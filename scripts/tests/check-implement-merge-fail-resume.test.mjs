import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  missingImplementMergeFailResumeCoverage,
  REQUIRED_FILES,
} from "../check-implement-merge-fail-resume.mjs";

function loadSources() {
  /** @type {Record<string, string>} */
  const sources = {};
  for (const [key, relative] of Object.entries(REQUIRED_FILES)) {
    sources[key] = readFileSync(relative, "utf8");
  }
  return sources;
}

test("implement merge-fail resume coverage is present", () => {
  assert.deepEqual(missingImplementMergeFailResumeCoverage(loadSources()), []);
});

test("merge-fail resume coverage fails when pi-job drops Merge-fail resume prompt", () => {
  const sources = loadSources();
  sources.piJob = sources.piJob.replace(/Merge-fail resume/g, "Checker-fail resume");
  const missing = missingImplementMergeFailResumeCoverage(sources);
  assert.ok(missing.some((item) => item.includes("Merge-fail resume")));
});

test("merge-fail resume coverage fails when reviewFeedbackIsLandFail is removed", () => {
  const sources = loadSources();
  sources.implementExit = sources.implementExit.replace(
    /export function reviewFeedbackIsLandFail[\s\S]*?^}/m,
    "",
  );
  const missing = missingImplementMergeFailResumeCoverage(sources);
  assert.ok(missing.some((item) => item.includes("reviewFeedbackIsLandFail")));
});
