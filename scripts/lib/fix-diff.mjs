/**
 * Classify a fix diff (ADR-0050). A review finding that is only text or a name is verified
 * against the fix diff, not by a new full review. This is the guard against mis-tagging: the
 * diff must really be docs, comments, or one consistent rename.
 */

const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*|#|<!--|-->)/;
const QUOTE = /['"`]/;
/** Words that change behaviour when swapped: a "rename" to or from one is not a rename. */
const RESERVED = new Set(
  (
    "true false null undefined this super new delete typeof instanceof void in of if else for while do " +
    "switch case default break continue return throw try catch finally await async yield function class " +
    "const let var static public private protected readonly import export from as extends implements type interface"
  ).split(" "),
);
const TOKEN = /[A-Za-z_$][\w$]*|\d+|[^\sA-Za-z_$\d]/g;

/**
 * For each token of a line, whether it sits inside a quoted string.
 * @param {string[]} tokens
 */
function stringFlags(tokens) {
  let open = null;
  return tokens.map((token) => {
    if (open === null && QUOTE.test(token) && token.length === 1) {
      open = token;
      return true;
    }
    if (open !== null && token === open) {
      open = null;
      return true;
    }
    return open !== null;
  });
}

const TEST_FILE = /(?:^|\/)(?:tests?|__tests__)\/|\.(?:test|spec)\./;
/** `<indent>test|it|describe[.modifier](<quote>title<quote><rest>`: the title is the first quoted string. */
const TEST_CALL = /^(\s*(?:test|it|describe)(?:\.\w+)?\()(["'`])((?:\\.|(?!\2).)*)\2(.*)$/;

/**
 * True when two lines are the same `test(...)` / `it(...)` / `describe(...)` call and only the
 * title string differs (KIT-367). A template title with an interpolation is code, not text.
 * @param {string} before
 * @param {string} after
 */
function isTestTitleOnlyChange(before, after) {
  const a = TEST_CALL.exec(before);
  const b = TEST_CALL.exec(after);
  if (!a || !b) {
    return false;
  }
  const [, prefixA, quoteA, titleA, restA] = a;
  const [, prefixB, quoteB, titleB, restB] = b;
  return (
    prefixA === prefixB &&
    quoteA === quoteB &&
    restA === restB &&
    titleA !== titleB &&
    !titleA.includes("${") &&
    !titleB.includes("${")
  );
}

/**
 * @typedef {{ removed: string[], added: string[] }} Hunk
 * @typedef {{ removed: string[], added: string[], hunks: Hunk[] }} FileLines
 */

/**
 * Lines per file, and per hunk inside it (KIT-373). A line starting with `@@ ` opens a hunk;
 * lines before any header belong to one implicit hunk, so header-less input behaves as one hunk.
 * @param {string} diffText unified diff, `-U0` preferred
 * @returns {Map<string, FileLines>}
 */
function perFile(diffText) {
  /** @type {Map<string, FileLines>} */
  const files = new Map();
  let current = "";
  /** @type {Hunk | null} */
  let hunk = null;
  for (const raw of String(diffText).split("\n")) {
    if (raw.startsWith("+++ ")) {
      current = raw.slice(4).replace(/^b\//, "");
      files.set(current, files.get(current) ?? { removed: [], added: [], hunks: [] });
      hunk = null;
    } else if (current && !raw.startsWith("--- ")) {
      const file = files.get(current);
      if (!file) {
        continue;
      }
      if (raw.startsWith("@@ ")) {
        hunk = { removed: [], added: [] };
        file.hunks.push(hunk);
      } else if (raw.startsWith("-") || raw.startsWith("+")) {
        if (!hunk) {
          hunk = { removed: [], added: [] };
          file.hunks.push(hunk);
        }
        const side = raw.startsWith("-") ? "removed" : "added";
        file[side].push(raw.slice(1));
        hunk[side].push(raw.slice(1));
      }
    }
  }
  return files;
}

const code = (lines) => lines.filter((line) => line.trim() !== "" && !COMMENT_LINE.test(line));

/**
 * @param {string} diffText
 * @param {{ isStillUsed?: (name: string) => boolean }} [options] `isStillUsed` answers whether a
 *   renamed-away name still appears in the tree after the fix; a rename that left the old name
 *   behind swapped one thing for another and is not light.
 * @returns {{ kind: "light" | "full", reason: string }}
 */
export function classifyFixDiff(diffText, options = {}) {
  const files = perFile(diffText);
  if (files.size === 0) {
    return { kind: "full", reason: "empty diff" };
  }
  /** @type {Map<string, string>} */
  const renames = new Map();
  let titleChanged = false;
  for (const [file, { removed, added, hunks }] of files) {
    if (/\.mdx?$/.test(file)) {
      continue;
    }
    const isTestFile = TEST_FILE.test(file);
    if (isTestFile && removed.length > added.length) {
      return { kind: "full", reason: `${file}: a test lost lines` };
    }
    const removedCode = code(removed);
    const addedCode = code(added);
    if (removedCode.length !== addedCode.length) {
      return { kind: "full", reason: `${file}: code lines added or removed` };
    }
    // KIT-373: lines pair within a hunk only, and a line on both sides is a move, not an edit.
    for (const hunk of hunks) {
      if (code(hunk.removed).length !== code(hunk.added).length) {
        return { kind: "full", reason: `${file}: code lines moved, added or removed` };
      }
    }
    const addedTexts = new Set(addedCode.map((line) => line.trim()));
    if (removedCode.some((line) => addedTexts.has(line.trim()))) {
      return { kind: "full", reason: `${file}: a code line moved` };
    }
    const pairs = hunks.flatMap((hunk) => {
      const hunkRemoved = code(hunk.removed);
      const hunkAdded = code(hunk.added);
      return hunkRemoved.map((line, i) => [line, hunkAdded[i]]);
    });
    for (const [beforeLine, afterLine] of pairs) {
      if (isTestFile && isTestTitleOnlyChange(beforeLine, afterLine)) {
        titleChanged = true;
        continue;
      }
      const before = beforeLine.match(TOKEN) ?? [];
      const after = afterLine.match(TOKEN) ?? [];
      if (before.length !== after.length) {
        return { kind: "full", reason: `${file}: a code line changed shape` };
      }
      const insideString = stringFlags(before);
      for (let t = 0; t < before.length; t += 1) {
        if (before[t] === after[t]) {
          continue;
        }
        if (insideString[t]) {
          return { kind: "full", reason: `${file}: text inside a string changed` };
        }
        if (!/^[A-Za-z_$][\w$]*$/.test(before[t]) || !/^[A-Za-z_$][\w$]*$/.test(after[t])) {
          return { kind: "full", reason: `${file}: a non-name token changed` };
        }
        if (RESERVED.has(before[t]) || RESERVED.has(after[t])) {
          return { kind: "full", reason: `${file}: a keyword or literal changed` };
        }
        if (renames.has(before[t]) && renames.get(before[t]) !== after[t]) {
          return { kind: "full", reason: `${before[t]} renamed two ways` };
        }
        renames.set(before[t], after[t]);
      }
    }
  }
  for (const from of renames.keys()) {
    if (options.isStillUsed?.(from)) {
      return { kind: "full", reason: `${from} is still used after the rename` };
    }
  }
  const renamed = [...renames].map(([from, to]) => `${from} -> ${to}`).join(", ");
  if (renamed) {
    return { kind: "light", reason: `rename only: ${renamed}` };
  }
  return { kind: "light", reason: titleChanged ? "test title only" : "docs and comments only" };
}
