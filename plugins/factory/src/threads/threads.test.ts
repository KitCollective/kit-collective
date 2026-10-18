import { createFakePluginHost, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import plugin from "../../server.js";
import type { rpcContract } from "../contract.js";

type Contract = typeof rpcContract;
type Rpc = <M extends keyof Contract & string>(
  method: M,
  input: unknown,
) => Promise<z.output<Contract[M]["output"]>>;

const NOW = Date.parse("2026-10-18T12:00:00Z");
const HOUR = 3_600_000;

type Thread = {
  id: string;
  title: string | null;
  parentThreadId: string | null;
  status: "idle" | "active" | "error";
  archivedAt: number | null;
};
const thread = (id: string, title: string | null, extra: Partial<Thread> = {}): Thread => ({
  id,
  title,
  parentThreadId: null,
  status: "idle",
  archivedAt: null,
  ...extra,
});

type Issue = { identifier: string; type: string; completedAt: string | null };
const done = (identifier: string, hoursAgo: number): Issue => ({
  identifier,
  type: "completed",
  completedAt: new Date(NOW - hoursAgo * HOUR).toISOString(),
});
const open = (identifier: string, type = "started"): Issue => ({
  identifier,
  type,
  completedAt: null,
});

/** A fake bb with the given threads and a fake Linear behind `fetch`. */
async function load(threads: Thread[], issues: Issue[], settings: { paused?: boolean } = {}) {
  const archived: string[] = [];
  const list = vi.fn(
    async (args: { archived?: boolean; hasParent?: boolean; parentThreadId?: string } = {}) =>
      threads
        .filter((t) => (args.archived === false ? t.archivedAt === null : true))
        .filter((t) => (args.hasParent === false ? t.parentThreadId === null : true))
        .filter((t) =>
          args.parentThreadId === undefined ? true : t.parentThreadId === args.parentThreadId,
        )
        .map((t) => makeThreadResponse({ ...t, projectId: "proj_1" })),
  );
  const archiveAll = vi.fn(async ({ threadId }: { threadId: string }) => {
    const tree = [threadId];
    for (const id of tree) {
      for (const child of threads.filter((t) => t.parentThreadId === id)) tree.push(child.id);
    }
    for (const t of threads) {
      if (tree.includes(t.id)) t.archivedAt = Date.now();
    }
    archived.push(...tree);
    return { ok: true as const, archivedThreadIds: tree };
  });
  const fetchMock = vi.fn(async () => {
    const nodes = issues.map((issue) => ({
      identifier: issue.identifier,
      completedAt: issue.completedAt,
      state: { name: issue.type === "completed" ? "Done" : "Other", type: issue.type },
    }));
    return new Response(
      JSON.stringify({
        data: { issues: { pageInfo: { hasNextPage: false, endCursor: null }, nodes } },
      }),
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  const host = createFakePluginHost({
    pluginId: "optio",
    settings: { linearApiKey: "lin_key", ...settings },
    agentSkillIds: ["optio"],
    sdk: { threads: { list, archiveAll } },
  });
  await plugin(host.bb);
  // SAFETY: the fake host's callRpc parses every result with the method's output schema in rpcContract.
  const rpc = host.harness.behavior.callRpc as Rpc;
  await rpc("board_setup", {
    projectId: "proj_1",
    teamKey: "ENG",
    backlogState: "Icebox",
    activeStates: ["Doing"],
    blockedState: null,
  });
  return { host, rpc, archived, archiveAll, fetchMock, threads };
}

describe("archiving the Issue threads of Done issues", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("archives the Issue thread of an issue Done for a day, and nothing else", async () => {
    const { rpc, archived } = await load(
      [thread("thr_a", "ENG-1"), thread("thr_b", "ENG-2")],
      [done("ENG-1", 25), done("ENG-2", 23)],
    );
    const result = await rpc("threads_archive_done", null);
    expect(result.error).toBeNull();
    expect(archived).toEqual(["thr_a"]);
    expect(result.archived).toEqual([{ issue: "ENG-1", threadIds: ["thr_a"] }]);
  });

  it("archives the child threads with it", async () => {
    const { rpc, archived } = await load(
      [
        thread("thr_a", "ENG-1"),
        thread("thr_lead", "lead:ENG-1", { parentThreadId: "thr_a" }),
        thread("thr_eng", "engineer:ENG-1:r1", { parentThreadId: "thr_a" }),
        thread("thr_rev", "reviewer:ENG-1", { parentThreadId: "thr_eng" }),
      ],
      [done("ENG-1", 30)],
    );
    const result = await rpc("threads_archive_done", null);
    expect(archived.sort()).toEqual(["thr_a", "thr_eng", "thr_lead", "thr_rev"]);
    expect(result.archived).toEqual([
      { issue: "ENG-1", threadIds: ["thr_a", "thr_lead", "thr_eng", "thr_rev"] },
    ]);
  });

  it("never archives a thread of an issue that is not Done", async () => {
    const { rpc, archived } = await load(
      [
        thread("thr_1", "ENG-1"),
        thread("thr_2", "ENG-2"),
        thread("thr_3", "ENG-3"),
        thread("thr_4", "ENG-4"),
      ],
      [
        open("ENG-1"),
        open("ENG-2", "canceled"),
        open("ENG-3", "unstarted"),
        // The issue came back from Done: Linear clears the completion date.
        {
          identifier: "ENG-4",
          type: "started",
          completedAt: new Date(NOW - 50 * HOUR).toISOString(),
        },
      ],
    );
    await rpc("threads_archive_done", null);
    expect(archived).toEqual([]);
  });

  it("never archives a Staff chat, a thread with no issue, or an issue of another team", async () => {
    const { rpc, archived, fetchMock } = await load(
      [
        thread("thr_max", "Max · 2026-10-16"),
        thread("thr_chat", "Max"),
        thread("thr_plain", "Refactor the thing"),
        thread("thr_none", null),
        thread("thr_other", "OPS-9"),
        // A child thread named after the issue is archived with its parent, never on its own.
        thread("thr_child", "ENG-1", { parentThreadId: "thr_plain" }),
      ],
      [done("ENG-1", 99), done("OPS-9", 99)],
    );
    const result = await rpc("threads_archive_done", null);
    expect(archived).toEqual([]);
    expect(result.archived).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("leaves a thread that is already archived alone", async () => {
    const { rpc, archiveAll } = await load(
      [thread("thr_a", "ENG-1", { archivedAt: NOW - 2 * HOUR })],
      [done("ENG-1", 30)],
    );
    await rpc("threads_archive_done", null);
    expect(archiveAll).not.toHaveBeenCalled();
  });

  it("waits while a run in the thread's tree is still working", async () => {
    const { rpc, archived } = await load(
      [
        thread("thr_a", "ENG-1"),
        thread("thr_eng", "engineer:ENG-1:r2", { parentThreadId: "thr_a", status: "active" }),
      ],
      [done("ENG-1", 30)],
    );
    await rpc("threads_archive_done", null);
    expect(archived).toEqual([]);
  });

  it("does not archive again a thread that was unarchived", async () => {
    const { host, rpc, archived, threads } = await load(
      [thread("thr_a", "ENG-1")],
      [done("ENG-1", 30)],
    );
    await rpc("threads_archive_done", null);
    expect(archived).toEqual(["thr_a"]);

    // Someone brings it back; bb fires the event.
    const [first] = threads;
    if (first === undefined) throw new Error("no thread");
    first.archivedAt = null;
    await host.harness.behavior.emitThreadEvent("thread.unarchived", {
      thread: makeThreadResponse({ id: "thr_a", title: "ENG-1" }),
    });
    vi.setSystemTime(NOW + 48 * HOUR);
    await rpc("threads_archive_done", null);
    await host.harness.behavior.runSchedule("archive-done-threads");
    expect(archived).toEqual(["thr_a"]);
  });

  it("does not archive again a thread it archived when the unarchive event was missed", async () => {
    const { rpc, archived, threads } = await load([thread("thr_a", "ENG-1")], [done("ENG-1", 30)]);
    await rpc("threads_archive_done", null);
    const [first] = threads;
    if (first === undefined) throw new Error("no thread");
    first.archivedAt = null;
    vi.setSystemTime(NOW + 48 * HOUR);
    await rpc("threads_archive_done", null);
    expect(archived).toEqual(["thr_a"]);
  });

  it("does not archive a thread someone unarchived after its issue was Done", async () => {
    const { host, rpc, archived } = await load([thread("thr_a", "ENG-1")], [done("ENG-1", 30)]);
    await host.harness.behavior.emitThreadEvent("thread.unarchived", {
      thread: makeThreadResponse({ id: "thr_a", title: "ENG-1" }),
    });
    await rpc("threads_archive_done", null);
    expect(archived).toEqual([]);
  });

  it("archives the thread of an issue that is Done again after an unarchive", async () => {
    const issues = [done("ENG-1", 30)];
    const { host, rpc, archived } = await load([thread("thr_a", "ENG-1")], issues);
    await host.harness.behavior.emitThreadEvent("thread.unarchived", {
      thread: makeThreadResponse({ id: "thr_a", title: "ENG-1" }),
    });
    // The issue was reopened and finished again, a full day before this sweep.
    vi.setSystemTime(NOW + 72 * HOUR);
    issues[0] = { ...done("ENG-1", 25), completedAt: new Date(NOW + 46 * HOUR).toISOString() };
    await rpc("threads_archive_done", null);
    expect(archived).toEqual(["thr_a"]);
  });

  it("runs on its schedule", async () => {
    const { host, archived } = await load([thread("thr_a", "ENG-1")], [done("ENG-1", 30)]);
    await host.harness.behavior.runSchedule("archive-done-threads");
    expect(archived).toEqual(["thr_a"]);
  });

  it("does not run on its schedule while Optio is paused", async () => {
    const { host, archived } = await load([thread("thr_a", "ENG-1")], [done("ENG-1", 30)], {
      paused: true,
    });
    await host.harness.behavior.runSchedule("archive-done-threads");
    expect(archived).toEqual([]);
  });

  it("reports why when the board was never set up, and touches nothing", async () => {
    const host = createFakePluginHost({
      pluginId: "optio",
      settings: { linearApiKey: "lin_key" },
      agentSkillIds: ["optio"],
    });
    await plugin(host.bb);
    // SAFETY: the fake host's callRpc parses every result with the method's output schema in rpcContract.
    const rpc = host.harness.behavior.callRpc as Rpc;
    const result = await rpc("threads_archive_done", null);
    expect(result.error).toMatch(/board is not set up/);
    expect(result.archived).toEqual([]);
  });

  it("reports a Linear failure and archives nothing", async () => {
    const { rpc, archived } = await load([thread("thr_a", "ENG-1")], [done("ENG-1", 30)]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 500 })),
    );
    const result = await rpc("threads_archive_done", null);
    expect(result.error).toMatch(/Linear answered 500/);
    expect(archived).toEqual([]);
  });
});
