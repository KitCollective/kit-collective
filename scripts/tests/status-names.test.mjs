import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import * as landPolicy from "../lib/land-policy.mjs";

const config = JSON.parse(readFileSync(new URL("../../factory.config.json", import.meta.url)));
const example = JSON.parse(
  readFileSync(new URL("../../factory.config.example.json", import.meta.url)),
);
const names = new Set(config.states.map((state) => state.name));
// Linear built-ins that factory.config.json does not list.
const LINEAR_BUILT_IN = new Set(["Triage", "Duplicate"]);
const known = (name) => names.has(name) || LINEAR_BUILT_IN.has(name);

test("status names used in code exist in factory.config.json states", () => {
  const used = {
    "dispatch.state": config.dispatch.state,
    MERGE_PERMISSION_STATUS: landPolicy.MERGE_PERMISSION_STATUS,
    POST_MERGE_STATUS: landPolicy.POST_MERGE_STATUS,
    MERGED_STATUS: landPolicy.MERGED_STATUS,
    MERGE_FAILURE_STATUS: landPolicy.MERGE_FAILURE_STATUS,
  };
  for (const [where, name] of Object.entries(used)) {
    assert.ok(known(name), `${where} = "${name}" is not in factory.config.json states`);
  }
  const gates = readFileSync(new URL("../lib/gates.mjs", import.meta.url), "utf8");
  const spelled = gates.match(/\[("[^"\]]+"(?:, "[^"\]]+")*)\]\.includes\(linear\.state\)/g) ?? [];
  assert.ok(spelled.length >= 2, "expected the sessionCheck state lists in gates.mjs");
  for (const list of spelled) {
    for (const [, name] of list.matchAll(/"([^"]+)"/g)) {
      assert.ok(known(name), `gates.mjs spells "${name}", not in factory.config.json states`);
    }
  }
});

test("the status model: dispatch is To-do, and every state alias points at a listed state", () => {
  for (const cfg of [config, example]) {
    assert.equal(cfg.dispatch.state, "To-do");
    const listed = new Set(cfg.states.map((state) => state.name));
    for (const name of ["To-do", "In Progress", "Approval", "Merging", "Post-Merge", "Done"]) {
      assert.ok(listed.has(name), `states must list ${name}`);
    }
    for (const stale of ["Implementing", "Ready for merge"]) {
      assert.ok(!listed.has(stale), `states must not list ${stale}`);
    }
    for (const target of Object.values(cfg.stateAliases)) {
      assert.ok(listed.has(target), `stateAliases target "${target}" is not a listed state`);
    }
  }
});
