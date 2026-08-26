/**
 * Linear-only Intake job (KIT-89).
 *
 * Lists open KIT Triage issues. Promotes well-formed slices, consolidates
 * related leftovers, comments unshaped Sentry. Interface: runIntake /
 * startIntakePoller. Linear CLI (or a fake) at this seam. No Pi spawn.
 */
export const DEFAULT_INTAKE_POLL_MS = 3_600_000;
export const INTAKE_TEAM_KEY = "KIT";
export const INTAKE_COMMENT_HEADING = "## Intake";
export const FORBIDDEN_INTAKE_STATES = ["Implementing", "In Review", "Merging", "Done"];

const READY_FOR_AGENT = "ready-for-agent";
const DROP_ON_PROMOTE = [
  "signal-up",
  "proposal",
  "needs-triage",
  "needs-info",
  "ready-for-human",
  "wontfix",
];

export const SENTRY_INTAKE_COMMENT = `${INTAKE_COMMENT_HEADING}

Unshaped Sentry issue. Left in Triage. Intake will not invent a product slice.
`;

/**
 * @param {object} issue
 */
export function isWellFormedSlice(issue) {
  const description = issue.description ?? "";
  return (
    Boolean(issue.linearType) &&
    /write-scope:\s*\S/.test(description) &&
    /##\s*What to build/i.test(description) &&
    /##\s*Acceptance criteria/i.test(description)
  );
}

/**
 * @param {object} issue
 */
export function isSentryIssue(issue) {
  const attachments = Array.isArray(issue.attachments) ? issue.attachments : [];
  if (attachments.some((item) => typeof item.url === "string" && item.url.includes("sentry.io"))) {
    return true;
  }
  return typeof issue.description === "string" && issue.description.includes("sentry.io");
}

/**
 * Class of finding from the signal-up body — paths, CI graph, or lock wording.
 * No synthetic `class:` line; create-contract writes `## Finding` only.
 *
 * @param {object} issue
 */
function leftoverClass(issue) {
  const description = String(issue.description ?? "");
  const findingMatch = description.match(/##\s*Finding\n([\s\S]*?)(?=\n##\s|\s*$)/i);
  const text =
    `${issue.title ?? ""}\n${findingMatch ? findingMatch[1] : description}`.toLowerCase();
  if (/\bci[-\s]?graph\b|required github check|\.github\/workflows|\bci\.yml\b/.test(text)) {
    return "ci-graph";
  }
  if (/\block wording\b|\barchitecture lock\b|\badr-00|\bdesign-system\.md\b/.test(text)) {
    return "lock-wording";
  }
  if (/\bwrite-scope\b|\bpath glob/.test(text)) {
    return "paths";
  }
  return "unclassified";
}

/**
 * Origin keys from relatedTo (origin may be outside Triage) and the body Origin line.
 *
 * @param {object} issue
 * @returns {string[]}
 */
function leftoverOriginKeys(issue) {
  const keys = [];
  for (const related of issue.relatedTo ?? []) {
    if (typeof related.id === "string" && related.id.length > 0) {
      keys.push(`id:${related.id}`);
    }
    if (typeof related.identifier === "string" && related.identifier.length > 0) {
      keys.push(`ident:${related.identifier}`);
    }
  }
  const originLine = String(issue.description ?? "").match(/Origin:\s*(KIT-\d+)/i);
  if (originLine) {
    keys.push(`ident:${originLine[1]}`);
  }
  return keys;
}

/**
 * Cluster leftovers that share a finding class or the same origin.
 * Origin need not be in the Triage list. Leftover↔leftover related is not required.
 *
 * @param {object[]} issues
 */
function leftoverClusters(issues) {
  const parent = new Map(issues.map((issue) => [issue.id, issue.id]));

  function find(id) {
    let current = id;
    while (parent.get(current) !== current) {
      parent.set(current, parent.get(parent.get(current)));
      current = parent.get(current);
    }
    return current;
  }

  function union(left, right) {
    const rootLeft = find(left);
    const rootRight = find(right);
    if (rootLeft !== rootRight) {
      parent.set(rootLeft, rootRight);
    }
  }

  const byClass = new Map();
  for (const issue of issues) {
    const className = leftoverClass(issue);
    if (className === "unclassified") {
      continue;
    }
    const existing = byClass.get(className);
    if (existing) {
      union(existing.id, issue.id);
    } else {
      byClass.set(className, issue);
    }
  }

  const byOrigin = new Map();
  for (const issue of issues) {
    for (const key of leftoverOriginKeys(issue)) {
      const existing = byOrigin.get(key);
      if (existing) {
        union(existing.id, issue.id);
      } else {
        byOrigin.set(key, issue);
      }
    }
  }

  const groups = new Map();
  for (const issue of issues) {
    const root = find(issue.id);
    const bucket = groups.get(root) ?? [];
    bucket.push(issue);
    groups.set(root, bucket);
  }
  return [...groups.values()].filter((group) => group.length >= 2);
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv | Record<string, string | undefined>,
 *   linear?: {
 *     listTriage: (input?: { teamKey?: string }) => Promise<object>,
 *     promoteIssue: (input: object) => Promise<unknown>,
 *     createTechIssue: (input: object) => Promise<{ id: string, identifier: string }>,
 *     markDuplicate: (input: object) => Promise<unknown>,
 *     commentIssue: (input: { issueId: string, body: string }) => Promise<unknown>,
 *     updateComment: (input: { id: string, body: string }) => Promise<unknown>,
 *   },
 * }} [input]
 */
export async function runIntake({ linear } = {}) {
  if (!linear) {
    throw new Error("intake requires a Linear CLI client");
  }

  const { teamId, backlogState, duplicateState, labels, issues } = await linear.listTriage({
    teamKey: INTAKE_TEAM_KEY,
  });
  if (backlogState?.name !== "Backlog" || typeof backlogState.id !== "string") {
    throw new Error("Backlog workflow state not found");
  }
  if (duplicateState?.name !== "Duplicate" || typeof duplicateState.id !== "string") {
    throw new Error("Duplicate workflow state not found");
  }
  if (typeof teamId !== "string") {
    throw new Error("KIT team not found");
  }

  const promoted = [];
  const commented = [];
  const processed = new Set();

  for (const issue of issues) {
    if (!isWellFormedSlice(issue)) {
      continue;
    }
    const addedLabelIds = [labels?.[READY_FOR_AGENT]].filter(
      (id) => typeof id === "string" && id.length > 0,
    );
    const removedLabelIds = (issue.labelIds ?? [])
      .filter((label) => DROP_ON_PROMOTE.includes(label.name))
      .map((label) => label.id);
    await linear.promoteIssue({
      id: issue.id,
      stateId: backlogState.id,
      addedLabelIds,
      removedLabelIds,
    });
    promoted.push({ identifier: issue.identifier });
    processed.add(issue.id);
  }

  const remaining = issues.filter((issue) => !processed.has(issue.id));

  for (const issue of remaining) {
    if (!isSentryIssue(issue)) {
      continue;
    }
    const existing = (issue.comments ?? []).find(
      (comment) =>
        typeof comment.body === "string" && comment.body.includes(INTAKE_COMMENT_HEADING),
    );
    if (existing) {
      await linear.updateComment({ id: existing.id, body: SENTRY_INTAKE_COMMENT });
    } else {
      await linear.commentIssue({ issueId: issue.id, body: SENTRY_INTAKE_COMMENT });
    }
    commented.push(issue.identifier);
    processed.add(issue.id);
  }

  const leftovers = remaining.filter((issue) => !processed.has(issue.id));
  const consolidated = [];
  for (const cluster of leftoverClusters(leftovers)) {
    const className = leftoverClass(cluster[0]);
    const origins = cluster.map((issue) => issue.identifier).sort();
    const created = await linear.createTechIssue({
      title: `Tech: ${className}`,
      description: `Consolidated leftovers of class ${className}.\n\nOrigins: ${origins.join(", ")}`,
      teamId,
      stateId: backlogState.id,
      labelIds: labels?.Improvement ? [labels.Improvement] : undefined,
    });
    await linear.commentIssue({
      issueId: created.id,
      body: `${INTAKE_COMMENT_HEADING}

Origins: ${origins.join(", ")}
`,
    });
    for (const origin of cluster) {
      await linear.markDuplicate({
        issueId: origin.id,
        canonicalId: created.id,
        stateId: duplicateState.id,
      });
    }
    consolidated.push({ identifier: created.identifier, origins });
  }

  return {
    promoted,
    commented,
    consolidated: consolidated[0] ?? { identifier: null, origins: [] },
  };
}

/**
 * Same list/promote/consolidate job the hourly poller enqueues.
 * Poller enqueues onto the planner mutex, not the coding slot.
 *
 * @param {{
 *   enqueue: { enqueue: (job: object) => unknown },
 *   intervalMs?: number,
 *   setIntervalFn?: typeof setInterval,
 *   clearIntervalFn?: typeof clearInterval,
 * }} input
 */
export function startIntakePoller({
  enqueue,
  intervalMs = DEFAULT_INTAKE_POLL_MS,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
}) {
  const timer = setIntervalFn(() => {
    enqueue.enqueue({ role: "intake" });
  }, intervalMs);
  if (typeof timer === "object" && timer !== null && typeof timer.unref === "function") {
    timer.unref();
  }
  return () => clearIntervalFn(timer);
}
