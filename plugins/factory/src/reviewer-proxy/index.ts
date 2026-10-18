// A reviewer on another vendor's model (ADR-0067). A workflow spawns a Claude Code reviewer whose
// thread title ends in `:openrouter`. For that thread only, Optio points Claude Code at its own route
// below, which forwards each Anthropic Messages call to OpenRouter with the key from the server's key
// file. The key never reaches the thread: the thread gets a per-thread token, checked here. Any other
// thread is left alone.
//
// `bb workflows validate` only accepts a model from Claude Code's catalog, so the workflow names a
// catalog model as a carrier and the route sends OpenRouter's model instead (an OpenRouter id in the
// request is forwarded as it is). Every thread the route serves is recorded, and
// `bb optio reviewer-served --thread <id>` answers whether it was: a review the proxy never served ran
// on the carrier, and the workflow does not count it as green.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { type BbPluginApi, cliCommand } from "@get-bb/plugin-sdk";
import { z } from "zod";

/** The thread titles that take the proxy. */
export const PROXIED_TITLE = /^reviewer:.+:openrouter$/;
/** An OpenRouter model id: `vendor/model`, never a Claude id. */
const OPENROUTER_MODEL = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i;
const UPSTREAM = "https://openrouter.ai/api/v1/messages";
/** The OpenRouter model a carrier request is sent as. Hard-coded until Operating settings choose it. */
export const REVIEWER_MODEL = "z-ai/glm-5.3";
const servedKey = (threadId: string) => `reviewerServed:${threadId}`;
const ROUTE = "/reviewer/v1/messages";
/** The part of an Anthropic Messages body the proxy reads; the rest is forwarded as it came. */
const messagesBody = z.object({ model: z.string().min(1) }).passthrough();
const SECRET_KEY = "reviewerProxySecret";

const textBlock = z.object({ type: z.literal("text"), text: z.string() }).passthrough();
const toolAddition = z.object({
  type: z.literal("tool_addition"),
  tool: z.object({ definition: z.record(z.string(), z.unknown()) }).passthrough(),
});
const systemMessage = z.object({
  role: z.literal("system"),
  content: z.union([z.string(), z.array(z.unknown())]),
});

/**
 * A Messages body OpenRouter's GLM accepts. A carrier from the 4.6 family on sends `role: "system"`
 * messages inside `messages`, with the effort and the deferred tools (`tool_addition`) on them, and
 * GLM refuses that as a mid-conversation effort change (2026-10-18). Their text joins
 * the system prompt, their tools join `tools`, and the rest of the body goes as it came.
 */
export function forOpenRouter(body: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(body.messages)) return body;
  const messages: unknown[] = [];
  const tools: unknown[] = Array.isArray(body.tools) ? [...body.tools] : [];
  const text: { type: "text"; text: string }[] = [];
  for (const message of body.messages) {
    const lifted = systemMessage.safeParse(message);
    if (!lifted.success) {
      messages.push(message);
      continue;
    }
    const content = lifted.data.content;
    if (typeof content === "string") {
      text.push({ type: "text", text: content });
      continue;
    }
    for (const block of content) {
      const added = toolAddition.safeParse(block);
      if (added.success) tools.push(added.data.tool.definition);
      const said = textBlock.safeParse(block);
      if (said.success) text.push({ type: "text", text: said.data.text });
    }
  }
  if (messages.length === body.messages.length) return body;
  const system =
    typeof body.system === "string"
      ? [{ type: "text", text: body.system }]
      : Array.isArray(body.system)
        ? body.system
        : [];
  return {
    ...body,
    messages,
    system: [...system, ...text],
    ...(tools.length > 0 ? { tools } : {}),
  };
}
/** Where the route is mounted for the host (`/api/v1/plugins/<id>/http/...`). */
const mountedAt = (pluginId: string) => `/api/v1/plugins/${pluginId}/http/reviewer`;

export interface ReviewerProxyDeps {
  bb: Pick<BbPluginApi, "storage" | "sdk" | "http" | "providers" | "log" | "pluginId">;
  /** The dotenv file on the bb server that holds the keys (the Linear key file). */
  keyFile: () => Promise<string>;
  /** Forward one request upstream; `fetch` in production. */
  fetch?: typeof fetch;
}

function sign(secret: string, threadId: string): string {
  return createHmac("sha256", secret).update(threadId).digest("hex").slice(0, 40);
}

export function createReviewerProxy(deps: ReviewerProxyDeps) {
  const forward = deps.fetch ?? fetch;

  async function secret(): Promise<string> {
    const saved = await deps.bb.storage.kv.get<string>(SECRET_KEY);
    if (typeof saved === "string" && saved.length >= 32) return saved;
    const made = randomBytes(32).toString("hex");
    await deps.bb.storage.kv.set(SECRET_KEY, made);
    return made;
  }

  async function openrouterKey(): Promise<string> {
    const path = await deps.keyFile();
    if (path !== "") {
      const text = await readFile(path, "utf8").catch(() => "");
      const line = /^\s*(?:export\s+)?OPENROUTER_API_KEY\s*=\s*(.+?)\s*$/m.exec(text);
      const value = line?.[1]?.replace(/^(["'])(.*)\1$/, "$2") ?? "";
      if (value !== "") return value;
    }
    throw new Error(
      "no OpenRouter key: add OPENROUTER_API_KEY to the key file in Optio's settings",
    );
  }

  async function proxiedThread(threadId: string): Promise<boolean> {
    const thread = await deps.bb.sdk.threads.get({ threadId }).catch(() => null);
    return thread !== null && typeof thread.title === "string" && PROXIED_TITLE.test(thread.title);
  }

  /** The env Claude Code gets in a proxied reviewer thread, and nothing for any other thread. */
  async function env(context: { threadId?: string | null }) {
    const threadId = context.threadId ?? "";
    if (threadId === "" || !(await proxiedThread(threadId))) return [];
    const token = `${threadId}.${sign(await secret(), threadId)}`;
    return [
      {
        name: "ANTHROPIC_BASE_URL",
        value: { serverPath: mountedAt(deps.bb.pluginId) },
        reason: "This reviewer runs on an OpenRouter model through Optio's proxy",
      },
      {
        name: "ANTHROPIC_AUTH_TOKEN",
        value: token,
        reason: "A token for this thread only; the OpenRouter key stays on the server",
      },
      { name: "ANTHROPIC_API_KEY", value: "", reason: "Use the token above, not an API key" },
      {
        name: "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC",
        value: "1",
        reason: "Only the review's own calls go through the proxy",
      },
    ];
  }

  /** The thread a token was issued to, or null. */
  async function verify(token: string): Promise<string | null> {
    const dot = token.lastIndexOf(".");
    if (dot <= 0) return null;
    const threadId = token.slice(0, dot);
    const given = Buffer.from(token.slice(dot + 1));
    const expected = Buffer.from(sign(await secret(), threadId));
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    return (await proxiedThread(threadId)) ? threadId : null;
  }

  function register() {
    deps.bb.providers.experimental_contributeEnv("claude-code", env);
    deps.bb.http.route(
      "POST",
      ROUTE,
      async (c) => {
        const bearer = /^Bearer\s+(.+)$/i.exec(c.req.header("authorization") ?? "")?.[1];
        const token = bearer ?? c.req.header("x-api-key") ?? "";
        const threadId = token === "" ? null : await verify(token);
        if (threadId === null) {
          return c.json(
            {
              type: "error",
              error: { type: "authentication_error", message: "not a proxied reviewer thread" },
            },
            401,
          );
        }
        const parsed = messagesBody.safeParse(await c.req.json().catch(() => null));
        if (!parsed.success) {
          return c.json(
            {
              type: "error",
              error: {
                type: "invalid_request_error",
                message: "expected an Anthropic Messages body with a model",
              },
            },
            400,
          );
        }
        let key: string;
        try {
          key = await openrouterKey();
        } catch (error) {
          return c.json(
            {
              type: "error",
              error: {
                type: "api_error",
                message: error instanceof Error ? error.message : String(error),
              },
            },
            503,
          );
        }
        // A carrier (a Claude id) goes out as the reviewer model; an OpenRouter id goes out as it is.
        const model = OPENROUTER_MODEL.test(parsed.data.model) ? parsed.data.model : REVIEWER_MODEL;
        // No endpoint that may train on the code.
        const upstream = await forward(UPSTREAM, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${key}`,
            "anthropic-version": c.req.header("anthropic-version") ?? "2023-06-01",
            "x-title": "Optio reviewer",
          },
          body: JSON.stringify({
            ...forOpenRouter(parsed.data),
            model,
            provider: { data_collection: "deny" },
          }),
        });
        deps.bb.log.info(
          `reviewer proxy: ${threadId} ${parsed.data.model} as ${model} -> ${upstream.status}`,
        );
        if (upstream.ok) {
          const before = await deps.bb.storage.kv.get<{ calls?: number }>(servedKey(threadId));
          await deps.bb.storage.kv.set(servedKey(threadId), {
            model,
            calls: (typeof before?.calls === "number" ? before.calls : 0) + 1,
            at: new Date().toISOString(),
          });
        }
        return new Response(upstream.body, {
          status: upstream.status,
          headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
        });
      },
      { auth: "none" },
    );
  }

  /** Whether the route served a thread, and as which model. */
  async function served(threadId: string): Promise<{ model: string; calls: number } | null> {
    const record = await deps.bb.storage.kv.get<{ model?: unknown; calls?: unknown }>(
      servedKey(threadId),
    );
    return record && typeof record.model === "string" && typeof record.calls === "number"
      ? { model: record.model, calls: record.calls }
      : null;
  }

  const command = cliCommand({
    summary: "Say whether the reviewer proxy served a thread, and as which model",
    description:
      "Exit 0 with SERVED when the proxy forwarded at least one call of the thread to OpenRouter; exit 1 with NOT SERVED otherwise. The AFK developer workflow asks before it counts a proxied review as green.",
    options: { thread: { type: "string", description: "The reviewer thread id" } },
    async run({ options }) {
      const threadId = typeof options.thread === "string" ? options.thread : "";
      if (!/^thr_[a-z0-9]+$/.test(threadId)) {
        return { exitCode: 2, stdout: "usage: bb optio reviewer-served --thread thr_x" };
      }
      const record = await served(threadId);
      return record === null
        ? {
            exitCode: 1,
            stdout: `NOT SERVED ${threadId}: the proxy forwarded no call of this thread`,
          }
        : { exitCode: 0, stdout: `SERVED ${threadId} as ${record.model} (${record.calls} calls)` };
    },
  });

  return { register, env, verify, served, cli: { "reviewer-served": command } };
}
