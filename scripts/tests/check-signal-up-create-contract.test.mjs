import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CREATE_CONTRACT_PATHS,
  leftoverCreateViolations,
  readCreateContractFiles,
} from "./check-signal-up-create-contract.mjs";

/** Spec literals — independent of current repo files. */
const GOOD_FILES = {
  [CREATE_CONTRACT_PATHS.signalUpSkill]:
    "Files an out-of-scope finding as a new Linear Triage issue with signal-up.",
  [CREATE_CONTRACT_PATHS.signalUpRules]:
    "Create a Linear issue: status `Triage` (the Linear state), label `signal-up` only. Do not file into Backlog.",
  [CREATE_CONTRACT_PATHS.signalUpYaml]:
    'short_description: "File out-of-scope work as a new Triage issue"',
  [CREATE_CONTRACT_PATHS.scopeRule]:
    "Follow the `signal-up` skill: new `Triage` issue, label `signal-up` only, related to the origin, at most 3 per run.",
  [CREATE_CONTRACT_PATHS.askMe]:
    "`/signal-up` — out-of-scope bug/debt: new Linear issue in **Triage**, label `signal-up` only. Never delegate.",
  [CREATE_CONTRACT_PATHS.signalUpDocs]:
    "Status = Linear **Triage** (the state, not the label group)\nLabel: `signal-up` only",
  [CREATE_CONTRACT_PATHS.proposalDocs]:
    "Status = Linear **Triage** (the state, not the label group)\nLabel: `proposal` only",
  [CREATE_CONTRACT_PATHS.issueTracker]:
    "`/signal-up` | New issue in Linear **Triage** with `signal-up` only. Never Backlog.",
  [CREATE_CONTRACT_PATHS.harnessDocs]:
    "Out-of-scope bugs/debt: new Linear issue in **Triage** (the state), label `signal-up` only.",
  [CREATE_CONTRACT_PATHS.agentsMd]:
    "Out-of-scope bugs/debt: new Linear issue in **Triage** (the state), label `signal-up` only.",
  [CREATE_CONTRACT_PATHS.contextMd]:
    "Out-of-scope bug or debt, filed as a new Linear **Triage** issue.",
  [CREATE_CONTRACT_PATHS.readme]:
    "The PI worker (Compose + `gh` + Linear CLI) is the runtime. Cursor Cloud Agents are not factory dispatch.",
  [CREATE_CONTRACT_PATHS.workflow]:
    "4. It is not labelled `signal-up`\n\nNever claim from Linear **Triage** or **Duplicate**.",
  [CREATE_CONTRACT_PATHS.orchestration]:
    "Planner still never claims Triage and never claims `signal-up`.",
  [CREATE_CONTRACT_PATHS.ciWorkflow]:
    "run: node --test scripts/tests/check-signal-up-create-contract.test.mjs",
};

test("good create-contract fixtures have no leftover Backlog violations", () => {
  assert.deepEqual(leftoverCreateViolations(GOOD_FILES), []);
});

test("fails when signal-up rules file leftovers into Backlog", () => {
  const files = { ...GOOD_FILES };
  files[CREATE_CONTRACT_PATHS.signalUpRules] =
    "Create a Linear issue: status `Backlog`, label `signal-up` only.";
  const missing = leftoverCreateViolations(files);
  assert.ok(missing.some((item) => item.includes("Backlog")));
});

test("fails when proposal docs create with dispatch.state", () => {
  const files = { ...GOOD_FILES };
  files[CREATE_CONTRACT_PATHS.proposalDocs] = "Status = `dispatch.state`\nLabel: `proposal` only";
  const missing = leftoverCreateViolations(files);
  assert.ok(missing.some((item) => item.includes("dispatch.state")));
});

test("fails when scope-signal-up pairs signal-up with needs-triage", () => {
  const files = { ...GOOD_FILES };
  files[CREATE_CONTRACT_PATHS.scopeRule] =
    "new `Triage` issue, labels `signal-up` + `needs-triage`";
  const missing = leftoverCreateViolations(files);
  assert.ok(missing.some((item) => item.includes("needs-triage")));
});

test("fails when README treats Cloud Agents as execute/dispatch", () => {
  const files = { ...GOOD_FILES };
  files[CREATE_CONTRACT_PATHS.readme] =
    "Linear is the board. Cursor Cloud Agents execute. The PI worker (Compose + `gh` + Linear CLI).";
  const missing = leftoverCreateViolations(files);
  assert.ok(missing.some((item) => item.includes("Cloud Agents")));
});

test("fails when the required test job omits the create-contract check", () => {
  const files = { ...GOOD_FILES };
  files[CREATE_CONTRACT_PATHS.ciWorkflow] = "run: pnpm test";
  const missing = leftoverCreateViolations(files);
  assert.ok(missing.some((item) => item.includes("check-signal-up-create-contract")));
});

test("repo create-contract files must not file leftovers into Backlog", () => {
  assert.deepEqual(leftoverCreateViolations(readCreateContractFiles()), []);
});
