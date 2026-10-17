import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { createGateStore, GATE_MIGRATIONS, type GateRunInput } from "./gate-store.js";

function store() {
  const db = new Database(":memory:");
  for (const statement of GATE_MIGRATIONS) db.exec(statement);
  return createGateStore(db);
}

const run = (over: Partial<GateRunInput> = {}): GateRunInput => ({
  at: 1000,
  threadId: "thr_1",
  gate: "review",
  pr: 12,
  issue: "ENG-1",
  outcome: "ran",
  exitCode: 0,
  verdictLine: "open",
  sha: "aaaa",
  hostId: "host_1",
  reason: null,
  ...over,
});

describe("latestReview", () => {
  it("returns the newest review record of the issue at or after the time, from any thread", () => {
    const gates = store();
    gates.record(run({ at: 900, sha: "old" }));
    gates.record(run({ at: 1000, threadId: "thr_a", sha: "first" }));
    const newest = gates.record(run({ at: 1100, threadId: "thr_b", exitCode: 1, sha: "second" }));
    expect(gates.latestReview("ENG-1", 1000)).toEqual(newest);
  });

  it("ignores other gates, other issues and records before the time", () => {
    const gates = store();
    gates.record(run({ gate: "pre-review" }));
    gates.record(run({ issue: "ENG-2" }));
    gates.record(run({ at: 999 }));
    expect(gates.latestReview("ENG-1", 1000)).toBeNull();
  });

  it("returns a refused or errored record too, so the hand-over can say why", () => {
    const gates = store();
    gates.record(run({ outcome: "error", exitCode: null, reason: "no environment" }));
    expect(gates.latestReview("ENG-1", 0)).toMatchObject({
      outcome: "error",
      reason: "no environment",
    });
  });
});
