import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { planBoard, scopesOverlap } from "./board.js";
import { createDispatchStore, DISPATCH_MIGRATIONS, LOOP_MIGRATIONS } from "./dispatch-store.js";
import { type Board, type BoardIssue, fetchBoard, parseWriteScope } from "./linear-api.js";
import { parseRegistry, type Registry } from "./loop-registry.js";
import { createScheduler } from "./scheduler.js";
import { parseScheduler, type SchedulerConfig } from "./scheduler-config.js";
import type { SpawnRequest } from "./sessions.js";

function config(overrides: Record<string, unknown> = {}): SchedulerConfig {
  const parsed = parseScheduler(
    JSON.stringify({
      mode: "live",
      projectId: "proj_1",
      teamKey: "ENG",
      backlogState: "Icebox",
      activeStates: ["Doing", "Reviewing"],
      blockedState: "Waiting",
      machines: [
        {
          id: "mac",
          cap: 1,
          capabilities: ["postgres"],
          hostId: "host_mac",
          branch: "origin/main",
        },
        { id: "harness", cap: 2, hostId: "host_harness", branch: "origin/main" },
      ],
      requirements: [{ capability: "postgres", labels: ["api"], scope: ["apps/api/"] }],
      ...overrides,
    }),
  );
  if (!parsed.ok || parsed.config === null) throw new Error(parsed.ok ? "empty" : parsed.error);
  return parsed.config;
}

const issueLoop = {
  name: "Issue run",
  enabled: true,
  workflow: "issue-run",
  trigger: {
    kind: "issue",
    state: "Ready",
    label: "agent-ready",
    unblocked: true,
    skipLabels: ["on-hold"],
    priorityOrder: [1, 2, 3, 4, 0],
  },
  machines: ["harness", "mac"],
  maxLive: 16,
};

/** The registry text a project checkout would hold. */
const registryText = (loops: Record<string, unknown>[] = [issueLoop], flow: unknown = undefined) =>
  JSON.stringify({ loops, flow });

function registry(loops?: Record<string, unknown>[], flow?: unknown): Registry {
  const parsed = parseRegistry(registryText(loops, flow));
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.registry;
}

const trigger = (overrides: Record<string, unknown>) => ({ ...issueLoop.trigger, ...overrides });

let serial = 0;
function issue(identifier: string, overrides: Partial<BoardIssue> = {}): BoardIssue {
  serial += 1;
  return {
    id: `id-${identifier}`,
    identifier,
    title: identifier,
    priority: 3,
    createdAt: `2026-10-01T00:00:${String(serial).padStart(2, "0")}Z`,
    state: "Ready",
    labels: ["agent-ready"],
    milestone: null,
    project: null,
    blockedBy: [],
    writeScope: [],
    ...overrides,
  };
}

const plan = (
  issues: BoardIssue[],
  focus: string | null = null,
  overrides = {},
  loaded: Registry = registry(),
) => planBoard({ issues, config: config(overrides), registry: loaded, focus, history: new Map() });

describe("scheduler config", () => {
  it("keeps what the Loop registry took over, so a config stored before it still parses", () => {
    const stored = {
      ...config(),
      workflow: "issue-run",
      dispatchState: "Ready",
      readyLabel: "agent-ready",
      skipLabels: ["on-hold"],
      priorityOrder: [1, 2, 3, 4, 0],
    };
    expect(parseScheduler(JSON.stringify(stored))).toMatchObject({ ok: true });
  });

  it("takes the operating states from the config, with no default", () => {
    for (const field of ["backlogState", "activeStates", "blockedState"]) {
      const stored = { ...config(), [field]: undefined };
      expect(parseScheduler(JSON.stringify(stored))).toMatchObject({
        ok: false,
        error: expect.stringContaining(`scheduler.${field}:`),
      });
    }
    expect(parseScheduler(JSON.stringify({ ...config(), blockedState: null }))).toMatchObject({
      ok: true,
    });
  });
});

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
    // Test globs are companion paths (ADR-0064): they never hold a scope.
    expect(
      scopesOverlap(["apps/mobile/tests/**"], ["apps/mobile/tests/capture-overview.test.ts"]),
    ).toBe(false);
    expect(
      scopesOverlap(
        ["apps/mobile/src/search/**", "apps/mobile/tests/**"],
        ["apps/mobile/tests/**"],
      ),
    ).toBe(false);
    expect(scopesOverlap(["apps/mobile/src/search/**"], ["apps/mobile/src/**"])).toBe(true);
    expect(scopesOverlap(["apps/mobile/.maestro/**"], ["apps/mobile/.maestro/flows/a.yaml"])).toBe(
      true,
    );
  });
});

describe("planBoard", () => {
  it("starts only ready, unblocked, unskipped issues in the dispatch state", () => {
    const result = plan([
      issue("ENG-1"),
      issue("ENG-2", { blockedBy: ["ENG-1"] }),
      issue("ENG-3", { labels: ["agent-ready", "on-hold"] }),
      issue("ENG-4", { labels: [] }),
      issue("ENG-5", { state: "Icebox" }),
    ]);
    expect(result.start.map((start) => start.issue.identifier)).toEqual(["ENG-1"]);
    expect(result.waiting).toEqual([
      { identifier: "ENG-2", loop: "Issue run", reason: "blocked by ENG-1" },
      { identifier: "ENG-3", loop: "Issue run", reason: "labelled on-hold" },
    ]);
  });

  it("takes the focus milestone first, then priority, then age", () => {
    const result = plan(
      [
        issue("ENG-1", { priority: 1 }),
        issue("ENG-2", { priority: 4, milestone: "Collection v2" }),
        issue("ENG-3", { priority: 0 }),
        issue("ENG-4", { priority: 2 }),
      ],
      "collection v2",
    );
    expect(result.start.map((start) => start.issue.identifier)).toEqual([
      "ENG-2",
      "ENG-1",
      "ENG-4",
    ]);
    expect(result.waiting).toEqual([
      { identifier: "ENG-3", loop: "Issue run", reason: "no free slot on harness or mac" },
    ]);
  });

  it("keeps the capable machine for the issues that need it", () => {
    const result = plan([
      issue("ENG-1"),
      issue("ENG-2", { labels: ["agent-ready", "api"] }),
      issue("ENG-3", { writeScope: ["apps/api/src/**"] }),
    ]);
    expect(result.start.map((start) => [start.issue.identifier, start.machineId])).toEqual([
      ["ENG-1", "harness"],
      ["ENG-2", "mac"],
    ]);
    expect(result.waiting).toEqual([
      { identifier: "ENG-3", loop: "Issue run", reason: "no free slot on mac" },
    ]);
  });

  it("holds an issue whose write scope overlaps work in progress or an earlier start", () => {
    const result = plan([
      issue("ENG-1", { state: "Reviewing", writeScope: ["apps/mobile/**"] }),
      issue("ENG-2", { writeScope: ["apps/mobile/src/tabs/**"] }),
      issue("ENG-3", { writeScope: ["apps/admin/**"] }),
      issue("ENG-4", { writeScope: ["apps/admin/src/**"] }),
    ]);
    expect(result.start.map((start) => start.issue.identifier)).toEqual(["ENG-3"]);
    expect(result.waiting).toEqual([
      { identifier: "ENG-2", loop: "Issue run", reason: "write scope overlaps ENG-1" },
      { identifier: "ENG-4", loop: "Issue run", reason: "write scope overlaps ENG-3" },
    ]);
  });

  it("counts active runs against capacity, holds stalls and resumes what ran before", () => {
    const result = planBoard({
      issues: [issue("ENG-1", { state: "Doing" }), issue("ENG-2"), issue("ENG-3"), issue("ENG-4")],
      config: config(),
      registry: registry(),
      focus: null,
      history: new Map([
        [
          "ENG-1",
          { activeOn: "harness", activeLoop: "Issue run", stalled: false, startedBefore: true },
        ],
        ["ENG-2", { activeOn: null, activeLoop: null, stalled: true, startedBefore: true }],
        ["ENG-3", { activeOn: null, activeLoop: null, stalled: false, startedBefore: true }],
      ]),
    });
    expect(result.running).toEqual([
      { identifier: "ENG-1", machineId: "harness", loop: "Issue run" },
    ]);
    expect(
      result.start.map((start) => [start.issue.identifier, start.machineId, start.resume]),
    ).toEqual([
      ["ENG-3", "harness", true],
      ["ENG-4", "mac", false],
    ]);
    expect(result.waiting[0]?.identifier).toBe("ENG-2");
  });

  describe("per Loop", () => {
    const second = {
      ...issueLoop,
      name: "Review run",
      workflow: "review-run",
      trigger: trigger({ state: "Queued", label: "needs-review", skipLabels: [] }),
      machines: ["harness"],
      maxLive: 1,
    };
    const two = () => registry([issueLoop, second]);

    it("gives each Loop its own candidates, workflow and machines", () => {
      const result = plan(
        [
          issue("ENG-1"),
          issue("ENG-2", { state: "Queued", labels: ["needs-review"] }),
          issue("ENG-3", { state: "Queued", labels: ["agent-ready"] }),
        ],
        null,
        {},
        two(),
      );
      expect(
        result.start.map((start) => [start.issue.identifier, start.loop, start.machineId]),
      ).toEqual([
        ["ENG-1", "Issue run", "harness"],
        ["ENG-2", "Review run", "harness"],
      ]);
      expect(result.ready).toBe(2);
    });

    it("shares machine capacity and write scope across Loops", () => {
      const result = plan(
        [
          issue("ENG-1"),
          issue("ENG-2"),
          issue("ENG-3", { state: "Queued", labels: ["needs-review"] }),
          issue("ENG-4", { writeScope: ["apps/admin/**"] }),
          issue("ENG-5", {
            state: "Queued",
            labels: ["needs-review"],
            writeScope: ["apps/admin/src/**"],
          }),
        ],
        null,
        { machines: [{ id: "harness", cap: 2, hostId: "h", branch: "origin/main" }] },
        registry([
          { ...issueLoop, machines: ["harness"] },
          { ...second, maxLive: 5 },
        ]),
      );
      expect(result.start.map((start) => start.issue.identifier)).toEqual(["ENG-1", "ENG-2"]);
      expect(result.waiting).toEqual([
        { identifier: "ENG-4", loop: "Issue run", reason: "no free slot on harness" },
        { identifier: "ENG-3", loop: "Review run", reason: "no free slot on harness" },
        { identifier: "ENG-5", loop: "Review run", reason: "no free slot on harness" },
      ]);
    });

    it("holds an issue whose write scope overlaps a start of another Loop", () => {
      const result = plan(
        [
          issue("ENG-1", { writeScope: ["apps/admin/**"] }),
          issue("ENG-2", {
            state: "Queued",
            labels: ["needs-review"],
            writeScope: ["apps/admin/src/**"],
          }),
        ],
        null,
        {},
        two(),
      );
      expect(result.start.map((start) => start.issue.identifier)).toEqual(["ENG-1"]);
      expect(result.waiting).toEqual([
        { identifier: "ENG-2", loop: "Review run", reason: "write scope overlaps ENG-1" },
      ]);
    });

    it("keeps a Loop to its own machines and says when it names one the board does not have", () => {
      const result = plan(
        [issue("ENG-1", { labels: ["agent-ready", "api"] }), issue("ENG-2")],
        null,
        {},
        registry([{ ...issueLoop, machines: ["harness", "ghost"] }]),
      );
      expect(result.start.map((start) => [start.issue.identifier, start.machineId])).toEqual([
        ["ENG-2", "harness"],
      ]);
      expect(result.waiting).toEqual([
        { identifier: "ENG-1", loop: "Issue run", reason: "no machine has postgres" },
      ]);
      const unknown = plan(
        [issue("ENG-1")],
        null,
        {},
        registry([{ ...issueLoop, machines: ["ghost"] }]),
      );
      expect(unknown.waiting).toEqual([
        { identifier: "ENG-1", loop: "Issue run", reason: 'no machine "ghost"' },
      ]);
    });

    it("caps the live runs of each Loop, counting the runs already going", () => {
      const result = planBoard({
        issues: [issue("ENG-1", { state: "Doing" }), issue("ENG-2"), issue("ENG-3")],
        config: config(),
        registry: registry([{ ...issueLoop, maxLive: 2 }]),
        focus: null,
        history: new Map([
          [
            "ENG-1",
            { activeOn: "harness", activeLoop: "Issue run", stalled: false, startedBefore: true },
          ],
        ]),
      });
      expect(result.start.map((start) => start.issue.identifier)).toEqual(["ENG-2"]);
      expect(result.waiting).toEqual([
        { identifier: "ENG-3", loop: "Issue run", reason: "Issue run has 2 of 2 live runs" },
      ]);
    });

    it("plans nothing for a disabled Loop and does not count its trigger as ready", () => {
      const result = plan([issue("ENG-1")], null, {}, registry([{ ...issueLoop, enabled: false }]));
      expect(result.start).toEqual([]);
      expect(result.ready).toBe(0);
    });

    it("applies the trigger's skip labels, priority order and unblocked rule", () => {
      const result = plan(
        [
          issue("ENG-1", { priority: 1 }),
          issue("ENG-2", { priority: 4 }),
          issue("ENG-3", { priority: 3, labels: ["agent-ready", "hold"] }),
          issue("ENG-4", { blockedBy: ["ENG-9"] }),
        ],
        null,
        {},
        registry([
          {
            ...issueLoop,
            trigger: trigger({
              skipLabels: ["hold"],
              priorityOrder: [4, 3, 2, 1, 0],
              unblocked: false,
            }),
          },
        ]),
      );
      expect(result.start.map((start) => start.issue.identifier)).toEqual([
        "ENG-2",
        "ENG-4",
        "ENG-1",
      ]);
      expect(result.waiting).toEqual([
        { identifier: "ENG-3", loop: "Issue run", reason: "labelled hold" },
      ]);
    });

    it("holds an issue started as often as flow.maxRunsPerDay allows in the last 24 h", () => {
      const result = planBoard({
        issues: [issue("ENG-1"), issue("ENG-2")],
        config: config(),
        registry: registry([issueLoop], { maxRunsPerDay: 3 }),
        focus: null,
        history: new Map(),
        recentStarts: new Map([
          ["ENG-1", 3],
          ["ENG-2", 2],
        ]),
      });
      expect(result.start.map((start) => start.issue.identifier)).toEqual(["ENG-2"]);
      expect(result.waiting).toEqual([
        { identifier: "ENG-1", loop: "Issue run", reason: "started 3 times in 24 h (cap 3)" },
      ]);
    });
  });

  it("lists blocked issues whose blockers are resolved", () => {
    const result = plan([
      issue("ENG-1", { state: "Waiting" }),
      issue("ENG-2", { state: "Waiting", blockedBy: ["ENG-9"] }),
    ]);
    expect(result.unblock.map((entry) => entry.identifier)).toEqual(["ENG-1"]);
  });
});

function setup(board: Board) {
  const db = new Database(":memory:");
  for (const statement of [...DISPATCH_MIGRATIONS, ...LOOP_MIGRATIONS]) db.exec(statement);
  const store = createDispatchStore(db);
  const state: {
    clock: number;
    spawned: SpawnRequest[];
    notes: string[];
    moved: string[];
    promoted: { identifier: string; stateId: string; comment: string; label: string }[];
    registryText: string | (() => never);
    registryReads: number;
    lastRefill: number | null;
    workflowActive: boolean;
    threadStatus: string | null;
    board: Board;
  } = {
    clock: 1_000_000,
    spawned: [],
    notes: [],
    moved: [],
    promoted: [],
    registryText: registryText(),
    registryReads: 0,
    lastRefill: null,
    workflowActive: true,
    threadStatus: "idle",
    board,
  };
  const scheduler = createScheduler({
    store,
    async loadRegistry() {
      state.registryReads += 1;
      if (typeof state.registryText === "function") return state.registryText();
      return state.registryText;
    },
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
    promoteIssue: async (promoted, stateId, comment, label) =>
      void state.promoted.push({ identifier: promoted.identifier, stateId, comment, label }),
    getLastRefill: async () => state.lastRefill,
    setLastRefill: async (at) => {
      state.lastRefill = at;
    },
    now: () => state.clock,
    log: () => {},
  });
  return { scheduler, store, state };
}

describe("refilling the queue from the backlog", () => {
  const states = { Ready: "state-todo" };
  const backlog = (identifier: string, overrides: Partial<BoardIssue> = {}) =>
    issue(identifier, { state: "Icebox", labels: [], ...overrides });

  it("plans room as capacity less running and ready, and lists what may be promoted, best first", () => {
    const result = plan(
      [
        issue("ENG-1"),
        backlog("ENG-2", { priority: 4 }),
        backlog("ENG-3", { priority: 1 }),
        backlog("ENG-4", { blockedBy: ["ENG-1"] }),
        backlog("ENG-5", { labels: ["on-hold"] }),
        backlog("ENG-6", { priority: 4, milestone: "Launch 1.0" }),
      ],
      "Launch 1.0",
    );
    expect(result.ready).toBe(1);
    expect(result.room).toBe(2); // capacity 3: one ready, none running
    expect(result.promotable.map((entry) => entry.identifier)).toEqual(["ENG-6", "ENG-3", "ENG-2"]);
  });

  it("asks the orchestrator once per interval, only when switched on and there is room", async () => {
    const board = { states, issues: [backlog("ENG-2"), backlog("ENG-3")] };
    const off = setup(board);
    await off.scheduler.tick(config(), true);
    expect(off.state.notes).toHaveLength(0);

    const { scheduler, state } = setup(board);
    const on = config({ autoPromote: true, refillMinutes: 30 });
    expect((await scheduler.tick(on, true)).refillRequested).toBe(true);
    expect(state.notes[0]).toContain("room for 3 more issues");
    expect(state.notes[0]).toContain("- ENG-2  P3  no milestone  ENG-2");
    expect(state.notes[0]).toContain('bb optio promote <issue> --reason "<why now>"');
    state.clock += 10 * 60_000;
    expect((await scheduler.tick(on, true)).refillRequested).toBe(false);
    state.clock += 21 * 60_000;
    expect((await scheduler.tick(on, true)).refillRequested).toBe(true);
    expect(state.notes).toHaveLength(2);
  });

  it("does not ask when the queue is full or the backlog has nothing unblocked", async () => {
    const on = config({ autoPromote: true });
    const full = setup({
      states,
      issues: [issue("ENG-1"), issue("ENG-2"), issue("ENG-3"), issue("ENG-4"), backlog("ENG-9")],
    });
    await full.scheduler.tick(on, true);
    expect(full.state.notes).toHaveLength(0);
    const empty = setup({ states, issues: [backlog("ENG-9", { blockedBy: ["ENG-1"] })] });
    await empty.scheduler.tick(on, true);
    expect(empty.state.notes).toHaveLength(0);
  });

  it("promotes a backlog issue with the reason as its comment", async () => {
    const { scheduler, state } = setup({ states, issues: [backlog("ENG-2")] });
    await scheduler.promote(config(), "ENG-2", "finishes Launch 1.0");
    expect(state.promoted).toEqual([
      {
        identifier: "ENG-2",
        stateId: "state-todo",
        comment:
          "Orchestrator: promoted from Icebox to Ready with agent-ready.\n\nWhy now: finishes Launch 1.0",
        label: "agent-ready",
      },
    ]);
  });

  it("refuses what may not be promoted", async () => {
    const { scheduler, state } = setup({
      states,
      issues: [
        issue("ENG-1"),
        backlog("ENG-2", { blockedBy: ["ENG-1"] }),
        backlog("ENG-3", { labels: ["on-hold"] }),
      ],
    });
    await expect(scheduler.promote(config(), "ENG-1", "x")).rejects.toThrow(
      "only Icebox issues are promoted",
    );
    await expect(scheduler.promote(config(), "ENG-2", "x")).rejects.toThrow("blocked by ENG-1");
    await expect(scheduler.promote(config(), "ENG-3", "x")).rejects.toThrow("labelled on-hold");
    await expect(scheduler.promote(config(), "ENG-99", "x")).rejects.toThrow("not an open issue");
    expect(state.promoted).toHaveLength(0);
  });

  it("refuses to grow the queue past the machines' capacity", async () => {
    const { scheduler } = setup({
      states,
      issues: [issue("ENG-1"), issue("ENG-2"), issue("ENG-3"), backlog("ENG-4")],
    });
    await expect(scheduler.promote(config(), "ENG-4", "x")).rejects.toThrow("the queue is full");
  });
});

describe("scheduler", () => {
  const states = { Ready: "state-todo" };

  it("starts nothing and writes nothing without apply", async () => {
    const { scheduler, store, state } = setup({
      states,
      issues: [issue("ENG-1"), issue("ENG-2", { state: "Waiting" })],
    });
    const result = await scheduler.tick(config(), false);
    expect(result.plan.start).toHaveLength(1);
    expect(state.spawned).toHaveLength(0);
    expect(state.moved).toHaveLength(0);
    expect(store.list(10)).toHaveLength(0);
    expect(store.decisions(10)).toHaveLength(0);
  });

  it("refuses a registry that does not parse: nothing is read, started or moved, and the reason is recorded", async () => {
    const { scheduler, store, state } = setup({
      states,
      issues: [issue("ENG-1"), issue("ENG-2", { state: "Waiting" })],
    });
    state.registryText = "{ not json";
    const result = await scheduler.tick(config(), true);
    expect(result.refusal).toContain("factory.config.json is not valid JSON");
    expect(result.registry).toBeNull();
    expect(result.plan.start).toEqual([]);
    expect(state.spawned).toHaveLength(0);
    expect(state.moved).toHaveLength(0);
    expect(state.notes).toHaveLength(0);
    expect(store.decisions(10)).toMatchObject([
      { kind: "refusal", mode: "live", loop: null, issue: null },
    ]);
    // The same refusal on the next tick is not written again.
    await scheduler.tick(config(), true);
    expect(store.decisions(10)).toHaveLength(1);
    // A read that only shows the page records nothing.
    expect((await scheduler.tick(config(), false)).refusal).not.toBeNull();
    expect(store.decisions(10)).toHaveLength(1);
  });

  it("refuses when the file cannot be read", async () => {
    const { scheduler, state } = setup({ states, issues: [issue("ENG-1")] });
    state.registryText = () => {
      throw new Error("no such file");
    };
    const result = await scheduler.tick(config(), true);
    expect(result.refusal).toBe("could not read factory.config.json: no such file");
    expect(state.spawned).toHaveLength(0);
  });

  it("reads the registry on every tick, so an edit is picked up without a reload", async () => {
    const { scheduler, state } = setup({ states, issues: [issue("ENG-1")] });
    state.registryText = registryText([{ ...issueLoop, enabled: false }]);
    expect((await scheduler.tick(config(), true)).started).toHaveLength(0);
    state.registryText = registryText([{ ...issueLoop, workflow: "other-run" }]);
    await scheduler.tick(config(), true);
    expect(state.registryReads).toBe(2);
    expect(state.spawned[0]?.prompt).toContain("bb workflows run --name other-run ");
  });

  it("starts each issue with its own Loop's workflow and remembers the Loop", async () => {
    const { scheduler, store, state } = setup({
      states: { Ready: "state-todo", Queued: "state-queued" },
      issues: [issue("ENG-1"), issue("ENG-2", { state: "Queued", labels: ["needs-review"] })],
    });
    state.registryText = registryText([
      issueLoop,
      {
        ...issueLoop,
        name: "Review run",
        workflow: "review-run",
        trigger: trigger({ state: "Queued", label: "needs-review" }),
        maxLive: 1,
      },
    ]);
    await scheduler.tick(config(), true);
    expect(state.spawned.map((request) => request.prompt.match(/--name (\S+)/)?.[1])).toEqual([
      "issue-run",
      "review-run",
    ]);
    expect(store.latest("ENG-2")).toMatchObject({ loop: "Review run", status: "active" });
    expect(store.history().get("ENG-2")).toMatchObject({ activeLoop: "Review run" });
  });

  it("writes every start, skip and refusal with its reason, and does not repeat a wait", async () => {
    const { scheduler, store, state } = setup({
      states,
      issues: [issue("ENG-1"), issue("ENG-2", { labels: ["agent-ready", "on-hold"] })],
    });
    const first = await scheduler.tick(config(), true);
    expect(first.recorded).toMatchObject([
      { kind: "skip", issue: "ENG-2", loop: "Issue run", reason: "labelled on-hold", mode: "live" },
      { kind: "start", issue: "ENG-1", loop: "Issue run", reason: "started on harness" },
    ]);
    state.clock += 60_000;
    expect((await scheduler.tick(config(), true)).recorded).toEqual([]);
    expect(store.decisions(10)).toHaveLength(2);
    // A wait that changes its reason is a new row.
    state.board = { states, issues: [issue("ENG-1"), issue("ENG-2", { blockedBy: ["ENG-1"] })] };
    expect((await scheduler.tick(config(), true)).recorded).toMatchObject([
      { kind: "skip", issue: "ENG-2", reason: "blocked by ENG-1" },
    ]);
  });

  it("holds an issue started as often as flow.maxRunsPerDay allows, and says so", async () => {
    const { scheduler, store, state } = setup({ states, issues: [issue("ENG-1")] });
    state.registryText = registryText([issueLoop], { maxRunsPerDay: 2 });
    for (const [index, outcome] of ["x", "y"].entries()) {
      const run = store.start({
        issue: "ENG-1",
        loop: "Issue run",
        machineId: "mac",
        resume: false,
        now: state.clock - (index + 1) * 3600_000,
      });
      store.end(run.id, "handed-over", outcome, state.clock);
    }
    const result = await scheduler.tick(config(), true);
    expect(result.plan.waiting).toEqual([
      { identifier: "ENG-1", loop: "Issue run", reason: "started 2 times in 24 h (cap 2)" },
    ]);
    expect(state.spawned).toHaveLength(0);
    // A day later the starts no longer count.
    state.clock += 25 * 3600_000;
    expect((await scheduler.tick(config(), true)).started).toHaveLength(1);
  });

  it("in dry-run records what it would do and applies nothing", async () => {
    const { scheduler, store, state } = setup({
      states,
      issues: [issue("ENG-1"), issue("ENG-2", { state: "Waiting" })],
    });
    const result = await scheduler.tick(config(), false, true);
    expect(result.recorded).toMatchObject([
      { kind: "start", issue: "ENG-1", mode: "dry-run", reason: "would start on harness" },
    ]);
    expect(state.spawned).toHaveLength(0);
    expect(state.moved).toHaveLength(0);
    expect(store.list(10)).toHaveLength(0);
  });

  it("starts the workflow on the chosen machine and does not start it twice", async () => {
    const { scheduler, state } = setup({ states, issues: [issue("ENG-1")] });
    await scheduler.tick(config(), true);
    await scheduler.tick(config(), true);
    expect(state.spawned).toHaveLength(1);
    expect(state.spawned[0]?.prompt).toContain(
      `bb workflows run --name issue-run --args '{"issue":"ENG-1","machine":"harness"}' --json`,
    );
    expect(state.spawned[0]?.title).toBe("ENG-1 on harness");
    expect(state.spawned[0]?.environment).toEqual({
      type: "provider",
      environmentProviderId: "git-worktree",
      machine: { type: "existing", hostId: "host_harness" },
      inputs: { branch: { kind: "named", name: "origin/main" } },
    });
  });

  it("moves an unblocked issue back to the dispatch state", async () => {
    const { scheduler, state } = setup({ states, issues: [issue("ENG-2", { state: "Waiting" })] });
    const result = await scheduler.tick(config(), true);
    expect(result.unblocked).toEqual(["ENG-2"]);
    expect(state.moved).toEqual(["id-ENG-2->state-todo"]);
  });

  it("frees the slot when the run handed the issue over", async () => {
    const { scheduler, store, state } = setup({ states, issues: [issue("ENG-1")] });
    await scheduler.tick(config(), true);
    state.clock += 10 * 60_000;
    state.workflowActive = false;
    state.board = { states, issues: [issue("ENG-1", { state: "Accepted" })] };
    const result = await scheduler.tick(config(), true);
    expect(result.stalled).toHaveLength(0);
    expect(store.latest("ENG-1")).toMatchObject({ status: "handed-over", outcome: "Accepted" });
    expect(state.notes).toHaveLength(0);
  });

  it("reports a run that ended at a gate, resumes it once, then refuses at the cap", async () => {
    const stuck = { states, issues: [issue("ENG-1", { state: "Reviewing" })] };
    const { scheduler, store, state } = setup({ states, issues: [issue("ENG-1")] });
    await scheduler.tick(config(), true);

    // Inside the start grace the run is left alone even though nothing shows yet.
    state.workflowActive = false;
    state.board = stuck;
    expect((await scheduler.tick(config(), true)).stalled).toHaveLength(0);

    state.clock += 10 * 60_000;
    const first = await scheduler.tick(config(), true);
    expect(first.stalled.map((dispatch) => dispatch.issue)).toEqual(["ENG-1"]);
    expect(state.notes[0]).toContain("ENG-1 stopped without a hand-over (attempt 1 of 2)");
    expect(state.notes[0]).toContain('in phase "Review gate"; the issue is in Reviewing');
    expect(state.notes[0]).toContain("bb optio resume ENG-1");
    expect(state.spawned).toHaveLength(1); // a stalled issue is not restarted by the plan

    const resumed = await scheduler.resume(config(), "ENG-1");
    expect(resumed).toMatchObject({ machineId: "harness", resume: true, threadId: "thr_2" });
    expect(state.spawned[1]?.prompt).toContain(
      `'{"issue":"ENG-1","resume":true,"machine":"harness"}'`,
    );

    state.clock += 10 * 60_000;
    await scheduler.tick(config(), true);
    expect(state.notes[1]).toContain("attempt 2 of 2");
    expect(state.notes[1]).toContain("is refused");
    await expect(scheduler.resume(config(), "ENG-1")).rejects.toThrow(
      "reached the cap of 2 attempts",
    );

    expect(store.release("ENG-1")).toBe(true);
    expect(store.history().get("ENG-1")).toMatchObject({ stalled: false, startedBefore: true });
  });

  it("keeps a run active while its workflow or its launcher thread is still going", async () => {
    const { scheduler, store, state } = setup({ states, issues: [issue("ENG-1")] });
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
    const stalled = store.start({
      issue: "ENG-1",
      loop: "Issue run",
      machineId: "mac",
      resume: false,
      now,
    });
    store.end(stalled.id, "stalled", "x", now);
    store.start({ issue: "ENG-2", loop: "Issue run", machineId: "mac", resume: false, now });
    await expect(scheduler.resume(config(), "ENG-1")).rejects.toThrow(
      "no free slot on mac (1 of 1 in use)",
    );
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
      state: { name: "Ready" },
      labels: { nodes: [{ name: "agent-ready" }] },
      projectMilestone: { name: "M1" },
      project: { name: "Collection" },
      inverseRelations: {
        nodes: [
          { type: "blocks", issue: { identifier: "ENG-7", state: { type: "started" } } },
          { type: "blocks", issue: { identifier: "ENG-8", state: { type: "completed" } } },
          { type: "related", issue: { identifier: "ENG-9", state: { type: "started" } } },
        ],
      },
      ...extra,
    });
    const calls: (RequestInit | undefined)[] = [];
    const fakeFetch: typeof fetch = async (_url, init) => {
      calls.push(init);
      const second = calls.length === 2;
      return new Response(
        JSON.stringify({
          data: {
            teams: { nodes: [{ states: { nodes: [{ id: "s1", name: "Ready" }] } }] },
            issues: {
              pageInfo: { hasNextPage: !second, endCursor: second ? null : "c1" },
              nodes: [node(second ? "ENG-2" : "ENG-1")],
            },
          },
        }),
      );
    };
    const board = await fetchBoard("lin_key", "ENG", fakeFetch);
    expect(board.states).toEqual({ Ready: "s1" });
    expect(board.issues.map((entry) => entry.identifier)).toEqual(["ENG-1", "ENG-2"]);
    expect(board.issues[0]).toMatchObject({
      blockedBy: ["ENG-7"],
      writeScope: ["apps/api/**"],
      milestone: "M1",
    });
    expect(new Headers(calls[0]?.headers).get("authorization")).toBe("lin_key");
  });

  it("fails loudly on a GraphQL error", async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ errors: [{ message: "Query too complex" }] }));
    await expect(fetchBoard("k", "ENG", fakeFetch)).rejects.toThrow(
      "Linear answered 200: Query too complex",
    );
  });
});
