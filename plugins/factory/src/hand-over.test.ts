import { describe, expect, it } from "vitest";
import type { GateRun } from "./gate-store.js";
import { decideHandOver, needsPrHead } from "./hand-over.js";

const record = (over: Partial<GateRun> = {}): GateRun => ({
  id: 1,
  at: 1,
  threadId: "thr_1",
  gate: "review",
  pr: 12,
  issue: "ENG-1",
  outcome: "ran",
  exitCode: 0,
  verdictLine: "review gate open",
  sha: "aaaa1111bbbb",
  hostId: "host_1",
  reason: null,
  ...over,
});
const head = (sha: string) => ({ ok: true as const, sha });

describe("decideHandOver", () => {
  it("approves a green gate on the head the pull request has now", () => {
    expect(decideHandOver({ record: record(), head: head("aaaa1111bbbb") })).toMatchObject({
      move: "approval",
    });
  });

  it("keeps the issue in review when the head moved, naming both commits", () => {
    const decision = decideHandOver({ record: record(), head: head("cccc3333dddd") });
    expect(decision.move).toBe("review");
    expect(decision.reason).toContain("aaaa1111");
    expect(decision.reason).toContain("cccc3333");
  });

  it.each([1, 3, 4])("keeps the issue in review for exit %i, with the verdict line", (exitCode) => {
    const decision = decideHandOver({
      record: record({ exitCode, verdictLine: "closed: no audit" }),
      head: null,
    });
    expect(decision.move).toBe("review");
    expect(decision.reason).toContain(`exit ${exitCode}`);
    expect(decision.reason).toContain("closed: no audit");
  });

  it("keeps the issue in review when nothing was recorded", () => {
    expect(decideHandOver({ record: null, head: null })).toEqual({
      move: "review",
      reason: "no review gate was recorded for this run",
    });
  });

  it.each(["refused", "error"] as const)("blocks the issue when the gate was %s", (outcome) => {
    const decision = decideHandOver({
      record: record({ outcome, exitCode: null, reason: "no environment" }),
      head: null,
    });
    expect(decision.move).toBe("blocked");
    expect(decision.reason).toContain("no environment");
  });

  it("blocks the issue when the pull request's head cannot be read", () => {
    const decision = decideHandOver({ record: record(), head: { ok: false, error: "gh failed" } });
    expect(decision.move).toBe("blocked");
    expect(decision.reason).toContain("gh failed");
  });

  it("needs the head only for a gate that ran and exited 0", () => {
    expect(needsPrHead(record())).toBe(true);
    expect(needsPrHead(record({ exitCode: 1 }))).toBe(false);
    expect(needsPrHead(record({ outcome: "error", exitCode: null }))).toBe(false);
    expect(needsPrHead(null)).toBe(false);
  });
});
