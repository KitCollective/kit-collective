/**
 * Helper / Optimizer quality gate (P1.3).
 * Reject ~instant GREEN with no diff when review feedback is open.
 * Spawn metrics may not be wired yet — export for tests and pi-job comments.
 */

/** Same floor as harness/implement-exit.mjs — keep values in sync. */
export const MIN_HELPER_DURATION_MS = 500;

/**
 * @param {{
 *   durationMs?: number,
 *   changedFilesCount?: number,
 *   reviewFeedbackOpen?: boolean,
 *   minDurationMs?: number,
 * }} input
 * @returns {{ ok: boolean, reason: string }}
 */
export function evaluateHelperQuality({
  durationMs = 0,
  changedFilesCount = 0,
  reviewFeedbackOpen = false,
  minDurationMs = MIN_HELPER_DURATION_MS,
} = {}) {
  const duration = Number(durationMs);
  const changed = Number(changedFilesCount);
  const min = Number(minDurationMs);

  if (Number.isFinite(changed) && changed > 0) {
    return { ok: true, reason: "diff" };
  }
  if (Number.isFinite(duration) && duration >= min) {
    return { ok: true, reason: "duration" };
  }
  if (reviewFeedbackOpen === true) {
    return {
      ok: false,
      reason: `helper quality: duration ${Number.isFinite(duration) ? duration : 0}ms < ${min}ms and no write-scope diff while Review feedback is open`,
    };
  }
  // No open feedback — allow short/no-diff helpers (e.g. read-only advise).
  return { ok: true, reason: "no-open-feedback" };
}
