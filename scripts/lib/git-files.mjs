/**
 * File lists from git, read the exact way: NUL separated (`-z`, so no quoting or octal escapes for
 * non-ASCII names or spaces) and without rename detection (a moved file is a deletion at the old
 * path and an addition at the new one, so both sides count). Every script that decides something
 * from "which files changed" (suite selection, write scope, review rows, naming checks) uses this.
 */
import { execFileSync } from "node:child_process";

/** Splits `-z` output into paths. */
export function nulList(output) {
  return String(output)
    .split("\0")
    .filter((entry) => entry !== "");
}

/** Arguments of `git diff --name-only` for a range, NUL separated, no rename detection. */
export function changedFilesArgs(range, extra = []) {
  return ["diff", "--name-only", "-z", "--no-renames", ...extra, range];
}

/**
 * @param {string} range e.g. `origin/development...HEAD`
 * @param {{ cwd?: string, extra?: string[] }} [options] extra: e.g. `--diff-filter=A`
 * @returns {string[]}
 */
export function changedFiles(range, { cwd, extra = [] } = {}) {
  return nulList(
    execFileSync("git", changedFilesArgs(range, extra), {
      cwd,
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
    }),
  );
}
