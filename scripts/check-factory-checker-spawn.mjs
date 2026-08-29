#!/usr/bin/env node
/**
 * Factory checker spawn ratchet (KIT-56, KIT-112).
 * Fails when factory-checker loses mechanical tool deny, memory-write allowlist, or writer config.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** @readonly */
export const FACTORY_CHECKER_MEMORY_TOOLS = [
  "memory_search",
  "session_search",
  "memory_add",
  "memory_replace",
  "memory_remove",
];

/**
 * @param {string} source
 * @param {string} constName
 * @returns {string[]}
 */
function stringArrayConst(source, constName) {
  const match = source.match(new RegExp(`export const ${constName}\\s*=\\s*\\[([\\s\\S]*?)\\];`));
  if (!match) {
    return [];
  }
  return [...match[1].matchAll(/"([^"]+)"/g)].map((part) => part[1]);
}

/**
 * @param {string} checkerSpawn
 * @returns {string[]}
 */
export function factoryCheckerAllowedToolsFromSource(checkerSpawn) {
  const allowedBlock = checkerSpawn.match(
    /export const FACTORY_CHECKER_ALLOWED_TOOLS\s*=\s*\[([\s\S]*?)\];/,
  );
  if (!allowedBlock) {
    return [];
  }
  const literals = [...allowedBlock[1].matchAll(/"([^"]+)"/g)].map((part) => part[1]);
  if (allowedBlock[1].includes("FACTORY_CHECKER_MEMORY_TOOLS")) {
    return [...literals, ...stringArrayConst(checkerSpawn, "FACTORY_CHECKER_MEMORY_TOOLS")];
  }
  return literals;
}

/**
 * @param {{
 *   piJob: string,
 *   checkerSpawn: string,
 *   checkerExit: string,
 *   dockerfile: string,
 *   role: string,
 *   host: string,
 *   checkerHermes: string,
 * }} files
 * @returns {string[]}
 */
export function missingFactoryCheckerSpawnCoverage(files) {
  const failures = [];
  const { piJob, checkerSpawn, checkerExit, dockerfile, role, host, checkerHermes } = files;

  if (!piJob.includes('from "./checker-spawn.mjs"')) {
    failures.push("harness/pi-job.mjs must import checker-spawn");
  }
  if (!piJob.includes("factoryCheckerPiArgs")) {
    failures.push("harness/pi-job.mjs must spawn factory-checker via factoryCheckerPiArgs");
  }
  if (!piJob.includes("LINEAR_ISSUE_ID")) {
    failures.push("harness/pi-job.mjs must set LINEAR_ISSUE_ID for factory-checker");
  }
  if (!piJob.includes("HERMES_CHECKER_AGENT_DIR_REL")) {
    failures.push(
      "harness/pi-job.mjs must declare HERMES_CHECKER_AGENT_DIR_REL for Memory writer config",
    );
  }
  if (!checkerSpawn.includes("FACTORY_CHECKER_EXCLUDED_TOOLS")) {
    failures.push("harness/checker-spawn.mjs must declare excluded tools");
  }
  if (!checkerSpawn.includes("factory-checker-tools.ts")) {
    failures.push("harness/checker-spawn.mjs must load factory-checker-tools extension");
  }
  const memoryTools = stringArrayConst(checkerSpawn, "FACTORY_CHECKER_MEMORY_TOOLS");
  for (const tool of FACTORY_CHECKER_MEMORY_TOOLS) {
    if (!memoryTools.includes(tool)) {
      failures.push(`harness/checker-spawn.mjs must declare factory-checker memory tool ${tool}`);
    }
  }
  const allowedTools = factoryCheckerAllowedToolsFromSource(checkerSpawn);
  for (const tool of FACTORY_CHECKER_MEMORY_TOOLS) {
    if (!allowedTools.includes(tool)) {
      failures.push(`factory-checker allowlist must include memory tool ${tool}`);
    }
  }
  for (const tool of ["write", "edit", "bash"]) {
    if (!stringArrayConst(checkerSpawn, "FACTORY_CHECKER_EXCLUDED_TOOLS").includes(tool)) {
      failures.push(`harness/checker-spawn.mjs must exclude repo tool ${tool}`);
    }
    if (allowedTools.includes(tool)) {
      failures.push(`factory-checker allowlist must not include repo tool ${tool}`);
    }
  }
  if (allowedTools.includes("skill_manage")) {
    failures.push("factory-checker allowlist must not include skill_manage");
  }
  if (!checkerExit.includes("reviewFeedbackIsClean")) {
    failures.push(
      "harness/checker-exit.mjs must require explicit three-axis pass via reviewFeedbackIsClean",
    );
  }
  if (!checkerExit.includes("reviewFeedbackMissingSlopAxis")) {
    failures.push("harness/checker-exit.mjs must detect missing Slop axis");
  }
  if (!checkerExit.includes("REVIEW_PASS_FEEDBACK_LINES")) {
    failures.push("harness/checker-exit.mjs must declare REVIEW_PASS_FEEDBACK_LINES");
  }
  if (!checkerExit.includes("REVIEW_FEEDBACK_HARNESS_INCOMPLETE")) {
    failures.push(
      "harness/checker-exit.mjs must declare REVIEW_FEEDBACK_HARNESS_INCOMPLETE for fail fallback",
    );
  }
  if (!allowedTools.includes("subagent")) {
    failures.push("factory-checker allowlist must include subagent for /code-review fan-out");
  }
  if (!checkerSpawn.includes("SLOP_AGENT_MEMORY_EXCLUDED_TOOLS")) {
    failures.push("harness/checker-spawn.mjs must declare SLOP_AGENT_MEMORY_EXCLUDED_TOOLS");
  }
  if (!checkerSpawn.includes("slopAgentToolArgs")) {
    failures.push("harness/checker-spawn.mjs must declare slopAgentToolArgs for Slop sub-agent spawn");
  }
  if (!piJob.includes("SLOP_AGENT_MEMORY_EXCLUDED_TOOLS")) {
    failures.push(
      "harness/pi-job.mjs must wire SLOP_AGENT_MEMORY_EXCLUDED_TOOLS at factory-checker spawn",
    );
  }
  const slopAgentPath = join(ROOT, ".pi/agents/slop.md");
  try {
    const slopAgent = readFileSync(slopAgentPath, "utf8");
    if (!slopAgent.includes("memory_add")) {
      failures.push(".pi/agents/slop.md must document that Slop child has no memory_add");
    }
    const slopToolsMatch = slopAgent.match(/^tools:\s*(.+)$/m);
    const slopTools = slopToolsMatch
      ? slopToolsMatch[1].split(",").map((tool) => tool.trim())
      : [];
    for (const tool of stringArrayConst(checkerSpawn, "SLOP_AGENT_MEMORY_EXCLUDED_TOOLS")) {
      if (slopTools.includes(tool)) {
        failures.push(`.pi/agents/slop.md must not grant Slop child tool ${tool}`);
      }
    }
    for (const tool of stringArrayConst(checkerSpawn, "SLOP_AGENT_ALLOWED_TOOLS")) {
      if (!slopTools.includes(tool)) {
        failures.push(`.pi/agents/slop.md must grant Slop child tool ${tool}`);
      }
    }
  } catch {
    failures.push(".pi/agents/slop.md must exist for read-only Slop sub-agent");
  }
  const codeReviewSkill = read(".cursor/skills/code-review/SKILL.md");
  if (!codeReviewSkill.includes("## Slop") && !codeReviewSkill.includes("**Slop**")) {
    failures.push(".cursor/skills/code-review/SKILL.md must define the Slop axis");
  }
  if (!piJob.includes("Standards + Spec + Slop")) {
    failures.push("harness/pi-job.mjs factory-checker prompt must name all three axes");
  }
  if (!role.includes("Slop")) {
    failures.push(".pi/roles/factory-checker.md must document the Slop axis");
  }
  if (!checkerExit.includes("Linked GitHub PR is required")) {
    failures.push("harness/checker-exit.mjs must fail-move when PR is missing");
  }
  if (!checkerExit.includes("timed out before turning green")) {
    failures.push("harness/checker-exit.mjs must fail-move on GitHub wait timeout");
  }
  if (
    !dockerfile.includes("checker-spawn.mjs") ||
    !dockerfile.includes("factory-checker-tools.ts")
  ) {
    failures.push("harness/Dockerfile must copy checker-spawn and factory-checker-tools");
  }
  if (!role.includes("linear_cli")) {
    failures.push(".pi/roles/factory-checker.md must document linear_cli host tool");
  }
  if (!host.match(/factory-checker.*Memory writer|Memory writer.*factory-checker/i)) {
    failures.push("harness/host.md must name factory-checker as the Memory writer");
  }
  if (!host.match(/Memory readers?/i)) {
    failures.push("harness/host.md must name other Pi jobs as Memory readers");
  }

  try {
    const config = JSON.parse(checkerHermes);
    if (config.reviewEnabled !== true) {
      failures.push(
        ".pi/agent-checker/hermes-memory-config.json must enable reviewEnabled for writer",
      );
    }
    if (config.correctionDetection !== true) {
      failures.push(
        ".pi/agent-checker/hermes-memory-config.json must enable correctionDetection for writer",
      );
    }
    if (config.flushOnShutdown !== true) {
      failures.push(
        ".pi/agent-checker/hermes-memory-config.json must enable flushOnShutdown for writer",
      );
    }
    if (config.memoryMode !== "policy-only") {
      failures.push(".pi/agent-checker/hermes-memory-config.json must stay policy-only");
    }
  } catch {
    failures.push(".pi/agent-checker/hermes-memory-config.json must exist and parse as JSON");
  }

  return failures;
}

/** @param {string} relative */
function read(relative) {
  return readFileSync(join(ROOT, relative), "utf8");
}

const failures = missingFactoryCheckerSpawnCoverage({
  piJob: read("harness/pi-job.mjs"),
  checkerSpawn: read("harness/checker-spawn.mjs"),
  checkerExit: read("harness/checker-exit.mjs"),
  dockerfile: read("harness/Dockerfile"),
  role: read(".pi/roles/factory-checker.md"),
  host: read("harness/host.md"),
  checkerHermes: read(".pi/agent-checker/hermes-memory-config.json"),
});

if (failures.length > 0) {
  console.error("check-factory-checker-spawn failed:");
  for (const line of failures) {
    console.error(`- ${line}`);
  }
  process.exit(1);
}

console.log("check-factory-checker-spawn ok");
