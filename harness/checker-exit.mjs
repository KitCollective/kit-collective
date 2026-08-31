/**
 * Factory checker exit (KIT-56).
 *
 * After the review Pi session: read workpad verdict + PR gates (MERGEABLE,
 * required GitHub checks). Pass → Ready for merge. Fail with complete axes →
 * Implementing. Incomplete Spec/Standards/Slop axes while PR is green → stay
 * In Review and re-run checker in-slot (cap 2), then park for human. Never merge.
 * Fake `gh` + Linear at this seam.
 */
import { ensureLoopCounters, incrementReviewLoops, parseLoopCounters } from "./auto-merge.mjs";
import {
  logFactoryExitDone,
  logFactoryExitStart,
  logFactoryGatePoll,
} from "./factory-exit-log.mjs";
import { bumpFirstPassCandidates } from "./first-pass.mjs";
import {
  evaluateStuckFeedback,
  extractReviewFeedback,
  IN_REVIEW,
  requiredChecksFailed,
  requiredChecksGreen,
  STUCK_FEEDBACK_CAP,
} from "./implement-exit.mjs";
import { createLandGh, resolveLinkedPullRequest } from "./land.mjs";
import { WORKPAD_HEADING } from "./linear-cli.mjs";
import {
  applyCheckerPassDescription,
  buildCheckerPassVerdicts,
  checkerFailComment,
  checkerPassComment,
  parseDescriptionAcRewrites,
} from "./role-comments.mjs";
import { createSlopReviewGh } from "./slop-review.mjs";

export const READY_FOR_MERGE = "Ready for merge";
export const IMPLEMENTING = "Implementing";
export const PARKED = "Parked";
export const READY_FOR_HUMAN_LABEL = "ready-for-human";
export { STUCK_FEEDBACK_CAP };
export const REVIEW_FEEDBACK_HEADING = "### Review feedback";
export const STUCK_LOOP_HEADING = "### Stuck loop";
export const REVIEW_AXIS_SPEC_CLEAN = /^-\s*Spec:\s*\(none\)\s*$/i;
export const REVIEW_AXIS_STANDARDS_CLEAN = /^-\s*Standards:\s*\(none\)\s*$/i;
export const REVIEW_AXIS_SLOP_CLEAN = /^-\s*Slop:\s*\(none\)\s*$/i;
export const REVIEW_PASS_FEEDBACK_LINES = [
  "- Spec: (none)",
  "- Standards: (none)",
  "- Slop: (none)",
];

/** Fail-path fallback when harness has no axis lines — never the legacy single `- (none)`. */
export const REVIEW_FEEDBACK_HARNESS_INCOMPLETE = "- Review feedback incomplete (harness)";
export const REVIEW_FEEDBACK_AXES_REQUIRED =
  "- Review feedback must include Spec, Standards, and Slop axis lines";
export const CHECKER_HARNESS_HEADING = "### Checker harness";
export const CHECKER_WORKPAD_PARKED_LINE = "- workpad-incomplete-parked";
export const MAX_CHECKER_WORKPAD_RETRIES = 2;
export const NOTES_HEADING = "### Notes";
export const CHECKER_PASS_STATUS = "All good — checker pass. MERGEABLE, required checks green.";
export const RATCHET_NUDGE_TEXT =
  "next implement pass must land a ratchet per docs/agents/error-ratcheting.md";

const REVIEW_FEEDBACK_HEADING_AT = /(?:^|\n)### Review feedback(?:\n|$)/;
const REVIEW_FEEDBACK_BLOCK = /(^|\n)### Review feedback\n([\s\S]*?)(?=\n### |$)/;
const NOTES_HEADING_AT = /(?:^|\n)### Notes(?:\n|$)/;
const NOTES_BLOCK = /(^|\n)### Notes\n([\s\S]*?)(?=\n### |$)/;
const STUCK_LOOP_BLOCK = /(^|\n)### Stuck loop\n([\s\S]*?)(?=\n### |$)/;

/**
 * @returns {string}
 */
export function ratchetNudgeWorkpadLine() {
  return `- Ratchet: ${RATCHET_NUDGE_TEXT}`;
}

/**
 * Read stuck-loop streak from workpad `### Stuck loop`.
 *
 * @param {string | undefined} body
 * @returns {number}
 */
export function parseStuckLoopStreak(body) {
  if (typeof body !== "string" || !body.includes(STUCK_LOOP_HEADING)) {
    return 0;
  }
  const match = body.match(STUCK_LOOP_BLOCK);
  if (!match) {
    return 0;
  }
  const streak = match[2].match(/streak:\s*(\d+)/i);
  return streak ? Number(streak[1]) || 0 : 0;
}

/**
 * Persist stuck streak + fingerprint on the workpad.
 *
 * @param {string | undefined} current
 * @param {{ streak: number, fingerprint: string }} input
 */
export function applyStuckLoopWorkpad(current, { streak, fingerprint }) {
  const base =
    typeof current === "string" && current.includes(WORKPAD_HEADING)
      ? current.trimEnd()
      : WORKPAD_HEADING;
  const content = `- streak: ${streak}\n- fingerprint: ${String(fingerprint ?? "").slice(0, 200)}\n`;
  const section = `${STUCK_LOOP_HEADING}\n\n${content}`;
  if (STUCK_LOOP_BLOCK.test(base)) {
    return `${base.replace(STUCK_LOOP_BLOCK, `$1${section}`)}\n`;
  }
  if (REVIEW_FEEDBACK_HEADING_AT.test(base)) {
    return `${base.replace(/(^|\n)### Review feedback(\n|$)/, `$1${section}\n\n${REVIEW_FEEDBACK_HEADING}$2`)}\n`;
  }
  return `${base}\n\n${section}\n`;
}

/**
 * Spec axis cannot pass on prose alone — require AC ticks, Validation, or ### Evidence.
 *
 * @param {string | undefined} workpadBody
 * @returns {{ ok: boolean, feedback: string[] }}
 */
export function evaluateSpecEvidenceFloor(workpadBody) {
  const body = typeof workpadBody === "string" ? workpadBody : "";
  const lines = reviewFeedbackLines(body);
  const specClean = lines.some((line) => REVIEW_AXIS_SPEC_CLEAN.test(line));
  const specFinding = lines.some(
    (line) => /^-\s*Spec:/i.test(line) && !REVIEW_AXIS_SPEC_CLEAN.test(line),
  );
  if (!specClean || specFinding) {
    // Spec not marked green — evidence floor does not apply.
    return { ok: true, feedback: [] };
  }

  const hasAcTick = /(?:^|\n)\s*[-*]\s*\[[xX]\]/.test(body);
  const validationMatch = body.match(/###\s*Validation\b([\s\S]*?)(?=\n###\s|\n##\s|$)/i);
  const validationBody = validationMatch ? String(validationMatch[1] ?? "").trim() : "";
  const hasValidation =
    validationBody.length > 0 &&
    !/^\(none\)$/i.test(validationBody) &&
    !/^-\s*\(none\)\s*$/im.test(validationBody);

  const evidenceMatch = body.match(/###\s*Evidence\b([\s\S]*?)(?=\n###\s|\n##\s|$)/i);
  const evidenceBody = evidenceMatch ? String(evidenceMatch[1] ?? "").trim() : "";
  const evidenceLines = evidenceBody
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^\(none\)$/i.test(line) && !/^-\s*\(none\)\s*$/i.test(line));
  const hasEvidence = evidenceLines.length > 0;

  if (hasAcTick || hasValidation || hasEvidence) {
    return { ok: true, feedback: [] };
  }
  return {
    ok: false,
    feedback: [
      "- Spec: evidence floor — Spec cannot pass on prose alone; tick AC checkboxes, fill ### Validation, or add non-empty ### Evidence",
    ],
  };
}

/**
 * @param {string} identifier
 * @returns {string}
 */
export function ratchetNudgeComment(identifier) {
  return `${identifier}: ${RATCHET_NUDGE_TEXT}`;
}

/**
 * @param {string | undefined} body
 * @returns {boolean}
 */
export function hasRatchetNudge(body) {
  return typeof body === "string" && body.includes(RATCHET_NUDGE_TEXT);
}

/**
 * Append the ratchet nudge workpad line when reviewLoops >= 2 (ADR-0026).
 *
 * @param {string | undefined} body
 */
export function applyRatchetNudge(body) {
  const counters = parseLoopCounters(body);
  if (!counters || counters.reviewLoops < 2 || hasRatchetNudge(body)) {
    return typeof body === "string" ? body : `${WORKPAD_HEADING}\n`;
  }
  const line = ratchetNudgeWorkpadLine();
  const base =
    typeof body === "string" && body.includes(WORKPAD_HEADING) ? body.trimEnd() : WORKPAD_HEADING;
  if (NOTES_HEADING_AT.test(base)) {
    return `${base.replace(NOTES_BLOCK, `$1${NOTES_HEADING}\n\n$2\n${line}\n`)}\n`;
  }
  if (REVIEW_FEEDBACK_HEADING_AT.test(base)) {
    return `${base.replace(/(^|\n)### Review feedback(\n|$)/, `$1${NOTES_HEADING}\n\n${line}\n\n${REVIEW_FEEDBACK_HEADING}$2`)}\n`;
  }
  return `${base}\n\n${NOTES_HEADING}\n\n${line}\n`;
}

/**
 * @param {string | undefined} body
 * @returns {string}
 */
export function reviewFeedbackSection(body) {
  if (typeof body !== "string") {
    return "";
  }
  const match = body.match(REVIEW_FEEDBACK_BLOCK);
  return match ? match[2].trim() : "";
}

/**
 * @param {string | undefined} body
 * @returns {string[]}
 */
export function reviewFeedbackLines(body) {
  const section = reviewFeedbackSection(body);
  if (section.length === 0) {
    return [];
  }
  return section
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * @param {string | undefined} body
 * @returns {boolean}
 */
export function reviewFeedbackMissingSlopAxis(body) {
  const lines = reviewFeedbackLines(body);
  if (lines.length === 0) {
    return true;
  }
  return !lines.some((line) => /^-\s*Slop:/i.test(line) || /^-\s*Slop\//i.test(line));
}

/**
 * True when Spec / Standards / Slop axis lines are all missing (empty or garbage section),
 * or when only clean/partial axes exist without a complete three-axis dump.
 * Real Spec/Standards/Slop findings are not "incomplete" — they are product fails
 * (even if one axis line is missing from the dump).
 *
 * @param {string | undefined} body
 */
export function reviewFeedbackAxesIncomplete(body) {
  const lines = reviewFeedbackLines(body);
  if (lines.length === 0) {
    return true;
  }
  const hasProductFinding = lines.some((line) => {
    if (/^-\s*Slop\//i.test(line)) {
      return true;
    }
    if (/^-\s*Spec:/i.test(line) && !REVIEW_AXIS_SPEC_CLEAN.test(line)) {
      return true;
    }
    if (/^-\s*Standards:/i.test(line) && !REVIEW_AXIS_STANDARDS_CLEAN.test(line)) {
      return true;
    }
    if (/^-\s*Slop:/i.test(line) && !REVIEW_AXIS_SLOP_CLEAN.test(line)) {
      return true;
    }
    return false;
  });
  if (hasProductFinding) {
    return false;
  }
  const hasSpec = lines.some((line) => /^-\s*Spec:/i.test(line));
  const hasStandards = lines.some((line) => /^-\s*Standards:/i.test(line));
  const hasSlop = lines.some((line) => /^-\s*Slop:/i.test(line) || /^-\s*Slop\//i.test(line));
  return !(hasSpec && hasStandards && hasSlop);
}

/**
 * @param {string | undefined} body
 */
export function workpadCheckerIncompleteParked(body) {
  return (
    typeof body === "string" &&
    body.includes(CHECKER_HARNESS_HEADING) &&
    body.includes(CHECKER_WORKPAD_PARKED_LINE)
  );
}

/**
 * @param {string | undefined} body
 * @returns {number}
 */
export function parseCheckerWorkpadIncompleteCount(body) {
  if (typeof body !== "string") {
    return 0;
  }
  const match = body.match(/incomplete-count:\s*(\d+)/i);
  return match ? Number(match[1]) || 0 : 0;
}

/**
 * @param {string} current
 * @param {{ count: number, parked?: boolean }} input
 */
export function applyCheckerIncompleteWorkpad(current, { count, parked = false }) {
  const base =
    typeof current === "string" && current.includes(WORKPAD_HEADING)
      ? current.trimEnd()
      : WORKPAD_HEADING;
  const lines = [
    CHECKER_HARNESS_HEADING,
    "",
    `- incomplete-count: ${count}`,
    parked ? CHECKER_WORKPAD_PARKED_LINE : "- incomplete-retry",
    "",
  ];
  const section = `${lines.join("\n")}\n`;
  let next = base;
  if (/###\s*Checker harness\b/i.test(next)) {
    next = next.replace(/###\s*Checker harness\b[\s\S]*?(?=\n###\s|\n##\s|$)/i, section);
  } else {
    next = `${next}\n\n${section}`;
  }
  if (REVIEW_FEEDBACK_HEADING_AT.test(next)) {
    next = next.replace(
      REVIEW_FEEDBACK_BLOCK,
      `$1${REVIEW_FEEDBACK_HEADING}\n\n${REVIEW_FEEDBACK_AXES_REQUIRED}\n`,
    );
  } else {
    next = `${next}\n\n${REVIEW_FEEDBACK_HEADING}\n\n${REVIEW_FEEDBACK_AXES_REQUIRED}\n`;
  }
  return `${next.trimEnd()}\n`;
}

/**
 * Pass is exactly the three labeled axes. Bare `- (none)` and empty feedback fail.
 *
 * @param {string | undefined} body
 * @returns {boolean}
 */
export function reviewFeedbackIsClean(body) {
  const lines = reviewFeedbackLines(body);
  if (lines.length !== REVIEW_PASS_FEEDBACK_LINES.length) {
    return false;
  }
  return (
    REVIEW_AXIS_SPEC_CLEAN.test(lines[0]) &&
    REVIEW_AXIS_STANDARDS_CLEAN.test(lines[1]) &&
    REVIEW_AXIS_SLOP_CLEAN.test(lines[2])
  );
}

/**
 * @param {string | undefined} body
 * @returns {boolean}
 */
export function reviewFeedbackHasFindings(body) {
  return !reviewFeedbackIsClean(body);
}

/**
 * @param {object | null | undefined} pr
 * @returns {string[]}
 */
export function ghGateFailures(pr) {
  const failures = [];
  if (pr?.mergeable !== "MERGEABLE") {
    failures.push(`- PR is not MERGEABLE (${pr?.mergeable ?? "unknown"})`);
  }
  const checks = pr?.requiredChecks ?? pr?.checks;
  if (requiredChecksFailed(checks)) {
    failures.push("- Required GitHub checks failed");
  } else if (!requiredChecksGreen(checks)) {
    failures.push("- Required GitHub checks are not green");
  }
  return failures;
}

/**
 * Durable pass note on the existing workpad. Keep Review feedback as the
 * three-axis pass lines (`- Spec: (none)`, `- Standards: (none)`, `- Slop: (none)`)
 * so a later checker does not treat the pass line as findings.
 *
 * @param {string | undefined} current
 */
export function applyCheckerPassWorkpad(current) {
  const base =
    typeof current === "string" && current.includes(WORKPAD_HEADING)
      ? current.trimEnd()
      : WORKPAD_HEADING;
  const statusBlock = `### Status\n${CHECKER_PASS_STATUS}\n`;
  let next = base.includes("### Status")
    ? base.replace(/### Status\n[\s\S]*?(?=\n### |\s*$)/, statusBlock)
    : base.replace(WORKPAD_HEADING, `${WORKPAD_HEADING}\n\n${statusBlock}`);
  if (REVIEW_FEEDBACK_HEADING_AT.test(next)) {
    next = next.replace(
      REVIEW_FEEDBACK_BLOCK,
      `$1${REVIEW_FEEDBACK_HEADING}\n\n${REVIEW_PASS_FEEDBACK_LINES.join("\n")}\n`,
    );
  } else {
    next = `${next}\n\n${REVIEW_FEEDBACK_HEADING}\n\n${REVIEW_PASS_FEEDBACK_LINES.join("\n")}\n`;
  }
  return ensureLoopCounters(`${next.trimEnd()}\n`);
}

export function applyCheckerFailWorkpad(current, { feedbackLines }) {
  const base =
    typeof current === "string" && current.includes(WORKPAD_HEADING)
      ? current.trimEnd()
      : WORKPAD_HEADING;
  const lines = Array.isArray(feedbackLines)
    ? feedbackLines.filter(Boolean)
    : [REVIEW_FEEDBACK_HARNESS_INCOMPLETE];
  const content = lines.length > 0 ? lines.join("\n") : REVIEW_FEEDBACK_HARNESS_INCOMPLETE;
  if (REVIEW_FEEDBACK_HEADING_AT.test(base)) {
    return `${base.replace(REVIEW_FEEDBACK_BLOCK, `$1${REVIEW_FEEDBACK_HEADING}\n\n${content}\n`)}\n`;
  }
  return `${base}\n\n${REVIEW_FEEDBACK_HEADING}\n\n${content}\n`;
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv | Record<string, string | undefined>,
 *   repo?: string,
 *   runCommand?: Function,
 *   runSync?: Function,
 * }} [deps]
 */
/**
 * @param {object | null | undefined} gh
 * @param {{
 *   repo?: string,
 *   number: number,
 *   workpadBody?: string,
 *   findings?: Array<{ path: string, lineNumber: number, message: string }>,
 * }} input
 */
export async function syncSlopReviewThreadsSafely(gh, input) {
  if (!gh || typeof gh.syncSlopReviewThreads !== "function") {
    return;
  }
  try {
    await gh.syncSlopReviewThreads(input);
  } catch {
    // GitHub thread sync must not block Linear status moves.
  }
}

export function createCheckerGh(deps = {}) {
  const land = createLandGh(deps);
  const slop = createSlopReviewGh(deps);
  return {
    viewPr: land.viewPr.bind(land),
    postInlineComment: slop.postInlineComment.bind(slop),
    listSlopThreads: slop.listSlopThreads.bind(slop),
    resolveReviewThread: slop.resolveReviewThread.bind(slop),
    syncSlopReviewThreads: slop.syncSlopReviewThreads.bind(slop),
    merge() {
      throw new Error("checker never merges");
    },
    approve() {
      throw new Error("checker never approves");
    },
  };
}

/**
 * @param {{
 *   job: { issueId: string, identifier?: string },
 *   linear: {
 *     updateWorkpad: (input: { issueId: string, body: string, commentId?: string }) => Promise<unknown>,
 *     setStatus: (input: { issueId: string, status: string }) => Promise<unknown>,
 *     commentIssue?: (input: { issueId: string, body: string }) => Promise<unknown>,
 *   },
 *   feedbackLines: string[],
 *   workpadBody?: string,
 *   existingComment?: { id?: string, body?: string },
 *   pr?: object | null,
 *   gh?: object | null,
 *   linked?: { repo: string, number: number } | null,
 * }} input
 */
async function checkerFailMove(input) {
  const {
    job,
    linear,
    feedbackLines,
    workpadBody = "",
    existingComment,
    pr = null,
    gh = null,
    linked = null,
  } = input;
  const { workpad: withCandidates, ratchetLines } = bumpFirstPassCandidates(
    workpadBody,
    feedbackLines,
  );
  const mergedFeedback = [...feedbackLines];
  for (const line of ratchetLines) {
    if (!mergedFeedback.includes(line)) {
      mergedFeedback.push(line);
    }
  }
  let body = applyRatchetNudge(
    incrementReviewLoops(
      applyCheckerFailWorkpad(withCandidates, { feedbackLines: mergedFeedback }),
    ),
  );

  const priorStreak = parseStuckLoopStreak(workpadBody);
  const stuck = evaluateStuckFeedback(workpadBody, body, priorStreak);
  body = applyStuckLoopWorkpad(body, {
    streak: stuck.streak,
    fingerprint: stuck.fingerprint,
  });

  await linear.updateWorkpad({
    issueId: job.issueId,
    body,
    commentId: existingComment?.id,
  });
  if (linked && typeof linked.number === "number") {
    await syncSlopReviewThreadsSafely(gh, {
      repo: linked.repo,
      number: linked.number,
      workpadBody,
    });
  }
  const identifier =
    typeof job.identifier === "string" && job.identifier.length > 0 ? job.identifier : job.issueId;

  if (stuck.stuck) {
    if (typeof linear.commentIssue === "function") {
      await linear.commentIssue({
        issueId: job.issueId,
        body: `${identifier}: stuck loop — same Review feedback fingerprint ≥ ${STUCK_FEEDBACK_CAP} times. Parked for human (${READY_FOR_HUMAN_LABEL}).`,
      });
    }
    await linear.setStatus({ issueId: job.issueId, status: PARKED });
    if (typeof linear.addLabels === "function") {
      await linear.addLabels({
        issueId: job.issueId,
        labelNames: [READY_FOR_HUMAN_LABEL],
      });
    }
    return {
      passed: false,
      nextStatus: PARKED,
      stuckParked: true,
      stuckStreak: stuck.streak,
      pr,
      feedbackLines,
    };
  }

  if (typeof linear.commentIssue === "function") {
    await linear.commentIssue({
      issueId: job.issueId,
      body: checkerFailComment(identifier, extractReviewFeedback(body)),
    });
  }
  await linear.setStatus({ issueId: job.issueId, status: IMPLEMENTING });
  return {
    passed: false,
    nextStatus: IMPLEMENTING,
    stuckStreak: stuck.streak,
    pr,
    feedbackLines,
  };
}

/**
 * @param {{
 *   job: { issueId: string, identifier?: string },
 *   linear: {
 *     getIssue: (id: string) => Promise<object | null>,
 *     listComments?: (issueId: string) => Promise<Array<{ id: string, body?: string }>>,
 *     updateWorkpad: (input: { issueId: string, body: string, commentId?: string }) => Promise<unknown>,
 *     setStatus: (input: { issueId: string, status: string }) => Promise<unknown>,
 *     commentIssue?: (input: { issueId: string, body: string }) => Promise<unknown>,
 *     updateIssueDescription?: (input: { issueId: string, description: string }) => Promise<unknown>,
 *   },
 *   gh: {
 *     viewPr: (input: { number: number, repo?: string }) => Promise<object | null>,
 *     merge?: (input?: object) => unknown,
 *   },
 *   now?: () => number,
 *   sleep?: (ms: number) => Promise<unknown>,
 *   waitTimeoutMs?: number,
 *   waitIntervalMs?: number,
 * }} input
 */
export async function completeChecker(input) {
  const {
    job,
    linear,
    gh,
    now = () => Date.now(),
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    waitTimeoutMs = 30 * 60 * 1000,
    waitIntervalMs = 15_000,
  } = input;

  const issue = await linear.getIssue(job.issueId);
  if (!issue || issue.status !== IN_REVIEW) {
    return {
      skipped: true,
      passed: false,
      nextStatus: issue?.status,
      reason: "checker wakes only from In Review",
    };
  }

  const comments =
    typeof linear.listComments === "function" ? await linear.listComments(job.issueId) : [];
  const existing = comments.find((comment) => comment.body?.includes(WORKPAD_HEADING));
  const workpadBody = existing?.body ?? "";

  const identifier =
    typeof job.identifier === "string" && job.identifier.length > 0
      ? job.identifier
      : issue.identifier;

  if (workpadCheckerIncompleteParked(workpadBody)) {
    logFactoryExitDone({
      role: "factory-checker",
      identifier,
      phase: "checker-exit",
      passed: false,
      nextStatus: IN_REVIEW,
      reason: "workpad-incomplete-parked",
    });
    return {
      skipped: true,
      passed: false,
      nextStatus: IN_REVIEW,
      checkerWorkpadParked: true,
      reason: "workpad-incomplete-parked",
    };
  }

  const linkedResolution = await resolveLinkedPullRequest({
    attachments: issue.attachments,
    identifier,
    gh,
  });
  const linked = linkedResolution?.linked ?? null;
  if (!linked) {
    return checkerFailMove({
      job,
      linear,
      workpadBody,
      existingComment: existing,
      feedbackLines: ["- Linked GitHub PR is required for factory checker"],
      gh,
    });
  }
  logFactoryExitStart({
    role: "factory-checker",
    identifier,
    phase: "checker-exit",
    linked,
    skipped: linkedResolution?.skipped ?? [],
  });

  const deadline = now() + waitTimeoutMs;
  let pr = null;
  let timedOut = false;
  let attempt = 0;
  while (true) {
    attempt += 1;
    pr = await gh.viewPr({ number: linked.number, repo: linked.repo });
    const checks = pr?.requiredChecks ?? pr?.checks;
    const checksGreen = requiredChecksGreen(checks);
    logFactoryGatePoll({
      role: "factory-checker",
      identifier,
      phase: "checker-exit",
      attempt,
      pr,
      checksGreen,
    });
    if (requiredChecksFailed(checks)) {
      break;
    }
    if (pr?.mergeable === "CONFLICTING") {
      break;
    }
    if (pr?.mergeable === "MERGEABLE" && checksGreen) {
      break;
    }
    if (now() >= deadline) {
      timedOut = true;
      break;
    }
    await sleep(waitIntervalMs);
  }

  const piFindings = reviewFeedbackHasFindings(workpadBody);
  const missingSlopAxis = reviewFeedbackMissingSlopAxis(workpadBody);
  const axesIncomplete = reviewFeedbackAxesIncomplete(workpadBody);
  const gateFailures = ghGateFailures(pr);
  if (timedOut) {
    gateFailures.push("- Required GitHub checks timed out before turning green");
  }
  const evidenceFloor = evaluateSpecEvidenceFloor(workpadBody);
  const passed =
    !piFindings &&
    !missingSlopAxis &&
    gateFailures.length === 0 &&
    evidenceFloor.ok;

  if (passed) {
    await syncSlopReviewThreadsSafely(gh, {
      repo: linked.repo,
      number: linked.number,
      workpadBody,
      findings: [],
    });
    const rewrites = parseDescriptionAcRewrites(workpadBody);
    const description = typeof issue.description === "string" ? issue.description : "";
    const updatedDescription = applyCheckerPassDescription(description, { rewrites });
    const verdicts = buildCheckerPassVerdicts(description, { rewrites });
    await linear.updateWorkpad({
      issueId: job.issueId,
      body: applyCheckerPassWorkpad(workpadBody),
      commentId: existing?.id,
    });
    if (typeof linear.updateIssueDescription === "function") {
      await linear.updateIssueDescription({
        issueId: job.issueId,
        description: updatedDescription,
      });
    }
    if (typeof linear.commentIssue === "function") {
      await linear.commentIssue({
        issueId: job.issueId,
        body: checkerPassComment(identifier, verdicts),
      });
    }
    await linear.setStatus({ issueId: job.issueId, status: READY_FOR_MERGE });
    logFactoryExitDone({
      role: "factory-checker",
      identifier,
      phase: "checker-exit",
      passed: true,
      nextStatus: READY_FOR_MERGE,
    });
    return { passed: true, nextStatus: READY_FOR_MERGE, pr };
  }

  // Incomplete three-axis workpad while PR is green: re-run checker in-slot — do not
  // bounce to a full implement tree (KIT-136 death spiral).
  if (axesIncomplete && gateFailures.length === 0) {
    const prior = parseCheckerWorkpadIncompleteCount(workpadBody);
    const count = prior + 1;
    const parked = count >= MAX_CHECKER_WORKPAD_RETRIES;
    const body = applyCheckerIncompleteWorkpad(workpadBody, { count, parked });
    await linear.updateWorkpad({
      issueId: job.issueId,
      body,
      commentId: existing?.id,
    });
    if (parked && typeof linear.commentIssue === "function") {
      await linear.commentIssue({
        issueId: job.issueId,
        body: `${identifier}: checker parked — Review feedback still missing Spec/Standards/Slop after ${count} tries. Needs human (ready-for-human). Staying In Review; resume will not re-enqueue.`,
      });
    }
    logFactoryExitDone({
      role: "factory-checker",
      identifier,
      phase: "checker-exit",
      passed: false,
      nextStatus: IN_REVIEW,
      reason: parked ? "workpad-incomplete-parked" : "workpad-incomplete-retry",
    });
    return {
      passed: false,
      nextStatus: IN_REVIEW,
      checkerWorkpadRetry: !parked,
      checkerWorkpadParked: parked,
      pr,
    };
  }

  const feedbackLines = [];
  if (!evidenceFloor.ok) {
    feedbackLines.push(...evidenceFloor.feedback);
  }
  if (piFindings || missingSlopAxis) {
    const section = reviewFeedbackSection(workpadBody);
    if (section.length === 0 || axesIncomplete) {
      feedbackLines.push(REVIEW_FEEDBACK_AXES_REQUIRED);
    } else {
      feedbackLines.push(
        ...section
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
      );
    }
    if (missingSlopAxis && !feedbackLines.some((line) => /Slop/i.test(line))) {
      feedbackLines.push("- Slop axis missing from Review feedback (checker miss)");
    }
  }
  for (const line of gateFailures) {
    if (!feedbackLines.includes(line)) {
      feedbackLines.push(line);
    }
  }
  const failResult = await checkerFailMove({
    job,
    linear,
    workpadBody,
    existingComment: existing,
    feedbackLines,
    pr,
    gh,
    linked,
  });
  logFactoryExitDone({
    role: "factory-checker",
    identifier,
    phase: "checker-exit",
    passed: false,
    nextStatus: failResult.nextStatus ?? IMPLEMENTING,
    reason: feedbackLines[0],
  });
  return failResult;
}
