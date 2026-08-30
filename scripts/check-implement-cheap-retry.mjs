#!/usr/bin/env node
/**
 * CI ratchet: Gate format:check, cheap implement retry (skip Scout/helpers),
 * and resume hold after the in-slot retry cap. Prevents the first-fail-is-GitHub
 * loop that respawned a full Scout→helpers→Gate Composer 4–9 times per issue.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");

export const REQUIRED_FILES = {
  gate: ".pi/agents/gate.md",
  implementRole: ".pi/roles/implement.md",
  piJob: "harness/pi-job.mjs",
  resume: "harness/resume.mjs",
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
  if (!/format:check|biome ci/.test(gate)) {
    missing.push("gate.md format:check / biome ci");
  }
  if (!/do not treat format/i.test(gate)) {
    missing.push("gate.md do not treat format as typecheck");
  }
  if (!/yellow/i.test(gate)) {
    missing.push("gate.md typecheck may be yellow");
  }
  const role = sources.implementRole ?? "";
  if (!/Skip Scout/i.test(role) || !/Skip helpers/i.test(role)) {
    missing.push("implement.md Skip Scout / Skip helpers on cheap retry");
  }
  if (!/selectImplementContext/.test(role)) {
    missing.push("implement.md selectImplementContext injection reference");
  }
  const piJob = sources.piJob ?? "";
  if (!/format vs Zod vs unique-email vs migration prefix/i.test(piJob)) {
    missing.push(
      "pi-job.mjs format vs Zod vs unique-email vs migration prefix class on cheap retry",
    );
  }
  if (!/cheapRetry/.test(piJob)) {
    missing.push("pi-job.mjs cheapRetry prompt");
  }
  if (!/isCheapImplementRetry/.test(piJob)) {
    missing.push("pi-job.mjs isCheapImplementRetry");
  }
  const resume = sources.resume ?? "";
  if (!/implement retry cap/.test(resume)) {
    missing.push("resume.mjs implement retry cap skip");
  }
  const dockerfile = sources.dockerfile ?? "";
  if (!/@biomejs\/biome@2\.5\.10/.test(dockerfile)) {
    missing.push("Dockerfile global @biomejs/biome@2.5.10");
  }
  const ciRetryTest = sources.ciRetryTest ?? "";
  if (
    !/Skip Scout/i.test(ciRetryTest) ||
    !/format vs Zod vs unique-email vs migration prefix/i.test(ciRetryTest)
  ) {
    missing.push("implement-ci-retry cheap retry prompt coverage");
  }
  if (!/does not spawn Pi when comments already hold the retry cap/.test(ciRetryTest)) {
    missing.push("implement-ci-retry retry-cap hold coverage");
  }
  const resumeTest = sources.resumeTest ?? "";
  if (!/skips Implementing after implement retry cap/.test(resumeTest)) {
    missing.push("resume.test.mjs implement retry cap skip coverage");
  }
  return missing;
}

const sources = {
  gate: readFileSync(join(root, REQUIRED_FILES.gate), "utf8"),
  implementRole: readFileSync(join(root, REQUIRED_FILES.implementRole), "utf8"),
  piJob: readFileSync(join(root, REQUIRED_FILES.piJob), "utf8"),
  resume: readFileSync(join(root, REQUIRED_FILES.resume), "utf8"),
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
