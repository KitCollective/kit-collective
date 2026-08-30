/**
 * Structured logs for factory exit jobs (checker-exit, auto-merge, land).
 * Emits harness JSON on stderr so Promtail/Loki/Grafana show silent poll phases.
 */
import { harnessLog } from "./harness-log.mjs";

/**
 * @param {{ role: string, identifier: string, phase: string, linked: { number: number }, skipped?: Array<{ number: number }> }} input
 */
export function logFactoryExitStart({ role, identifier, phase, linked, skipped = [] }) {
  const skippedText =
    skipped.length > 0 ? ` (skipped ${skipped.map((row) => `#${row.number}`).join(", ")})` : "";
  harnessLog({
    role,
    identifier,
    event: "phase",
    phase,
    gate: "green",
    stopPoint: 2,
    detail: `linked PR #${linked.number}${skippedText}`,
  });
}

/**
 * @param {{
 *   role: string,
 *   identifier: string,
 *   phase: string,
 *   attempt: number,
 *   pr: { number?: number, mergeable?: string } | null,
 *   checksGreen: boolean,
 * }} input
 */
export function logFactoryGatePoll({ role, identifier, phase, attempt, pr, checksGreen }) {
  const mergeable = pr?.mergeable ?? "unknown";
  const gate = mergeable === "MERGEABLE" && checksGreen ? "green" : "yellow";
  harnessLog({
    role,
    identifier,
    event: "wait",
    phase,
    gate,
    attempt,
    stopPoint: 4,
    detail: `PR #${pr?.number ?? "?"} mergeable=${mergeable} checks=${checksGreen ? "green" : "pending"}`,
    loopRisk: attempt > 10 ? 5 : 1,
  });
}

/**
 * @param {{
 *   role: string,
 *   identifier: string,
 *   phase: string,
 *   passed: boolean,
 *   nextStatus: string,
 *   reason?: string,
 * }} input
 */
export function logFactoryExitDone({ role, identifier, phase, passed, nextStatus, reason }) {
  const incomplete =
    reason === "workpad-incomplete-retry" || reason === "workpad-incomplete-parked";
  harnessLog({
    role,
    identifier,
    event: "phase",
    phase: `${phase}-done`,
    gate: passed ? "green" : incomplete ? "yellow" : "red",
    stopPoint: 8,
    detail: reason ?? nextStatus,
  });
}
