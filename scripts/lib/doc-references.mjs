/**
 * Pure helpers for the doc-reference check (ADR-0050). A review kept finding docs that
 * still named a flow, step, prop or file the diff had renamed or removed (KIT-272 reviews 2
 * and 3, KIT-267 review 5). These helpers find both halves mechanically.
 */

const DECLARATION =
  /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|const|let|var|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/;
const PROPERTY_KEY = /^(?:readonly\s+)?([A-Za-z_$][\w$]*)\??\s*:/;
const STEP_NAME = /(?<![A-Za-z0-9])\d{2}-[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?![A-Za-z0-9-])/g;

/** Tracked file kinds whose removed lines can declare a name. */
const CODE_OR_FLOW = /\.(?:tsx?|jsx?|mjs|cjs|mts|cts|ya?ml)$/;

/**
 * A short or generic name (`id`, `value`) would match every doc. Only distinctive names count:
 * eight or more characters with an inner capital, or a `NN-step-name`.
 *
 * @param {string} name
 */
export function isDistinctive(name) {
  if (/^\d{2}-[a-z]/.test(name)) {
    return true;
  }
  return name.length >= 8 && /[a-z][A-Z]/.test(name);
}

/**
 * Names that a diff removed from code or flow files: declarations, property keys, Device-flow
 * step names. Only `-` lines of files the diff touched are read.
 *
 * @param {string} diffText unified diff (any context size)
 * @returns {string[]}
 */
export function removedNames(diffText) {
  /** @type {Set<string>} */
  const names = new Set();
  let currentFile = "";
  for (const raw of String(diffText).split("\n")) {
    if (raw.startsWith("+++ ")) {
      currentFile = raw.slice(4).replace(/^b\//, "");
      continue;
    }
    if (raw.startsWith("--- ") || !raw.startsWith("-") || !CODE_OR_FLOW.test(currentFile)) {
      continue;
    }
    const line = raw.slice(1).trim();
    const declared = line.match(DECLARATION) ?? line.match(PROPERTY_KEY);
    if (declared && isDistinctive(declared[1])) {
      names.add(declared[1]);
    }
    for (const step of line.match(STEP_NAME) ?? []) {
      names.add(step);
    }
  }
  return [...names];
}

/**
 * Backticked repo paths on added lines of changed docs: `dir/file.ext`. Globs, placeholders,
 * URLs and ellipses are skipped.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function backtickedPaths(text) {
  const out = [];
  for (const match of String(text).matchAll(/`([^`\s]+\/[^`\s/.][^`\s/]*\.[A-Za-z0-9]+)`/g)) {
    const token = match[1];
    if (/[*<>${}()|]|\.\.\.|:\/\/|^\.\.?\//.test(token) || token.includes("node_modules")) {
      continue;
    }
    out.push(token.replace(/^\/+/, ""));
  }
  return out;
}

/**
 * Added lines per markdown file from a unified diff.
 *
 * @param {string} diffText
 * @returns {{ file: string, text: string }[]}
 */
export function addedMarkdownLines(diffText) {
  /** @type {Map<string, string[]>} */
  const byFile = new Map();
  let currentFile = "";
  for (const raw of String(diffText).split("\n")) {
    if (raw.startsWith("+++ ")) {
      currentFile = raw.slice(4).replace(/^b\//, "");
      continue;
    }
    if (!raw.startsWith("+") || !/\.mdx?$/.test(currentFile)) {
      continue;
    }
    const list = byFile.get(currentFile) ?? [];
    list.push(raw.slice(1));
    byFile.set(currentFile, list);
  }
  return [...byFile].map(([file, lines]) => ({ file, text: lines.join("\n") }));
}

/**
 * @param {string} path a backticked path
 * @param {string[]} trackedFiles `git ls-files`
 * @returns {boolean} true when the path is a tracked file or the tail of one
 */
export function pathExists(path, trackedFiles) {
  const tail = `/${path}`;
  return trackedFiles.some((file) => file === path || file.endsWith(tail));
}

/** Docs that describe the present. ADRs and frozen specs record history and are not read. */
export function isLivingDoc(file) {
  if (!/\.mdx?$/.test(file)) {
    return false;
  }
  return !(
    file.startsWith("docs/adr/") ||
    file.startsWith(".scratch/") ||
    file.startsWith("research_notes/") ||
    file.startsWith("reports/") ||
    file === "docs/agents/pi-harness-archived.md"
  );
}
