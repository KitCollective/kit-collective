/**
 * Linear-only Intake job (KIT-89 / KIT-99).
 *
 * Lists open KIT Triage issues. Promotes well-formed slices, shapes leftovers
 * that have an inferable write-scope, comments unshaped Sentry or unscoped
 * leftovers. Interface: runIntake / startIntakePoller. Linear CLI (or a fake)
 * at this seam. No Pi spawn. Planner claims and sets Pi delegate.
 */
import { parseWriteScopeGlobs } from "../scripts/lib/pr-write-scope.mjs";

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
const PATH_RE =
  /(?:^|[\s`'"(])((?:harness|apps|packages|scripts|docs|\.cursor|\.pi|\.github)\/[A-Za-z0-9_./?*+-]+)/g;
const BUG_RE =
  /\b(omit|omits|missing|does not|fail|crash|wipe|broken|wrong|still says|cannot|can't)\b/i;
const SURFACE_PATHS = [
  ["apps/mobile", "surface:mobile"],
  ["apps/web", "surface:web"],
  ["apps/admin", "surface:admin"],
  ["apps/api", "surface:api"],
  ["packages/db", "surface:api"],
];

export const SENTRY_INTAKE_COMMENT = `${INTAKE_COMMENT_HEADING}

Unshaped Sentry issue. Left in Triage. Intake will not invent a product slice.
`;

export const UNSCOPED_INTAKE_COMMENT = `${INTAKE_COMMENT_HEADING}

Could not infer write-scope from this leftover. Left in Triage for a human to shape.
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
 * @param {string} text
 */
function issueText(issue) {
  return `${issue.title ?? ""}\n${issue.description ?? ""}`;
}

/**
 * @param {string} description
 * @param {string} heading
 */
function markdownSection(description, heading) {
  const match = String(description).match(
    new RegExp(`##\\s*${heading}\\n([\\s\\S]*?)(?=\\n##\\s|\\s*$)`, "i"),
  );
  return match ? match[1].trim() : "";
}

/**
 * Repo paths from an existing write-scope line or mentioned files.
 *
 * @param {object} issue
 * @returns {string[]}
 */
export function inferWriteScopeGlobs(issue) {
  const declared = parseWriteScopeGlobs(issue.description ?? "");
  if (Array.isArray(declared) && declared.length > 0) {
    return declared;
  }
  const found = new Set();
  const text = issueText(issue);
  PATH_RE.lastIndex = 0;
  let match = PATH_RE.exec(text);
  while (match) {
    found.add(match[1].replace(/[.,;:]+$/, ""));
    match = PATH_RE.exec(text);
  }
  return [...found];
}

/**
 * @param {object} issue
 */
export function inferLinearType(issue) {
  if (typeof issue.linearType === "string" && issue.linearType.length > 0) {
    return issue.linearType;
  }
  return BUG_RE.test(issueText(issue)) ? "Bug" : "Improvement";
}

/**
 * @param {object} issue
 * @returns {string[]}
 */
export function inferSurfaceLabels(issue) {
  const text = issueText(issue);
  const labels = [];
  for (const [needle, label] of SURFACE_PATHS) {
    if (text.includes(needle) && !labels.includes(label)) {
      labels.push(label);
    }
  }
  return labels;
}

/**
 * @param {object} issue
 */
export function canShapeLeftover(issue) {
  return inferWriteScopeGlobs(issue).length > 0;
}

/**
 * @param {object} issue
 */
export function shapeLeftoverDescription(issue) {
  const description = String(issue.description ?? "");
  const globs = inferWriteScopeGlobs(issue);
  const finding = markdownSection(description, "Finding");
  const existingWhat = markdownSection(description, "What to build");
  const what = existingWhat || finding || String(issue.title ?? "");
  const suggested = markdownSection(description, "Suggested acceptance(?: \\(optional\\))?");
  const existingAc = markdownSection(description, "Acceptance criteria");
  const ac = existingAc || suggested || `- [ ] ${issue.title}`;
  const scopeLine = `write-scope: ${globs.join(", ")}`;
  let next = description;
  if (!/##\s*What to build/i.test(next)) {
    next = `## What to build\n\n${what}\n\n${scopeLine}\n\n${next}`.trim();
  } else if (!/write-scope:\s*\S/.test(next)) {
    next = next.replace(/(##\s*What to build[\s\S]*?)(?=\n##\s|$)/i, (block) => {
      return `${block.trimEnd()}\n\n${scopeLine}\n`;
    });
  }
  if (!/##\s*Acceptance criteria/i.test(next)) {
    next = `${next.trim()}\n\n## Acceptance criteria\n\n${ac}\n`;
  }
  return next;
}

/**
 * @param {object} issue
 * @param {Record<string, string>} labels
 */
function promoteLabelIds(issue, labels) {
  const added = [labels?.[READY_FOR_AGENT]];
  if (!issue.linearType) {
    added.push(labels?.[inferLinearType(issue)]);
  }
  for (const name of inferSurfaceLabels(issue)) {
    added.push(labels?.[name]);
  }
  return added.filter((id) => typeof id === "string" && id.length > 0);
}

/**
 * @param {object} issue
 */
function dropLabelIds(issue) {
  return (issue.labelIds ?? [])
    .filter((label) => DROP_ON_PROMOTE.includes(label.name))
    .map((label) => label.id);
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv | Record<string, string | undefined>,
 *   linear?: {
 *     listTriage: (input?: { teamKey?: string }) => Promise<object>,
 *     promoteIssue: (input: object) => Promise<unknown>,
 *     commentIssue: (input: { issueId: string, body: string }) => Promise<unknown>,
 *     updateComment: (input: { id: string, body: string }) => Promise<unknown>,
 *   },
 * }} [input]
 */
export async function runIntake({ linear } = {}) {
  if (!linear) {
    throw new Error("intake requires a Linear CLI client");
  }

  const { backlogState, labels, issues } = await linear.listTriage({
    teamKey: INTAKE_TEAM_KEY,
  });
  if (backlogState?.name !== "Backlog" || typeof backlogState.id !== "string") {
    throw new Error("Backlog workflow state not found");
  }

  const promoted = [];
  const commented = [];
  const processed = new Set();

  for (const issue of issues) {
    if (isWellFormedSlice(issue)) {
      await linear.promoteIssue({
        id: issue.id,
        stateId: backlogState.id,
        addedLabelIds: promoteLabelIds(issue, labels),
        removedLabelIds: dropLabelIds(issue),
        description: issue.description ?? "",
      });
      promoted.push({ identifier: issue.identifier });
      processed.add(issue.id);
      continue;
    }
    if (canShapeLeftover(issue)) {
      const description = shapeLeftoverDescription(issue);
      await linear.promoteIssue({
        id: issue.id,
        stateId: backlogState.id,
        addedLabelIds: promoteLabelIds(issue, labels),
        removedLabelIds: dropLabelIds(issue),
        description,
      });
      promoted.push({ identifier: issue.identifier });
      processed.add(issue.id);
    }
  }

  const remaining = issues.filter((issue) => !processed.has(issue.id));

  for (const issue of remaining) {
    const body = isSentryIssue(issue) ? SENTRY_INTAKE_COMMENT : UNSCOPED_INTAKE_COMMENT;
    const existing = (issue.comments ?? []).find(
      (comment) =>
        typeof comment.body === "string" && comment.body.includes(INTAKE_COMMENT_HEADING),
    );
    if (existing) {
      await linear.updateComment({ id: existing.id, body });
    } else {
      await linear.commentIssue({ issueId: issue.id, body });
    }
    commented.push(issue.identifier);
    processed.add(issue.id);
  }

  return {
    promoted,
    commented,
    consolidated: { identifier: null, origins: [] },
  };
}

/**
 * Same list/promote job the hourly poller enqueues.
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
