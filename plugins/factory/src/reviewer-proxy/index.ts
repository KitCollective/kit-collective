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
// on the carrier, and the workflow does not count it as green. `--title <title>` asks the same for the
// newest thread with that exact title, so the workflow learns the reviewer's thread id from bb rather
// than from the model, which once reported its parent's id instead of its own (2026-10-18).
//
// Cost (2026-10-19): GLM 5.3 caches prompts implicitly on OpenRouter, without `cache_control`, so the
// proxy keeps the rewritten prefix stable from call to call, keeps a thread on one provider with
// `session_id`, sorts the no-training endpoints by price, and adds each call's usage and cost to the
// thread's served record.
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
/**
 * Which OpenRouter endpoints may serve a call: none that may train on the code, cheapest first. GLM's
 * cheap endpoints price a cached read close to their uncached input, so price beats a cache discount
 * (2026-10-19: a 43k-token call cost $0.0030 cached on Relace, $0.0113 cached on Z.AI).
 */
export const UPSTREAM_PROVIDER: Readonly<Record<string, string>> = {
  data_collection: "deny",
  sort: "price",
};
const ROUTE = "/reviewer/v1/messages";
/** The part of an Anthropic Messages body the proxy reads; the rest is forwarded as it came. */
const messagesBody = z.object({ model: z.string().min(1) }).passthrough();
/** OpenRouter's usage on a Messages response, or on the `message_delta` event of a stream. */
const usageOf = z.object({
  usage: z.object({
    input_tokens: z.number().optional(),
    output_tokens: z.number().optional(),
    cache_read_input_tokens: z.number().nullish(),
    cache_creation_input_tokens: z.number().nullish(),
    cost: z.number().optional(),
  }),
});
/** Spend: prompt tokens (cached ones included), cached prompt tokens, completion tokens, USD. */
const spent = z.object({
  prompt: z.number(),
  cached: z.number(),
  completion: z.number(),
  cost: z.number(),
});
type Spent = z.infer<typeof spent>;
const servedRecord = z.object({ model: z.string(), calls: z.number(), usage: spent.optional() });
type ServedRecord = z.infer<typeof servedRecord>;
const SECRET_KEY = "reviewerProxySecret";
/** Thread listing pages for `--title`, as the Issue-thread archiver pages them. */
const PAGE = 200;
const MAX_PAGES = 20;

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
/**
 * The usage of one upstream call, read from its body: the last `usage` of a server-sent event stream
 * (the `message_delta` event carries the final count and the cost), or the `usage` of a JSON body.
 */
export async function usageFrom(body: ReadableStream<Uint8Array>): Promise<Spent | null> {
  const text = await new Response(body).text();
  const candidates = text.trimStart().startsWith("{")
    ? [text]
    : text.split("\n").flatMap((line) => (line.startsWith("data:") ? [line.slice(5).trim()] : []));
  let last: Spent | null = null;
  for (const candidate of candidates) {
    let json: unknown;
    try {
      json = JSON.parse(candidate);
    } catch {
      continue;
    }
    const parsed = usageOf.safeParse(json);
    if (!parsed.success) continue;
    const usage = parsed.data.usage;
    const cached = usage.cache_read_input_tokens ?? 0;
    const prompt = (usage.input_tokens ?? 0) + cached + (usage.cache_creation_input_tokens ?? 0);
    const completion = usage.output_tokens ?? 0;
    if (prompt === 0 && completion === 0) continue;
    last = { prompt, cached, completion, cost: usage.cost ?? 0 };
  }
  return last;
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
        // The thread is the session: its calls stay on one provider, whose cache holds its prefix.
        const upstream = await forward(UPSTREAM, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${key}`,
            "anthropic-version": c.req.header("anthropic-version") ?? "2023-06-01",
            "x-title": "Optio reviewer",
            "x-session-id": threadId,
          },
          body: JSON.stringify({
            ...forOpenRouter(parsed.data),
            model,
            session_id: threadId,
            provider: UPSTREAM_PROVIDER,
          }),
        });
        deps.bb.log.info(
          `reviewer proxy: ${threadId} ${parsed.data.model} as ${model} -> ${upstream.status}`,
        );
        let body = upstream.body;
        if (upstream.ok) {
          const before = await served(threadId);
          await deps.bb.storage.kv.set(servedKey(threadId), {
            model,
            calls: (before?.calls ?? 0) + 1,
            ...(before?.usage === undefined ? {} : { usage: before.usage }),
            at: new Date().toISOString(),
          });
          if (body !== null) {
            const [toClient, toMeter] = body.tee();
            body = toClient;
            void usageFrom(toMeter)
              .then((spentNow) => (spentNow === null ? undefined : addUsage(threadId, spentNow)))
              .catch((error: unknown) => {
                const why = error instanceof Error ? error.message : String(error);
                deps.bb.log.warn(`reviewer proxy: no usage for ${threadId}: ${why}`);
              });
          }
        }
        return new Response(body, {
          status: upstream.status,
          headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
        });
      },
      { auth: "none" },
    );
  }

  /** Whether the route served a thread, as which model, and what its calls cost so far. */
  async function served(threadId: string): Promise<ServedRecord | null> {
    const record = servedRecord.safeParse(await deps.bb.storage.kv.get(servedKey(threadId)));
    return record.success ? record.data : null;
  }

  /** Add one call's usage to the thread's record once its response has streamed. */
  async function addUsage(threadId: string, add: Spent): Promise<void> {
    const record = await served(threadId);
    if (record === null) return;
    const total = record.usage ?? { prompt: 0, cached: 0, completion: 0, cost: 0 };
    await deps.bb.storage.kv.set(servedKey(threadId), {
      ...record,
      usage: {
        prompt: total.prompt + add.prompt,
        cached: total.cached + add.cached,
        completion: total.completion + add.completion,
        cost: total.cost + add.cost,
      },
      at: new Date().toISOString(),
    });
  }

  /** `2 calls`, or with usage `2 calls, $0.0061: 86000 prompt tokens (86000 cached), 40 completion`. */
  const spend = (record: ServedRecord) =>
    record.usage === undefined
      ? `${record.calls} calls`
      : `${record.calls} calls, $${record.usage.cost.toFixed(4)}: ${record.usage.prompt} prompt tokens (${record.usage.cached} cached), ${record.usage.completion} completion`;

  /**
   * The newest thread whose title is exactly `title`: archived and hidden threads included, since a
   * workflow's reviewer thread is hidden and may be archived by the time anyone asks.
   */
  async function threadTitled(
    title: string,
    projectId: string | undefined,
  ): Promise<string | null> {
    let newest: { id: string; createdAt: number } | null = null;
    for (const archived of [false, true]) {
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const threads = await deps.bb.sdk.threads.list({
          ...(projectId === undefined ? {} : { projectId }),
          archived,
          includeHidden: true,
          limit: PAGE,
          offset: page * PAGE,
        });
        for (const thread of threads) {
          if (thread.title === title && (newest === null || thread.createdAt > newest.createdAt)) {
            newest = { id: thread.id, createdAt: thread.createdAt };
          }
        }
        if (threads.length < PAGE) break;
      }
    }
    return newest?.id ?? null;
  }

  const usage = "usage: bb optio reviewer-served (--thread thr_x | --title <exact thread title>)";
  const command = cliCommand({
    summary: "Say whether the reviewer proxy served a thread, and as which model",
    description:
      "Exit 0 with SERVED <thread> when the proxy forwarded at least one call of the thread to OpenRouter, with the calls' total cost and tokens once OpenRouter reported them; exit 1 with NOT SERVED <thread> otherwise. --title names the thread by its exact title instead (the newest one, archived and hidden threads included) and exits 1 with NOT FOUND when no thread has it. The AFK developer workflow asks before it counts a proxied review as green.",
    options: {
      thread: { type: "string", description: "The reviewer thread id" },
      title: { type: "string", description: "The reviewer thread's exact title" },
      project: {
        type: "string",
        description: "The bb project --title looks in (default: the caller's)",
      },
    },
    async run({ options }, ctx) {
      const byId = typeof options.thread === "string" ? options.thread : "";
      const title = typeof options.title === "string" ? options.title.trim() : "";
      if ((byId === "") === (title === "")) return { exitCode: 2, stdout: usage };
      let threadId = byId;
      if (title !== "") {
        const project =
          typeof options.project === "string" && options.project !== ""
            ? options.project
            : ctx.projectId;
        const found = await threadTitled(title, project);
        if (found === null) {
          return { exitCode: 1, stdout: `NOT FOUND: no thread titled ${title}` };
        }
        threadId = found;
      }
      if (!/^thr_[a-z0-9]+$/.test(threadId)) return { exitCode: 2, stdout: usage };
      const record = await served(threadId);
      return record === null
        ? {
            exitCode: 1,
            stdout: `NOT SERVED ${threadId}: the proxy forwarded no call of this thread`,
          }
        : { exitCode: 0, stdout: `SERVED ${threadId} as ${record.model} (${spend(record)})` };
    },
  });

  return { register, env, verify, served, cli: { "reviewer-served": command } };
}
