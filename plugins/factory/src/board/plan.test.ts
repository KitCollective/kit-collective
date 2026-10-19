import { describe, expect, it } from "vitest";
import { type IssueHistory, planBoard } from "../board.js";
import type { BoardIssue } from "../linear-api.js";
import { parseRegistry, type Registry } from "../loop-registry.js";
import { parseScheduler, type SchedulerConfig } from "../scheduler-config.js";

function config(cap: number): SchedulerConfig {
  const parsed = parseScheduler(
    JSON.stringify({
      mode: "live",
      projectId: "proj_1",
      teamKey: "ENG",
      backlogState: "Icebox",
      activeStates: ["Doing"],
      blockedState: null,
      machines: [{ id: "harness", cap, hostId: "host_harness", branch: "origin/main" }],
      requirements: [],
    }),
  );
  if (!parsed.ok || parsed.config === null) throw new Error(parsed.ok ? "empty" : parsed.error);
  return parsed.config;
}

function registry(maxLive: number): Registry {
  const parsed = parseRegistry(
    JSON.stringify({
      loops: [
        {
          name: "Issue run",
          enabled: true,
          workflow: "issue-run",
          trigger: {
            kind: "issue",
            state: "Ready",
            label: "agent-ready",
            unblocked: true,
            skipLabels: [],
            priorityOrder: [1, 2, 3, 4, 0],
          },
          machines: ["harness"],
          maxLive,
        },
      ],
    }),
  );
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.registry;
}

function issue(identifier: string, overrides: Partial<BoardIssue> = {}): BoardIssue {
  return {
    id: `id-${identifier}`,
    identifier,
    title: identifier,
    priority: 3,
    createdAt: "2026-10-01T00:00:00Z",
    state: "Ready",
    labels: ["agent-ready"],
    milestone: null,
    project: null,
    blockedBy: [],
    writeScope: [],
    pullRequest: null,
    ...overrides,
  };
}

const handStarted = ["ENG-1", "ENG-2", "ENG-3"].map((identifier) =>
  issue(identifier, { state: "Doing" }),
);

const plan = (cap: number, maxLive: number, history = new Map<string, IssueHistory>()) =>
  planBoard({
    issues: [...handStarted, issue("ENG-4")],
    config: config(cap),
    registry: registry(maxLive),
    focus: null,
    history,
  });

describe("planBoard runs the Board did not start", () => {
  it("starts nothing while hand-started runs fill the machine", () => {
    const result = plan(3, 16);
    expect(result.start).toEqual([]);
    expect(result.waiting).toEqual([
      { identifier: "ENG-4", loop: "Issue run", reason: "no free slot on harness" },
    ]);
  });

  it("lists them under Running, marked as not started by the Board", () => {
    expect(plan(3, 16).running).toEqual(
      handStarted.map(({ identifier }) => ({
        identifier,
        machineId: "harness",
        loop: "Issue run",
        outside: true,
      })),
    );
  });

  it("counts them against the Loop's maxLive even when the machine has room", () => {
    const result = plan(5, 3);
    expect(result.start).toEqual([]);
    expect(result.waiting).toEqual([
      { identifier: "ENG-4", loop: "Issue run", reason: "Issue run has 3 of 3 live runs" },
    ]);
  });

  it("starts when a slot is free", () => {
    expect(plan(4, 16).start.map((start) => start.issue.identifier)).toEqual(["ENG-4"]);
  });

  it("does not count an issue the Board started and whose run has since stalled", () => {
    const stalled: IssueHistory = {
      activeOn: null,
      activeLoop: null,
      stalled: true,
      startedBefore: true,
    };
    const result = plan(3, 16, new Map([["ENG-1", stalled]]));
    expect(result.running.map((run) => run.identifier)).toEqual(["ENG-2", "ENG-3"]);
  });

  it("counts a run the Board started once, not twice", () => {
    const own: IssueHistory = {
      activeOn: "harness",
      activeLoop: "Issue run",
      stalled: false,
      startedBefore: true,
    };
    const result = plan(3, 16, new Map([["ENG-1", own]]));
    expect(result.running.filter((run) => run.identifier === "ENG-1")).toEqual([
      { identifier: "ENG-1", machineId: "harness", loop: "Issue run" },
    ]);
    expect(result.running).toHaveLength(3);
  });
});
