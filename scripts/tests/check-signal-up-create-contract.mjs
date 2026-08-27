#!/usr/bin/env node
/**
 * KIT-88: leftover create-contract files must file into Linear Triage, not
 * Backlog. Independent oracle: spec "Intake and auto-merge" + ADR-0024.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const CREATE_CONTRACT_PATHS = {
  signalUpSkill: ".cursor/skills/signal-up/SKILL.md",
  signalUpRules: ".cursor/skills/signal-up/references/rules.md",
  signalUpYaml: ".cursor/skills/signal-up/agents/openai.yaml",
  scopeRule: ".cursor/rules/scope-signal-up.mdc",
  askMe: ".cursor/skills/ask-me/SKILL.md",
  signalUpDocs: "docs/agents/signal-up.md",
  proposalDocs: "docs/agents/qualified-proposals.md",
  issueTracker: "docs/agents/issue-tracker.md",
  harnessDocs: ".cursor/skills/bootstrap-linear/scripts/generate-harness-docs.mjs",
  agentsMd: "AGENTS.md",
  contextMd: "CONTEXT.md",
  readme: "README.md",
  workflow: "WORKFLOW.md",
  orchestration: ".cursor/rules/orchestration.mdc",
  ciWorkflow: ".github/workflows/ci.yml",
};

/** Phrases that mean new leftovers are filed into Backlog / dispatch.state. */
export const BACKLOG_CREATE_PATTERNS = [
  [/new Linear Backlog issue/i, "creates a Linear Backlog issue"],
  [/new `Backlog` issue/, "creates a `Backlog` issue"],
  [/new `dispatch\.state` issue/, "creates a `dispatch.state` issue"],
  [/status `dispatch\.state`/, "create status is `dispatch.state`"],
  [/status `Backlog`/, "create status is `Backlog`"],
  [/Status = `dispatch\.state`/, "create Status = `dispatch.state`"],
  [/filed as a new `Backlog` issue/, "filed as a new `Backlog` issue"],
  [/filed as a new `\$\{dispatch\}` issue/, "generator files signal-up into dispatch.state"],
  [/new Linear issue, `Backlog`/, "AGENTS files into Backlog"],
  [/new Linear issue, `\$\{dispatch\}`/, "generator interpolates dispatch.state as create status"],
  [/New issue in the dispatch state/, "issue-tracker files into the dispatch state"],
  [/File out-of-scope work as a new Backlog issue/, "signal-up yaml files into Backlog"],
];

/** Leftover-create files only — `/to-tickets` may still use dispatch.state. */
const LEFTOVER_CREATE_PATHS = new Set([
  CREATE_CONTRACT_PATHS.signalUpSkill,
  CREATE_CONTRACT_PATHS.signalUpRules,
  CREATE_CONTRACT_PATHS.signalUpYaml,
  CREATE_CONTRACT_PATHS.scopeRule,
  CREATE_CONTRACT_PATHS.askMe,
  CREATE_CONTRACT_PATHS.signalUpDocs,
  CREATE_CONTRACT_PATHS.proposalDocs,
  CREATE_CONTRACT_PATHS.harnessDocs,
  CREATE_CONTRACT_PATHS.agentsMd,
  CREATE_CONTRACT_PATHS.contextMd,
]);

const TRIAGE_CREATE_NEEDLES = [
  [CREATE_CONTRACT_PATHS.signalUpSkill, "Triage"],
  [CREATE_CONTRACT_PATHS.signalUpRules, "status `Triage`"],
  [CREATE_CONTRACT_PATHS.signalUpYaml, "Triage"],
  [CREATE_CONTRACT_PATHS.scopeRule, "Triage"],
  [CREATE_CONTRACT_PATHS.askMe, "Triage"],
  [CREATE_CONTRACT_PATHS.signalUpDocs, "Triage"],
  [CREATE_CONTRACT_PATHS.proposalDocs, "Triage"],
  [CREATE_CONTRACT_PATHS.issueTracker, "Triage"],
  [CREATE_CONTRACT_PATHS.harnessDocs, "**Triage**"],
  [CREATE_CONTRACT_PATHS.agentsMd, "**Triage**"],
];

const SIGNAL_UP_ONLY_PATHS = [CREATE_CONTRACT_PATHS.scopeRule, CREATE_CONTRACT_PATHS.askMe];

/**
 * @param {Record<string, string>} files
 * @returns {string[]}
 */
export function leftoverCreateViolations(files) {
  const violations = [];

  for (const path of LEFTOVER_CREATE_PATHS) {
    const source = files[path];
    if (typeof source !== "string") {
      continue;
    }
    for (const [pattern, label] of BACKLOG_CREATE_PATTERNS) {
      if (pattern.test(source)) {
        violations.push(`${path}: ${label}`);
      }
    }
  }

  const issueTracker = files[CREATE_CONTRACT_PATHS.issueTracker];
  if (typeof issueTracker === "string") {
    const cell = issueTracker.match(/\|\s*`\/signal-up`\s*\|([^|]+)\|/);
    const target = cell ? cell[1] : issueTracker;
    if (!/Triage/.test(target)) {
      violations.push(
        `${CREATE_CONTRACT_PATHS.issueTracker}: /signal-up create contract missing Triage`,
      );
    }
    if (/dispatch state|in Backlog|into Backlog/.test(target)) {
      violations.push(
        `${CREATE_CONTRACT_PATHS.issueTracker}: /signal-up files into Backlog/dispatch`,
      );
    }
  }

  for (const [path, needle] of TRIAGE_CREATE_NEEDLES) {
    const source = files[path];
    if (typeof source !== "string") {
      continue;
    }
    if (!source.includes(needle)) {
      violations.push(`${path}: missing create-status needle ${needle}`);
    }
  }

  for (const path of SIGNAL_UP_ONLY_PATHS) {
    const source = files[path];
    if (typeof source !== "string") {
      continue;
    }
    if (/`signal-up` \+ `needs-triage`/.test(source)) {
      violations.push(`${path}: pairs signal-up with needs-triage`);
    }
  }

  const readme = files[CREATE_CONTRACT_PATHS.readme];
  if (typeof readme === "string") {
    if (/Cursor Cloud Agents execute/.test(readme)) {
      violations.push("README.md: treats Cursor Cloud Agents as execute/dispatch");
    }
    if (!readme.includes("PI worker")) {
      violations.push("README.md: missing PI worker");
    }
    if (!readme.includes("Compose") || !readme.includes("`gh`") || !readme.includes("Linear CLI")) {
      violations.push("README.md: missing Compose + gh + Linear CLI");
    }
  }

  const workflow = files[CREATE_CONTRACT_PATHS.workflow];
  if (typeof workflow === "string") {
    if (!/Never claim from Linear \*\*Triage\*\*/.test(workflow)) {
      violations.push("WORKFLOW.md: missing never-claim-Triage");
    }
    if (!/not labelled `signal-up`/.test(workflow)) {
      violations.push("WORKFLOW.md: missing never-claim signal-up");
    }
  }

  const orchestration = files[CREATE_CONTRACT_PATHS.orchestration];
  if (typeof orchestration === "string") {
    if (!/never claims Triage/i.test(orchestration)) {
      violations.push("orchestration.mdc: missing planner never claims Triage");
    }
    if (!/`signal-up`/.test(orchestration)) {
      violations.push("orchestration.mdc: missing signal-up");
    }
  }

  const ci = files[CREATE_CONTRACT_PATHS.ciWorkflow];
  if (typeof ci === "string") {
    if (!ci.includes("scripts/tests/check-signal-up-create-contract")) {
      violations.push("ci.yml: test job missing check-signal-up-create-contract");
    }
  }

  return violations;
}

/**
 * @param {string} root
 * @returns {Record<string, string>}
 */
export function readCreateContractFiles(root = ".") {
  /** @type {Record<string, string>} */
  const files = {};
  for (const path of Object.values(CREATE_CONTRACT_PATHS)) {
    files[path] = readFileSync(join(root, path), "utf8");
  }
  return files;
}

function isCli() {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  return resolve(entry) === fileURLToPath(import.meta.url);
}

if (isCli()) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const violations = leftoverCreateViolations(readCreateContractFiles(root));
  if (violations.length > 0) {
    console.error("check-signal-up-create-contract: leftovers must file into Triage, not Backlog:");
    for (const item of violations) {
      console.error(`  - ${item}`);
    }
    process.exit(1);
  }
}
