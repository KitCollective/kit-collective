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
