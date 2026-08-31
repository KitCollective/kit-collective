#!/usr/bin/env node
/**
 * CI ratchet: Gate format:check, cheap implement retry (skip Scout/helpers),
 * same Implementing stay (not a new try), no retry-cap hold. Prevents KIT-125
 * (five false format cheap-retries → hold, never In Review while GitHub was green).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");

export const REQUIRED_FILES = {
  gate: ".pi/agents/gate.md",
  implementRole: ".pi/roles/implement.md",
  piJob: "harness/pi-job.mjs",
  resume: "harness/resume.mjs",
  implementExit: "harness/implement-exit.mjs",
  dockerfile: "harness/Dockerfile",
  ciRetryTest: "harness/tests/implement-ci-retry.test.mjs",
  resumeTest: "harness/tests/resume.test.mjs",
};

/**
 * @param {Record<string, string>} sources
 * @returns {string[]}
 */
export function missingImplementCheapRetryCoverage(sources) {
  const missing = [];
  const gate = sources.gate ?? "";
  if (!/Mechanical close|format:check|biome/i.test(gate)) {
    missing.push("gate.md Mechanical close / format:check ownership");
  }
  if (!/do not spawn|superseded/i.test(gate)) {
    missing.push("gate.md superseded — do not spawn");
  }
  if (!/typecheck|yellow/i.test(gate)) {
    missing.push("gate.md typecheck / yellow owned by harness");
  }
  const role = sources.implementRole ?? "";
  if (!/Skip Scout/i.test(role) || !/Skip Draft/i.test(role) || !/Skip helpers/i.test(role)) {
    missing.push("implement.md Skip Scout / Skip Draft / Skip helpers on cheap retry");
  }
  if (!/selectImplementContext/.test(role)) {
    missing.push("implement.md selectImplementContext injection reference");
  }
  if (!/not a new try|same Implementing stay/i.test(role)) {
    missing.push("implement.md cheap retry is the same Implementing stay");
  }
  if (!/one at a time|Mechanical close|Do not spawn Gate/i.test(role)) {
    missing.push("implement.md serial helpers / Mechanical close / no Gate spawn");
  }
  const piJob = sources.piJob ?? "";
  if (!/format vs lockfile vs migration prefix/i.test(piJob)) {
    missing.push("pi-job.mjs format vs lockfile vs migration prefix class on cheap retry");
  }
  if (!/cheapRetry/.test(piJob)) {
    missing.push("pi-job.mjs cheapRetry prompt");
  }
  if (!/isCheapImplementRetry/.test(piJob)) {
    missing.push("pi-job.mjs isCheapImplementRetry");
  }
  if (!/not a new try/.test(piJob)) {
    missing.push("pi-job.mjs cheap retry is not a new try");
  }
  if (!/harness waits/.test(piJob)) {
    missing.push("pi-job.mjs harness waits for GitHub");
  }
  if (!/First-pass resume|reviewFeedbackIsFirstPassOnly/.test(piJob)) {
    missing.push("pi-job.mjs First-pass resume Skip Scout when findings are known classes");
  }
  if (!/Never spawn Gate|Do not spawn Gate|one at a time/i.test(piJob)) {
    missing.push("pi-job.mjs Do not spawn Gate / serial helpers");
  }
  if (/retry-cap-hold/.test(piJob) || /implementRetryCapComment/.test(piJob)) {
    missing.push("pi-job.mjs must not hold Implementing on retry cap");
  }
  const resume = sources.resume ?? "";
  if (/commentsHoldImplementRetryCap/.test(resume) || /implement retry cap/.test(resume)) {
    missing.push("resume.mjs must not skip Implementing on retry-cap comments");
  }
  const implementExit = sources.implementExit ?? "";
  if (!/export function isFormatInfraError/.test(implementExit)) {
    missing.push("implement-exit.mjs isFormatInfraError");
  }
  if (!/FORMAT_CHECK_MAX_BUFFER/.test(implementExit)) {
    missing.push("implement-exit.mjs FORMAT_CHECK_MAX_BUFFER");
  }
  if (!/export function classifyCiFailure/.test(implementExit)) {
    missing.push("implement-exit.mjs classifyCiFailure");
  }
  if (!/export function createFormatApply/.test(implementExit)) {
    missing.push("implement-exit.mjs createFormatApply");
  }
  if (!/formatApply/.test(implementExit)) {
    missing.push("implement-exit.mjs formatApply before formatRetry");
  }
  if (!/CONFLICTING/.test(implementExit) || !/conflictRebase/.test(implementExit)) {
    missing.push("implement-exit.mjs rebase CONFLICTING during GitHub wait");
  }
  if (!/firstPassRetry|collectFirstPassViolations/.test(implementExit)) {
    missing.push("implement-exit.mjs first-pass scan before In Review");
  }
  const dockerfile = sources.dockerfile ?? "";
  if (!/@biomejs\/biome@2\.5\.10/.test(dockerfile)) {
    missing.push("Dockerfile global @biomejs/biome@2.5.10");
  }
  const ciRetryTest = sources.ciRetryTest ?? "";
  if (
    !/Skip Scout/i.test(ciRetryTest) ||
    !/format vs lockfile vs migration prefix/i.test(ciRetryTest)
  ) {
    missing.push("implement-ci-retry cheap retry prompt coverage");
  }
  if (!/stale retry-cap comment does not skip Pi spawn/.test(ciRetryTest)) {
    missing.push("implement-ci-retry stale retry-cap does not skip Pi");
  }
  if (!/not a new try|same Implementing stay/i.test(ciRetryTest)) {
    missing.push("implement-ci-retry same Implementing stay / not a new try");
  }
  const resumeTest = sources.resumeTest ?? "";
  if (!/enqueues Implementing even when a stale retry-cap comment/.test(resumeTest)) {
    missing.push("resume.test.mjs stale retry-cap still enqueues");
  }
  return missing;
}

const sources = {
  gate: readFileSync(join(root, REQUIRED_FILES.gate), "utf8"),
  implementRole: readFileSync(join(root, REQUIRED_FILES.implementRole), "utf8"),
  piJob: readFileSync(join(root, REQUIRED_FILES.piJob), "utf8"),
  resume: readFileSync(join(root, REQUIRED_FILES.resume), "utf8"),
  implementExit: readFileSync(join(root, REQUIRED_FILES.implementExit), "utf8"),
  dockerfile: readFileSync(join(root, REQUIRED_FILES.dockerfile), "utf8"),
  ciRetryTest: readFileSync(join(root, REQUIRED_FILES.ciRetryTest), "utf8"),
  resumeTest: readFileSync(join(root, REQUIRED_FILES.resumeTest), "utf8"),
};
const missing = missingImplementCheapRetryCoverage(sources);
if (missing.length > 0) {
  console.error("check-implement-cheap-retry: missing required coverage:");
  for (const item of missing) {
    console.error(`  - ${item}`);
  }
  process.exit(1);
}

console.log("check-implement-cheap-retry: ok");
