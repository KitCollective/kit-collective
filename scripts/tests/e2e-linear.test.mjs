import assert from "node:assert/strict";
import { test } from "node:test";
import { issueIdentifier } from "../e2e/linear.mjs";

test("the issue comes from the PR title, whatever its case", () => {
  assert.equal(issueIdentifier("KIT-267: Maestro review", "KIT"), "KIT-267");
  assert.equal(issueIdentifier("claude/kit-12-something", "KIT"), "KIT-12");
});

test("a title without an issue gives null", () => {
  assert.equal(issueIdentifier("Fix the sprocket-267 thing", "KIT"), null);
  assert.equal(issueIdentifier("TOOLKIT-9", "KIT"), null);
});
