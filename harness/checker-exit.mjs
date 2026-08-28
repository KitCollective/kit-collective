/**
 * Factory checker exit (KIT-56).
 *
 * After the review Pi session: read workpad verdict + PR gates (MERGEABLE,
 * required GitHub checks). Pass → Ready for merge. Fail → Implementing with
 * complete ### Review feedback. Never merge. Fake `gh` + Linear at this seam.
 */
import { incrementReviewLoops, parseLoopCounters } from "./auto-merge.mjs";
import { IN_REVIEW, requiredChecksFailed, requiredChecksGreen } from "./implement-exit.mjs";
import { createLandGh, pullRequestFromAttachments } from "./land.mjs";
import { WORKPAD_HEADING } from "./linear-cli.mjs";
import {
  applyCheckerPassDescription,
  buildCheckerPassVerdicts,
  checkerFailComment,
  checkerPassComment,
  parseDescriptionAcRewrites,
} from "./role-comments.mjs";

export const READY_FOR_MERGE = "Ready for merge";
export const IMPLEMENTING = "Implementing";
export const REVIEW_FEEDBACK_HEADING = "### Review feedback";
export const NOTES_HEADING = "### Notes";
export const CHECKER_PASS_STATUS = "All good — checker pass. MERGEABLE, required checks green.";
export const RATCHET_NUDGE_TEXT =
  "next implement pass must land a ratchet per docs/agents/error-ratcheting.md";

/**
 * @returns {string}
 */
export function ratchetNudgeWorkpadLine() {
  return `- Ratchet: ${RATCHET_NUDGE_TEXT}`;
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
  if (base.includes(NOTES_HEADING)) {
    return `${base.replace(/### Notes\n([\s\S]*?)(?=\n### |\s*$)/, `${NOTES_HEADING}\n\n$1\n${line}\n`)}\n`;
  }
  if (base.includes(REVIEW_FEEDBACK_HEADING)) {
    return `${base.replace(REVIEW_FEEDBACK_HEADING, `${NOTES_HEADING}\n\n${line}\n\n${REVIEW_FEEDBACK_HEADING}`)}\n`;
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
  const match = body.match(/### Review feedback\n([\s\S]*?)(?=\n### |\s*$)/);
  return match ? match[1].trim() : "";
}

/**
 * @param {string | undefined} body
 * @returns {boolean}
 */
export function reviewFeedbackIsClean(body) {
  const section = reviewFeedbackSection(body);
  if (section.length === 0) {
    return false;
  }
  const lines = section
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return false;
  }
  return lines.length === 1 && /^-\s*\(none\)\s*$/i.test(lines[0]);
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
 * @param {string | undefined} current
 * @param {{ feedbackLines: string[] }} input
 */
/**
 * Durable pass note on the existing workpad. Keep Review feedback as `- (none)`
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
  if (next.includes(REVIEW_FEEDBACK_HEADING)) {
    next = next.replace(
      /### Review feedback\n[\s\S]*?(?=\n### |\s*$)/,
      `${REVIEW_FEEDBACK_HEADING}\n\n- (none)\n`,
    );
  } else {
    next = `${next}\n\n${REVIEW_FEEDBACK_HEADING}\n\n- (none)\n`;
  }
  return `${next.trimEnd()}\n`;
}

export function applyCheckerFailWorkpad(current, { feedbackLines }) {
  const base =
    typeof current === "string" && current.includes(WORKPAD_HEADING)
      ? current.trimEnd()
      : WORKPAD_HEADING;
  const lines = Array.isArray(feedbackLines) ? feedbackLines.filter(Boolean) : ["- (none)"];
  const content = lines.length > 0 ? lines.join("\n") : "- (none)";
  if (base.includes(REVIEW_FEEDBACK_HEADING)) {
    return `${base.replace(/### Review feedback\n[\s\S]*?(?=\n### |\s*$)/, `${REVIEW_FEEDBACK_HEADING}\n\n${content}\n`)}\n`;
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
export function createCheckerGh(deps = {}) {
  const land = createLandGh(deps);
  return {
    viewPr: land.viewPr.bind(land),
    merge() {
      throw new Error("checker never merges");
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
 * }} input
 */
async function checkerFailMove(input) {
  const { job, linear, feedbackLines, workpadBody = "", existingComment, pr = null } = input;
  const body = applyRatchetNudge(
    incrementReviewLoops(applyCheckerFailWorkpad(workpadBody, { feedbackLines })),
  );
  await linear.updateWorkpad({
    issueId: job.issueId,
    body,
    commentId: existingComment?.id,
  });
  const identifier =
    typeof job.identifier === "string" && job.identifier.length > 0 ? job.identifier : job.issueId;
  if (typeof linear.commentIssue === "function") {
    await linear.commentIssue({
      issueId: job.issueId,
      body: checkerFailComment(identifier),
    });
  }
  await linear.setStatus({ issueId: job.issueId, status: IMPLEMENTING });
  return {
    passed: false,
    nextStatus: IMPLEMENTING,
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

  const linked = pullRequestFromAttachments(issue.attachments);
  const comments =
    typeof linear.listComments === "function" ? await linear.listComments(job.issueId) : [];
  const existing = comments.find((comment) => comment.body?.includes(WORKPAD_HEADING));
  const workpadBody = existing?.body ?? "";

  if (!linked) {
    return checkerFailMove({
      job,
      linear,
      workpadBody,
      existingComment: existing,
      feedbackLines: ["- Linked GitHub PR is required for factory checker"],
    });
  }

  const deadline = now() + waitTimeoutMs;
  let pr = null;
  let timedOut = false;
  while (true) {
    pr = await gh.viewPr({ number: linked.number, repo: linked.repo });
    const checks = pr?.requiredChecks ?? pr?.checks;
    if (requiredChecksFailed(checks)) {
      break;
    }
    if (pr?.mergeable === "CONFLICTING") {
      break;
    }
    if (pr?.mergeable === "MERGEABLE" && requiredChecksGreen(checks)) {
      break;
    }
    if (now() >= deadline) {
      timedOut = true;
      break;
    }
    await sleep(waitIntervalMs);
  }

  const piFindings = reviewFeedbackHasFindings(workpadBody);
  const gateFailures = ghGateFailures(pr);
  if (timedOut) {
    gateFailures.push("- Required GitHub checks timed out before turning green");
  }
  const passed = !piFindings && gateFailures.length === 0;

  if (passed) {
    const identifier =
      typeof job.identifier === "string" && job.identifier.length > 0
        ? job.identifier
        : issue.identifier;
    const rewrites = parseDescriptionAcRewrites(workpadBody);
    const description =
      typeof issue.description === "string" ? issue.description : "";
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
    return { passed: true, nextStatus: READY_FOR_MERGE, pr };
  }

  const feedbackLines = [];
  if (piFindings) {
    const section = reviewFeedbackSection(workpadBody);
    if (section.length === 0) {
      feedbackLines.push("- Review feedback must include explicit `- (none)` on pass");
    } else {
      feedbackLines.push(
        ...section
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
      );
    }
  }
  for (const line of gateFailures) {
    if (!feedbackLines.includes(line)) {
      feedbackLines.push(line);
    }
  }
  return checkerFailMove({
    job,
    linear,
    workpadBody,
    existingComment: existing,
    feedbackLines,
    pr,
  });
}
