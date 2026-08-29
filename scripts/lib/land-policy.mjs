/**
 * Land merge gate (KIT-51).
 *
 * The approver moving an issue to Merging is merge permission.
 * Done means the PR is already on the integration lane — not a second merge signal.
 * Fake `gh` at this seam (see scripts/tests/land-policy.test.mjs). Not the webhook router.
 */

export const MERGE_PERMISSION_STATUS = "Merging";
export const MERGED_STATUS = "Done";
export const MERGE_FAILURE_STATUS = "Implementing";

/** Short backoff while GitHub computes mergeability during concurrent land (KIT-119). */
export const LAND_UNKNOWN_MERGEABLE_RETRIES = 3;
export const LAND_UNKNOWN_RETRY_MS = 15_000;

const ALLOWED_CHECK_CONCLUSIONS = new Set(["success", "skipped", "neutral"]);

/** Non-interactive `gh pr merge` requires one of these after the PR number (KIT-129). */
export const GH_PR_MERGE_STRATEGY_FLAGS = ["--merge", "--squash", "--rebase"];

/** Land uses a merge commit onto the integration lane — not squash or rebase. */
export const LAND_GH_MERGE_STRATEGY = "--merge";

/**
 * @param {unknown} args
 * @returns {boolean}
 */
export function ghMergeArgsIncludeStrategy(args) {
  if (!Array.isArray(args) || args[0] !== "pr" || args[1] !== "merge") {
    return false;
  }
  return GH_PR_MERGE_STRATEGY_FLAGS.some((flag) => args.includes(flag));
}

/**
 * @param {unknown} setup
 * @returns {boolean}
 */
export function setupRecordsMerging(setup) {
  const id = setup?.states?.Merging?.id;
  return typeof id === "string" && id.length > 0 && id !== "dry-run";
}

/**
 * Linear resolves blockedBy when the blocker is completed or canceled.
 * Merging is started, so dependents stay blocked.
 *
 * @param {string} statusName
 * @param {Array<{ name: string, type: string }>} states
 * @returns {boolean}
 */
export function blockerResolvesDependents(statusName, states) {
  const found = states.find((state) => state.name === statusName);
  if (!found) {
    return false;
  }
  return found.type === "completed" || found.type === "canceled";
}

/**
 * @param {{ from: string, to: string, states: Array<{ name: string, type: string }> }} input
 * @returns {boolean}
 */
export function statusTransitionResolvesBlockedBy({ to, states }) {
  return blockerResolvesDependents(to, states);
}

/**
 * @param {Array<{ name?: string, conclusion?: string }> | undefined} checks
 * @returns {boolean}
 */
function requiredChecksGreen(checks) {
  if (!Array.isArray(checks)) {
    return false;
  }
  for (const check of checks) {
    const conclusion = check?.conclusion ?? "";
    if (!ALLOWED_CHECK_CONCLUSIONS.has(conclusion)) {
      return false;
    }
  }
  return true;
}

/**
 * @param {{
 *   issueStatus: string,
 *   pr: { number: number, mergeable: string, baseRef: string, requiredChecks?: Array<{ name?: string, conclusion?: string }> } | null,
 *   lanes: { integration: string, staging?: string, production?: string },
 * }} input
 * @returns {{ allowMerge: boolean, reason: string, ghArgs: string[] | null }}
 */
function evaluateMergeGate({ issueStatus, pr, lanes }) {
  if (issueStatus !== MERGE_PERMISSION_STATUS) {
    return {
      allowMerge: false,
      reason:
        issueStatus === MERGED_STATUS
          ? "Done means the PR is already on the integration lane"
          : `merge is allowed only from ${MERGE_PERMISSION_STATUS}`,
      ghArgs: null,
    };
  }
  if (!pr) {
    return { allowMerge: false, reason: "no linked PR", ghArgs: null };
  }
  if (pr.baseRef !== lanes.integration) {
    return {
      allowMerge: false,
      reason: `PR base ${pr.baseRef} is not ${lanes.integration}`,
      ghArgs: null,
    };
  }
  if (pr.mergeable !== "MERGEABLE") {
    return { allowMerge: false, reason: `PR is ${pr.mergeable}`, ghArgs: null };
  }
  if (!requiredChecksGreen(pr.requiredChecks)) {
    return { allowMerge: false, reason: "required checks are not green", ghArgs: null };
  }

  return {
    allowMerge: true,
    reason: "Merging + MERGEABLE + green required checks",
    // Strategy after the number: land.mjs reads args[2] as the PR. gh without a TTY
    // requires an explicit method; this is a merge commit onto the integration lane.
    ghArgs: ["pr", "merge", String(pr.number), LAND_GH_MERGE_STRATEGY],
  };
}

/**
 * @param {{
 *   issueStatus: string,
 *   pr: { number: number, mergeable: string, baseRef: string, requiredChecks?: Array<{ name?: string, conclusion?: string }> } | null,
 *   lanes: { integration: string, staging?: string, production?: string },
 *   gh: { merge: (args: string[]) => { ok: boolean, sha?: string, error?: string } },
 * }} input
 * @returns {{
 *   merged: boolean,
 *   nextStatus: string,
 *   ghCalled: boolean,
 *   ghArgs: string[] | null,
 *   reason: string,
 *   sha?: string,
 * }}
 */
export function landAtMergeGate({ issueStatus, pr, lanes, gh }) {
  const decision = evaluateMergeGate({ issueStatus, pr, lanes });
  if (!decision.allowMerge || !decision.ghArgs) {
    return {
      merged: false,
      nextStatus: issueStatus,
      ghCalled: false,
      ghArgs: null,
      reason: decision.reason,
    };
  }

  if (decision.ghArgs.includes("--force")) {
    return {
      merged: false,
      nextStatus: MERGE_FAILURE_STATUS,
      ghCalled: false,
      ghArgs: decision.ghArgs,
      reason: "refusing --force",
    };
  }

  const result = gh.merge(decision.ghArgs);
  if (!result.ok) {
    return {
      merged: false,
      nextStatus: MERGE_FAILURE_STATUS,
      ghCalled: true,
      ghArgs: decision.ghArgs,
      reason: result.error ?? "merge failed",
    };
  }

  return {
    merged: true,
    nextStatus: MERGED_STATUS,
    ghCalled: true,
    ghArgs: decision.ghArgs,
    reason: decision.reason,
    sha: result.sha,
  };
}
