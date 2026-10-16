import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { planBoard, scopesOverlap } from "./board.js";
import type { SpawnRequest } from "./sessions.js";
import { DISPATCH_MIGRATIONS, createDispatchStore } from "./dispatch-store.js";
import { fetchBoard, parseWriteScope, type Board, type BoardIssue } from "./linear-api.js";
import { createScheduler } from "./scheduler.js";
import { parseScheduler, type SchedulerConfig } from "./scheduler-config.js";

function config(overrides: Record<string, unknown> = {}): SchedulerConfig {
  const parsed = parseScheduler(
    JSON.stringify({
      mode: "live",
      projectId: "proj_1",
      teamKey: "KIT",
      workflow: "kit-issue",
      skipLabels: ["needs-info"],
      machines: [
        { id: "mac", cap: 1, capabilities: ["postgres"], hostId: "host_mac", branch: "origin/development" },
        { id: "harness", cap: 2, hostId: "host_harness", branch: "origin/development" },
      ],
      requirements: [{ capability: "postgres", labels: ["api"], scope: ["apps/api/"] }],
      ...overrides,
    }),
  );
  if (!parsed.ok || parsed.config === null) throw new Error(parsed.ok ? "empty" : parsed.error);
  return parsed.config;
}

let serial = 0;
function issue(identifier: string, overrides: Partial<BoardIssue> = {}): BoardIssue {
  serial += 1;
  return {
    id: `id-${identifier}`,
    identifier,
    title: identifier,
    priority: 3,
    createdAt: `2026-10-01T00:00:${String(serial).padStart(2, "0")}Z`,
    state: "To-do",
    labels: ["ready-for-agent"],
    milestone: null,
    project: null,
    blockedBy: [],
    writeScope: [],
    ...overrides,
  };
}

const plan = (issues: BoardIssue[], focus: string | null = null, overrides = {}) =>
  planBoard({ issues, config: config(overrides), focus, history: new Map() });

describe("write scope", () => {
  it("reads the declared globs", () => {
    expect(parseWriteScope("Intro\n\nwrite-scope: `apps/api/**`, packages/db/**\nMore")).toEqual([
      "apps/api/**",
      "packages/db/**",
    ]);
    expect(parseWriteScope("no scope here")).toEqual([]);
  });

  it("overlaps when one static prefix contains the other", () => {
    expect(scopesOverlap(["apps/api/**"], ["apps/api/src/auth/**"])).toBe(true);
    expect(scopesOverlap(["apps/api/**"], ["apps/mobile/**"])).toBe(false);
    expect(scopesOverlap([], ["apps/mobile/**"])).toBe(false);
  });
});

describe("planBoard", () => {
  it("starts only ready, unblocked, unskipped issues in the dispatch state", () => {
    const result = plan([
      issue("KIT-1"),
      issue("KIT-2", { blockedBy: ["KIT-1"] }),
      issue("KIT-3", { labels: ["ready-for-agent", "needs-info"] }),
      issue("KIT-4", { labels: [] }),
      issue("KIT-5", { state: "Backlog" }),
    ]);
    expect(result.start.map((start) => start.issue.identifier)).toEqual(["KIT-1"]);
    expect(result.waiting).toEqual([
      { identifier: "KIT-2", reason: "blocked by KIT-1" },
      { identifier: "KIT-3", reason: "labelled needs-info" },
    ]);
  });

  it("takes the focus milestone first, then priority, then age", () => {
    const result = plan(
      [
        issue("KIT-1", { priority: 1 }),
        issue("KIT-2", { priority: 4, milestone: "Collection v2" }),
        issue("KIT-3", { priority: 0 }),
        issue("KIT-4", { priority: 2 }),
      ],
      "collection v2",
    );
    expect(result.start.map((start) => start.issue.identifier)).toEqual(["KIT-2", "KIT-1", "KIT-4"]);
    expect(result.waiting).toEqual([{ identifier: "KIT-3", reason: "no free slot on harness or mac" }]);
  });

  it("keeps the capable machine for the issues that need it", () => {
    const result = plan([
      issue("KIT-1"),
      issue("KIT-2", { labels: ["ready-for-agent", "api"] }),
      issue("KIT-3", { writeScope: ["apps/api/src/**"] }),
    ]);
    expect(result.start.map((start) => [start.issue.identifier, start.machineId])).toEqual([
      ["KIT-1", "harness"],
      ["KIT-2", "mac"],
    ]);
    expect(result.waiting).toEqual([{ identifier: "KIT-3", reason: "no free slot on mac" }]);
  });

  it("holds an issue whose write scope overlaps work in progress or an earlier start", () => {
    const result = plan([
      issue("KIT-1", { state: "In Review", writeScope: ["apps/mobile/**"] }),
      issue("KIT-2", { writeScope: ["apps/mobile/src/tabs/**"] }),
      issue("KIT-3", { writeScope: ["apps/admin/**"] }),
      issue("KIT-4", { writeScope: ["apps/admin/src/**"] }),
    ]);
    expect(result.start.map((start) => start.issue.identifier)).toEqual(["KIT-3"]);
    expect(result.waiting).toEqual([
      { identifier: "KIT-2", reason: "write scope overlaps KIT-1" },
      { identifier: "KIT-4", reason: "write scope overlaps KIT-3" },
    ]);
  });

  it("counts active runs against capacity, holds stalls and resumes what ran before", () => {
    const result = planBoard({
      issues: [issue("KIT-1", { state: "In Progress" }), issue("KIT-2"), issue("KIT-3"), issue("KIT-4")],
      config: config(),
      focus: null,
      history: new Map([
        ["KIT-1", { activeOn: "harness", stalled: false, startedBefore: true }],
        ["KIT-2", { activeOn: null, stalled: true, startedBefore: true }],
        ["KIT-3", { activeOn: null, stalled: false, startedBefore: true }],
      ]),
    });
    expect(result.running).toEqual([{ identifier: "KIT-1", machineId: "harness" }]);
    expect(result.start.map((start) => [start.issue.identifier, start.machineId, start.resume])).toEqual([
      ["KIT-3", "harness", true],
      ["KIT-4", "mac", false],
    ]);
    expect(result.waiting[0]?.identifier).toBe("KIT-2");
  });

  it("lists blocked issues whose blockers are resolved", () => {
    const result = plan([issue("KIT-1", { state: "Blocked" }), issue("KIT-2", { state: "Blocked", blockedBy: ["KIT-9"] })]);
    expect(result.unblock.map((entry) => entry.identifier)).toEqual(["KIT-1"]);
  });
});

function setup(board: Board) {
  const db = new Database(":memory:");
  for (const statement of DISPATCH_MIGRATIONS) db.exec(statement);
  const store = createDispatchStore(db);
  const state = {
    clock: 1_000_000,
    spawned: [] as SpawnRequest[],
    notes: [] as string[],
    moved: [] as string[],
    promoted: [] as { identifier: string; stateId: string; comment: string }[],
    lastRefill: null as number | null,
    workflowActive: true,
    threadStatus: "idle" as string | null,
    board,
  };
  const scheduler = createScheduler({
    store,
    loadBoard: async () => state.board,
    moveIssue: async (issueId, stateId) => void state.moved.push(`${issueId}->${stateId}`),
    async spawn(request) {
      state.spawned.push(request);
      return { id: `thr_${state.spawned.length}` };
    },
    threadStatus: async () => state.threadStatus,
    workflowRuns: async () => ({
      active: state.workflowActive,
      last: state.workflowActive ? null : 'workflow run wf_1 succeeded in phase "Review gate"',
    }),
    notify: async (text) => void state.notes.push(text),
    getFocus: async () => null,
    promoteIssue: async (promoted, stateId, comment) =>
      void state.promoted.push({ identifier: promoted.identifier, stateId, comment }),
    getLastRefill: async () => state.lastRefill,
    setLastRefill: async (at) => void (state.lastRefill = at),
    now: () => state.clock,
    log: () => {},
  });
  return { scheduler, store, state };
}

describe("refilling the queue from the backlog", () => {
  const states = { "To-do": "state-todo" };
  const backlog = (identifier: string, overrides: Partial<BoardIssue> = {}) =>
    issue(identifier, { state: "Backlog", labels: [], ...overrides });

  it("plans room as capacity less running and ready, and lists what may be promoted, best first", () => {
    const result = plan(
      [
        issue("KIT-1"),
        backlog("KIT-2", { priority: 4 }),
        backlog("KIT-3", { priority: 1 }),
        backlog("KIT-4", { blockedBy: ["KIT-1"] }),
        backlog("KIT-5", { labels: ["needs-info"] }),
        backlog("KIT-6", { priority: 4, milestone: "Samling 1.0" }),
      ],
      "Samling 1.0",
    );
    expect(result.ready).toBe(1);
    expect(result.room).toBe(2); // capacity 3: one ready, none running
    expect(result.promotable.map((entry) => entry.identifier)).toEqual(["KIT-6", "KIT-3", "KIT-2"]);
  });

  it("asks the orchestrator once per interval, only when switched on and there is room", async () => {
    const board = { states, issues: [backlog("KIT-2"), backlog("KIT-3")] };
    const off = setup(board);
    await off.scheduler.tick(config(), true);
    expect(off.state.notes).toHaveLength(0);

    const { scheduler, state } = setup(board);
    const on = config({ autoPromote: true, refillMinutes: 30 });
    expect((await scheduler.tick(on, true)).refillRequested).toBe(true);
    expect(state.notes[0]).toContain("room for 3 more issues");
    expect(state.notes[0]).toContain("- KIT-2  P3  no milestone  KIT-2");
    expect(state.notes[0]).toContain('bb meta-agents promote <issue> --reason "<why now>"');
    state.clock += 10 * 60_000;
    expect((await scheduler.tick(on, true)).refillRequested).toBe(false);
    state.clock += 21 * 60_000;
    expect((await scheduler.tick(on, true)).refillRequested).toBe(true);
    expect(state.notes).toHaveLength(2);
  });

  it("does not ask when the queue is full or the backlog has nothing unblocked", async () => {
    const on = config({ autoPromote: true });
    const full = setup({ states, issues: [issue("KIT-1"), issue("KIT-2"), issue("KIT-3"), issue("KIT-4"), backlog("KIT-9")] });
    await full.scheduler.tick(on, true);
    expect(full.state.notes).toHaveLength(0);
    const empty = setup({ states, issues: [backlog("KIT-9", { blockedBy: ["KIT-1"] })] });
    await empty.scheduler.tick(on, true);
    expect(empty.state.notes).toHaveLength(0);
  });

  it("promotes a backlog issue with the reason as its comment", async () => {
    const { scheduler, state } = setup({ states, issues: [backlog("KIT-2")] });
    await scheduler.promote(config(), "KIT-2", "finishes Samling 1.0");
    expect(state.promoted).toEqual([
      {
        identifier: "KIT-2",
        stateId: "state-todo",
        comment: "Orchestrator: promoted from Backlog to To-do with ready-for-agent.\n\nWhy now: finishes Samling 1.0",
      },
    ]);
  });

  it("refuses what may not be promoted", async () => {
    const { scheduler, state } = setup({
      states,
      issues: [
        issue("KIT-1"),
        backlog("KIT-2", { blockedBy: ["KIT-1"] }),
        backlog("KIT-3", { labels: ["needs-info"] }),
      ],
    });
    await expect(scheduler.promote(config(), "KIT-1", "x")).rejects.toThrow("only Backlog issues are promoted");
    await expect(scheduler.promote(config(), "KIT-2", "x")).rejects.toThrow("blocked by KIT-1");
    await expect(scheduler.promote(config(), "KIT-3", "x")).rejects.toThrow("labelled needs-info");
    await expect(scheduler.promote(config(), "KIT-99", "x")).rejects.toThrow("not an open issue");
    expect(state.promoted).toHaveLength(0);
  });

  it("refuses to grow the queue past the machines' capacity", async () => {
    const { scheduler } = setup({ states, issues: [issue("KIT-1"), issue("KIT-2"), issue("KIT-3"), backlog("KIT-4")] });
    await expect(scheduler.promote(config(), "KIT-4", "x")).rejects.toThrow("the queue is full");
  });
});

describe("scheduler", () => {
  const states = { "To-do": "state-todo" };

  it("starts nothing and writes nothing without apply", async () => {
    const { scheduler, store, state } = setup({ states, issues: [issue("KIT-1"), issue("KIT-2", { state: "Blocked" })] });
    const result = await scheduler.tick(config(), false);
    expect(result.plan.start).toHaveLength(1);
    expect(state.spawned).toHaveLength(0);
    expect(state.moved).toHaveLength(0);
    expect(store.list(10)).toHaveLength(0);
  });

  it("starts the workflow on the chosen machine and does not start it twice", async () => {
    const { scheduler, state } = setup({ states, issues: [issue("KIT-1")] });
    await scheduler.tick(config(), true);
    await scheduler.tick(config(), true);
    expect(state.spawned).toHaveLength(1);
    expect(state.spawned[0]?.prompt).toContain(
      `bb workflows run --name kit-issue --args '{"issue":"KIT-1","machine":"harness"}' --json`,
    );
    expect(state.spawned[0]?.title).toBe("KIT-1 on harness");
    expect(state.spawned[0]?.environment).toEqual({
      type: "provider",
      environmentProviderId: "git-worktree",
      machine: { type: "existing", hostId: "host_harness" },
      inputs: { branch: { kind: "named", name: "origin/development" } },
    });
  });

  it("moves an unblocked issue back to the dispatch state", async () => {
    const { scheduler, state } = setup({ states, issues: [issue("KIT-2", { state: "Blocked" })] });
    const result = await scheduler.tick(config(), true);
    expect(result.unblocked).toEqual(["KIT-2"]);
    expect(state.moved).toEqual(["id-KIT-2->state-todo"]);
  });

  it("frees the slot when the run handed the issue over", async () => {
    const { scheduler, store, state } = setup({ states, issues: [issue("KIT-1")] });
    await scheduler.tick(config(), true);
    state.clock += 10 * 60_000;
    state.workflowActive = false;
    state.board = { states, issues: [issue("KIT-1", { state: "Approval" })] };
    const result = await scheduler.tick(config(), true);
    expect(result.stalled).toHaveLength(0);
    expect(store.latest("KIT-1")).toMatchObject({ status: "handed-over", outcome: "Approval" });
    expect(state.notes).toHaveLength(0);
  });

  it("reports a run that ended at a gate, resumes it once, then refuses at the cap", async () => {
    const stuck = { states, issues: [issue("KIT-1", { state: "In Review" })] };
    const { scheduler, store, state } = setup({ states, issues: [issue("KIT-1")] });
    await scheduler.tick(config(), true);

    // Inside the start grace the run is left alone even though nothing shows yet.
    state.workflowActive = false;
    state.board = stuck;
    expect((await scheduler.tick(config(), true)).stalled).toHaveLength(0);

    state.clock += 10 * 60_000;
    const first = await scheduler.tick(config(), true);
    expect(first.stalled.map((dispatch) => dispatch.issue)).toEqual(["KIT-1"]);
    expect(state.notes[0]).toContain("KIT-1 stopped without a hand-over (attempt 1 of 2)");
    expect(state.notes[0]).toContain('in phase "Review gate"; the issue is in In Review');
    expect(state.notes[0]).toContain("bb meta-agents resume KIT-1");
    expect(state.spawned).toHaveLength(1); // a stalled issue is not restarted by the plan

    const resumed = await scheduler.resume(config(), "KIT-1");
    expect(resumed).toMatchObject({ machineId: "harness", resume: true, threadId: "thr_2" });
    expect(state.spawned[1]?.prompt).toContain(`'{"issue":"KIT-1","resume":true,"machine":"harness"}'`);

    state.clock += 10 * 60_000;
    await scheduler.tick(config(), true);
    expect(state.notes[1]).toContain("attempt 2 of 2");
    expect(state.notes[1]).toContain("is refused");
    await expect(scheduler.resume(config(), "KIT-1")).rejects.toThrow("reached the cap of 2 attempts");

    expect(store.release("KIT-1")).toBe(true);
    expect(store.history().get("KIT-1")).toMatchObject({ stalled: false, startedBefore: true });
  });

  it("keeps a run active while its workflow or its launcher thread is still going", async () => {
    const { scheduler, store, state } = setup({ states, issues: [issue("KIT-1")] });
    await scheduler.tick(config(), true);
    state.clock += 10 * 60_000;
    await scheduler.tick(config(), true);
    state.workflowActive = false;
    state.threadStatus = "active";
    await scheduler.tick(config(), true);
    expect(store.active()).toHaveLength(1);
  });

  it("refuses a resume when the machine is full", async () => {
    const { scheduler, store, state } = setup({ states, issues: [] });
    const now = state.clock;
    const stalled = store.start({ issue: "KIT-1", machineId: "mac", resume: false, now });
    store.end(stalled.id, "stalled", "x", now);
    store.start({ issue: "KIT-2", machineId: "mac", resume: false, now });
    await expect(scheduler.resume(config(), "KIT-1")).rejects.toThrow("no free slot on mac (1 of 1 in use)");
  });
});

describe("fetchBoard", () => {
  it("maps Linear's answer and keeps only unresolved blockers", async () => {
    const node = (identifier: string, extra: Record<string, unknown> = {}) => ({
      id: `id-${identifier}`,
      identifier,
      title: identifier,
      priority: 2,
      createdAt: "2026-10-01T00:00:00Z",
      description: "write-scope: apps/api/**",
      state: { name: "To-do" },
      labels: { nodes: [{ name: "ready-for-agent" }] },
      projectMilestone: { name: "M1" },
      project: { name: "Collection" },
      inverseRelations: {
        nodes: [
          { type: "blocks", issue: { identifier: "KIT-7", state: { type: "started" } } },
          { type: "blocks", issue: { identifier: "KIT-8", state: { type: "completed" } } },
          { type: "related", issue: { identifier: "KIT-9", state: { type: "started" } } },
        ],
      },
      ...extra,
    });
    const calls: unknown[] = [];
    const fakeFetch = (async (_url: unknown, init?: { body?: unknown; headers?: unknown }) => {
      calls.push(init);
      const second = calls.length === 2;
      return new Response(
        JSON.stringify({
          data: {
            teams: { nodes: [{ states: { nodes: [{ id: "s1", name: "To-do" }] } }] },
            issues: {
              pageInfo: { hasNextPage: !second, endCursor: second ? null : "c1" },
              nodes: [node(second ? "KIT-2" : "KIT-1")],
            },
          },
        }),
      );
    }) as typeof fetch;
    const board = await fetchBoard("lin_key", "KIT", fakeFetch);
    expect(board.states).toEqual({ "To-do": "s1" });
    expect(board.issues.map((entry) => entry.identifier)).toEqual(["KIT-1", "KIT-2"]);
    expect(board.issues[0]).toMatchObject({ blockedBy: ["KIT-7"], writeScope: ["apps/api/**"], milestone: "M1" });
    expect((calls[0] as { headers: Record<string, string> }).headers.authorization).toBe("lin_key");
  });

  it("fails loudly on a GraphQL error", async () => {
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ errors: [{ message: "Query too complex" }] }))) as typeof fetch;
    await expect(fetchBoard("k", "KIT", fakeFetch)).rejects.toThrow("Linear answered 200: Query too complex");
  });
});
