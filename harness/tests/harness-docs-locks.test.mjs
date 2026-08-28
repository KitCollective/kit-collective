/**
 * KIT-114 ratchet: factory locks stay on empty Linear Agent, role comments,
 * description AC, and Auto-merge without Pi after generate-harness-docs.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("AGENTS.md describes empty Agent, role comments, description AC, Auto-merge without Pi", () => {
  const agents = readFileSync(join(ROOT, "AGENTS.md"), "utf8");
  assert.match(agents, /Linear Agent stays empty/);
  assert.match(agents, /role comment/i);
  assert.match(agents, /description AC/i);
  assert.match(agents, /Auto-merge or Nicklas to Merging/);
  assert.doesNotMatch(agents, /checker → Nicklas to Merging/);
});

test("CONTEXT orchestration Land is Auto-merge or Nicklas", () => {
  const context = readFileSync(join(ROOT, "CONTEXT.md"), "utf8");
  assert.match(context, /after Auto-merge or Nicklas moves the issue to Merging/);
  assert.match(context, /Pi delegate is not a gate/);
});

test("WORKFLOW.md does not skip Implementing without Pi or key Auto-merge on Pi", () => {
  const workflow = readFileSync(join(ROOT, "WORKFLOW.md"), "utf8");
  assert.doesNotMatch(workflow, /Implementing without a Pi delegate is skipped/);
  assert.doesNotMatch(workflow, /Pi stays delegate until Auto-merge/);
  assert.match(workflow, /Empty Linear Agent is the Implementing happy path/);
  assert.match(workflow, /### Description AC rewrites/);
});

test("automations.md locks land success and fail as role comments", () => {
  const automations = readFileSync(join(ROOT, "docs/agents/automations.md"), "utf8");
  assert.match(automations, /fail \+ one role comment\)/);
  assert.match(automations, /one role comment with SHA; merge fail/);
  assert.match(automations, /one role comment with the merge SHA/);
  assert.match(automations, /one role comment with the merge error/);
});

test("ADR-0025 keeps a supersession note and the original Pi-delegate body", () => {
  const adr = readFileSync(join(ROOT, "docs/adr/0025-auto-merge-ready-for-merge.md"), "utf8");
  assert.match(adr, /Superseded \(Pi-delegate ownership\)/);
  assert.match(adr, /ADR-0028/);
  assert.match(adr, /when delegate is Pi/);
});
