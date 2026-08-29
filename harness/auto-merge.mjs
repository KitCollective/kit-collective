/**
 * Auto-merge job (KIT-90).
 *
 * Wakes on Ready for merge. Flips to Merging when the PR is MERGEABLE,
 * required checks are green, and workpad `### Loop counters` are under the
 * cap. Never merges. Never force-pushes. Fake Linear + `gh` at this seam.
 */

import { logFactoryExitDone, logFactoryExitStart } from "./factory-exit-log.mjs";
import { resolveLinkedPullRequest } from "./land.mjs";
import { WORKPAD_HEADING } from "./linear-cli.mjs";
import { autoMergeFlipComment, autoMergeRefuseComment } from "./role-comments.mjs";

export const LOOP_COUNTERS_HEADING = "### Loop counters";
export const LOOP_CAP = 5;
export const READY_FOR_MERGE = "Ready for merge";
export const MERGING = "Merging";
export const REVIEW_FEEDBACK_HEADING = "### Review feedback";

const GREEN_CONCLUSIONS = new Set([
  "success",
  "skipped",
  "neutral",
  "pass",
  "SUCCESS",
  "SKIPPED",
  "NEUTRAL",
  "PASS",
]);

/**
 * Read `ciFailCycles` / `reviewLoops` from the workpad `### Loop counters`
 * section. Missing heading or missing values fail closed (`null`).
 * Does not read a synthetic Linear field.
 *
 * @param {string | undefined} body
 * @returns {{ ciFailCycles: number, reviewLoops: number } | null}
 */
export function parseLoopCounters(body) {
  if (typeof body !== "string" || !body.includes(LOOP_COUNTERS_HEADING)) {
    return null;
  }
  const match = body.match(/### Loop counters\n([\s\S]*?)(?=\n### |\s*$)/);
  if (!match) {
    return null;
  }
  const section = match[1];
  const ci = section.match(/ciFailCycles:\s*(\d+)/);
  const review = section.match(/reviewLoops:\s*(\d+)/);
  if (!ci || !review) {
    return null;
  }
  return {
    ciFailCycles: Number(ci[1]),
    reviewLoops: Number(review[1]),
  };
}

/**
 * @param {string | undefined} current
 * @param {{ ciFailCycles: number, reviewLoops: number }} counters
 */
export function applyLoopCounters(current, { ciFailCycles, reviewLoops }) {
  const base =
    typeof current === "string" && current.includes(WORKPAD_HEADING)
      ? current.trimEnd()
      : WORKPAD_HEADING;
  const content = `- ciFailCycles: ${ciFailCycles}\n- reviewLoops: ${reviewLoops}\n`;
  if (base.includes(LOOP_COUNTERS_HEADING)) {
    return `${base.replace(/### Loop counters\n[\s\S]*?(?=\n### |\s*$)/, `${LOOP_COUNTERS_HEADING}\n\n${content}`)}\n`;
  }
  if (base.includes(REVIEW_FEEDBACK_HEADING)) {
    return `${base.replace(REVIEW_FEEDBACK_HEADING, `${LOOP_COUNTERS_HEADING}\n\n${content}\n${REVIEW_FEEDBACK_HEADING}`)}\n`;
  }
  return `${base}\n\n${LOOP_COUNTERS_HEADING}\n\n${content}\n`;
}

/**
 * @param {string | undefined} body
 */
export function ensureLoopCounters(body) {
  const current = parseLoopCounters(body);
  if (current) {
    return body ?? `${WORKPAD_HEADING}\n`;
  }
  return applyLoopCounters(body, { ciFailCycles: 0, reviewLoops: 0 });
}

/**
 * @param {string | undefined} body
 */
export function incrementCiFailCycles(body) {
  const current = parseLoopCounters(body) ?? { ciFailCycles: 0, reviewLoops: 0 };
  return applyLoopCounters(body, {
    ciFailCycles: current.ciFailCycles + 1,
    reviewLoops: current.reviewLoops,
  });
}

/**
 * @param {string | undefined} body
 */
export function incrementReviewLoops(body) {
  const current = parseLoopCounters(body) ?? { ciFailCycles: 0, reviewLoops: 0 };
  return applyLoopCounters(body, {
    ciFailCycles: current.ciFailCycles,
    reviewLoops: current.reviewLoops + 1,
  });
}

/**
 * @param {string | undefined} current
 * @param {string} line
 */
export function applyAutoMergeNote(current, line) {
  const base =
    typeof current === "string" && current.includes(WORKPAD_HEADING)
      ? current.trimEnd()
      : WORKPAD_HEADING;
  if (base.includes(REVIEW_FEEDBACK_HEADING)) {
    return `${base.replace(/### Review feedback\n[\s\S]*?(?=\n### |\s*$)/, `${REVIEW_FEEDBACK_HEADING}\n\n${line}\n`)}\n`;
  }
  return `${base}\n\n${REVIEW_FEEDBACK_HEADING}\n\n${line}\n`;
}

/**
 * @param {object | null | undefined} pr
 */
function requiredChecksAreGreen(pr) {
  const checks = pr?.requiredChecks ?? pr?.checks;
  if (!Array.isArray(checks) || checks.length === 0) {
    return false;
  }
  return checks.every((check) => GREEN_CONCLUSIONS.has(check?.conclusion ?? check?.state ?? ""));
}

/**
 * @param {{
 *   job: { issueId: string, identifier?: string },
 *   linear: {
 *     getIssue: (id: string) => Promise<object | null>,
 *     listComments?: (issueId: string) => Promise<Array<{ id: string, body?: string }>>,
 *     updateWorkpad: (input: { issueId: string, body: string, commentId?: string }) => Promise<unknown>,
 *     setStatus: (input: { issueId: string, status: string }) => Promise<unknown>,
 *     clearDelegate?: (input: { issueId: string }) => Promise<unknown>,
 *     commentIssue?: (input: { issueId: string, body: string }) => Promise<unknown>,
 *   },
 *   gh: {
 *     viewPr: (input: { number: number, repo?: string }) => Promise<object | null>,
 *     merge?: (input?: object) => unknown,
 *   },
 *   env?: NodeJS.ProcessEnv | Record<string, string | undefined>,
 * }} input
 */
export async function completeAutoMerge({ job, linear, gh, env: _env }) {
  const issue = await linear.getIssue(job.issueId);
  if (!issue || issue.status !== READY_FOR_MERGE) {
    return {
      skipped: true,
      flipped: false,
      nextStatus: issue?.status,
      reason: "auto-merge wakes only from Ready for merge",
    };
  }

  const comments =
    typeof linear.listComments === "function" ? await linear.listComments(job.issueId) : [];
  const existing = comments.find((comment) => comment.body?.includes(WORKPAD_HEADING));
  const workpadBody = existing?.body ?? "";

  /**
   * @param {string} reason
   */
  async function block(reason) {
    const body = applyAutoMergeNote(workpadBody, `- Auto-merge blocked: ${reason}`);
    await linear.updateWorkpad({
      issueId: job.issueId,
      body,
      commentId: existing?.id,
    });
    if (typeof linear.clearDelegate === "function") {
      await linear.clearDelegate({ issueId: job.issueId });
    }
    const identifier =
      typeof job.identifier === "string" && job.identifier.length > 0
        ? job.identifier
        : issue.identifier;
    if (typeof linear.commentIssue === "function") {
      await linear.commentIssue({
        issueId: job.issueId,
        body: autoMergeRefuseComment(identifier, reason),
      });
    }
    return {
      flipped: false,
      nextStatus: READY_FOR_MERGE,
      reason,
    };
  }

  const counters = parseLoopCounters(workpadBody);
  if (!counters) {
    return block("missing ### Loop counters.");
  }
  if (counters.ciFailCycles >= LOOP_CAP) {
    return block(
      `loop cap (ciFailCycles=${counters.ciFailCycles}). Nicklas can still move Merging.`,
    );
  }
  if (counters.reviewLoops >= LOOP_CAP) {
    return block(`loop cap (reviewLoops=${counters.reviewLoops}). Nicklas can still move Merging.`);
  }

  const identifier =
    typeof job.identifier === "string" && job.identifier.length > 0
      ? job.identifier
      : issue.identifier;

  const linkedResolution = await resolveLinkedPullRequest({
    attachments: issue.attachments,
    identifier,
    gh,
  });
  const linked = linkedResolution?.linked ?? null;
  if (!linked) {
    return block("linked GitHub PR is required.");
  }
  logFactoryExitStart({
    role: "auto-merge",
    identifier,
    phase: "auto-merge",
    linked,
    skipped: linkedResolution?.skipped ?? [],
  });

  const pr = await gh.viewPr({ number: linked.number, repo: linked.repo });
  if (pr?.mergeable === "CONFLICTING") {
    return block("PR is CONFLICTING.");
  }
  if (pr?.mergeable !== "MERGEABLE") {
    return block(`PR is not MERGEABLE (${pr?.mergeable ?? "unknown"}).`);
  }
  if (!requiredChecksAreGreen(pr)) {
    return block("required GitHub checks are not green.");
  }

  await linear.setStatus({ issueId: job.issueId, status: MERGING });
  if (typeof linear.commentIssue === "function") {
    await linear.commentIssue({
      issueId: job.issueId,
      body: autoMergeFlipComment(identifier),
    });
  }
  logFactoryExitDone({
    role: "auto-merge",
    identifier,
    phase: "auto-merge",
    passed: true,
    nextStatus: MERGING,
  });
  return { flipped: true, nextStatus: MERGING, pr };
}
