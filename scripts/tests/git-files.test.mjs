import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { changedFiles, changedFilesArgs, nulList } from "../lib/git-files.mjs";
import { suitesFor } from "../lib/verify.mjs";

const env = {
  ...process.env,
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@t",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@t",
};
const git = (cwd, ...args) => execFileSync("git", args, { cwd, env, encoding: "utf8" });
const put = (root, path, text) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
};

const suites = [
  { id: "web", paths: ["apps/web/**"] },
  { id: "docs", paths: ["docs/**"] },
];

/** A scratch repo with a base commit, then a branch commit that moves a file across suites. */
function scratch(change) {
  const root = mkdtempSync(join(tmpdir(), "gitfiles-"));
  git(root, "init", "-b", "main");
  put(root, "apps/web/a.ts", "export const a = 1;\n");
  put(root, "docs/readme.md", "docs\n");
  git(root, "add", "-A");
  git(root, "commit", "-m", "base");
  git(root, "checkout", "-b", "feature");
  change(root);
  git(root, "add", "-A");
  git(root, "commit", "-m", "change");
  return root;
}

test("args are NUL separated with no rename detection", () => {
  assert.deepEqual(changedFilesArgs("a...HEAD"), [
    "diff",
    "--name-only",
    "-z",
    "--no-renames",
    "a...HEAD",
  ]);
  assert.deepEqual(nulList("a\0b c\0blåbær\0"), ["a", "b c", "blåbær"]);
});

test("a rename across suites selects BOTH suites (the source side is not dropped)", () => {
  const root = scratch((r) => {
    mkdirSync(join(r, "docs"), { recursive: true });
    renameSync(join(r, "apps/web/a.ts"), join(r, "docs/a.ts"));
  });
  const files = changedFiles("main...HEAD", { cwd: root });
  assert.deepEqual(files.sort(), ["apps/web/a.ts", "docs/a.ts"]);
  assert.deepEqual(
    suitesFor(files, suites)
      .map((s) => s.id)
      .sort(),
    ["docs", "web"],
  );
});

test("a non-ASCII name and a name with spaces arrive unquoted and match their suite", () => {
  const root = scratch((r) => {
    put(r, "apps/web/blåbær.ts", "x\n");
    put(r, "apps/web/with space.ts", "y\n");
  });
  const files = changedFiles("main...HEAD", { cwd: root });
  assert.deepEqual(files.sort(), ["apps/web/blåbær.ts", "apps/web/with space.ts"]);
  assert.deepEqual(
    suitesFor(files, suites).map((s) => s.id),
    ["web"],
  );
  // the plain line-based form is what used to lose them
  const quoted = git(root, "diff", "--name-only", "main...HEAD");
  assert.match(quoted, /\\303\\245/);
});

test("an extra diff filter keeps only additions, a moved file counts as added at its new path", () => {
  const root = scratch((r) => {
    renameSync(join(r, "apps/web/a.ts"), join(r, "apps/web/b.ts"));
  });
  assert.deepEqual(changedFiles("main...HEAD", { cwd: root, extra: ["--diff-filter=A"] }), [
    "apps/web/b.ts",
  ]);
});
