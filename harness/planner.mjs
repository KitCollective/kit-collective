/**
 * Linear-only planner (KIT-55).
 *
 * Claims Backlog + ready-for-agent + unblocked issues in Linear priority order.
 * Interface: runPlanner / startPlannerPoller. Linear CLI (or a fake) at this seam.
 * No file tools. No general bash. No Pi spawn.
 */
import { createLinearCliClient } from "./linear-cli.mjs";

export const DEFAULT_PLANNER_POLL_MS = 300_000;
export const PLANNER_PRIORITY_ORDER = [1, 2, 3, 4, 0];
export const PLANNER_TEAM_KEY = "KIT";

const READY_FOR_AGENT = "ready-for-agent";
const SIGNAL_UP = "signal-up";
const CURSOR_NAME = "cursor";

/**
 * @param {Array<{ status?: string, statusType?: string }> | undefined} blockedBy
 */
function hasUnresolvedBlocker(blockedBy) {
  if (!Array.isArray(blockedBy) || blockedBy.length === 0) {
    return false;
  }
  return blockedBy.some((blocker) => {
    if (blocker?.statusType === "completed" || blocker?.statusType === "canceled") {
      return false;
    }
    if (blocker?.status === "Done" || blocker?.status === "Canceled") {
      return false;
    }
    return true;
  });
}

/**
 * @param {object} issue
 */
function eligibility(issue) {
  const labels = Array.isArray(issue.labels) ? issue.labels : [];
  if (issue.status !== "Backlog") {
    return { ok: false, reason: "not backlog" };
  }
  if (!labels.includes(READY_FOR_AGENT)) {
    return { ok: false, reason: "missing ready-for-agent" };
  }
  if (labels.includes(SIGNAL_UP)) {
    return { ok: false, reason: "signal-up" };
  }
  if (hasUnresolvedBlocker(issue.blockedBy)) {
    return { ok: false, reason: "blockedBy unresolved" };
  }
  const agentName = issue.delegate?.name;
  if (typeof agentName === "string" && agentName.length > 0) {
    return {
      ok: false,
      reason: "agent set",
      comment: agentName.toLowerCase() === CURSOR_NAME,
    };
  }
  return { ok: true };
}

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
 *   env?: NodeJS.ProcessEnv | Record<string, string | undefined>,
 *   linear?: {
 *     lookupUser: (id: string) => Promise<{ id: string, name: string } | null>,
 *     listDispatch: (input?: { teamKey?: string }) => Promise<{ implementingState: { id?: string, name?: string } | null, issues: object[] }>,
 *     claimIssue: (input: { id: string, stateId: string, delegateId: string }) => Promise<object | null>,
 *     commentIssue: (input: { issueId: string, body: string }) => Promise<unknown>,
 *   },
 * }} [input]
 */
export async function runPlanner({ env = process.env, linear } = {}) {
  const piAppUserId = env.LINEAR_PI_APP_USER_ID;
  if (typeof piAppUserId !== "string" || piAppUserId.length === 0) {
    throw new Error("missing LINEAR_PI_APP_USER_ID");
  }
  const client = linear ?? createLinearCliClient({ env });
  const user = await client.lookupUser(piAppUserId);
  if (!user) {
    throw new Error("LINEAR_PI_APP_USER_ID did not resolve to a Linear user");
  }
  if (user.name.toLowerCase() === CURSOR_NAME) {
    throw new Error("planner must not set Linear Agent to Cursor");
  }

  const { implementingState, issues } = await client.listDispatch({ teamKey: PLANNER_TEAM_KEY });
  if (implementingState?.name !== "Implementing" || typeof implementingState.id !== "string") {
    throw new Error("Implementing workflow state not found");
  }

  const claimed = [];
  const skipped = [];
  for (const issue of sortByPriority(issues)) {
    const gate = eligibility(issue);
    if (!gate.ok) {
      skipped.push({ identifier: issue.identifier, reason: gate.reason });
      if (gate.comment) {
        await client.commentIssue({
          issueId: issue.id,
          body: `${issue.identifier}: skipped — Linear Agent is ${issue.delegate.name}. Factory planner does not claim Cursor-delegated issues.`,
        });
      }
      continue;
    }
    const updated = await client.claimIssue({
      id: issue.id,
      stateId: implementingState.id,
      delegateId: piAppUserId,
    });
    claimed.push({
      identifier: issue.identifier,
      assignee: updated?.assignee ?? issue.assignee,
      delegate: updated?.delegate ?? { id: piAppUserId, name: user.name },
    });
  }
  return { claimed, skipped };
}

/**
 * Same skip/claim job the webhook router enqueues for role=planner.
 * Poller and webhook planner enqueue onto the planner mutex, not the coding slot.
 *
 * @param {{
 *   enqueue: { enqueue: (job: object) => unknown },
 *   intervalMs?: number,
 *   setIntervalFn?: typeof setInterval,
 *   clearIntervalFn?: typeof clearInterval,
 * }} input
 */
export function startPlannerPoller({
  enqueue,
  intervalMs = DEFAULT_PLANNER_POLL_MS,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
}) {
  const timer = setIntervalFn(() => {
    enqueue.enqueue({ role: "planner" });
  }, intervalMs);
  if (typeof timer === "object" && timer !== null && typeof timer.unref === "function") {
    timer.unref();
  }
  return () => clearIntervalFn(timer);
}
