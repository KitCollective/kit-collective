/**
 * Resume started factory states after Compose rebuild or a missed webhook.
 * Lists Implementing / In Review / Ready for merge / Merging and enqueues
 * the same roles as the Issue HMAC path. Does not claim, move status, or
 * set delegate. Worktree reuse stays in checkout.
 */
import { createDelegateGateConfig } from "./delegate-gate.mjs";
import { createLinearCliClient } from "./linear-cli.mjs";
import { findWriteScopeOverlap, PLANNER_PRIORITY_ORDER, PLANNER_TEAM_KEY } from "./planner.mjs";
import { dispatchIssue } from "./webhook-router.mjs";

const RESUME_STATUS_ORDER = ["Merging", "Ready for merge", "In Review"];

/**
 * @param {Array<{ priority?: number, createdAt?: string }>} issues
 */
function sortByPriority(issues) {
  return [...issues].sort((left, right) => {
    const leftRank = PLANNER_PRIORITY_ORDER.indexOf(left.priority ?? 0);
    const rightRank = PLANNER_PRIORITY_ORDER.indexOf(right.priority ?? 0);
    const leftIndex = leftRank === -1 ? PLANNER_PRIORITY_ORDER.length : leftRank;
    const rightIndex = rightRank === -1 ? PLANNER_PRIORITY_ORDER.length : rightRank;
    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex;
    }
    return String(left.createdAt).localeCompare(String(right.createdAt));
  });
}

/**
 * @param {{
 *   enqueue: { enqueue: (job: object) => unknown },
 *   issue: object,
 *   decision: { role: string, adwFile?: string },
 * }} input
 */
function enqueueRole({ enqueue, issue, decision }) {
  enqueue.enqueue({
    role: decision.role,
    issueId: issue.id,
    identifier: issue.identifier,
    ...(decision.adwFile ? { adwFile: decision.adwFile } : {}),
  });
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv | Record<string, string | undefined>,
 *   linear?: { listOrphans: (input?: { teamKey?: string }) => Promise<object[]> },
 *   enqueue: { enqueue: (job: object) => unknown },
 *   delegateGateConfig?: { names: string[], appUserId?: string },
 *   queuedIdentifiers?: string[],
 * }} input
 */
export async function runResume({
  env = process.env,
  linear,
  enqueue,
  delegateGateConfig,
  queuedIdentifiers = [],
} = {}) {
  if (!enqueue || typeof enqueue.enqueue !== "function") {
    throw new Error("resume requires enqueue");
  }
  const client = linear ?? createLinearCliClient({ env });
  const gate = delegateGateConfig ?? createDelegateGateConfig(env);
  const queued = new Set(queuedIdentifiers);
  const issues = await client.listOrphans({ teamKey: PLANNER_TEAM_KEY });
  const enqueued = [];
  const skipped = [];

  /**
   * @param {object} issue
   * @returns {boolean}
   */
  function tryEnqueue(issue) {
    if (queued.has(issue.identifier)) {
      skipped.push({ identifier: issue.identifier, reason: "already queued" });
      return false;
    }
    const decision = dispatchIssue(issue, gate);
    if (decision.kind !== "enqueue") {
      skipped.push({ identifier: issue.identifier, reason: decision.reason });
      return false;
    }
    enqueueRole({ enqueue, issue, decision });
    queued.add(issue.identifier);
    enqueued.push({ identifier: issue.identifier, role: decision.role });
    return true;
  }

  for (const status of RESUME_STATUS_ORDER) {
    for (const issue of sortByPriority(issues.filter((row) => row.status === status))) {
      tryEnqueue(issue);
    }
  }

  const implementing = sortByPriority(issues.filter((row) => row.status === "Implementing"));
  const selected = [];
  for (const issue of implementing) {
    if (queued.has(issue.identifier)) {
      skipped.push({ identifier: issue.identifier, reason: "already queued" });
      selected.push(issue);
      continue;
    }
    const overlap = findWriteScopeOverlap(issue, selected);
    if (overlap) {
      skipped.push({ identifier: issue.identifier, reason: "write-scope overlap" });
      continue;
    }
    tryEnqueue(issue);
    selected.push(issue);
  }

  for (const issue of issues) {
    if (
      issue.status !== "Implementing" &&
      !RESUME_STATUS_ORDER.includes(issue.status) &&
      !enqueued.some((row) => row.identifier === issue.identifier) &&
      !skipped.some((row) => row.identifier === issue.identifier)
    ) {
      const decision = dispatchIssue(issue, gate);
      skipped.push({
        identifier: issue.identifier,
        reason: decision.kind === "skip" ? decision.reason : `no factory role for ${issue.status}`,
      });
    }
  }

  return { enqueued, skipped };
}

/**
 * Immediate enqueue plus the planner interval. Planner mutex, not the coding slot.
 *
 * @param {{
 *   enqueue: { enqueue: (job: object) => unknown },
 *   intervalMs?: number,
 *   setIntervalFn?: typeof setInterval,
 *   clearIntervalFn?: typeof clearInterval,
 * }} input
 */
export function startResumePoller({
  enqueue,
  intervalMs,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
}) {
  enqueue.enqueue({ role: "resume" });
  const timer = setIntervalFn(() => {
    enqueue.enqueue({ role: "resume" });
  }, intervalMs);
  if (typeof timer === "object" && timer !== null && typeof timer.unref === "function") {
    timer.unref();
  }
  return () => clearIntervalFn(timer);
}
