import assert from "node:assert/strict";
import { test } from "node:test";

import { issueOfBranch, planReap } from "../lib/reap-environments.mjs";

const env = (id, branchName, extra = {}) => ({
  id,
  branchName,
  hostId: "host_runs",
  environmentProviderId: "git-worktree",
  ...extra,
});

test("the issue is the one the worktree branch names", () => {
  assert.equal(issueOfBranch("bb/kit-290-thr_eu4c3pbazx"), "KIT-290");
  assert.equal(issueOfBranch("bb/kit-290"), "KIT-290");
  assert.equal(issueOfBranch("bb/reviewer-kit-295-thr_t8"), null);
  assert.equal(issueOfBranch("kit-287-resume"), null);
  assert.equal(issueOfBranch(null), null);
});

test("only worktrees of finished issues on the runs machine are reaped", () => {
  const states = {
    "KIT-1": "Done",
    "KIT-2": "Canceled",
    "KIT-3": "Approval",
    "KIT-4": "In Progress",
  };
  const plan = planReap(
    [
      env("env_done", "bb/kit-1-thr_a"),
      env("env_canceled", "bb/kit-2-thr_b"),
      env("env_waiting", "bb/kit-3-thr_c"),
      env("env_running", "bb/kit-4-thr_d"),
      env("env_dispatch", "bb/kit-1-thr_e"),
      env("env_noissue", "development"),
      env("env_mac", "bb/kit-1-thr_f", { hostId: "host_mac" }),
      env("env_checkout", "bb/kit-1-thr_g", { environmentProviderId: "project-checkout" }),
    ],
    { machine: "host_runs", keep: ["env_dispatch"], stateOf: (issue) => states[issue] ?? null },
  );
  assert.deepEqual(
    plan.reap.map((r) => r.id),
    ["env_done", "env_canceled"],
  );
  assert.deepEqual(
    plan.keep.map((k) => k.id),
    ["env_waiting", "env_running", "env_dispatch", "env_noissue"],
  );
});

test("an issue whose state cannot be read is kept", () => {
  const plan = planReap([env("env_x", "bb/kit-9-thr_a")], {
    machine: "host_runs",
    keep: [],
    stateOf: () => null,
  });
  assert.equal(plan.reap.length, 0);
});
