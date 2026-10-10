/**
 * Classify a fix diff (ADR-0050). A review finding that is only text or a name is verified
 * against the fix diff, not by a new full review. This is the guard against mis-tagging: the
 * diff must really be docs, comments, or one consistent rename.
 */

const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*|#|<!--|-->)/;
const TOKEN = /[A-Za-z_$][\w$]*|\d+|[^\sA-Za-z_$\d]/g;

/**
 * @param {string} diffText unified diff, `-U0` preferred
 * @returns {Map<string, { removed: string[], added: string[] }>}
 */
function perFile(diffText) {
  /** @type {Map<string, { removed: string[], added: string[] }>} */
  const files = new Map();
  let current = "";
  for (const raw of String(diffText).split("\n")) {
    if (raw.startsWith("+++ ")) {
      current = raw.slice(4).replace(/^b\//, "");
      files.set(current, files.get(current) ?? { removed: [], added: [] });
    } else if (current && !raw.startsWith("--- ")) {
      if (raw.startsWith("-")) {
        files.get(current)?.removed.push(raw.slice(1));
      } else if (raw.startsWith("+")) {
        files.get(current)?.added.push(raw.slice(1));
      }
    }
  }
  return files;
}

/**
 * @param {string} diffText
 * @returns {{ kind: "light" | "full", reason: string }}
 */
export function classifyFixDiff(diffText) {
  const files = perFile(diffText);
  if (files.size === 0) {
    return { kind: "full", reason: "empty diff" };
  }
  /** @type {Map<string, string>} */
  const renames = new Map();
  for (const [file, { removed, added }] of files) {
    if (/\.mdx?$/.test(file)) {
      continue;
    }
    if (
      /(?:^|\/)(?:tests?|__tests__)\/|\.(?:test|spec)\./.test(file) &&
      removed.length > added.length
    ) {
      return { kind: "full", reason: `${file}: a test lost lines` };
    }
    const code = (lines) => lines.filter((line) => line.trim() !== "" && !COMMENT_LINE.test(line));
    const removedCode = code(removed);
    const addedCode = code(added);
    if (removedCode.length !== addedCode.length) {
      return { kind: "full", reason: `${file}: code lines added or removed` };
    }
    for (let i = 0; i < removedCode.length; i += 1) {
      const before = removedCode[i].match(TOKEN) ?? [];
      const after = addedCode[i].match(TOKEN) ?? [];
      if (before.length !== after.length) {
        return { kind: "full", reason: `${file}: a code line changed shape` };
      }
      for (let t = 0; t < before.length; t += 1) {
        if (before[t] === after[t]) {
          continue;
        }
        if (!/^[A-Za-z_$][\w$]*$/.test(before[t]) || !/^[A-Za-z_$][\w$]*$/.test(after[t])) {
          return { kind: "full", reason: `${file}: a non-name token changed` };
        }
        if (renames.has(before[t]) && renames.get(before[t]) !== after[t]) {
          return { kind: "full", reason: `${before[t]} renamed two ways` };
        }
        renames.set(before[t], after[t]);
      }
    }
  }
  const renamed = [...renames].map(([from, to]) => `${from} -> ${to}`).join(", ");
  return { kind: "light", reason: renamed ? `rename only: ${renamed}` : "docs and comments only" };
}
