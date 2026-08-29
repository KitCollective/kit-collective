/**
 * Role transition comments and description AC (KIT-114).
 * Pure functions at the worker lifecycle seam.
 */

export const AC_REWRITES_HEADING = "### Description AC rewrites";

/**
 * @param {string} identifier
 */
export function plannerClaimComment(identifier) {
  return `${identifier}: claimed — Backlog + ready-for-agent, unblocked, write-scope clear. Linear Agent left empty.`;
}

/**
 * Short "what was built" from the workpad Notes or first checked Plan item.
 *
 * @param {string | undefined} body
 * @returns {string}
 */
export function implementSummaryFromWorkpad(body) {
  if (typeof body !== "string") {
    return "";
  }
  const notes = body.match(/### Notes\n([\s\S]*?)(?=\n### |\s*$)/);
  if (notes) {
    for (const line of notes[1].split("\n")) {
      const bullet = line.match(/^-\s+(.+)$/);
      if (bullet && !/^\(none\)\s*$/i.test(bullet[1].trim())) {
        return bullet[1].trim();
      }
    }
  }
  const plan = body.match(/### Plan\n([\s\S]*?)(?=\n### |\s*$)/);
  if (plan) {
    for (const line of plan[1].split("\n")) {
      const checked = line.match(/^-\s*\[[xX]\]\s+(.+)$/);
      if (checked) {
        return checked[1].trim();
      }
    }
  }
  return "";
}

/**
 * @param {string} identifier
 * @param {{ prUrl: string, summary?: string }} input
 */
export function implementInReviewComment(identifier, { prUrl, summary }) {
  const built =
    typeof summary === "string" && summary.length > 0
      ? summary
      : "Pre-review gate passed — MERGEABLE, required checks green.";
  return `${identifier}: In Review — ${built}\n\nPR: ${prUrl}`;
}

export const IMPLEMENT_RETRY_CAP_MARKER = "implement retry cap";

/**
 * Durable human hold after in-slot implement retries are exhausted.
 * Linear Agent stays empty. No Cursor Cloud Agent.
 *
 * @param {string} identifier
 * @param {{ cap?: number }} [options]
 */
export function implementRetryCapComment(identifier, { cap = 3 } = {}) {
  return `${identifier}: implement retry cap — stayed Implementing after ${cap} in-slot retries. Nicklas must act. Linear Agent left empty. No Cursor Cloud Agent.`;
}

/**
 * @param {Array<{ body?: string }> | undefined} comments
 */
export function commentsHoldImplementRetryCap(comments) {
  if (!Array.isArray(comments)) {
    return false;
  }
  return comments.some(
    (comment) =>
      typeof comment?.body === "string" &&
      comment.body.toLowerCase().includes(IMPLEMENT_RETRY_CAP_MARKER),
  );
}

/**
 * @param {string} identifier
 */
export function checkerFailComment(identifier) {
  return `${identifier}: returned to Implementing — findings in workpad ### Review feedback.`;
}

/**
 * @param {string} identifier
 * @param {Array<{ text: string, rewriteReason?: string }>} verdicts
 */
export function checkerPassComment(identifier, verdicts) {
  const lines = (Array.isArray(verdicts) ? verdicts : []).map((verdict) => {
    const suffix =
      typeof verdict.rewriteReason === "string" && verdict.rewriteReason.length > 0
        ? ` (rewrote: ${verdict.rewriteReason})`
        : "";
    return `- ✓ ${verdict.text}${suffix}`;
  });
  return `${identifier}: checker pass\n\n${lines.join("\n")}`;
}

/**
 * @param {string} identifier
 */
export function autoMergeFlipComment(identifier) {
  return `${identifier}: Auto-merge → Merging — PR MERGEABLE, required checks green, loop cap clear.`;
}

/**
 * @param {string} identifier
 * @param {string} reason
 */
export function autoMergeRefuseComment(identifier, reason) {
  return `${identifier}: Auto-merge refused — ${reason}`;
}

/**
 * @param {string} identifier
 * @param {string} sha
 */
export function landSuccessComment(identifier, sha) {
  return `${identifier}: merged to development — ${sha}`;
}

/**
 * @param {string} identifier
 * @param {string} error
 */
export function landFailComment(identifier, error) {
  return `${identifier}: merge failed — returned to Implementing. ${error}`;
}

/**
 * @param {string | undefined} description
 * @returns {string}
 */
export function acceptanceCriteriaSection(description) {
  if (typeof description !== "string") {
    return "";
  }
  const match = description.match(/##\s*Acceptance criteria\n([\s\S]*?)(?=\n##\s|$)/i);
  return match ? match[1] : "";
}

/**
 * @param {string | undefined} description
 * @returns {Array<{ text: string, checked: boolean }>}
 */
export function parseAcceptanceCriteria(description) {
  const section = acceptanceCriteriaSection(description);
  const criteria = [];
  for (const line of section.split("\n")) {
    const match = line.match(/^-\s*\[([ xX])\]\s*(.+)$/);
    if (!match) {
      continue;
    }
    criteria.push({
      checked: match[1].toLowerCase() === "x",
      text: match[2].trim(),
    });
  }
  return criteria;
}

/**
 * @param {string | undefined} workpadBody
 * @returns {Array<{ from: string, to: string, reason: string }>}
 */
export function parseDescriptionAcRewrites(workpadBody) {
  if (typeof workpadBody !== "string" || !workpadBody.includes(AC_REWRITES_HEADING)) {
    return [];
  }
  const match = workpadBody.match(/### Description AC rewrites\n([\s\S]*?)(?=\n### |\s*$)/);
  if (!match) {
    return [];
  }
  const rewrites = [];
  for (const line of match[1].split("\n")) {
    const parsed = line.match(/^-\s*(.+?)\s*→\s*(.+?)\s*\|\s*(.+)$/);
    if (!parsed) {
      continue;
    }
    rewrites.push({
      from: parsed[1].trim(),
      to: parsed[2].trim(),
      reason: parsed[3].trim(),
    });
  }
  return rewrites;
}

/**
 * @param {string | undefined} description
 * @param {{ rewrites?: Array<{ from: string, to: string }> }} [input]
 */
/**
 * Rewrite one Acceptance criterion line in the AC section only.
 *
 * @param {string} description
 * @param {string} from
 * @param {string} to
 */
function rewriteAcceptanceCriterionLine(description, from, to) {
  const section = acceptanceCriteriaSection(description);
  if (!section || typeof from !== "string" || typeof to !== "string") {
    return description;
  }
  const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const nextSection = section.replace(
    new RegExp(`^(- \\[[ xX]\\] )${escaped}\\s*$`, "gm"),
    `$1${to}`,
  );
  if (nextSection === section) {
    return description;
  }
  return description.replace(
    /##\s*Acceptance criteria\n[\s\S]*?(?=\n##\s|$)/i,
    `## Acceptance criteria\n\n${nextSection.trim()}\n`,
  );
}

/**
 * @param {string | undefined} description
 * @param {{ rewrites?: Array<{ from: string, to: string }> }} [input]
 */
export function applyCheckerPassDescription(description, { rewrites = [] } = {}) {
  let next = typeof description === "string" ? description : "";
  for (const rewrite of rewrites) {
    next = rewriteAcceptanceCriterionLine(next, rewrite.from, rewrite.to);
  }
  const section = acceptanceCriteriaSection(next);
  if (!section) {
    return next;
  }
  const ticked = section.replace(/^- \[ \]/gm, "- [x]");
  return next.replace(
    /##\s*Acceptance criteria\n[\s\S]*?(?=\n##\s|$)/i,
    `## Acceptance criteria\n\n${ticked.trim()}\n`,
  );
}

/**
 * @param {string | undefined} description
 * @param {{ rewrites?: Array<{ from: string, to: string, reason?: string }> }} [input]
 */
export function buildCheckerPassVerdicts(description, { rewrites = [] } = {}) {
  const updated = applyCheckerPassDescription(description, { rewrites });
  return parseAcceptanceCriteria(updated).map((criterion) => {
    const rewrite = rewrites.find((row) => row.to === criterion.text);
    return {
      text: criterion.text,
      ...(typeof rewrite?.reason === "string" && rewrite.reason.length > 0
        ? { rewriteReason: rewrite.reason }
        : {}),
    };
  });
}

/**
 * @param {string | undefined} description
 */
export function descriptionAcceptanceCriteriaTicked(description) {
  const criteria = parseAcceptanceCriteria(description);
  return criteria.length > 0 && criteria.every((row) => row.checked);
}
