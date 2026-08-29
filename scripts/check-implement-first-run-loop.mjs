#!/usr/bin/env node
/**
 * CI ratchet: first PI implement run injects selectImplementContext (helpers, skills,
 * rules, PI overlays) — same loop as local /implement + /tdd, not soft .pi/roles text alone.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(import.meta.dirname, "..");

export const REQUIRED_FILES = {
  implementContext: "harness/implement-context.mjs",
  piJob: "harness/pi-job.mjs",
  implementRole: ".pi/roles/implement.md",
  contextTest: "harness/tests/implement-context.test.mjs",
  ciRetryTest: "harness/tests/implement-ci-retry.test.mjs",
};

/**
 * @param {Record<string, string>} sources
 * @returns {string[]}
 */
export function missingImplementFirstRunLoopCoverage(sources) {
  const missing = [];
  const ctx = sources.implementContext ?? "";
  if (!/export function selectImplementContext/.test(ctx)) {
    missing.push("implement-context.mjs selectImplementContext");
  }
  if (!/detectRequiredHelpers/.test(ctx)) {
    missing.push("implement-context.mjs detectRequiredHelpers");
  }
  if (!/buildImplementAppendPath/.test(ctx)) {
    missing.push("implement-context.mjs buildImplementAppendPath");
  }
  if (!/PI_PRE_REVIEW_OVERLAY/.test(ctx) || !/GitHub Actions only/.test(ctx)) {
    missing.push("implement-context.mjs PI pre-review overlay (full graph = GitHub only)");
  }
  if (!/PI_SECRETS_OVERLAY/.test(ctx) || !/LINEAR_CLI_API_KEY/.test(ctx)) {
    missing.push("implement-context.mjs PI secrets overlay (LINEAR_CLI remap)");
  }
  if (!/ALWAYS_SKILLS/.test(ctx) || !/tdd\/SKILL\.md/.test(ctx)) {
    missing.push("implement-context.mjs always tdd skill");
  }

  const piJob = sources.piJob ?? "";
  if (!/selectImplementContext/.test(piJob)) {
    missing.push("pi-job.mjs selectImplementContext wiring");
  }
  if (!/buildImplementAppendPath/.test(piJob)) {
    missing.push("pi-job.mjs buildImplementAppendPath append");
  }
  if (!/Required helpers:/.test(piJob)) {
    missing.push("pi-job.mjs Required helpers in implementPrompt");
  }
  if (!/First run/.test(piJob)) {
    missing.push("pi-job.mjs First run hard prompt");
  }
  if (!/Spawn Scout first/.test(piJob)) {
    missing.push("pi-job.mjs Spawn Scout first");
  }
  if (!/not `pnpm test`/.test(piJob)) {
    missing.push("pi-job.mjs TDD not pnpm test on worker");
  }
  if (!/resolveImplementSkillPaths/.test(piJob)) {
    missing.push("pi-job.mjs multiple --skill paths");
  }

  const role = sources.implementRole ?? "";
  if (!/selectImplementContext/.test(role)) {
    missing.push("implement.md references selectImplementContext injection");
  }
  if (!/Skip Scout/.test(role) || !/Skip helpers/.test(role)) {
    missing.push("implement.md cheap retry Skip Scout / Skip helpers");
  }

  const contextTest = sources.contextTest ?? "";
  if (!/First run/i.test(contextTest) || !/Required helpers: expo, ui-ux/.test(contextTest)) {
    missing.push("implement-context.test.mjs mobile first-run Scout + helpers");
  }
  if (!/api scope selects nest not ui-ux/.test(contextTest)) {
    missing.push("implement-context.test.mjs api nest not ui-ux");
  }
  if (!/db scope selects drizzle not ui-ux/.test(contextTest)) {
    missing.push("implement-context.test.mjs db drizzle not ui-ux");
  }
  if (!/combined mobile\+api\+db scope/.test(contextTest)) {
    missing.push("implement-context.test.mjs combined mobile+api+db scope");
  }
  if (!/Required helpers: expo, ui-ux/.test(contextTest)) {
    missing.push("implement-context.test.mjs mobile Required helpers in prompt");
  }
  if (!/cheap retry implementPrompt still Skip helpers/.test(contextTest)) {
    missing.push("implement-context.test.mjs cheap retry Skip helpers");
  }
  if (!/checker-fail uses full selector/.test(contextTest)) {
    missing.push("implement-context.test.mjs checker-fail full selector");
  }

  const ciRetryTest = sources.ciRetryTest ?? "";
  if (!/Required helpers:/.test(ciRetryTest)) {
    missing.push("implement-ci-retry.test.mjs Required helpers coverage");
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
    implementContext: readFileSync(join(root, REQUIRED_FILES.implementContext), "utf8"),
    piJob: readFileSync(join(root, REQUIRED_FILES.piJob), "utf8"),
    implementRole: readFileSync(join(root, REQUIRED_FILES.implementRole), "utf8"),
    contextTest: readFileSync(join(root, REQUIRED_FILES.contextTest), "utf8"),
    ciRetryTest: readFileSync(join(root, REQUIRED_FILES.ciRetryTest), "utf8"),
  };
  const missing = missingImplementFirstRunLoopCoverage(sources);
  if (missing.length > 0) {
    console.error("check-implement-first-run-loop: missing required coverage:");
    for (const item of missing) {
      console.error(`  - ${item}`);
    }
    process.exit(1);
  }
  console.log("check-implement-first-run-loop: ok");
}
