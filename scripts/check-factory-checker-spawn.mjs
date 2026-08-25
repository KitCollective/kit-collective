#!/usr/bin/env node
/**
 * Factory checker spawn ratchet (KIT-56).
 * Fails when factory-checker loses mechanical tool deny or silent-pass guard.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** @param {string} relative */
function read(relative) {
  return readFileSync(join(ROOT, relative), "utf8");
}

const piJob = read("harness/pi-job.mjs");
const checkerSpawn = read("harness/checker-spawn.mjs");
const checkerExit = read("harness/checker-exit.mjs");
const dockerfile = read("harness/Dockerfile");
const role = read(".pi/roles/factory-checker.md");

const failures = [];

if (!piJob.includes('from "./checker-spawn.mjs"')) {
  failures.push("harness/pi-job.mjs must import checker-spawn");
}
if (!piJob.includes("factoryCheckerPiArgs")) {
  failures.push("harness/pi-job.mjs must spawn factory-checker via factoryCheckerPiArgs");
}
if (!piJob.includes("LINEAR_ISSUE_ID")) {
  failures.push("harness/pi-job.mjs must set LINEAR_ISSUE_ID for factory-checker");
}
if (!checkerSpawn.includes("FACTORY_CHECKER_EXCLUDED_TOOLS")) {
  failures.push("harness/checker-spawn.mjs must declare excluded tools");
}
if (!checkerSpawn.includes("factory-checker-tools.ts")) {
  failures.push("harness/checker-spawn.mjs must load factory-checker-tools extension");
}
if (!checkerExit.includes("reviewFeedbackIsClean")) {
  failures.push(
    "harness/checker-exit.mjs must require explicit - (none) via reviewFeedbackIsClean",
  );
}
if (!checkerExit.includes("Linked GitHub PR is required")) {
  failures.push("harness/checker-exit.mjs must fail-move when PR is missing");
}
if (!checkerExit.includes("timed out before turning green")) {
  failures.push("harness/checker-exit.mjs must fail-move on GitHub wait timeout");
}
if (!dockerfile.includes("checker-spawn.mjs") || !dockerfile.includes("factory-checker-tools.ts")) {
  failures.push("harness/Dockerfile must copy checker-spawn and factory-checker-tools");
}
if (!role.includes("linear_cli")) {
  failures.push(".pi/roles/factory-checker.md must document linear_cli host tool");
}

if (failures.length > 0) {
  console.error("check-factory-checker-spawn failed:");
  for (const line of failures) {
    console.error(`- ${line}`);
  }
  process.exit(1);
}

console.log("check-factory-checker-spawn ok");
