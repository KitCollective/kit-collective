import assert from "node:assert/strict";
import { test } from "node:test";
import { selectBefore } from "../e2e/before.mjs";

const passed = (sha) => ({ sha, lane: "development", status: "passed" });

test("before is the merge base when it has a passed development run", () => {
  const before = selectBefore({
    ancestors: ["c3", "c2", "c1"],
    runs: [passed("c3"), passed("c1")],
  });
  assert.equal(before, "c3");
});

test("before walks back to the latest passed development run before the merge base", () => {
  const before = selectBefore({
    ancestors: ["c3", "c2", "c1"],
    runs: [passed("c1"), passed("c2")],
  });
  assert.equal(before, "c2");
});

test("a failed run, a PR run or a run after the merge base is never before", () => {
  const before = selectBefore({
    ancestors: ["c3", "c2", "c1"],
    runs: [
      { sha: "c3", lane: "development", status: "failed" },
      { sha: "c2", lane: "pr", status: "passed" },
      passed("c9"),
      passed("c1"),
    ],
  });
  assert.equal(before, "c1");
});

test("no passed development run at or before the merge base gives null", () => {
  assert.equal(selectBefore({ ancestors: ["c3"], runs: [passed("c9")] }), null);
});
