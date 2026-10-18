/**
 * The pure decisions of `scripts/land-approved.mjs`: what a PR view means for `start`, the verdict
 * lines Optio reads, the comments and the label swap of the hand-over to a person. No I/O here.
 */

export const TAG = "land-approved";

/** One verdict line: `<KIND> (land-approved): <text>`. Optio reads the kind and, for WAITING, the phase. */
export const verdict = (kind, text) => `${kind} (${TAG}): ${text}`;

/** The labels that say who acts; the hand-over replaces whichever the issue carries with ready-for-human. */
const WHO_ACTS = ["ready-for-agent", "needs-info", "needs-triage", "ready-for-human"];

/**
 * The `scripts/linear.mjs label` arguments (after the issue) that leave the issue with
 * ready-for-human, or null when it already carries it.
 * @param {string[]} labels
 */
export function handOverLabel(labels) {
  const from = WHO_ACTS.find((label) => labels.includes(label));
  if (from === "ready-for-human") {
    return null;
  }
  return from ? ["swap", from, "ready-for-human"] : ["add", "ready-for-human"];
}

/**
 * What `start` does for a PR view and the check runs on its head.
 * @param {{ state: string, mergeable?: string, autoMergeRequest?: unknown, isInMergeQueue?: boolean }} view
 * @param {Array<{ conclusion: string | null }>} checks
 * @returns {{ act: "queued" | "enqueue" | "wait" | "stop", code?: string, detail: string }}
 */
export function startDecision(view, checks) {
  if (view.state === "MERGED") {
    return { act: "queued", detail: "is already merged" };
  }
  if (view.state === "CLOSED") {
    return { act: "stop", code: "pr-closed", detail: "the PR is closed without being merged" };
  }
  if (view.autoMergeRequest || view.isInMergeQueue) {
    return { act: "queued", detail: "is already in the merge queue" };
  }
  if (view.mergeable === "CONFLICTING") {
    return { act: "stop", code: "conflict", detail: "the PR conflicts with the lane" };
  }
  if (view.mergeable !== "MERGEABLE") {
    return {
      act: "wait",
      detail: `GitHub has not decided whether the PR is mergeable (${view.mergeable ?? "unknown"})`,
    };
  }
  if (checks.some((check) => check.conclusion === null || check.conclusion === undefined)) {
    return { act: "wait", detail: "checks are still running on the head" };
  }
  return { act: "enqueue", detail: "" };
}

/** The comment on the issue when the landing stops and a person has to look. */
export function stoppedComment(code, detail, pr) {
  return `Landing stopped (${code}): ${detail}\n\nPR #${pr}. A person has to look: the issue is in Approval with ready-for-human.`;
}

/** The comment on the issue when the PR landed and the land gate is open. */
export function landedComment(pr, mergeSha, gateLine) {
  return `Landed: PR #${pr} merged as ${mergeSha}, the land gate is open (${gateLine}).`;
}
