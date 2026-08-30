/**
 * First-pass pack — dynamic slice brief + ratchet registry.
 *
 * Product taste does not live here. Ticket text yields paths and "Do not" lines.
 * Recurring checker classes land in `.pi/first-pass-classes.json` (tighten only)
 * after the same class fails twice — same contract as docs/agents/error-ratcheting.md.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const FIRST_PASS_CLASSES_REL = ".pi/first-pass-classes.json";

/**
 * @typedef {{
 *   id: string,
 *   feedbackTag: string,
 *   scan?: { glob?: string, regex: string, flags?: string, message: string },
 * }} FirstPassClass
 */

/**
 * @typedef {{ classes: FirstPassClass[] }} FirstPassRegistry
 */

/**
 * @param {string} workspace
 * @param {{ readFile?: (path: string) => string, exists?: (path: string) => boolean }} [deps]
 * @returns {FirstPassRegistry}
 */
export function loadFirstPassRegistry(workspace, deps = {}) {
  const exists = deps.exists ?? existsSync;
  const read = deps.readFile ?? ((path) => readFileSync(path, "utf8"));
  const path = join(workspace, FIRST_PASS_CLASSES_REL);
  if (!exists(path)) {
    return { classes: [] };
  }
  try {
    const raw = JSON.parse(read(path));
    const classes = Array.isArray(raw?.classes) ? raw.classes : [];
    return {
      classes: classes.filter(
        (entry) =>
          entry &&
          typeof entry.id === "string" &&
          entry.id.length > 0 &&
          typeof entry.feedbackTag === "string" &&
          entry.feedbackTag.length > 0,
      ),
    };
  } catch {
    return { classes: [] };
  }
}

/**
 * Repo-relative paths already named in the issue / feedback (dynamic composition).
 *
 * @param {string} text
 * @returns {string[]}
 */
export function extractIssuePaths(text = "") {
  const source = String(text);
  /** @type {Set<string>} */
  const paths = new Set();
  const pattern =
    /(?:^|[\s`"'(])((?:apps|packages|seed|harness|scripts|docs|\.cursor|\.pi)\/[A-Za-z0-9_./@+-]+\.[A-Za-z0-9]+)/gm;
  let match = pattern.exec(source);
  while (match) {
    paths.add(match[1].replace(/[),.;]+$/, ""));
    match = pattern.exec(source);
  }
  return [...paths].sort();
}

/**
 * Explicit "Do not …" constraints from the issue body (dynamic, not harness taste).
 *
 * @param {string} text
 * @returns {string[]}
 */
export function extractIssueConstraints(text = "") {
  const lines = String(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  /** @type {string[]} */
  const out = [];
  for (const line of lines) {
    const bullet = line.replace(/^[-*]\s+/, "").replace(/^\*\*?Do not\*\*?\s*/i, "Do not ");
    if (/^Do not\b/i.test(bullet)) {
      out.push(bullet.replace(/\s+/g, " ").trim());
    }
  }
  return [...new Set(out)];
}

/**
 * Paths Scout / parent listed under workpad `### Composition` (dynamic, not product hardcodes).
 *
 * @param {string} workpad
 * @returns {string[]}
 */
export function extractWorkpadCompositionPaths(workpad = "") {
  const text = String(workpad);
  const match = text.match(/###\s*Composition\b([\s\S]*?)(?=\n###\s|\n##\s|$)/i);
  if (!match) {
    return [];
  }
  return extractIssuePaths(match[1] ?? "");
}

/**
 * Prior Spec/Standards/Slop bullets from the same issue — inject so resume fixes the class.
 *
 * @param {string} feedback
 * @returns {string[]}
 */
export function extractPriorFailLines(feedback = "") {
  return String(feedback)
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) =>
        /^-/.test(line) &&
        !/\(none\)/i.test(line) &&
        !/^-\s*First-pass\b/i.test(line),
    )
    .map((line) => line.replace(/^-\s*/, "").replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0 && line.length < 280)
    .slice(0, 12);
}

/**
 * @param {{ paths?: string[], constraints?: string[], priorFails?: string[] }} input
 */
export function formatSliceBrief({ paths = [], constraints = [], priorFails = [] } = {}) {
  if (paths.length === 0 && constraints.length === 0 && priorFails.length === 0) {
    return "";
  }
  const lines = [
    "## Slice brief (from the ticket)",
    "",
    "Derived from the issue / workpad — not a harness taste list. Prefer these paths; honor Do not lines.",
    "",
  ];
  if (paths.length > 0) {
    lines.push("Read before inventing:");
    for (const rel of paths) {
      lines.push(`- \`${rel}\``);
    }
    lines.push("");
  }
  if (constraints.length > 0) {
    lines.push("Hard constraints:");
    for (const line of constraints) {
      lines.push(`- ${line}`);
    }
    lines.push("");
  }
  if (priorFails.length > 0) {
    lines.push(
      "Prior checker findings on this issue (fix the class, not only the cited file):",
    );
    for (const line of priorFails) {
      lines.push(`- ${line}`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

/**
 * @deprecated Use extractIssuePaths + extractIssueConstraints. Kept empty so callers stay safe.
 * @returns {[]}
 */
export function selectCompositionHints() {
  return [];
}

/**
 * @deprecated
 */
export function formatCompositionHints() {
  return "";
}

/**
 * @param {string} rel
 * @param {string} glob
 */
export function pathMatchesGlob(rel, glob) {
  if (typeof rel !== "string" || typeof glob !== "string" || glob.length === 0) {
    return true;
  }
  if (glob.endsWith("/**")) {
    return rel.startsWith(glob.slice(0, -2));
  }
  if (glob.includes("**")) {
    const [prefix, suffix] = glob.split("**");
    return (
      rel.startsWith(prefix ?? "") &&
      (typeof suffix !== "string" || suffix.length === 0 || rel.endsWith(suffix.replace(/^\//, "")))
    );
  }
  if (glob.includes("*")) {
    const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*");
    return new RegExp(`^${escaped}$`).test(rel);
  }
  return rel === glob || rel.startsWith(`${glob}/`);
}

/**
 * Run only registry-backed scanners (ratchet JSON). No product regexes in code.
 *
 * @param {string} rel
 * @param {string} source
 * @param {FirstPassClass[]} classes
 * @returns {string[]}
 */
export function scanFirstPassFile(rel, source, classes = []) {
  if (typeof rel !== "string" || typeof source !== "string") {
    return [];
  }
  if (!/\.(tsx|ts|jsx|js|mjs|cjs)$/.test(rel)) {
    return [];
  }
  /** @type {string[]} */
  const violations = [];
  for (const entry of classes) {
    const scan = entry.scan;
    if (!scan || typeof scan.regex !== "string" || scan.regex.length === 0) {
      continue;
    }
    if (typeof scan.glob === "string" && scan.glob.length > 0 && !pathMatchesGlob(rel, scan.glob)) {
      continue;
    }
    let pattern;
    try {
      pattern = new RegExp(scan.regex, typeof scan.flags === "string" ? scan.flags : "m");
    } catch {
      continue;
    }
    if (pattern.test(source)) {
      const message =
        typeof scan.message === "string" && scan.message.length > 0
          ? scan.message
          : `${entry.feedbackTag} matched`;
      violations.push(`${rel}: [${entry.feedbackTag}] ${message}`);
    }
  }
  return violations;
}

/**
 * @param {{
 *   cwd: string,
 *   files?: string[],
 *   readFile?: (path: string) => string,
 *   registry?: FirstPassRegistry,
 *   workspace?: string,
 * }} input
 * @returns {string[]}
 */
export function collectFirstPassViolations({
  cwd,
  files = [],
  readFile,
  registry,
  workspace,
} = { cwd: "" }) {
  const classes =
    registry?.classes ??
    loadFirstPassRegistry(typeof workspace === "string" && workspace.length > 0 ? workspace : cwd)
      .classes;
  if (classes.length === 0) {
    return [];
  }
  const read = readFile ?? ((rel) => readFileSync(join(cwd, rel), "utf8"));
  /** @type {string[]} */
  const violations = [];
  for (const rel of files) {
    if (typeof rel !== "string" || rel.length === 0) {
      continue;
    }
    try {
      violations.push(...scanFirstPassFile(rel, read(rel), classes));
    } catch {
      // missing path is not a first-pass finding
    }
  }
  return violations;
}

/**
 * @param {string[]} violations
 * @returns {string[]}
 */
export function formatFirstPassFeedback(violations = []) {
  if (!Array.isArray(violations) || violations.length === 0) {
    return [];
  }
  const lines = [
    "- First-pass: registry class matched — fix before In Review (cheap retry, not Grok).",
  ];
  for (const violation of violations) {
    lines.push(`  ${violation}`);
  }
  return lines;
}

/**
 * Checker-fail is Spec-only when Spec has a real finding and Standards/Slop are
 * clean or absent — slim resume (no Scout/helpers / no full factory dump).
 *
 * @param {string | undefined} feedback
 */
export function reviewFeedbackIsSpecOnly(feedback) {
  const text = typeof feedback === "string" ? feedback.trim() : "";
  if (text.length === 0) {
    return false;
  }
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^-/.test(line));
  if (lines.length === 0) {
    return false;
  }
  const hasSpecFinding = lines.some(
    (line) => /^-\s*Spec:/i.test(line) && !/^-\s*Spec:\s*\(none\)\s*$/i.test(line),
  );
  if (!hasSpecFinding) {
    return false;
  }
  const hasStandardsFinding = lines.some(
    (line) => /^-\s*Standards:/i.test(line) && !/^-\s*Standards:\s*\(none\)\s*$/i.test(line),
  );
  const hasSlopFinding = lines.some(
    (line) =>
      /^-\s*Slop\//i.test(line) ||
      (/^-\s*Slop:/i.test(line) && !/^-\s*Slop:\s*\(none\)\s*$/i.test(line)),
  );
  return !hasStandardsFinding && !hasSlopFinding;
}

/**
 * Checker-fail is first-pass-only when every finding is tagged for the registry
 * (`First-pass:` / `first-pass:<id>` / registered feedbackTag). Unknown Spec keeps full resume.
 *
 * @param {string | undefined} feedback
 * @param {FirstPassClass[]} [classes]
 */
export function reviewFeedbackIsFirstPassOnly(feedback, classes = []) {
  const text = typeof feedback === "string" ? feedback.trim() : "";
  if (text.length === 0) {
    return false;
  }
  const tags = new Set(
    classes.map((entry) => entry.feedbackTag.toLowerCase()).filter((tag) => tag.length > 0),
  );
  const findingLines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) =>
        /^-/.test(line) &&
        !/^-\s*(?:Spec|Standards|Slop|Tests):\s*\(none\)\s*$/i.test(line) &&
        !/^-\s*\(none\)\s*$/i.test(line),
    );
  if (findingLines.length === 0) {
    return false;
  }
  return findingLines.every((line) => {
    if (/^-\s*First-pass\b/i.test(line) || /\[first-pass:[a-z0-9_-]+\]/i.test(line)) {
      return true;
    }
    const lower = line.toLowerCase();
    for (const tag of tags) {
      if (lower.includes(tag)) {
        return true;
      }
    }
    return false;
  });
}

export const FIRST_PASS_CANDIDATES_HEADING = "### First-pass candidates";

/**
 * Registry summary for factory-checker append (tag contract).
 *
 * @param {FirstPassClass[]} classes
 */
export function formatRegistryForChecker(classes = []) {
  const lines = [
    "## First-pass registry",
    "",
    "When a Standards or Slop finding matches a registered class, prefix the workpad line with `[first-pass:<id>]` (keep Spec/Standards/Slop axis). Unknown classes stay untagged — full Scout+helpers resume.",
    "",
  ];
  if (!Array.isArray(classes) || classes.length === 0) {
    lines.push("(empty — no registered classes yet)");
    lines.push("");
    return `${lines.join("\n")}\n`;
  }
  for (const entry of classes) {
    lines.push(`- \`${entry.id}\` → tag \`${entry.feedbackTag}\``);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

/**
 * Fingerprint Standards/Slop findings for 2× ratchet (never Spec).
 *
 * @param {string} line
 * @returns {{ axis: string, fingerprint: string, id: string, feedbackTag: string } | null}
 */
export function fingerprintRatchetFinding(line = "") {
  const trimmed = String(line).trim();
  if (!/^-/.test(trimmed) || /\(none\)/i.test(trimmed) || /^-\s*First-pass\b/i.test(trimmed)) {
    return null;
  }
  const axisMatch = trimmed.match(/^-\s*(Standards|Slop\/?)\s*:?\s*(.*)$/i);
  if (!axisMatch) {
    return null;
  }
  const axis = /slop/i.test(axisMatch[1]) ? "slop" : "standards";
  let body = (axisMatch[2] ?? "").trim();
  body = body
    .replace(/\[first-pass:[a-z0-9_-]+\]/gi, "")
    .replace(/\b[\w./@-]+\.(?:tsx?|jsx?|mjs|cjs|mdc?|json)\b:\d+(?::\d+)?/gi, "")
    .replace(/\b(?:apps|packages|harness|scripts|docs|\.cursor|\.pi)\/[\w./@+-]+/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (body.length < 8) {
    return null;
  }
  const id = slugifyFirstPassId(body);
  return {
    axis,
    fingerprint: body.slice(0, 160),
    id,
    feedbackTag: `first-pass:${id}`,
  };
}

/**
 * @param {string} text
 */
export function slugifyFirstPassId(text = "") {
  const slug = String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return slug.length > 0 ? slug : "unnamed-class";
}

/**
 * @param {string} workpad
 * @returns {Map<string, { id: string, feedbackTag: string, count: number, fingerprint: string }>}
 */
export function parseFirstPassCandidates(workpad = "") {
  /** @type {Map<string, { id: string, feedbackTag: string, count: number, fingerprint: string }>} */
  const map = new Map();
  const match = String(workpad).match(
    /###\s*First-pass candidates\b([\s\S]*?)(?=\n###\s|\n##\s|$)/i,
  );
  if (!match) {
    return map;
  }
  for (const line of (match[1] ?? "").split("\n")) {
    const row = line.trim().match(
      /^-\s*`([^`]+)`\s+count=(\d+)\s+tag=`([^`]+)`\s+fingerprint=`([^`]*)`/i,
    );
    if (!row) {
      continue;
    }
    map.set(row[1], {
      id: row[1],
      count: Number(row[2]) || 0,
      feedbackTag: row[3],
      fingerprint: row[4] ?? "",
    });
  }
  return map;
}

/**
 * Bump Standards/Slop fingerprints; return workpad body + ratchet requirement lines (count ≥ 2).
 *
 * @param {string} workpad
 * @param {string[]} feedbackLines
 */
export function bumpFirstPassCandidates(workpad, feedbackLines = []) {
  const map = parseFirstPassCandidates(workpad);
  /** @type {string[]} */
  const ratchetLines = [];
  for (const line of feedbackLines) {
    const hit = fingerprintRatchetFinding(line);
    if (!hit) {
      continue;
    }
    const prev = map.get(hit.id);
    const count = (prev?.count ?? 0) + 1;
    map.set(hit.id, {
      id: hit.id,
      count,
      feedbackTag: hit.feedbackTag,
      fingerprint: hit.fingerprint,
    });
    if (count >= 2) {
      ratchetLines.push(
        `- Standards: [first-pass:${hit.id}] Land ratchet in \`.pi/first-pass-classes.json\` — \`{ "id": "${hit.id}", "feedbackTag": "${hit.feedbackTag}" }\` (optional scan). Same class failed ${count}×.`,
      );
    }
  }
  const sectionLines = [`${FIRST_PASS_CANDIDATES_HEADING}`, ""];
  for (const entry of [...map.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    sectionLines.push(
      `- \`${entry.id}\` count=${entry.count} tag=\`${entry.feedbackTag}\` fingerprint=\`${entry.fingerprint}\``,
    );
  }
  sectionLines.push("");
  const section = `${sectionLines.join("\n")}\n`;
  let next = String(workpad);
  if (/###\s*First-pass candidates\b/i.test(next)) {
    next = next.replace(
      /###\s*First-pass candidates\b[\s\S]*?(?=\n###\s|\n##\s|$)/i,
      section,
    );
  } else if (/###\s*Review feedback\b/i.test(next)) {
    next = next.replace(
      /(###\s*Review feedback\b)/i,
      `${section}$1`,
    );
  } else {
    next = `${next.trimEnd()}\n\n${section}`;
  }
  return { workpad: next, ratchetLines: [...new Set(ratchetLines)] };
}
