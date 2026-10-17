// The hand-over decision: where an ended run's issue goes, from the review gate Optio recorded
// and the pull request's head now. Pure; the scheduler reads the record and the head.
import type { GateRun } from "./gate-store.js";

/** What reading the pull request's head came back with. */
export type PrHead = { ok: true; sha: string } | { ok: false; error: string };

/**
 * approval: the review gate was green on the PR's current head.
 * review: the issue stays where it is, and the run is reported as a stall.
 * blocked: the gate could not be run or the head could not be read.
 */
export interface HandOver {
  move: "approval" | "review" | "blocked";
  /** One line for the workpad and the stall report. */
  reason: string;
}

/** Whether the decision needs the PR's head: only a gate that ran and exited 0 is compared with it. */
export const needsPrHead = (record: GateRun | null): boolean =>
  record !== null && record.outcome === "ran" && record.exitCode === 0;

const short = (sha: string | null) => (sha === null ? "none" : sha.slice(0, 8));

export function decideHandOver(input: { record: GateRun | null; head: PrHead | null }): HandOver {
  const { record, head } = input;
  if (record === null) {
    return { move: "review", reason: "no review gate was recorded for this run" };
  }
  if (record.outcome !== "ran") {
    return {
      move: "blocked",
      reason: `the review gate could not be run (${record.outcome}): ${record.reason ?? "no reason recorded"}`,
    };
  }
  if (record.exitCode !== 0) {
    return {
      move: "review",
      reason: `the review gate is closed (exit ${record.exitCode}): ${record.verdictLine ?? "no verdict line"}`,
    };
  }
  if (head === null) return { move: "review", reason: "the pull request's head was not read" };
  if (!head.ok) {
    return { move: "blocked", reason: `the pull request's head could not be read: ${head.error}` };
  }
  if (record.sha !== head.sha) {
    return {
      move: "review",
      reason: `the head moved after the green review gate: it ran on ${short(record.sha)}, the pull request is at ${short(head.sha)}`,
    };
  }
  return {
    move: "approval",
    reason: `the review gate is green on the pull request's head ${short(head.sha)}`,
  };
}
