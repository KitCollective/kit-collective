#!/usr/bin/env node
/**
 * CI ratchet: land merge-fail resume is orchestration — not checker-fail Scout+helpers.
 * UNKNOWN mergeable gets a short land retry; resume fast-path skips Pi when PR is ready.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(import.meta.dirname, "..");

export const REQUIRED_FILES = {
  landPolicy: "scripts/lib/land-policy.mjs",
  land: "harness/land.mjs",
  implementExit: "harness/implement-exit.mjs",
  piJob: "harness/pi-job.mjs",
  resume: "harness/resume.mjs",
  landTest: "harness/tests/land.test.mjs",
  ciRetryTest: "harness/tests/implement-ci-retry.test.mjs",
  resumeTest: "harness/tests/resume.test.mjs",
};

/**
 * @param {Record<string, string>} sources
 * @returns {string[]}
 */
export function missingImplementMergeFailResumeCoverage(sources) {
  const missing = [];
  const landPolicy = sources.landPolicy ?? "";
  if (!/LAND_UNKNOWN_MERGEABLE_RETRIES/.test(landPolicy)) {
    missing.push("land-policy.mjs LAND_UNKNOWN_MERGEABLE_RETRIES");
  }
  if (!/LAND_UNKNOWN_RETRY_MS/.test(landPolicy)) {
    missing.push("land-policy.mjs LAND_UNKNOWN_RETRY_MS");
  }

  const land = sources.land ?? "";
  if (!/mergeable === "UNKNOWN"/.test(land)) {
    missing.push("land.mjs UNKNOWN mergeable retry loop");
  }
  if (!/unknownRetryAttempts/.test(land)) {
    missing.push("land.mjs unknownRetryAttempts parameter");
  }

  const implementExit = sources.implementExit ?? "";
  if (!/export function reviewFeedbackIsLandFail/.test(implementExit)) {
    missing.push("implement-exit.mjs reviewFeedbackIsLandFail");
  }

  const piJob = sources.piJob ?? "";
  if (!/reviewFeedbackIsLandFail/.test(piJob)) {
    missing.push("pi-job.mjs reviewFeedbackIsLandFail");
  }
  if (!/Merge-fail resume/.test(piJob)) {
    missing.push("pi-job.mjs Merge-fail resume prompt");
  }
  if (!/Do not re-implement the feature/.test(piJob)) {
    missing.push("pi-job.mjs Do not re-implement on merge-fail");
  }
  if (!/mergeFailFastPath/.test(piJob)) {
    missing.push("pi-job.mjs merge-fail fast path skips Pi");
  }
  if (!/mergeFailResume/.test(piJob)) {
    missing.push("pi-job.mjs mergeFailResume prompt branch");
  }

  const resume = sources.resume ?? "";
  if (!/stale retry-cap/i.test(resume)) {
    missing.push("resume.mjs stale retry-cap still enqueues Implementing");
  }

  const landTest = sources.landTest ?? "";
  if (!/UNKNOWN mergeable/.test(landTest)) {
    missing.push("land.test.mjs UNKNOWN mergeable retry coverage");
  }
  if (!/UNKNOWN race resolves to MERGEABLE on the final retry/.test(landTest)) {
    missing.push("land.test.mjs UNKNOWN race final retry coverage");
  }

  const ciRetryTest = sources.ciRetryTest ?? "";
  if (!/Merge-fail resume/.test(ciRetryTest)) {
    missing.push("implement-ci-retry.test.mjs Merge-fail resume prompt");
  }
  if (!/merge-fail fast path/i.test(ciRetryTest)) {
    missing.push("implement-ci-retry.test.mjs merge-fail fast path");
  }
  if (!/reviewFeedbackIsLandFail distinguishes merge gate/.test(ciRetryTest)) {
    missing.push("implement-ci-retry.test.mjs reviewFeedbackIsLandFail vs checker-fail");
  }
  if (!/fast path does not skip Pi when PR is not MERGEABLE/.test(ciRetryTest)) {
    missing.push("implement-ci-retry.test.mjs merge-fail fast path refuses non-MERGEABLE");
  }
  if (!/fast path does not skip Pi when required checks are red/.test(ciRetryTest)) {
    missing.push("implement-ci-retry.test.mjs merge-fail fast path refuses red checks");
  }

  const resumeTest = sources.resumeTest ?? "";
  if (!/land-fail/i.test(resumeTest)) {
    missing.push("resume.test.mjs land-fail not blocked by retry cap");
  }
  if (!/re-enqueues merge-fail Implementing after slot freed/.test(resumeTest)) {
    missing.push("resume.test.mjs merge-fail re-enqueue after slot freed");
  }

  return missing;
}

function isCli() {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  return resolve(entry) === fileURLToPath(import.meta.url);
}

if (isCli()) {
  const sources = {
    landPolicy: readFileSync(join(root, REQUIRED_FILES.landPolicy), "utf8"),
    land: readFileSync(join(root, REQUIRED_FILES.land), "utf8"),
    implementExit: readFileSync(join(root, REQUIRED_FILES.implementExit), "utf8"),
    piJob: readFileSync(join(root, REQUIRED_FILES.piJob), "utf8"),
    resume: readFileSync(join(root, REQUIRED_FILES.resume), "utf8"),
    landTest: readFileSync(join(root, REQUIRED_FILES.landTest), "utf8"),
    ciRetryTest: readFileSync(join(root, REQUIRED_FILES.ciRetryTest), "utf8"),
    resumeTest: readFileSync(join(root, REQUIRED_FILES.resumeTest), "utf8"),
  };
  const missing = missingImplementMergeFailResumeCoverage(sources);
  if (missing.length > 0) {
    console.error("check-implement-merge-fail-resume: missing required coverage:");
    for (const item of missing) {
      console.error(`  - ${item}`);
    }
    process.exit(1);
  }
  console.log("check-implement-merge-fail-resume: ok");
}
