import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import {
  assertRange,
  assertRef,
  changedFiles,
  changedFilesArgs,
  lsTree,
  nulEntries,
  nulList,
} from "../lib/git-files.mjs";
import { suiteKey, suitesFor } from "../lib/verify.mjs";

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
    "--end-of-options",
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

const webSuite = { id: "web", command: "echo", paths: ["apps/web/**"] };
const keyAt = (root) =>
  suiteKey({ suite: webSuite, entries: lsTree("HEAD", { cwd: root }), nodeVersion: "v22" });

test("the reuse key changes for an edit to a non-ASCII, spaced, newline-named or gitlink path, not for an unrelated edit", () => {
  const root = scratch((r) => {
    put(r, "apps/web/blåbær.ts", "v1\n");
    put(r, "apps/web/with space.ts", "v1\n");
    put(r, "apps/web/line\nbreak.ts", "v1\n");
  });
  // a real nested repository, so `git add -A` records a gitlink (a submodule-like entry)
  const sub = join(root, "apps/web/vendor/sub");
  mkdirSync(sub, { recursive: true });
  git(sub, "init", "-b", "main");
  put(sub, "f.txt", "1\n");
  git(sub, "add", "-A");
  git(sub, "commit", "-m", "sub 1");
  git(root, "add", "-A");
  git(root, "commit", "-m", "gitlink");
  const edit = (path, text) => {
    put(root, path, text);
    git(root, "add", "-A");
    git(root, "commit", "-m", `edit ${path}`);
  };
  const keys = [keyAt(root)];
  for (const path of ["apps/web/blåbær.ts", "apps/web/with space.ts", "apps/web/line\nbreak.ts"]) {
    edit(path, "v2\n");
    keys.push(keyAt(root));
  }
  put(sub, "f.txt", "2\n");
  git(sub, "commit", "-am", "sub 2");
  git(root, "add", "-A");
  git(root, "commit", "-m", "move gitlink");
  keys.push(keyAt(root));
  assert.equal(
    new Set(keys).size,
    keys.length,
    `every edit produced a new key: ${keys.map((k) => k.slice(0, 6))}`,
  );
  edit("docs/readme.md", "unrelated\n");
  assert.equal(keyAt(root), keys.at(-1), "an unrelated edit leaves the key alone");
  const listed = lsTree("HEAD", { cwd: root }).map((e) => e.path);
  assert.ok(listed.includes("apps/web/blåbær.ts") && listed.includes("apps/web/line\nbreak.ts"));
  assert.ok(
    listed.includes("apps/web/vendor/sub"),
    "a submodule-like entry is listed, not descended",
  );
});

test("nulEntries keeps the original bytes of a name that is not valid UTF-8", () => {
  const buffer = Buffer.concat([
    Buffer.from("docs/latin"),
    Buffer.from([0xe9]),
    Buffer.from(".md\0ok.md\0"),
  ]);
  const [bad, good] = nulEntries(buffer);
  assert.equal(bad.lossy, true);
  assert.equal(
    Buffer.compare(
      bad.raw,
      Buffer.concat([Buffer.from("docs/latin"), Buffer.from([0xe9]), Buffer.from(".md")]),
    ),
    0,
  );
  assert.equal(good.lossy, false);
});

test("refs and ranges that git could read as options are refused, and nothing is written", () => {
  for (const bad of [
    "--output=/tmp/kc-x",
    "-x",
    "--upload-pack=touch /tmp/kc-y",
    "a b",
    "",
    "a;b",
    "origin/dev..x",
  ]) {
    assert.throws(() => assertRef(bad), /refused ref/, JSON.stringify(bad));
  }
  assert.throws(() => assertRange("--output=/tmp/kc-x...HEAD"), /refused ref/);
  assert.throws(() => changedFiles("--output=/tmp/kc-x...HEAD"), /refused/);
  assert.throws(() => changedFiles("HEAD"), /refused range/);
  assert.equal(existsSync("/tmp/kc-x"), false);
  assert.equal(assertRef("origin/development"), "origin/development");
  assert.equal(assertRef("c0ffee1"), "c0ffee1");
  assert.equal(assertRange("origin/development...HEAD"), "origin/development...HEAD");
});

test("review-matrix plan refuses a bad sha with exit 2 instead of an empty list", () => {
  const cli = new URL("../review-matrix.mjs", import.meta.url).pathname;
  const dir = mkdtempSync(join(tmpdir(), "wp-"));
  writeFileSync(join(dir, "w.md"), "### Review matrix\n");
  const result = spawnSync("node", [cli, "plan", join(dir, "w.md"), "--output=/tmp/kc-z"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 2);
  assert.equal(existsSync("/tmp/kc-z"), false);
});
