/**
 * Linear-only planner (KIT-55).
 *
 * Claims Backlog + ready-for-agent + unblocked issues in Linear priority order.
 * Interface: runPlanner / startPlannerPoller. Linear CLI (or a fake) at this seam.
 * No file tools. No general bash. No Pi spawn.
 */
import { matchesGlob, parseWriteScopeGlobs } from "../scripts/lib/pr-write-scope.mjs";
import { parseLoopCounters } from "./auto-merge.mjs";
import { hasRatchetNudge, ratchetNudgeComment } from "./checker-exit.mjs";
import { createLinearCliClient, WORKPAD_HEADING } from "./linear-cli.mjs";
import { plannerClaimComment } from "./role-comments.mjs";

export const DEFAULT_PLANNER_POLL_MS = 300_000;
export const PLANNER_PRIORITY_ORDER = [1, 2, 3, 4, 0];
export const PLANNER_TEAM_KEY = "KIT";

const READY_FOR_AGENT = "ready-for-agent";
const SIGNAL_UP = "signal-up";
const WHO_ACTS_BLOCKERS = ["ready-for-human", "needs-info", "wontfix"];
const CURSOR_NAME = "cursor";

/**
 * @param {string} globA
 * @param {string} globB
 */
export function globsOverlap(globA, globB) {
  if (!globA.includes("*") && matchesGlob(globA, globB)) {
    return true;
  }
  if (!globB.includes("*") && matchesGlob(globB, globA)) {
    return true;
  }
  const prefixA = globA.split("*")[0];
  const prefixB = globB.split("*")[0];
  if (prefixA.startsWith(prefixB) || prefixB.startsWith(prefixA)) {
    return true;
  }
  const probeA = globA.replace(/\*\*/g, "x").replace(/\*/g, "y");
  const probeB = globB.replace(/\*\*/g, "x").replace(/\*/g, "y");
  return matchesGlob(probeA, globB) || matchesGlob(probeB, globA);
}

/**
 * @param {string[] | null | undefined} left
 * @param {string[] | null | undefined} right
 */
export function writeScopeSetsOverlap(left, right) {
  if (!Array.isArray(left) || left.length === 0 || !Array.isArray(right) || right.length === 0) {
    return false;
  }
  for (const leftGlob of left) {
    for (const rightGlob of right) {
      if (globsOverlap(leftGlob, rightGlob)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * @param {string | undefined} description
 * @returns {string[] | null}
 */
export function parseIssueWriteScope(description) {
  return parseWriteScopeGlobs(typeof description === "string" ? description : "");
}

/**
 * @param {object} issue
 * @param {Array<{ identifier: string, description?: string }>} implementingIssues
 */
export function findWriteScopeOverlap(issue, implementingIssues) {
  const candidateGlobs = parseIssueWriteScope(issue.description);
  if (!candidateGlobs || candidateGlobs.length === 0) {
    return null;
  }
  for (const active of implementingIssues) {
    const activeGlobs = parseIssueWriteScope(active.description);
    if (!activeGlobs || activeGlobs.length === 0) {
      continue;
    }
    if (writeScopeSetsOverlap(candidateGlobs, activeGlobs)) {
      return {
        identifier: active.identifier,
        candidateGlobs,
        activeGlobs,
        kind: "implementing",
      };
    }
  }
  return null;
}

/**
 * Open kit-* PRs into development whose changed files hit the candidate write-scope.
 *
 * @param {object} issue
 * @param {Array<{ headRefName?: string, head?: string, number?: number, files?: Array<string | { path?: string }> }>} openPrs
 */
export function findOpenPrPathOverlap(issue, openPrs = []) {
  const candidateGlobs = parseIssueWriteScope(issue.description);
  if (!candidateGlobs || candidateGlobs.length === 0 || !Array.isArray(openPrs)) {
    return null;
  }
  for (const pr of openPrs) {
    const head = String(pr.headRefName ?? pr.head ?? "");
    if (!/^kit-\d+$/i.test(head)) {
      continue;
    }
    const issueNum = String(issue.identifier ?? "").replace(/^KIT-/i, "");
    if (issueNum.length > 0 && head.toLowerCase() === `kit-${issueNum}`.toLowerCase()) {
      continue;
    }
    const files = Array.isArray(pr.files) ? pr.files : [];
    for (const file of files) {
      const path = typeof file === "string" ? file : file?.path;
      if (typeof path !== "string" || path.length === 0) {
        continue;
      }
      for (const glob of candidateGlobs) {
        if (matchesGlob(path, glob)) {
          return {
            identifier: head,
            candidateGlobs,
            path,
            kind: "open-pr",
            number: pr.number,
          };
        }
      }
    }
  }
  return null;
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv | Record<string, string | undefined>,
 *   runCommand?: (command: string, args: string[], options?: object) => Promise<string>,
 * }} [deps]
 * @returns {Promise<Array<{ headRefName: string, number: number, files: string[] }>>}
 */
export async function listOpenKitDevelopmentPrs(deps = {}) {
  const env = deps.env ?? process.env;
  const run =
    deps.runCommand ??
    (async (command, args, options = {}) => {
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const execFileAsync = promisify(execFile);
      const result = await execFileAsync(command, args, {
        encoding: "utf8",
        maxBuffer: 4 * 1024 * 1024,
        env: { ...process.env, ...env, ...options.env },
      });
      return result.stdout;
    });
  try {
    const stdout = await run(
      "gh",
      [
        "pr",
        "list",
        "--state",
        "open",
        "--base",
        "development",
        "--limit",
        "50",
        "--json",
        "number,headRefName,files",
      ],
      { env },
    );
    const parsed = JSON.parse(stdout);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((row) => /^kit-\d+$/i.test(String(row?.headRefName ?? "")))
      .map((row) => ({
        headRefName: row.headRefName,
        number: row.number,
        files: Array.isArray(row.files)
          ? row.files
              .map((file) => (typeof file === "string" ? file : file?.path))
              .filter((path) => typeof path === "string")
          : [],
      }));
  } catch {
    return [];
  }
}

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
  for (const name of WHO_ACTS_BLOCKERS) {
    if (labels.includes(name)) {
      return { ok: false, reason: name };
    }
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
 *   listComments: (issueId: string) => Promise<Array<{ body?: string }>>,
 *   commentIssue: (input: { issueId: string, body: string }) => Promise<unknown>,
 * }} client
 * @param {Array<{ id: string, identifier: string }>} implementingIssues
 */
export async function nudgeImplementingRatchets(client, implementingIssues) {
  const nudged = [];
  if (!Array.isArray(implementingIssues) || implementingIssues.length === 0) {
    return nudged;
  }
  for (const issue of implementingIssues) {
    if (typeof issue?.id !== "string" || typeof issue?.identifier !== "string") {
      continue;
    }
    const comments =
      typeof client.listComments === "function" ? await client.listComments(issue.id) : [];
    if (comments.some((comment) => hasRatchetNudge(comment.body))) {
      continue;
    }
    const workpad = comments.find((comment) => comment.body?.includes(WORKPAD_HEADING));
    const workpadBody = workpad?.body ?? "";
    if (hasRatchetNudge(workpadBody)) {
      continue;
    }
    const counters = parseLoopCounters(workpadBody);
    if (!counters || counters.reviewLoops < 2) {
      continue;
    }
    await client.commentIssue({
      issueId: issue.id,
      body: ratchetNudgeComment(issue.identifier),
    });
    nudged.push(issue.identifier);
  }
  return nudged;
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv | Record<string, string | undefined>,
 *   linear?: {
 *     listDispatch: (input?: { teamKey?: string }) => Promise<{ implementingState: { id?: string, name?: string } | null, implementingIssues?: object[], issues: object[] }>,
 *     claimIssue: (input: { id: string, stateId: string }) => Promise<object | null>,
 *     commentIssue: (input: { issueId: string, body: string }) => Promise<unknown>,
 *     listComments?: (issueId: string) => Promise<Array<{ body?: string }>>,
 *   },
 *   listOpenPrs?: () => Promise<Array<{ headRefName?: string, number?: number, files?: string[] }>>,
 * }} [input]
 */
export async function runPlanner({ env = process.env, linear, listOpenPrs } = {}) {
  const client = linear ?? createLinearCliClient({ env });

  const {
    implementingState,
    implementingIssues = [],
    issues,
  } = await client.listDispatch({
    teamKey: PLANNER_TEAM_KEY,
  });
  if (implementingState?.name !== "Implementing" || typeof implementingState.id !== "string") {
    throw new Error("Implementing workflow state not found");
  }

  /** Mutable so same-poll claims block later overlapping candidates. */
  const activeImplementing = [...implementingIssues];
  const openPrs =
    typeof listOpenPrs === "function"
      ? await listOpenPrs()
      : await listOpenKitDevelopmentPrs({ env });

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
    const overlap = findWriteScopeOverlap(issue, activeImplementing);
    if (overlap) {
      skipped.push({ identifier: issue.identifier, reason: "write-scope overlap" });
      await client.commentIssue({
        issueId: issue.id,
        body: `${issue.identifier}: skipped — write-scope overlaps ${overlap.identifier} (${overlap.candidateGlobs.filter((glob) => overlap.activeGlobs.some((activeGlob) => globsOverlap(glob, activeGlob))).join(", ")}).`,
      });
      continue;
    }
    const prOverlap = findOpenPrPathOverlap(issue, openPrs);
    if (prOverlap) {
      skipped.push({ identifier: issue.identifier, reason: "open-pr path overlap" });
      await client.commentIssue({
        issueId: issue.id,
        body: `${issue.identifier}: skipped — write-scope overlaps open PR ${prOverlap.identifier} (${prOverlap.path}).`,
      });
      continue;
    }
    const updated = await client.claimIssue({
      id: issue.id,
      stateId: implementingState.id,
    });
    await client.commentIssue({
      issueId: issue.id,
      body: plannerClaimComment(issue.identifier),
    });
    activeImplementing.push(issue);
    claimed.push({
      identifier: issue.identifier,
      assignee: updated?.assignee ?? issue.assignee,
      delegate: updated?.delegate ?? issue.delegate ?? null,
    });
  }
  const ratchetNudged = await nudgeImplementingRatchets(client, implementingIssues);
  return { claimed, skipped, ratchetNudged };
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
