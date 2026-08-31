/**
 * Composition fail-close gate (P2.1).
 * After Scout, workpad ### Composition must list mirror paths, Skip Draft, and
 * lockfile-need when package.json is in scope — before Draft runs.
 */

import { extractIssuePaths } from "./first-pass.mjs";

/**
 * @param {string | undefined} workpadBody
 * @returns {string}
 */
export function compositionSectionText(workpadBody) {
  const text = typeof workpadBody === "string" ? workpadBody : "";
  const match = text.match(/###\s*Composition\b([\s\S]*?)(?=\n###\s|\n##\s|$)/i);
  return match ? String(match[1] ?? "").trim() : "";
}

/**
 * Parse Skip Draft yes/no from Composition prose.
 *
 * @param {string} section
 * @returns {boolean | null}
 */
export function parseSkipDraftDecision(section) {
  const text = String(section ?? "");
  const yes = /skip\s*draft\s*[:：]?\s*(yes|true|y)\b/i.test(text);
  const no = /skip\s*draft\s*[:：]?\s*(no|false|n)\b/i.test(text);
  if (yes && !no) {
    return true;
  }
  if (no && !yes) {
    return false;
  }
  return null;
}

/**
 * Parse lockfile-need note when package.json is mentioned.
 *
 * @param {string} section
 * @returns {boolean | null} null when package.json not mentioned; true/false when noted; null if mentioned but not noted
 */
export function parseLockfileNeed(section) {
  const text = String(section ?? "");
  const mentionsPackageJson = /(?:^|[\s`"'(/])package\.json\b/i.test(text);
  if (!mentionsPackageJson) {
    return null;
  }
  const yes = /lockfile[- ]?need\s*[:：]?\s*(yes|true|y|required|needed)\b/i.test(text);
  const no = /lockfile[- ]?need\s*[:：]?\s*(no|false|n|none|unneeded)\b/i.test(text);
  if (yes && !no) {
    return true;
  }
  if (no && !yes) {
    return false;
  }
  // package.json present but no explicit lockfile-need line
  return null;
}

/**
 * @param {string | undefined} workpadBody
 * @returns {{
 *   paths: string[],
 *   skipDraft: boolean | null,
 *   lockfileNeed: boolean | null,
 *   hasSection: boolean,
 *   packageJsonMentioned: boolean,
 * }}
 */
export function parseCompositionSection(workpadBody) {
  const section = compositionSectionText(workpadBody);
  const hasSection = section.length > 0 || /###\s*Composition\b/i.test(String(workpadBody ?? ""));
  const paths = extractIssuePaths(section);
  // Also accept bare repo-relative path bullets (write-scope mirrors) without apps/ prefix.
  const bulletPaths = section
    .split("\n")
    .map((line) => line.replace(/^\s*[-*]\s*/, "").trim())
    .map((line) => line.replace(/^`(.+)`$/, "$1").trim())
    .filter(
      (line) =>
        line.length > 0 &&
        !/^skip\s*draft\b/i.test(line) &&
        !/^lockfile[- ]?need\b/i.test(line) &&
        /^[A-Za-z0-9_./@+-]+\.[A-Za-z0-9]+$/.test(line),
    );
  const merged = [...new Set([...paths, ...bulletPaths])].sort();
  const packageJsonMentioned = /(?:^|[\s`"'(/])package\.json\b/i.test(section);
  return {
    paths: merged,
    skipDraft: hasSection ? parseSkipDraftDecision(section) : null,
    lockfileNeed: hasSection ? parseLockfileNeed(section) : null,
    hasSection,
    packageJsonMentioned,
  };
}

/**
 * Fail-close before Draft.
 *
 * @param {{
 *   workpadBody?: string,
 *   skipDraftAllowed?: boolean,
 * }} input
 * @returns {{ ok: boolean, feedback: string[], parsed: ReturnType<typeof parseCompositionSection> }}
 */
export function evaluateCompositionGate({ workpadBody, skipDraftAllowed = false } = {}) {
  const parsed = parseCompositionSection(workpadBody);
  /** @type {string[]} */
  const feedback = [];

  if (!parsed.hasSection) {
    feedback.push("- Composition: missing ### Composition section (fail-close before Draft)");
    return { ok: false, feedback, parsed };
  }
  if (parsed.paths.length === 0) {
    feedback.push("- Composition: list at least one repo-relative path to mirror before Draft");
  }
  if (parsed.skipDraft === null && skipDraftAllowed !== true) {
    feedback.push(
      "- Composition: state Skip Draft yes/no explicitly (or auth/IAP/Vision Skip Draft allowlist)",
    );
  }
  if (parsed.packageJsonMentioned && parsed.lockfileNeed === null) {
    feedback.push(
      "- Composition: package.json listed — note Lockfile need: yes/no (pnpm-lock.yaml companion)",
    );
  }

  return {
    ok: feedback.length === 0,
    feedback,
    parsed,
  };
}
