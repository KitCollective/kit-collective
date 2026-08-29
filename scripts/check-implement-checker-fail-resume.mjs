#!/usr/bin/env node
/**
 * CI ratchet: checker-fail implement resume inlines workpad ### Review feedback
 * (same extractReviewFeedback as cheap CI retry) and the Linear fail comment
 * carries the finding lines. Cheap retry still Skip Scout/helpers; checker-fail
 * resume must not. Prevents repeating KIT-116 loop 2 (Composer saw only
 * «fix the class»; GitHub Slop was a subset; Nicklas could not read the loop
 * on Linear).
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(import.meta.dirname, "..");

export const REQUIRED_FILES = {
  implementRole: ".pi/roles/implement.md",
  implementContext: "harness/implement-context.mjs",
  piJob: "harness/pi-job.mjs",
  implementExit: "harness/implement-exit.mjs",
  roleComments: "harness/role-comments.mjs",
  checkerExit: "harness/checker-exit.mjs",
  ciRetryTest: "harness/tests/implement-ci-retry.test.mjs",
  contextTest: "harness/tests/implement-context.test.mjs",
  roleCommentsTest: "harness/tests/role-comments.test.mjs",
  checkerTest: "harness/tests/checker.test.mjs",
};

/**
 * @param {Record<string, string>} sources
 * @returns {string[]}
 */
export function missingImplementCheckerFailResumeCoverage(sources) {
  const missing = [];
  const role = sources.implementRole ?? "";
  if (!/selectImplementContext/.test(role)) {
    missing.push("implement.md selectImplementContext injection reference");
  }
  if (!/Skip Scout/.test(role) || !/Skip helpers/.test(role)) {
    missing.push("implement.md cheap retry Skip Scout / Skip helpers");
  }

  const implementContext = sources.implementContext ?? "";
  if (!/selectImplementContext/.test(implementContext)) {
    missing.push("implement-context.mjs selectImplementContext");
  }
  if (!/detectRequiredHelpers/.test(implementContext)) {
    missing.push("implement-context.mjs detectRequiredHelpers for full helper list");
  }

  const piJob = sources.piJob ?? "";
  if (!/extractReviewFeedback/.test(piJob)) {
    missing.push("pi-job.mjs extractReviewFeedback");
  }
  if (!/reviewFeedbackIsActionable/.test(piJob)) {
    missing.push("pi-job.mjs reviewFeedbackIsActionable");
  }
  if (!/const cheapRetry = isCheapImplementRetry/.test(piJob)) {
    missing.push("pi-job.mjs derive cheapRetry from isCheapImplementRetry");
  }
  if (!/Checker-fail resume/.test(piJob)) {
    missing.push("pi-job.mjs Checker-fail resume prompt");
  }
  if (!/\[factory-checker\/slop\]/.test(piJob)) {
    missing.push("pi-job.mjs GitHub Slop threads are a subset");
  }
  if (!/Do not Skip Scout/.test(piJob)) {
    missing.push("pi-job.mjs Do not Skip Scout on checker-fail resume");
  }
  if (!/Required helpers:/.test(piJob)) {
    missing.push("pi-job.mjs Required helpers from selector on checker-fail resume");
  }

  const implementExit = sources.implementExit ?? "";
  if (!/export function extractReviewFeedback/.test(implementExit)) {
    missing.push("implement-exit.mjs extractReviewFeedback");
  }
  if (!/export function reviewFeedbackIsActionable/.test(implementExit)) {
    missing.push("implement-exit.mjs reviewFeedbackIsActionable");
  }

  const roleComments = sources.roleComments ?? "";
  if (!/formatCheckerFailFindings/.test(roleComments)) {
    missing.push("role-comments.mjs formatCheckerFailFindings");
  }
  if (!/selectCheckerFailFindings/.test(roleComments)) {
    missing.push("role-comments.mjs selectCheckerFailFindings");
  }
  if (!/function checkerFailComment\(identifier, reviewFeedback\)/.test(roleComments)) {
    missing.push("role-comments.mjs checkerFailComment(identifier, reviewFeedback)");
  }

  const checkerExit = sources.checkerExit ?? "";
  if (!/extractReviewFeedback\(body\)/.test(checkerExit)) {
    missing.push("checker-exit.mjs extractReviewFeedback on fail comment");
  }

  const ciRetryTest = sources.ciRetryTest ?? "";
  if (!/Collection tab missing badge count/.test(ciRetryTest)) {
    missing.push("implement-ci-retry KIT-116 findings inline coverage");
  }
  if (!/Do not Skip Scout/.test(ciRetryTest)) {
    missing.push("implement-ci-retry Do not Skip Scout on checker-fail resume");
  }
  if (!/Skip Scout/.test(ciRetryTest) || !/Skip helpers/.test(ciRetryTest)) {
    missing.push("implement-ci-retry cheap retry still Skip Scout / Skip helpers");
  }
  if (!/Required helpers:/.test(ciRetryTest)) {
    missing.push("implement-ci-retry Required helpers on checker-fail resume");
  }

  const contextTest = sources.contextTest ?? "";
  if (!/checker-fail uses full selector/.test(contextTest)) {
    missing.push("implement-context.test.mjs checker-fail full selector");
  }

  const roleCommentsTest = sources.roleCommentsTest ?? "";
  if (!/### Spec/.test(roleCommentsTest)) {
    missing.push("role-comments.test.mjs Spec heading");
  }
  if (!/unused Badge export/.test(roleCommentsTest)) {
    missing.push("role-comments.test.mjs verbatim Standards finding");
  }

  const checkerTest = sources.checkerTest ?? "";
  if (!/AC missing/.test(checkerTest)) {
    missing.push("checker.test.mjs fail comment includes Spec finding");
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
    implementRole: readFileSync(join(root, REQUIRED_FILES.implementRole), "utf8"),
    implementContext: readFileSync(join(root, REQUIRED_FILES.implementContext), "utf8"),
    piJob: readFileSync(join(root, REQUIRED_FILES.piJob), "utf8"),
    implementExit: readFileSync(join(root, REQUIRED_FILES.implementExit), "utf8"),
    roleComments: readFileSync(join(root, REQUIRED_FILES.roleComments), "utf8"),
    checkerExit: readFileSync(join(root, REQUIRED_FILES.checkerExit), "utf8"),
    ciRetryTest: readFileSync(join(root, REQUIRED_FILES.ciRetryTest), "utf8"),
    contextTest: readFileSync(join(root, REQUIRED_FILES.contextTest), "utf8"),
    roleCommentsTest: readFileSync(join(root, REQUIRED_FILES.roleCommentsTest), "utf8"),
    checkerTest: readFileSync(join(root, REQUIRED_FILES.checkerTest), "utf8"),
  };
  const missing = missingImplementCheckerFailResumeCoverage(sources);
  if (missing.length > 0) {
    console.error("check-implement-checker-fail-resume: missing required coverage:");
    for (const item of missing) {
      console.error(`  - ${item}`);
    }
    process.exit(1);
  }
  console.log("check-implement-checker-fail-resume: ok");
}
