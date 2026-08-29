import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  blockerResolvesDependents,
  landAtMergeGate,
  setupRecordsMerging,
  statusTransitionResolvesBlockedBy,
} from "../lib/land-policy.mjs";

const STATES = [
  { name: "Backlog", type: "backlog" },
  { name: "Parked", type: "unstarted" },
  { name: "Implementing", type: "started" },
  { name: "In Review", type: "started" },
  { name: "Ready for merge", type: "started" },
  { name: "Merging", type: "started" },
  { name: "Done", type: "completed" },
  { name: "Canceled", type: "canceled" },
];

const LANES = {
  integration: "development",
  staging: "staging",
  production: "production",
};

function greenPr(overrides = {}) {
  return {
    number: 99,
    mergeable: "MERGEABLE",
    baseRef: "development",
    requiredChecks: [{ name: "test", conclusion: "success" }],
    ...overrides,
  };
}

function fakeGh({ ok = true, sha = "abc1234", error = "merge failed" } = {}) {
  const calls = [];
  return {
    calls,
    merge(args) {
      calls.push(args);
      return ok ? { ok: true, sha } : { ok: false, error };
    },
  };
}

test("setupRecordsMerging is true only when Merging has a real id", () => {
  assert.equal(
    setupRecordsMerging({
      states: { Merging: { id: "234f4755-fdd9-499b-b9b7-4812671a5b38", type: "started" } },
    }),
    true,
  );
  assert.equal(
    setupRecordsMerging({ states: { Merging: { id: "dry-run", type: "started" } } }),
    false,
  );
  assert.equal(setupRecordsMerging({ states: { Done: { id: "x", type: "completed" } } }), false);
  assert.equal(setupRecordsMerging({}), false);
});

test("linear.setup.json records the Merging workflow state id", () => {
  const setup = JSON.parse(readFileSync("linear.setup.json", "utf8"));
  assert.equal(setupRecordsMerging(setup), true);
  assert.equal(setup.states.Merging.type, "started");
});

test("factory.config.json lists Merging as started so bootstrap can record its id", () => {
  const config = JSON.parse(readFileSync("factory.config.json", "utf8"));
  const merging = config.states.find((state) => state.name === "Merging");
  assert.ok(merging, "factory.config.json states must include Merging");
  assert.equal(merging.type, "started");
});

test("Merging + MERGEABLE + green required checks allows a non-interactive merge commit without --force", () => {
  const gh = fakeGh();
  const result = landAtMergeGate({
    issueStatus: "Merging",
    pr: greenPr(),
    lanes: LANES,
    gh,
  });

  assert.equal(result.merged, true);
  assert.equal(result.nextStatus, "Done");
  assert.equal(result.ghCalled, true);
  assert.equal(gh.calls.length, 1);
  assert.deepEqual(gh.calls[0], ["pr", "merge", "99", "--merge"]);
  assert.ok(!gh.calls[0].includes("--force"));
  assert.ok(!gh.calls[0].includes("--squash"));
  assert.ok(!gh.calls[0].includes("--rebase"));
  assert.ok(!result.ghArgs.includes("--force"));
});

test("land treats Done as merged and refuses to merge again", () => {
  const gh = fakeGh();
  const result = landAtMergeGate({
    issueStatus: "Done",
    pr: greenPr(),
    lanes: LANES,
    gh,
  });

  assert.equal(result.merged, false);
  assert.equal(result.nextStatus, "Done");
  assert.equal(result.ghCalled, false);
  assert.equal(gh.calls.length, 0);
});

const refuseStatuses = [
  "Backlog",
  "Parked",
  "Implementing",
  "In Review",
  "Ready for merge",
  "Canceled",
];

for (const status of refuseStatuses) {
  test(`land refuses merge from ${status}`, () => {
    const gh = fakeGh();
    const result = landAtMergeGate({
      issueStatus: status,
      pr: greenPr(),
      lanes: LANES,
      gh,
    });

    assert.equal(result.merged, false);
    assert.equal(result.nextStatus, status);
    assert.equal(result.ghCalled, false);
    assert.equal(gh.calls.length, 0);
    assert.notEqual(result.nextStatus, "Done");
  });
}

test("land refuses merge when the PR is not MERGEABLE", () => {
  const gh = fakeGh();
  const result = landAtMergeGate({
    issueStatus: "Merging",
    pr: greenPr({ mergeable: "CONFLICTING" }),
    lanes: LANES,
    gh,
  });

  assert.equal(result.merged, false);
  assert.equal(result.ghCalled, false);
  assert.notEqual(result.nextStatus, "Done");
});

test("land refuses merge when a required check is red", () => {
  const gh = fakeGh();
  const result = landAtMergeGate({
    issueStatus: "Merging",
    pr: greenPr({
      requiredChecks: [{ name: "test", conclusion: "failure" }],
    }),
    lanes: LANES,
    gh,
  });

  assert.equal(result.merged, false);
  assert.equal(result.ghCalled, false);
  assert.notEqual(result.nextStatus, "Done");
});

test("land refuses merge onto staging or production", () => {
  for (const baseRef of ["staging", "production"]) {
    const gh = fakeGh();
    const result = landAtMergeGate({
      issueStatus: "Merging",
      pr: greenPr({ baseRef }),
      lanes: LANES,
      gh,
    });

    assert.equal(result.merged, false);
    assert.equal(result.ghCalled, false);
    assert.equal(gh.calls.length, 0);
  }
});

test("merge failure moves to Implementing and never Done", () => {
  const gh = fakeGh({ ok: false, error: "protected branch hook declined" });
  const result = landAtMergeGate({
    issueStatus: "Merging",
    pr: greenPr(),
    lanes: LANES,
    gh,
  });

  assert.equal(result.merged, false);
  assert.equal(result.ghCalled, true);
  assert.equal(result.nextStatus, "Implementing");
  assert.notEqual(result.nextStatus, "Done");
  assert.ok(!result.ghArgs.includes("--force"));
});

test("dependents stay blocked until the blocker is Done or Canceled", () => {
  assert.equal(blockerResolvesDependents("Merging", STATES), false);
  assert.equal(blockerResolvesDependents("Ready for merge", STATES), false);
  assert.equal(blockerResolvesDependents("Implementing", STATES), false);
  assert.equal(blockerResolvesDependents("Done", STATES), true);
  assert.equal(blockerResolvesDependents("Canceled", STATES), true);
});

test("Ready for merge → Merging does not resolve blockedBy", () => {
  assert.equal(
    statusTransitionResolvesBlockedBy({
      from: "Ready for merge",
      to: "Merging",
      states: STATES,
    }),
    false,
  );
  assert.equal(
    statusTransitionResolvesBlockedBy({
      from: "Merging",
      to: "Done",
      states: STATES,
    }),
    true,
  );
});
