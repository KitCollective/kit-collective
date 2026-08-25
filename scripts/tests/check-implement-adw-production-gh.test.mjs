import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  IMPLEMENT_ADW_TEST,
  missingImplementAdwProductionGhCoverage,
} from "../check-implement-adw-production-gh.mjs";

test("implement ADW production gh coverage is present", () => {
  const source = readFileSync(IMPLEMENT_ADW_TEST, "utf8");
  assert.deepEqual(missingImplementAdwProductionGhCoverage(source), []);
});

test("implement ADW production gh coverage fails when the createGhClient job test is removed", () => {
  const source = readFileSync(IMPLEMENT_ADW_TEST, "utf8");
  const mutated = source.replace(
    'test("production createGhClient pushes the rebased head, waits through pending required checks, and ignores optional pending"',
    'test("removed production gh coverage"',
  );
  const missing = missingImplementAdwProductionGhCoverage(mutated);
  assert.ok(missing.some((item) => item.includes("production createGhClient pushes")));
});

test("implement ADW production gh coverage fails when the empty-rollup wait test is removed", () => {
  const source = readFileSync(IMPLEMENT_ADW_TEST, "utf8");
  const mutated = source.replace(
    'test("production createGhClient does not move to In Review on MERGEABLE empty rollup when required checks are pending"',
    'test("removed empty rollup coverage"',
  );
  const missing = missingImplementAdwProductionGhCoverage(mutated);
  assert.ok(missing.some((item) => item.includes("MERGEABLE empty rollup")));
});

test("implement ADW production gh coverage fails when the typecheck skip test is removed", () => {
  const source = readFileSync(IMPLEMENT_ADW_TEST, "utf8");
  const mutated = source.replace(
    'test("typecheckTouched skips pnpm when the diff has no workspace packages"',
    'test("removed typecheck skip coverage"',
  );
  const missing = missingImplementAdwProductionGhCoverage(mutated);
  assert.ok(missing.some((item) => item.includes("skips pnpm")));
});

test("implement ADW production gh coverage fails when the missing-pnpm test is removed", () => {
  const source = readFileSync(IMPLEMENT_ADW_TEST, "utf8");
  const mutated = source.replace(
    'test("typecheckTouched fails closed when pnpm is missing and workspace packages are touched"',
    'test("removed missing pnpm coverage"',
  );
  const missing = missingImplementAdwProductionGhCoverage(mutated);
  assert.ok(missing.some((item) => item.includes("pnpm is missing")));
});
