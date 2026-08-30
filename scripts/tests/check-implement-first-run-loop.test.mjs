import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  missingImplementFirstRunLoopCoverage,
  REQUIRED_FILES,
} from "../check-implement-first-run-loop.mjs";

function loadSources() {
  /** @type {Record<string, string>} */
  const sources = {};
  for (const [key, relative] of Object.entries(REQUIRED_FILES)) {
    sources[key] = readFileSync(relative, "utf8");
  }
  return sources;
}

test("implement first-run loop coverage is present", () => {
  assert.deepEqual(missingImplementFirstRunLoopCoverage(loadSources()), []);
});

test("implement first-run loop coverage fails when selectImplementContext is removed", () => {
  const sources = loadSources();
  sources.implementContext = sources.implementContext.replace(
    "export function selectImplementContext",
    "export function removedSelectImplementContext",
  );
  const missing = missingImplementFirstRunLoopCoverage(sources);
  assert.ok(missing.some((item) => item.includes("selectImplementContext")));
});

test("implement first-run loop coverage fails when First run prompt is removed", () => {
  const sources = loadSources();
  sources.piJob = sources.piJob.replace(/First run/g, "Soft run");
  const missing = missingImplementFirstRunLoopCoverage(sources);
  assert.ok(missing.some((item) => item.includes("First run")));
});

test("implement first-run loop coverage fails when English identifier prompt is removed", () => {
  const sources = loadSources();
  sources.piJob = sources.piJob.replace(
    /Code identifiers, comments, and technical names are English/g,
    "Identifiers may be local language",
  );
  const missing = missingImplementFirstRunLoopCoverage(sources);
  assert.ok(missing.some((item) => item.includes("English code identifiers")));
});
