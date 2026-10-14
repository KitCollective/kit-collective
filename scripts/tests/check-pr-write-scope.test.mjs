import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  changedFilesDiffArgs,
  findWriteScopeViolations,
  isRatchetException,
  isRatchetShapedPath,
  matchesGlob,
  parseWriteScopeGlobs,
  resolveWriteScopeViolations,
  shouldEnforceWriteScope,
} from "../lib/pr-write-scope.mjs";

test("changedFilesDiffArgs diffs from the merge base (three dots)", () => {
  assert.deepEqual(changedFilesDiffArgs("origin/development"), [
    "diff",
    "--name-only",
    "-z",
    "--no-renames",
    "--end-of-options",
    "origin/development...HEAD",
  ]);
  assert.throws(() => changedFilesDiffArgs("--output=x"), /refused ref/);
});

test("the branch's own files only: not the lane's later changes, also after the branch merged the lane", () => {
  const dir = mkdtempSync(join(tmpdir(), "write-scope-"));
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: dir,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "t",
        GIT_AUTHOR_EMAIL: "t@t",
        GIT_COMMITTER_NAME: "t",
        GIT_COMMITTER_EMAIL: "t@t",
      },
    });
  const commit = (file, message) => {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), message);
    git("add", "--", file);
    git("commit", "-q", "-m", message);
  };
  const changed = () =>
    git(...changedFilesDiffArgs("lane"))
      .split("\0")
      .filter(Boolean)
      .sort();
  git("init", "-q", "-b", "lane");
  commit("README.md", "base");
  git("checkout", "-q", "-b", "feature");
  commit("apps/mobile/screen.tsx", "the slice");
  git("checkout", "-q", "lane");
  commit("scripts/gate.mjs", "a harness change on the lane");
  git("checkout", "-q", "feature");
  // Behind the lane: the tip-to-tip range used to list scripts/gate.mjs as the PR's.
  assert.deepEqual(changed(), ["apps/mobile/screen.tsx"]);
  assert.match(git("diff", "--name-only", "lane..HEAD"), /scripts\/gate\.mjs/);
  // After merging the lane in, still only the branch's own file.
  git("merge", "-q", "--no-edit", "lane");
  assert.deepEqual(changed(), ["apps/mobile/screen.tsx"]);
});

test("parseWriteScopeGlobs extracts comma-separated globs", () => {
  const text = `Some intro

write-scope: apps/admin/**, apps/api/**, packages/api-contract/**

More text`;
  assert.deepEqual(parseWriteScopeGlobs(text), [
    "apps/admin/**",
    "apps/api/**",
    "packages/api-contract/**",
  ]);
});

test("parseWriteScopeGlobs returns null when line is absent", () => {
  assert.equal(parseWriteScopeGlobs("no scope here"), null);
});

test("matchesGlob supports single-segment and recursive globs", () => {
  assert.equal(matchesGlob("apps/admin/src/App.tsx", "apps/admin/**"), true);
  assert.equal(matchesGlob("apps/api/src/main.ts", "apps/admin/**"), false);
  assert.equal(matchesGlob("pnpm-workspace.yaml", "pnpm-workspace.yaml"), true);
  assert.equal(matchesGlob("seed/fkapi/tests/seed.test.ts", "apps/api/**"), false);
});

test("isRatchetException allows named ratchet scripts, not arbitrary scripts/lib paths", () => {
  assert.equal(isRatchetException("scripts/check-pr-write-scope.mjs"), true);
  assert.equal(isRatchetException("scripts/check-seed-fkapi-test-database-isolation.mjs"), true);
  assert.equal(isRatchetException("scripts/check-kit-db-test-database-isolation.mjs"), true);
  assert.equal(isRatchetException("scripts/check-seed-mcp-stdio-catalog-owner.mjs"), true);
  assert.equal(
    isRatchetException("scripts/tests/check-seed-mcp-stdio-catalog-owner.test.mjs"),
    true,
  );
  assert.equal(isRatchetException("scripts/check-migration-prefixes.mjs"), true);
  assert.equal(isRatchetException("scripts/lib/migration-prefix.mjs"), true);
  assert.equal(isRatchetException("scripts/tests/check-migration-prefixes.test.mjs"), true);
  assert.equal(isRatchetException("scripts/lib/pr-write-scope.mjs"), true);
  assert.equal(isRatchetException("scripts/tests/check-pr-write-scope.test.mjs"), true);
  assert.equal(isRatchetException(".cursor/rules/write-scope.mdc"), true);
  assert.equal(isRatchetException(".github/workflows/ci.yml"), true);
  assert.equal(isRatchetException("scripts/lib/unrelated-helper.mjs"), false);
  assert.equal(isRatchetException("scripts/check-something-else.mjs"), false);
  assert.equal(isRatchetException("apps/admin/src/App.tsx"), false);
});

test("shouldEnforceWriteScope is false when write-scope line is absent", () => {
  assert.equal(shouldEnforceWriteScope(null), false);
  assert.equal(shouldEnforceWriteScope([]), false);
  assert.equal(shouldEnforceWriteScope(parseWriteScopeGlobs("no scope here")), false);
});

test("shouldEnforceWriteScope is true when write-scope globs are declared", () => {
  const globs = parseWriteScopeGlobs("write-scope: apps/admin/**");
  assert.equal(shouldEnforceWriteScope(globs), true);
});

test("findWriteScopeViolations flags scripts/lib files that are not ratchet implementations", () => {
  const globs = ["apps/admin/**", "apps/api/**"];
  const changedFiles = ["scripts/lib/unrelated-helper.mjs"];

  assert.deepEqual(findWriteScopeViolations(changedFiles, globs), [
    "scripts/lib/unrelated-helper.mjs",
  ]);
});

test("findWriteScopeViolations flags out-of-scope files and ignores ratchet paths", () => {
  const globs = ["apps/admin/**", "apps/api/**"];
  const changedFiles = [
    "apps/admin/src/App.tsx",
    "seed/fkapi/tests/seed.test.ts",
    "scripts/check-pr-write-scope.mjs",
  ];

  assert.deepEqual(findWriteScopeViolations(changedFiles, globs), [
    "seed/fkapi/tests/seed.test.ts",
  ]);
});

test("check script exits non-zero on synthetic out-of-scope diff", () => {
  const globs = ["apps/admin/**"];
  const violations = findWriteScopeViolations(["root/package.json"], globs);
  assert.equal(violations.length, 1);
  assert.equal(violations[0], "root/package.json");
});

test("isRatchetShapedPath is only check-scripts and their tests", () => {
  assert.equal(isRatchetShapedPath("scripts/check-mobile-inbox-conversation-chrome.mjs"), true);
  assert.equal(
    isRatchetShapedPath("scripts/tests/check-mobile-inbox-conversation-chrome.test.mjs"),
    true,
  );
  assert.equal(isRatchetShapedPath("scripts/lib/pr-write-scope.mjs"), false);
  assert.equal(isRatchetShapedPath("package.json"), false);
  assert.equal(isRatchetShapedPath("harness/land.mjs"), false);
});

test("resolveWriteScopeViolations waives a new check-script the worktree allowlist accepts", () => {
  const globs = ["apps/mobile/**"];
  const changedFiles = [
    "apps/mobile/app/(tabs)/inbox/index.tsx",
    "scripts/check-mobile-inbox-conversation-chrome.mjs",
    "scripts/tests/check-mobile-inbox-conversation-chrome.test.mjs",
  ];
  const bundled = findWriteScopeViolations(changedFiles, globs);
  assert.deepEqual(bundled, [
    "scripts/check-mobile-inbox-conversation-chrome.mjs",
    "scripts/tests/check-mobile-inbox-conversation-chrome.test.mjs",
  ]);
  const worktreeFind = (files, scope) =>
    findWriteScopeViolations(files, scope).filter(
      (file) => !file.includes("inbox-conversation-chrome"),
    );
  assert.deepEqual(resolveWriteScopeViolations(changedFiles, globs, worktreeFind), []);
});

test("findWriteScopeViolations allows pnpm-lock.yaml when package.json is in scope", () => {
  const globs = ["apps/api/**"];
  assert.deepEqual(
    findWriteScopeViolations(
      ["apps/api/package.json", "apps/api/src/main.ts", "pnpm-lock.yaml"],
      globs,
    ),
    [],
  );
});

test("findWriteScopeViolations still flags package.json outside write-scope", () => {
  const globs = ["apps/mobile/**"];
  assert.deepEqual(findWriteScopeViolations(["package.json", "pnpm-lock.yaml"], globs), [
    "package.json",
    "pnpm-lock.yaml",
  ]);
});

test("findWriteScopeViolations allows root package.json companion lockfile when package.json matches glob", () => {
  const globs = ["package.json", "apps/api/**"];
  assert.deepEqual(
    findWriteScopeViolations(["package.json", "pnpm-lock.yaml", "apps/api/src/x.ts"], globs),
    [],
  );
});

test("resolveWriteScopeViolations does not waive product or harness paths even if worktree allowlists them", () => {
  const globs = ["apps/mobile/**"];
  const changedFiles = ["apps/mobile/app/index.tsx", "package.json", "harness/land.mjs"];
  const worktreeFind = () => [];
  assert.deepEqual(resolveWriteScopeViolations(changedFiles, globs, worktreeFind), [
    "package.json",
    "harness/land.mjs",
  ]);
});

test("matchesGlob spans a newline in a file name and still honours directory boundaries", () => {
  assert.equal(matchesGlob("apps/web/line\nbreak.ts", "apps/web/**"), true);
  assert.equal(matchesGlob("apps/web/line\nbreak.ts", "apps/web/*.ts"), true);
  assert.equal(matchesGlob("apps/other/line\nbreak.ts", "apps/web/**"), false);
});

test("parseWriteScopeGlobs removes the markdown escapes Linear adds to a saved description", () => {
  assert.deepEqual(
    parseWriteScopeGlobs(
      "write-scope: scripts/tests/\\*\\*, scripts/lib/pr\\_write.mjs, docs/adr/\\*\\*",
    ),
    ["scripts/tests/**", "scripts/lib/pr_write.mjs", "docs/adr/**"],
  );
  // A plain line is unchanged, and a backslash before an ordinary letter stays.
  assert.deepEqual(parseWriteScopeGlobs("write-scope: a/**, b\\n"), ["a/**", "b\\n"]);
  assert.equal(parseWriteScopeGlobs("no scope"), null);
});

test("an escaped scope line still matches the files it names", () => {
  const globs = parseWriteScopeGlobs("write-scope: scripts/tests/\\*\\*");
  assert.deepEqual(findWriteScopeViolations(["scripts/tests/a.test.mjs"], globs), []);
  assert.deepEqual(findWriteScopeViolations(["apps/x.ts"], globs), ["apps/x.ts"]);
});

test("CI runs again when the PR description changes, since the scope step reads it from the event", () => {
  const ci = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../.github/workflows/ci.yml"),
    "utf8",
  );
  const pullRequest = /^ {2}pull_request:\n([\s\S]*?)^ {2}[a-z_]+:/m.exec(ci)?.[1] ?? "";
  assert.match(pullRequest, /types: \[opened, synchronize, reopened, edited\]/);
  assert.match(
    ci,
    /PR_BODY: \$\{\{ github\.event_name == 'pull_request' && github\.event\.pull_request\.body/,
  );
});
