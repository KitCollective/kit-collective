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
export function applyCheckerPassDescription(description, { rewrites = [] } = {}) {
  let next = typeof description === "string" ? description : "";
  for (const rewrite of rewrites) {
    if (typeof rewrite.from === "string" && typeof rewrite.to === "string") {
      next = next.replace(rewrite.from, rewrite.to);
    }
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
    const rewrite = rewrites.find(
      (row) => row.to === criterion.text || (description ?? "").includes(row.from),
    );
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
