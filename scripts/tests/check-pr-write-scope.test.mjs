import assert from "node:assert/strict";
import { test } from "node:test";
import {
  findWriteScopeViolations,
  isRatchetException,
  matchesGlob,
  parseWriteScopeGlobs,
  shouldEnforceWriteScope,
} from "../lib/pr-write-scope.mjs";

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
  assert.equal(isRatchetException("scripts/check-factory-checker-spawn.mjs"), true);
  assert.equal(isRatchetException("scripts/check-implement-checker-fail-resume.mjs"), true);
  assert.equal(
    isRatchetException("scripts/tests/check-implement-checker-fail-resume.test.mjs"),
    true,
  );
  assert.equal(isRatchetException("scripts/tests/check-factory-checker-spawn.test.mjs"), true);
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
