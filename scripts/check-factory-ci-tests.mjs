#!/usr/bin/env node
/**
 * CI ratchet (KIT-75): the required GitHub `test` job must run land-policy and
 * migration-prefix factory-script tests. Fails if those invocations are omitted,
 * or if existing mobile check-scripts leave that job.
 * Pi harness tests moved to github.com/KitCollective/kit-pi-harness (2026-09-01).
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const CI_WORKFLOW_PATH = ".github/workflows/ci.yml";
export const PACKAGE_JSON_PATH = "package.json";

export const FACTORY_NODE_TEST_NEEDLES = ["land-policy", "migration-prefix"];

export const MOBILE_CHECK_NEEDLES = [
  "check:mobile-tab-bar",
  "scripts/check-mobile-profile-settings-hub.mjs",
  "check:mobile-design-tokens",
  "check:mobile-collection-ui-evidence",
  "wishlist-ui-evidence",
  "check:mobile-drag-reorder",
  "check:mobile-add-form-wiring",
  "check:mobile-add-confirm-redirect",
  "check:mobile-add-upload-files",
];

/**
 * @param {string} workflowSource
 * @param {string} jobName
 * @returns {string}
 */
export function extractNamedJob(workflowSource, jobName) {
  const jobsMatch = workflowSource.match(/^jobs:\n([\s\S]*)$/m);
  if (!jobsMatch) {
    return "";
  }
  const jobsBody = jobsMatch[1];
  const jobHeader = `  ${jobName}:\n`;
  const start = jobsBody.indexOf(jobHeader);
  if (start === -1) {
    return "";
  }
  const after = jobsBody.slice(start + jobHeader.length);
  const nextJob = after.search(/\n {2}[A-Za-z0-9_-]+:/);
  return (nextJob === -1 ? after : after.slice(0, nextJob)).trimEnd();
}

/**
 * @param {string} packageSource
 * @returns {Record<string, string>}
 */
export function readScripts(packageSource) {
  try {
    const pkg = JSON.parse(packageSource);
    if (
      !pkg ||
      typeof pkg !== "object" ||
      typeof pkg.scripts !== "object" ||
      pkg.scripts === null
    ) {
      return {};
    }
    /** @type {Record<string, string>} */
    const scripts = {};
    for (const [name, body] of Object.entries(pkg.scripts)) {
      if (typeof body === "string") {
        scripts[name] = body;
      }
    }
    return scripts;
  } catch {
    return {};
  }
}

/**
 * Run bodies only — step titles must not satisfy factory needles.
 *
 * @param {string} step
 * @returns {string}
 */
export function stepRunSource(step) {
  const bodies = [];
  const lines = step.split("\n");
  let collectingBlock = false;
  /** @type {string[]} */
  let blockLines = [];

  const flushBlock = () => {
    if (collectingBlock) {
      bodies.push(blockLines.join("\n"));
      collectingBlock = false;
      blockLines = [];
    }
  };

  for (const line of lines) {
    const runMatch = line.match(/^\s*run:\s*(.*)$/);
    if (runMatch) {
      flushBlock();
      const rest = runMatch[1];
      if (rest === "|" || rest === ">" || rest === "|-" || rest === ">-") {
        collectingBlock = true;
        blockLines = [];
        continue;
      }
      bodies.push(rest);
      continue;
    }
    if (collectingBlock) {
      if (/^\s+(?:name|uses|env|if|continue-on-error|with|id|working-directory):/.test(line)) {
        flushBlock();
        continue;
      }
      if (line.trim() === "") {
        blockLines.push(line);
        continue;
      }
      if (/^\s+\S/.test(line)) {
        blockLines.push(line);
        continue;
      }
      flushBlock();
    }
  }
  flushBlock();
  return bodies.join("\n");
}

/**
 * @param {string} runSource
 * @param {Record<string, string>} scripts
 * @returns {string}
 */
export function expandPnpmScripts(runSource, scripts) {
  let expanded = runSource;
  for (const [name, body] of Object.entries(scripts)) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`pnpm(?:\\s+run)?\\s+${escaped}\\b`);
    if (pattern.test(runSource)) {
      expanded += `\n${body}`;
    }
  }
  return expanded;
}

/**
 * @param {string} text
 * @returns {string[]}
 */
function splitSteps(text) {
  return text.split(/^\s+- (?:name|uses):/m);
}

/**
 * @param {string} expandedRun
 * @param {string} fileNeedle
 * @returns {boolean}
 */
function stepRunsNodeTestOn(expandedRun, fileNeedle) {
  return expandedRun.includes("node --test") && expandedRun.includes(fileNeedle);
}

/**
 * @param {string} workflowSource
 * @returns {boolean}
 */
export function pullsRequestIntoDevelopment(workflowSource) {
  const onMatch = workflowSource.match(/^on:\n([\s\S]*?)\njobs:/m);
  if (!onMatch) {
    return false;
  }
  const prMatch = onMatch[1].match(/pull_request:\n([\s\S]*?)(?=\n {2}[a-z]|\n*$)/);
  if (!prMatch) {
    return false;
  }
  return prMatch[1].includes("development");
}

/**
 * @param {{ workflowSource: string, packageSource: string }} files
 * @returns {string[]}
 */
export function missingFactoryCiCoverage({ workflowSource, packageSource }) {
  const missing = [];
  const testJob = extractNamedJob(workflowSource, "test");
  if (!testJob) {
    missing.push("jobs.test");
    return missing;
  }

  if (!pullsRequestIntoDevelopment(workflowSource)) {
    missing.push("pull_request into development");
  }

  const scripts = readScripts(packageSource);
  const steps = splitSteps(testJob);

  for (const needle of FACTORY_NODE_TEST_NEEDLES) {
    const matching = steps.filter((step) =>
      stepRunsNodeTestOn(expandPnpmScripts(stepRunSource(step), scripts), needle),
    );
    if (matching.length === 0) {
      missing.push(`${needle} via node --test`);
      continue;
    }
    if (matching.some((step) => /continue-on-error:\s*true/.test(step))) {
      missing.push(`continue-on-error: true on ${needle}`);
    }
  }

  for (const needle of MOBILE_CHECK_NEEDLES) {
    if (!testJob.includes(needle)) {
      missing.push(`mobile check-script ${needle}`);
    }
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
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const workflowSource = readFileSync(join(root, CI_WORKFLOW_PATH), "utf8");
  const packageSource = readFileSync(join(root, PACKAGE_JSON_PATH), "utf8");
  const missing = missingFactoryCiCoverage({ workflowSource, packageSource });
  if (missing.length > 0) {
    console.error("check-factory-ci-tests: required GitHub test job is missing coverage:");
    for (const item of missing) {
      console.error(`  - ${item}`);
    }
    process.exit(1);
  }
}
