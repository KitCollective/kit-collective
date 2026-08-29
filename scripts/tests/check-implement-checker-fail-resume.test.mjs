import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  missingImplementCheckerFailResumeCoverage,
  REQUIRED_FILES,
} from "../check-implement-checker-fail-resume.mjs";

function loadSources() {
  /** @type {Record<string, string>} */
  const sources = {};
  for (const [key, relative] of Object.entries(REQUIRED_FILES)) {
    sources[key] = readFileSync(relative, "utf8");
  }
  return sources;
}

test("implement checker-fail resume coverage is present", () => {
  assert.deepEqual(missingImplementCheckerFailResumeCoverage(loadSources()), []);
});

test("implement checker-fail resume coverage fails when the prompt drops extractReviewFeedback", () => {
  const sources = loadSources();
  sources.piJob = sources.piJob.replace(/extractReviewFeedback/g, "readNotes");
  const missing = missingImplementCheckerFailResumeCoverage(sources);
  assert.ok(missing.some((item) => item.includes("extractReviewFeedback")));
});

test("implement checker-fail resume coverage fails when pi-job drops the slop subset", () => {
  const sources = loadSources();
  sources.piJob = sources.piJob.replace(/\[factory-checker\/slop\]/g, "[github comments]");
  const missing = missingImplementCheckerFailResumeCoverage(sources);
  assert.ok(missing.some((item) => item.includes("Slop threads")));
});

test("implement checker-fail resume coverage fails when the Linear comment no longer takes findings", () => {
  const sources = loadSources();
  sources.roleComments = sources.roleComments.replace(
    "function checkerFailComment(identifier, reviewFeedback)",
    "function checkerFailComment(identifier)",
  );
  const missing = missingImplementCheckerFailResumeCoverage(sources);
  assert.ok(missing.some((item) => item.includes("checkerFailComment")));
});
