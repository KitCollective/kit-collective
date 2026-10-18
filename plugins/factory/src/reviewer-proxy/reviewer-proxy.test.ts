import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import plugin from "../../server.js";

const keyFile = join(mkdtempSync(join(tmpdir(), "optio-keys-")), ".env");
writeFileSync(keyFile, "LINEAR_API_KEY=lin_key\nOPENROUTER_API_KEY=sk-or-test\n");

const titles: Record<string, string> = {
  thr_review1: "reviewer:ISSUE-1:r1:openrouter",
  thr_claude1: "reviewer:ISSUE-1:r1",
  thr_engine1: "engineer:ISSUE-1:r1",
};

async function load() {
  const host = createFakePluginHost({
    pluginId: "optio",
    settings: { linearWebhookSecret: "whsec", linearApiKeyFile: keyFile },
    agentSkillIds: ["optio"],
    sdk: {
      threads: {
        get: async ({ threadId }: { threadId: string }) => {
          const title = titles[threadId];
          if (title === undefined) throw new Error("no such thread");
          return { id: threadId, title, archivedAt: null };
        },
      },
    },
  });
  await plugin(host.bb);
  return { ...host.harness.behavior, cli: host.harness.behavior.runCli };
}

const context = (threadId: string) => ({ threadId, projectId: "p", hostId: "h" });
const envOf = (entries: readonly { name: string; value: unknown }[]) =>
  new Map(entries.map((entry) => [entry.name, entry.value]));

async function tokenFor(behavior: Awaited<ReturnType<typeof load>>, threadId: string) {
  const token = envOf(await behavior.resolveProviderEnv("claude-code", context(threadId))).get(
    "ANTHROPIC_AUTH_TOKEN",
  );
  return typeof token === "string" ? token : "";
}

afterEach(() => vi.unstubAllGlobals());

describe("the reviewer proxy (ADR-0067)", () => {
  it("gives a proxied reviewer thread the proxy and a token, and every other thread nothing", async () => {
    const behavior = await load();
    const review = envOf(await behavior.resolveProviderEnv("claude-code", context("thr_review1")));
    expect(review.get("ANTHROPIC_BASE_URL")).toEqual({
      serverPath: "/api/v1/plugins/optio/http/reviewer",
    });
    expect(await tokenFor(behavior, "thr_review1")).toMatch(/^thr_review1\.[0-9a-f]{40}$/);
    expect(JSON.stringify([...review.values()])).not.toContain("sk-or-test");
    for (const threadId of ["thr_claude1", "thr_engine1", "thr_unknown"]) {
      expect(await behavior.resolveProviderEnv("claude-code", context(threadId))).toEqual([]);
    }
  });

  it("forwards a call with a valid token to OpenRouter with the server's key, never to endpoints that train", async () => {
    const upstream = vi.fn(
      async (_url: string, _init: RequestInit) =>
        new Response(JSON.stringify({ type: "message", content: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", upstream);
    const behavior = await load();
    const token = await tokenFor(behavior, "thr_review1");
    const res = await behavior.fetchHttp("POST", "/reviewer/v1/messages", {
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ model: "deepseek/deepseek-v4-pro", max_tokens: 10, messages: [] }),
    });
    expect(res.status).toBe(200);
    const [url, init] = upstream.mock.calls[0] ?? [];
    expect(url).toBe("https://openrouter.ai/api/v1/messages");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer sk-or-test");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: "deepseek/deepseek-v4-pro",
      provider: { data_collection: "deny" },
    });
  });

  it("sends a carrier (a Claude catalog id) as GLM 5.3 and records the thread as served", async () => {
    const upstream = vi.fn(
      async (_url: string, _init: RequestInit) =>
        new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", upstream);
    const behavior = await load();
    const before = await behavior.cli(["reviewer-served", "--thread", "thr_review1"]);
    expect(before.exitCode).toBe(1);
    expect(before.stdout).toMatch(/^NOT SERVED thr_review1/);
    const token = await tokenFor(behavior, "thr_review1");
    for (let i = 0; i < 2; i += 1) {
      await behavior.fetchHttp("POST", "/reviewer/v1/messages", {
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ model: "claude-haiku-5-5", messages: [] }),
      });
    }
    const [, init] = upstream.mock.calls[0] ?? [];
    expect(JSON.parse(String(init?.body)).model).toBe("z-ai/glm-5.3");
    const after = await behavior.cli(["reviewer-served", "--thread", "thr_review1"]);
    expect(after.exitCode).toBe(0);
    expect(after.stdout).toBe("SERVED thr_review1 as z-ai/glm-5.3 (2 calls)");
  });

  it("lifts a mid-conversation system message into the system prompt and its tools into tools", async () => {
    const upstream = vi.fn(
      async (_url: string, _init: RequestInit) =>
        new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", upstream);
    const behavior = await load();
    const token = await tokenFor(behavior, "thr_review1");
    const definition = { name: "late_tool", description: "d", input_schema: { type: "object" } };
    await behavior.fetchHttp("POST", "/reviewer/v1/messages", {
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-5-5",
        system: "base",
        tools: [{ name: "Bash" }],
        output_config: { effort: "low" },
        messages: [
          { role: "user", content: [{ type: "text", text: "review" }] },
          {
            role: "system",
            output_config: { effort: "low" },
            content: [
              { type: "text", text: "late note" },
              { type: "tool_addition", tool: { type: "tool_definition", definition } },
            ],
          },
        ],
      }),
    });
    const [, init] = upstream.mock.calls[0] ?? [];
    const sent = JSON.parse(String(init?.body));
    expect(sent.messages).toEqual([{ role: "user", content: [{ type: "text", text: "review" }] }]);
    expect(sent.system).toEqual([
      { type: "text", text: "base" },
      { type: "text", text: "late note" },
    ]);
    expect(sent.tools).toEqual([{ name: "Bash" }, definition]);
    expect(sent.output_config).toEqual({ effort: "low" });
  });

  it("does not count a failed upstream call as served", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 404 })),
    );
    const behavior = await load();
    const token = await tokenFor(behavior, "thr_review1");
    await behavior.fetchHttp("POST", "/reviewer/v1/messages", {
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-haiku-5-5", messages: [] }),
    });
    expect((await behavior.cli(["reviewer-served", "--thread", "thr_review1"])).exitCode).toBe(1);
  });

  it("refuses a forged token and a token for a thread it does not proxy", async () => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    const behavior = await load();
    const call = (token: string, model = "z-ai/glm-5.3") =>
      behavior.fetchHttp("POST", "/reviewer/v1/messages", {
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ model, messages: [] }),
      });
    expect((await call(`thr_review1.${"0".repeat(40)}`)).status).toBe(401);
    expect((await call("thr_claude1.abc")).status).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
  });
});
