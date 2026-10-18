import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import plugin from "../../server.js";
import type { rpcContract } from "../contract.js";

type Contract = typeof rpcContract;
type Rpc = <M extends keyof Contract & string>(
  method: M,
  input: unknown,
) => Promise<z.output<Contract[M]["output"]>>;

const CHARTER = [
  "---",
  "name: Max",
  "title: Engineering Manager",
  "heartbeat: every 5 minutes, plus a daily status at 08:00",
  "limits:",
  "  live_runs: 3",
  "---",
  "",
  "# Max",
].join("\n");

interface Options {
  /** Charters by path in the agent's project checkout. */
  files?: Record<string, string>;
  archived?: Set<string>;
  threadList?: { id: string; title: string; updatedAt: number }[];
  /** Thread ids whose read fails with this error. */
  failing?: Map<string, Error>;
}

async function load({
  files = { "staff/max.md": CHARTER },
  archived = new Set<string>(),
  threadList = [],
  failing = new Map<string, Error>(),
}: Options = {}) {
  let spawned = 0;
  const host = createFakePluginHost({
    pluginId: "optio",
    settings: { linearWebhookSecret: "whsec" },
    agentSkillIds: ["optio"],
    sdk: {
      threads: {
        spawn: async () => {
          spawned += 1;
          return { id: `thr_chat${spawned}` };
        },
        get: async ({ threadId }: { threadId: string }) => {
          const failure = failing.get(threadId);
          if (failure !== undefined) throw failure;
          return {
            status: "idle",
            projectId: "proj_1",
            deletedAt: null,
            archivedAt: archived.has(threadId) ? 1 : null,
          };
        },
        list: async () => threadList,
        timeline: async () => ({ rows: [] }),
        send: async () => ({}),
      },
      projects: {
        list: async () => [{ id: "proj_1", name: "acme" }],
        fileContent: async ({ path }: { path: string }) => {
          const content = files[path];
          if (content === undefined) throw new Error(`no ${path}`);
          return {
            content,
            contentEncoding: "utf8",
            mimeType: "text/markdown",
            sizeBytes: content.length,
          };
        },
      },
    },
  });
  await plugin(host.bb);
  // SAFETY: the fake host's callRpc parses every result with the method's output schema in rpcContract.
  const rpc = host.harness.behavior.callRpc as Rpc;
  const agent = async (id: string, name: string, enabled = true) => {
    // The id is made from the name; the test names agents so that it comes out as `id`.
    const made = await rpc("agent_create", {
      name,
      description: "",
      projectId: "proj_1",
      instructions: "Do the work.",
      enabled,
      httpTrigger: false,
    });
    expect(made.id).toBe(id);
    return made;
  };
  const spawns = () => host.harness.inspection.sdk.callsTo("threads.spawn");
  return { rpc, cli: host.harness.behavior.runCli, agent, spawns, host };
}

describe("the Staff list", () => {
  it("lists the agents whose project holds a Charter, with the title it gives", async () => {
    const { rpc, agent } = await load();
    await agent("max", "Max");
    await agent("orchestrator", "Orchestrator");
    const { staff, others } = await rpc("staff_list", null);
    expect(staff).toEqual([
      { agentId: "max", name: "Max", title: "Engineering Manager", chatThreadId: null },
    ]);
    expect(others.map((other) => other.id)).toEqual(["orchestrator"]);
  });
});

describe("the standing Staff chat", () => {
  it("is made the first time and found again after that", async () => {
    const { rpc, agent, spawns } = await load();
    await agent("max", "Max");
    const first = await rpc("staff_chat_open", { agentId: "max" });
    const again = await rpc("staff_chat_open", { agentId: "max" });
    expect(again.threadId).toBe(first.threadId);
    expect(spawns()).toHaveLength(1);
    expect((await rpc("staff_list", null)).staff[0]?.chatThreadId).toBe(first.threadId);
  });

  it("is made once when two opens race", async () => {
    const { rpc, agent, spawns } = await load();
    await agent("max", "Max");
    const [a, b] = await Promise.all([
      rpc("staff_chat_open", { agentId: "max" }),
      rpc("staff_chat_open", { agentId: "max" }),
    ]);
    expect(a.threadId).toBe(b.threadId);
    expect(spawns()).toHaveLength(1);
  });

  it("is made again when the chat was archived", async () => {
    const archived = new Set<string>();
    const { rpc, agent, spawns } = await load({ archived });
    await agent("max", "Max");
    const first = await rpc("staff_chat_open", { agentId: "max" });
    archived.add(first.threadId);
    const second = await rpc("staff_chat_open", { agentId: "max" });
    expect(second.threadId).not.toBe(first.threadId);
    expect(spawns()).toHaveLength(2);
  });

  it("is made again when the host says the chat no longer exists", async () => {
    const failing = new Map<string, Error>();
    const { rpc, agent, spawns } = await load({ failing });
    await agent("max", "Max");
    const first = await rpc("staff_chat_open", { agentId: "max" });
    failing.set(first.threadId, Object.assign(new Error("Thread not found"), { status: 404 }));
    const second = await rpc("staff_chat_open", { agentId: "max" });
    expect(second.threadId).not.toBe(first.threadId);
    expect(spawns()).toHaveLength(2);
  });

  it("is not made again when reading it fails for another reason", async () => {
    const failing = new Map<string, Error>();
    const { rpc, agent, spawns } = await load({ failing });
    await agent("max", "Max");
    const first = await rpc("staff_chat_open", { agentId: "max" });
    failing.set(first.threadId, new Error("socket hang up"));
    await expect(rpc("staff_chat_open", { agentId: "max" })).rejects.toThrow(/socket hang up/);
    failing.delete(first.threadId);
    expect((await rpc("staff_chat_open", { agentId: "max" })).threadId).toBe(first.threadId);
    expect(spawns()).toHaveLength(1);
  });

  it("is not made again when the host cannot be reached", async () => {
    const failing = new Map<string, Error>();
    const { rpc, agent, spawns } = await load({ failing });
    await agent("max", "Max");
    const first = await rpc("staff_chat_open", { agentId: "max" });
    failing.set(
      first.threadId,
      Object.assign(new Error("getaddrinfo ENOTFOUND bb.local"), { code: "ENOTFOUND" }),
    );
    await expect(rpc("staff_chat_open", { agentId: "max" })).rejects.toThrow(/ENOTFOUND/);
    expect(spawns()).toHaveLength(1);
  });

  it("is refused for an agent with no Charter", async () => {
    const { rpc, agent, spawns } = await load();
    await agent("orchestrator", "Orchestrator");
    await expect(rpc("staff_chat_open", { agentId: "orchestrator" })).rejects.toThrow(/Charter/);
    expect(spawns()).toHaveLength(0);
  });

  it("has a title that neither the dispatch tick nor the watchdog takes for its daily thread", async () => {
    const { rpc, agent, spawns } = await load();
    await agent("max", "Max");
    await rpc("staff_chat_open", { agentId: "max" });
    const title = JSON.stringify(spawns()[0]);
    const spawnedTitle = /"title":"([^"]*)"/.exec(title)?.[1] ?? "";
    expect(spawnedTitle).toBe("Max: Staff chat");
    // staff/max/tick.js and staff/max/watchdog.js: /^Max (· )?\d{4}-\d{2}-\d{2}/
    expect(/^Max (· )?\d{4}-\d{2}-\d{2}/.test(spawnedTitle)).toBe(false);
  });

  it("is what `bb optio chat` prints, the same thread the page opens", async () => {
    const { rpc, cli, agent, spawns } = await load();
    await agent("max", "Max");
    const opened = await rpc("staff_chat_open", { agentId: "max" });
    const printed = await cli(["chat", "max", "--json"]);
    expect(printed.exitCode).toBe(0);
    expect(JSON.parse(printed.stdout)).toEqual({ threadId: opened.threadId });
    expect(spawns()).toHaveLength(1);
    const unknown = await cli(["chat", "nobody"]);
    expect(unknown.exitCode).not.toBe(0);
  });
});

describe("the Staff chat header", () => {
  it("shows the title, status, last Heartbeat and budget of the chat's Staff member", async () => {
    const { rpc, agent } = await load({
      files: { "staff/max.md": `${CHARTER.replace("---\n\n", "budget: 40 USD a day\n---\n\n")}` },
      threadList: [
        { id: "thr_old", title: "Max · 2026-10-16", updatedAt: 1_000 },
        { id: "thr_day", title: "Max · 2026-10-17", updatedAt: 5_000 },
        { id: "thr_other", title: "Brad · 2026-10-17", updatedAt: 9_000 },
      ],
    });
    await agent("max", "Max");
    const chat = await rpc("staff_chat_open", { agentId: "max" });
    expect(await rpc("staff_chat_header", { threadId: chat.threadId })).toEqual({
      agentId: "max",
      name: "Max",
      title: "Engineering Manager",
      status: "on",
      lastHeartbeat: 5_000,
      budget: { limit: "40 USD a day", used: null },
    });
  });

  it("says off for a disabled agent, and null for a thread that is not a Staff chat", async () => {
    const { rpc, agent } = await load();
    const made = await agent("max", "Max");
    const chat = await rpc("staff_chat_open", { agentId: "max" });
    await rpc("agent_update", {
      id: made.id,
      name: "Max",
      description: "",
      projectId: "proj_1",
      instructions: "Do the work.",
      enabled: false,
      httpTrigger: false,
    });
    const header = await rpc("staff_chat_header", { threadId: chat.threadId });
    expect(header).toMatchObject({ status: "off", lastHeartbeat: null });
    expect(header?.budget).toEqual({ limit: null, used: null });
    expect(await rpc("staff_chat_header", { threadId: "thr_somewhere_else" })).toBeNull();
  });

  it("does not read the Charter or the thread list for a thread that is not a Staff chat", async () => {
    const { rpc, host } = await load();
    await rpc("staff_chat_header", { threadId: "thr_somewhere_else" });
    expect(host.harness.inspection.sdk.callsTo("threads.list")).toHaveLength(0);
    expect(host.harness.inspection.sdk.callsTo("projects.fileContent")).toHaveLength(0);
  });
});
