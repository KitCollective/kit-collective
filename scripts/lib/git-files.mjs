/**
 * File lists from git, read the exact way (ADR-0053): NUL separated (`-z`, so no quoting or octal
 * escapes for non-ASCII names, spaces or newlines), without rename detection (a moved file is a
 * deletion at the old path and an addition at the new one, so both sides count), and with every ref
 * checked before it reaches git. Every script that decides something from "which files changed"
 * or "what is in this tree" reads through this module: one way to read a file list.
 *
 * Paths are decoded as UTF-8 for glob matching. A name that is not valid UTF-8 keeps its original
 * bytes in `raw` and is flagged `lossy`; nothing here passes a decoded path back to git.
 */
import { execFileSync } from "node:child_process";

/** A single ref or sha: cannot start with `-`, so git can never read it as an option. */
const REF = /^[A-Za-z0-9_][A-Za-z0-9._/~^@-]*$/;

/** @param {string} ref @returns {string} the ref, or throws */
export function assertRef(ref) {
  if (typeof ref !== "string" || !REF.test(ref) || ref.includes("..")) {
    throw new Error(`refused ref ${JSON.stringify(String(ref).slice(0, 60))}`);
  }
  return ref;
}

/** A `a..b` or `a...b` range with both sides checked. */
export function assertRange(range) {
  const m = /^(.+?)(\.\.\.?)(.+)$/.exec(String(range));
  if (!m) {
    throw new Error(`refused range ${JSON.stringify(String(range).slice(0, 60))}`);
  }
  return `${assertRef(m[1])}${m[2]}${assertRef(m[3])}`;
}

/**
 * Splits `-z` output into entries. A Buffer keeps the exact bytes in `raw`.
 * @param {string | Buffer} output
 * @returns {{ path: string, raw: Buffer, lossy: boolean }[]}
 */
export function nulEntries(output) {
  const buffer = Buffer.isBuffer(output) ? output : Buffer.from(String(output), "utf8");
  const entries = [];
  let start = 0;
  for (let i = 0; i <= buffer.length; i += 1) {
    if (i === buffer.length || buffer[i] === 0) {
      if (i > start) {
        const raw = buffer.subarray(start, i);
        const path = raw.toString("utf8");
        entries.push({ path, raw, lossy: path.includes("�") });
      }
      start = i + 1;
    }
  }
  return entries;
}

/** Splits `-z` output into path strings. */
export function nulList(output) {
  return nulEntries(output).map((entry) => entry.path);
}

/** Arguments of `git diff --name-only` for a validated range, NUL separated, no renames. */
export function changedFilesArgs(range, extra = []) {
  return [
    "diff",
    "--name-only",
    "-z",
    "--no-renames",
    ...extra,
    "--end-of-options",
    assertRange(range),
  ];
}

const run = (args, cwd) =>
  execFileSync("git", args, {
    cwd,
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });

/**
 * @param {string} range e.g. `origin/development...HEAD`
 * @param {{ cwd?: string, extra?: string[] }} [options] extra: e.g. `--diff-filter=A`
 * @returns {string[]}
 */
export function changedFiles(range, { cwd, extra = [] } = {}) {
  return nulList(run(changedFilesArgs(range, extra), cwd));
}

/**
 * `git ls-tree -r -z <treeish>`: every entry `{ mode, type, sha, path, raw }`. Submodule entries
 * (type `commit`) are listed, not descended into.
 * @param {string} treeish a validated ref or sha, e.g. HEAD
 * @param {{ cwd?: string }} [options]
 */
export function lsTree(treeish, { cwd } = {}) {
  const output = run(["ls-tree", "-r", "-z", "--end-of-options", assertRef(treeish)], cwd);
  return nulEntries(output).map((entry) => {
    const tab = entry.raw.indexOf(0x09);
    const [mode, type, sha] = entry.raw.subarray(0, tab).toString("utf8").split(" ");
    const raw = entry.raw.subarray(tab + 1);
    const path = raw.toString("utf8");
    return { mode, type, sha, path, raw, lossy: path.includes("�") };
  });
}
