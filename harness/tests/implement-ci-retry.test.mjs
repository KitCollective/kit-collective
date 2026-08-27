/**
 * KIT-71 — Implement stays Implementing until required GitHub checks are green.
 * Fake `gh` + Linear at the implement-exit / job-queue seam. Do not spawn a model.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { LINEAR_CLI_PIN } from "../boot-env.mjs";
import { completeChecker } from "../checker-exit.mjs";
import {
  completeImplementAdw,
  IMPLEMENTING,
  IN_REVIEW,
  WORKPAD_HEADING,
} from "../implement-exit.mjs";
import { createSerialQueue, IMPLEMENT_CI_RETRY_CAP } from "../job-queue.mjs";
import { createPiJobRunner, implementPrompt } from "../pi-job.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ADW = "steps:\n  - pr\n  - in-review\nnever:\n  - merge\n";
const SECRET_LOG = [
  "FAIL AssertionError: expected 2 to equal 1",
  "Authorization: Bearer ghp_secret_token",
  "GH_TOKEN=ghp_secret_token",
].join("\n");

function validWorkerEnv() {
  return {
    CURSOR_API_KEY: "cursor_test",
    LINEAR_CLI_API_KEY: "lin_cli_test",
    LINEAR_WEBHOOK_SECRET: "secret",
    GH_TOKEN: "ghp_test",
    LINEAR_CLI_VERSION: LINEAR_CLI_PIN.version,
    LINEAR_PI_APP_USER_ID: "pi-app-user-1",
    PI_MODEL: "cursor/composer-2.5",
    PI_MODEL_FAST: "cursor/grok-4.6",
    OPENROUTER_API_KEY: "or_test",
  };
}

function fakeWorktree({ path = "/var/lib/kit-pi/worktrees/KIT-99", branch = "kit-99" } = {}) {
  const calls = [];
  return {
    calls,
    async checkout(input) {
      calls.push(input);
      return { path, branch, lane: "development" };
    },
  };
}

function fakeGh({
  mergeable = "MERGEABLE",
  checks = [{ name: "test", conclusion: "success", isRequired: true }],
} = {}) {
  const calls = [];
  let opened = false;
  return {
    calls,
    async rebase(input) {
      calls.push(["rebase", input]);
    },
    async viewPr(input) {
      calls.push(["viewPr", input]);
      if (!opened) {
        return { url: undefined, mergeable: "UNKNOWN", checks: [] };
      }
      return {
        url: "https://github.com/KitCollective/kit-collective/pull/71",
        mergeable,
        checks,
      };
    },
    async createPr(input) {
      calls.push(["createPr", input]);
      opened = true;
      return {
        url: "https://github.com/KitCollective/kit-collective/pull/71",
        mergeable,
        checks,
      };
    },
    async fetchCheckLog(input) {
      calls.push(["fetchCheckLog", input]);
      const match = checks.find((check) => check.name === input.name);
      return typeof match?.log === "string" ? match.log : "";
    },
    merge() {
      calls.push(["merge"]);
      throw new Error("implement never merges");
    },
  };
}

function fakeLinear() {
  const calls = [];
  const comments = [
    {
      id: "c1",
      body: `${WORKPAD_HEADING}\n\n### Review feedback\n\n- (none)\n`,
    },
  ];
  return {
    calls,
    comments,
    async listComments() {
      calls.push(["listComments"]);
      return comments;
    },
    async updateWorkpad(input) {
      calls.push(["updateWorkpad", input]);
      const current = comments[0];
      if (current) {
        current.body = input.body;
        return { id: current.id, created: false };
      }
      comments.push({ id: "c-new", body: input.body });
      return { id: "c-new", created: true };
    },
    async setStatus(input) {
      calls.push(["setStatus", input]);
    },
    async getIssue() {
      return { status: "In Review", attachments: [] };
    },
  };
}

function implementRunner({
  gh,
  linear,
  worktree,
  spawned,
  now,
  sleep,
  waitTimeoutMs,
  waitIntervalMs,
}) {
  return createPiJobRunner({
    env: validWorkerEnv(),
    workspace: ROOT,
    worktree: worktree ?? fakeWorktree(),
    gh,
    linear,
    typecheckTouched: async (input) => {
      gh.calls.push(["typecheckTouched", input]);
    },
    spawnProcess(command, args, options) {
      spawned.push({ command, args, options });
      return Promise.resolve({ status: 0 });
    },
    now,
    sleep,
    waitTimeoutMs,
    waitIntervalMs,
  });
}

function redChecks() {
  return [
    {
      name: "test",
      conclusion: "failure",
      isRequired: true,
      log: SECRET_LOG,
    },
  ];
}

test("red required checks stay Implementing, write workpad failure, do not move to In Review", async () => {
  const gh = fakeGh({ mergeable: "MERGEABLE", checks: redChecks() });
  const linear = fakeLinear();
  const result = await completeImplementAdw({
    job: { identifier: "KIT-99", issueId: "issue-1", adwFile: ".pi/adw/feature.yaml" },
    checkout: { path: "/var/lib/kit-pi/worktrees/KIT-99", branch: "kit-99" },
    gh,
    linear,
    typecheckTouched: async () => undefined,
    adwText: ADW,
    sleep: async () => undefined,
    waitIntervalMs: 0,
    waitTimeoutMs: 60_000,
  });

  assert.equal(result.status, IMPLEMENTING);
  assert.equal(result.ciRetry, true);
  assert.equal(
    linear.calls.some((call) => call[0] === "setStatus" && call[1].status === IN_REVIEW),
    false,
  );
  assert.equal(
    linear.calls.some((call) => call[0] === "setStatus"),
    false,
  );
  const workpad = linear.calls.find((call) => call[0] === "updateWorkpad")[1];
  assert.equal(workpad.commentId, "c1");
  assert.match(workpad.body, /### Review feedback/);
  assert.match(workpad.body, /required check `test` failed/);
  assert.match(workpad.body, /AssertionError/);
  assert.equal(workpad.body.includes("ghp_secret_token"), false);
  assert.equal(workpad.body.includes("Bearer ghp_secret_token"), false);
  assert.equal(
    gh.calls.some((call) => call[0] === "merge"),
    false,
  );
});

test("green required checks and MERGEABLE move to In Review once", async () => {
  const gh = fakeGh();
  const linear = fakeLinear();
  const result = await completeImplementAdw({
    job: { identifier: "KIT-99", issueId: "issue-1", adwFile: ".pi/adw/feature.yaml" },
    checkout: { path: "/var/lib/kit-pi/worktrees/KIT-99", branch: "kit-99" },
    gh,
    linear,
    typecheckTouched: async () => undefined,
    adwText: ADW,
    sleep: async () => undefined,
    waitIntervalMs: 0,
    waitTimeoutMs: 60_000,
  });

  assert.equal(result.status, IN_REVIEW);
  assert.equal(result.ciRetry, false);
  const statusCalls = linear.calls.filter((call) => call[0] === "setStatus");
  assert.equal(statusCalls.length, 1);
  assert.deepEqual(statusCalls[0][1], { issueId: "issue-1", status: IN_REVIEW });
});

test("timed-out required checks stay Implementing and write workpad failure", async () => {
  const gh = fakeGh({
    mergeable: "MERGEABLE",
    checks: [{ name: "test", conclusion: "", status: "IN_PROGRESS", isRequired: true }],
  });
  const linear = fakeLinear();
  const result = await completeImplementAdw({
    job: { identifier: "KIT-99", issueId: "issue-1", adwFile: ".pi/adw/feature.yaml" },
    checkout: { path: "/var/lib/kit-pi/worktrees/KIT-99", branch: "kit-99" },
    gh,
    linear,
    typecheckTouched: async () => undefined,
    adwText: ADW,
    now: () => 0,
    sleep: async () => undefined,
    waitIntervalMs: 0,
    waitTimeoutMs: 0,
  });

  assert.equal(result.status, IMPLEMENTING);
  assert.equal(result.ciRetry, true);
  assert.equal(
    linear.calls.some((call) => call[0] === "setStatus"),
    false,
  );
  const workpad = linear.calls.find((call) => call[0] === "updateWorkpad")[1];
  assert.match(workpad.body, /timed out waiting for required GitHub checks/);
});

test("job-queue re-enqueues the same implement job on red CI and never calls checker", async () => {
  const gh = fakeGh({ mergeable: "MERGEABLE", checks: redChecks() });
  const linear = fakeLinear();
  const worktree = fakeWorktree();
  const spawned = [];
  const runner = implementRunner({ gh, linear, worktree, spawned });
  const runs = [];
  const queue = createSerialQueue({
    async run(job) {
      runs.push({ ...job });
      return runner.run(job);
    },
  });

  await assert.rejects(
    () =>
      queue.enqueue({
        role: "implement",
        identifier: "KIT-99",
        issueId: "issue-1",
        adwFile: ".pi/adw/feature.yaml",
      }),
    /implement CI retry cap hit/,
  );

  assert.equal(runs.length, IMPLEMENT_CI_RETRY_CAP);
  assert.equal(
    runs.every(
      (job) =>
        job.role === "implement" &&
        job.identifier === "KIT-99" &&
        job.issueId === "issue-1" &&
        job.adwFile === ".pi/adw/feature.yaml",
    ),
    true,
  );
  assert.equal(worktree.calls.length, IMPLEMENT_CI_RETRY_CAP);
  assert.equal(spawned.length, IMPLEMENT_CI_RETRY_CAP);
  assert.equal(
    spawned.every((spawn) =>
      spawn.args.some((arg) => String(arg).endsWith(".pi/roles/implement.md")),
    ),
    true,
  );
  assert.equal(
    spawned.some((spawn) =>
      spawn.args.some((arg) => String(arg).endsWith(".pi/roles/factory-checker.md")),
    ),
    false,
  );
  assert.equal(
    linear.calls.some((call) => call[0] === "setStatus" && call[1].status === IN_REVIEW),
    false,
  );
  assert.match(linear.comments[0].body, /required check `test` failed/);
});

test("job-queue moves to In Review once when required checks are green", async () => {
  const gh = fakeGh();
  const linear = fakeLinear();
  const spawned = [];
  const runner = implementRunner({ gh, linear, spawned });
  const runs = [];
  const queue = createSerialQueue({
    async run(job) {
      runs.push(job.role);
      return runner.run(job);
    },
  });

  const result = await queue.enqueue({
    role: "implement",
    identifier: "KIT-99",
    issueId: "issue-1",
    adwFile: ".pi/adw/feature.yaml",
  });

  assert.equal(runs.length, 1);
  assert.equal(spawned.length, 1);
  assert.equal(result.status, IN_REVIEW);
  assert.equal(result.ciRetry, false);
  const statusCalls = linear.calls.filter((call) => call[0] === "setStatus");
  assert.equal(statusCalls.length, 1);
  assert.equal(statusCalls[0][1].status, IN_REVIEW);
});

test("job-queue fail-closes when the implement CI retry cap is already exhausted", async () => {
  const runs = [];
  const queue = createSerialQueue({
    async run(job) {
      runs.push(job.ciRetryAttempt ?? 1);
      return { ...job, ciRetry: true, status: IMPLEMENTING };
    },
  });

  await assert.rejects(
    () =>
      queue.enqueue({
        role: "implement",
        identifier: "KIT-99",
        issueId: "issue-1",
        adwFile: ".pi/adw/feature.yaml",
        ciRetryAttempt: IMPLEMENT_CI_RETRY_CAP,
      }),
    /implement CI retry cap hit/,
  );
  assert.deepEqual(runs, [IMPLEMENT_CI_RETRY_CAP]);
});

test("implement prompt and role/ADW text leave In Review to the harness", () => {
  const prompt = implementPrompt("implement", "KIT-99", ".pi/adw/feature.yaml");
  assert.equal(/move the issue to In Review/i.test(prompt), false);
  assert.match(prompt, /harness/i);
  assert.match(prompt, /Never merge/);
  assert.match(prompt, /Never spawn factory-checker/);

  const role = readFileSync(join(ROOT, ".pi/roles/implement.md"), "utf8");
  assert.equal(/move the issue to In Review/i.test(role), false);
  assert.match(role, /harness/i);

  for (const file of [".pi/adw/feature.yaml", ".pi/adw/bug.yaml", ".pi/adw/improvement.yaml"]) {
    const text = readFileSync(join(ROOT, file), "utf8");
    assert.match(text, /^ {2}- in-review$/m, file);
    assert.equal(/move to In Review/i.test(text), false, file);
    assert.match(text, /harness/i, file);
  }
});

test("checker still wakes only on In Review and fail-closes with Review feedback, not CI retry", async () => {
  const linear = {
    calls: [],
    async getIssue() {
      return { status: IMPLEMENTING, attachments: [] };
    },
    async listComments() {
      return [];
    },
    async updateWorkpad(input) {
      this.calls.push(["updateWorkpad", input]);
    },
    async setStatus(input) {
      this.calls.push(["setStatus", input]);
    },
  };
  const skipped = await completeChecker({
    job: { issueId: "issue-1", identifier: "KIT-99" },
    linear,
    gh: {
      async viewPr() {
        throw new Error("checker must not view a PR when status is Implementing");
      },
    },
  });
  assert.equal(skipped.skipped, true);
  assert.equal(linear.calls.length, 0);

  const reviewLinear = fakeLinear();
  reviewLinear.getIssue = async () => ({
    status: IN_REVIEW,
    attachments: [{ url: "https://github.com/KitCollective/kit-collective/pull/71" }],
  });
  reviewLinear.comments[0].body = `${WORKPAD_HEADING}\n\n### Review feedback\n\n- Spec: missing AC evidence\n`;
  const gh = {
    async viewPr() {
      return {
        mergeable: "MERGEABLE",
        checks: [{ name: "test", conclusion: "success", isRequired: true }],
      };
    },
    merge() {
      throw new Error("checker never merges");
    },
  };
  const failed = await completeChecker({
    job: { issueId: "issue-1", identifier: "KIT-99" },
    linear: reviewLinear,
    gh,
  });
  assert.equal(failed.passed, false);
  assert.equal(failed.nextStatus, IMPLEMENTING);
  assert.equal(failed.ciRetry, undefined);
  assert.deepEqual(reviewLinear.calls.find((call) => call[0] === "setStatus")[1], {
    issueId: "issue-1",
    status: IMPLEMENTING,
  });
  assert.match(reviewLinear.comments[0].body, /Spec: missing AC evidence/);
});
