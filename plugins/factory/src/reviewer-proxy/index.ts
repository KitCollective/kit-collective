// A reviewer on another vendor's model (ADR-0067). A workflow can spawn a Claude Code reviewer whose
// thread title ends in `:openrouter` and whose model is an OpenRouter model id (`vendor/model`). For
// that thread only, Optio points Claude Code at its own route below, which forwards each Anthropic
// Messages call to OpenRouter with the key from the server's key file. The key never reaches the
// thread: the thread gets a per-thread token, checked here. Any other thread is left alone.
//
// It fails closed: if this env is not applied, Claude Code sends the OpenRouter model id to
// Anthropic, which refuses it, so a reviewer never runs on a model nobody chose.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { BbPluginApi } from "@get-bb/plugin-sdk";

/** The thread titles that take the proxy. */
export const PROXIED_TITLE = /^reviewer:.+:openrouter$/;
/** An OpenRouter model id: `vendor/model`, never a Claude id. */
const OPENROUTER_MODEL = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i;
const UPSTREAM = "https://openrouter.ai/api/v1/messages";
const ROUTE = "/reviewer/v1/messages";
const SECRET_KEY = "reviewerProxySecret";
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
        const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
        if (body === null || typeof body.model !== "string" || !OPENROUTER_MODEL.test(body.model)) {
          return c.json(
            {
              type: "error",
              error: {
                type: "invalid_request_error",
                message: "the model must be an OpenRouter model id (vendor/model)",
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
              error: { type: "api_error", message: String((error as Error).message) },
            },
            503,
          );
        }
        // No endpoint that may train on the code.
        const upstream = await forward(UPSTREAM, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${key}`,
            "anthropic-version": c.req.header("anthropic-version") ?? "2023-06-01",
            "x-title": "Optio reviewer",
          },
          body: JSON.stringify({ ...body, provider: { data_collection: "deny" } }),
        });
        deps.bb.log.info(`reviewer proxy: ${threadId} ${body.model} -> ${upstream.status}`);
        return new Response(upstream.body, {
          status: upstream.status,
          headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
        });
      },
      { auth: "none" },
    );
  }

  return { register, env, verify };
}
