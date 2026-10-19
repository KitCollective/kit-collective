import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import plugin from "../../server.js";
import { forOpenRouter, usageFrom } from "./index.js";

const keyFile = join(mkdtempSync(join(tmpdir(), "optio-keys-")), ".env");
writeFileSync(keyFile, "LINEAR_API_KEY=lin_key\nOPENROUTER_API_KEY=sk-or-test\n");

const titles: Record<string, string> = {
  thr_review1: "reviewer:ISSUE-1:r1:openrouter",
  thr_claude1: "reviewer:ISSUE-1:r1",
  thr_engine1: "engineer:ISSUE-1:r1",
  thr_issue01: "ISSUE-1",
  thr_review0: "reviewer:ISSUE-1:r1:openrouter",
  thr_review2: "reviewer:ISSUE-2:r1:openrouter",
};
/** What `threads.list` knows: an older and a newer thread share a title; one is archived. */
const listed = [
  { id: "thr_issue01", projectId: "p", createdAt: 1, archived: false },
  { id: "thr_review0", projectId: "p", createdAt: 2, archived: false },
  { id: "thr_review1", projectId: "p", createdAt: 3, archived: false },
  { id: "thr_review2", projectId: "p", createdAt: 4, archived: true },
];
const listCalls: Record<string, unknown>[] = [];

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
        list: async (
          query: { projectId?: string; archived?: boolean; includeHidden?: boolean } = {},
        ) => {
          listCalls.push(query);
          return listed
            .filter(
              (thread) =>
                (query.projectId === undefined || thread.projectId === query.projectId) &&
                thread.archived === (query.archived ?? false),
            )
            .map((thread) => ({ ...thread, title: titles[thread.id] ?? null }));
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

afterEach(() => {
  vi.unstubAllGlobals();
  listCalls.length = 0;
});

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
      provider: { data_collection: "deny", sort: "price" },
      // The thread is the sticky-routing session, so its calls hit one provider's prompt cache.
      session_id: "thr_review1",
    });
    expect(new Headers(init?.headers).get("x-session-id")).toBe("thr_review1");
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

  it("finds the reviewer thread by its exact title, newest first, and names it in the answer", async () => {
    const upstream = vi.fn(
      async (_url: string, _init: RequestInit) =>
        new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", upstream);
    const behavior = await load();
    const title = "reviewer:ISSUE-1:r1:openrouter";
    const before = await behavior.cli(["reviewer-served", "--title", title], { projectId: "p" });
    expect(before.exitCode).toBe(1);
    expect(before.stdout).toBe(
      "NOT SERVED thr_review1: the proxy forwarded no call of this thread",
    );
    const token = await tokenFor(behavior, "thr_review1");
    await behavior.fetchHttp("POST", "/reviewer/v1/messages", {
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-haiku-5-5", messages: [] }),
    });
    const after = await behavior.cli(["reviewer-served", "--title", title], { projectId: "p" });
    expect(after.exitCode).toBe(0);
    expect(after.stdout).toBe("SERVED thr_review1 as z-ai/glm-5.3 (1 calls)");
    // Hidden workflow threads count, in the caller's project, archived or not.
    expect(listCalls).toContainEqual(
      expect.objectContaining({ projectId: "p", includeHidden: true, archived: false }),
    );
    expect(listCalls).toContainEqual(expect.objectContaining({ archived: true }));
  });

  it("finds an archived thread, and says NOT FOUND for a title no thread has", async () => {
    const behavior = await load();
    const archived = await behavior.cli([
      "reviewer-served",
      "--title",
      "reviewer:ISSUE-2:r1:openrouter",
      "--project",
      "p",
    ]);
    expect(archived.stdout).toMatch(/^NOT SERVED thr_review2: /);
    const missing = await behavior.cli(["reviewer-served", "--title", "reviewer:ISSUE-3:r1"], {
      projectId: "p",
    });
    expect(missing.exitCode).toBe(1);
    expect(missing.stdout).toBe("NOT FOUND: no thread titled reviewer:ISSUE-3:r1");
    // Another project's threads are not this project's.
    const elsewhere = await behavior.cli(
      ["reviewer-served", "--title", "reviewer:ISSUE-1:r1:openrouter"],
      { projectId: "q" },
    );
    expect(elsewhere.stdout).toMatch(/^NOT FOUND: /);
  });

  it("takes exactly one of --thread and --title", async () => {
    const behavior = await load();
    expect((await behavior.cli(["reviewer-served"])).exitCode).toBe(2);
    const both = await behavior.cli([
      "reviewer-served",
      "--thread",
      "thr_review1",
      "--title",
      "reviewer:ISSUE-1:r1:openrouter",
    ]);
    expect(both.exitCode).toBe(2);
    expect(both.stdout).toMatch(/^usage: /);
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

  it("adds each streamed call's usage and cost to the thread, and reviewer-served prints the total", async () => {
    const sse = (cached: number, cost: number) =>
      [
        "event: message_start",
        `data: ${JSON.stringify({ type: "message_start", message: { usage: { input_tokens: 0, output_tokens: 0 } } })}`,
        "",
        "event: message_delta",
        `data: ${JSON.stringify({ type: "message_delta", usage: { input_tokens: 1000 - cached, cache_read_input_tokens: cached, output_tokens: 20, cost } })}`,
        "",
        "event: message_stop",
        'data: {"type":"message_stop"}',
        "",
      ].join("\n");
    const bodies = [sse(0, 0.002), sse(900, 0.0015)];
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(bodies.shift() ?? "", {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          }),
      ),
    );
    const behavior = await load();
    const token = await tokenFor(behavior, "thr_review1");
    for (let i = 0; i < 2; i += 1) {
      const res = await behavior.fetchHttp("POST", "/reviewer/v1/messages", {
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ model: "claude-haiku-5-5", stream: true, messages: [] }),
      });
      // The client still gets the whole stream.
      expect(await res.text()).toContain("message_stop");
    }
    await vi.waitFor(async () => {
      const after = await behavior.cli(["reviewer-served", "--thread", "thr_review1"]);
      expect(after.stdout).toBe(
        "SERVED thr_review1 as z-ai/glm-5.3 (2 calls, $0.0035: 2000 prompt tokens (900 cached), 40 completion)",
      );
    });
  });

  it("reads usage from a JSON body too, and ignores a body without it", async () => {
    const json = (value: unknown) =>
      new Response(JSON.stringify(value)).body ?? new ReadableStream();
    expect(
      await usageFrom(
        json({
          usage: { input_tokens: 10, cache_read_input_tokens: 90, output_tokens: 5, cost: 0.01 },
        }),
      ),
    ).toEqual({ prompt: 100, cached: 90, completion: 5, cost: 0.01 });
    expect(await usageFrom(json({ type: "message", content: [] }))).toBeNull();
  });

  it("keeps cache_control and a byte-stable prefix while it lifts system messages", () => {
    const definition = { name: "late_tool", input_schema: { type: "object" } };
    const firstTurns = [
      {
        role: "user",
        content: [{ type: "text", text: "review", cache_control: { type: "ephemeral" } }],
      },
      {
        role: "system",
        content: [
          { type: "text", text: "late note" },
          { type: "tool_addition", tool: { definition } },
        ],
      },
      { role: "assistant", content: [{ type: "text", text: "reading" }] },
    ];
    const body = (messages: unknown[]) => ({
      model: "claude-haiku-5-5",
      system: [
        { type: "text", text: "base" },
        { type: "text", text: "rules", cache_control: { type: "ephemeral" } },
      ],
      tools: [{ name: "Bash", cache_control: { type: "ephemeral" } }],
      messages,
    });
    const call1 = forOpenRouter(body(firstTurns));
    const call2 = forOpenRouter(
      body([...firstTurns, { role: "user", content: [{ type: "text", text: "next" }] }]),
    );
    // Claude Code's breakpoints reach OpenRouter as they came.
    expect(call1.system).toEqual([
      { type: "text", text: "base" },
      { type: "text", text: "rules", cache_control: { type: "ephemeral" } },
      { type: "text", text: "late note" },
    ]);
    expect(JSON.stringify(call1.tools)).toContain('"cache_control"');
    // The next call renders the same tools, system prompt and earlier turns, byte for byte.
    expect(JSON.stringify(call2.tools)).toBe(JSON.stringify(call1.tools));
    expect(JSON.stringify(call2.system)).toBe(JSON.stringify(call1.system));
    const turns = (sent: ReturnType<typeof forOpenRouter>) =>
      Array.isArray(sent.messages) ? sent.messages : [];
    expect(JSON.stringify(turns(call2).slice(0, 2))).toBe(JSON.stringify(turns(call1)));
    // A body with no system message goes out untouched.
    const plain = body([firstTurns[0]]);
    expect(forOpenRouter(plain)).toBe(plain);
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
