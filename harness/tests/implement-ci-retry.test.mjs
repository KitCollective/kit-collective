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
import { selectImplementContext } from "../implement-context.mjs";
import {
  completeImplementAdw,
  IMPLEMENTING,
  IN_REVIEW,
  WORKPAD_HEADING,
} from "../implement-exit.mjs";
import { createSerialQueue, IMPLEMENT_CI_RETRY_CAP, isCheapImplementRetry } from "../job-queue.mjs";
import { createPiJobRunner, implementPrompt } from "../pi-job.mjs";
import { commentsHoldImplementRetryCap, implementRetryCapComment } from "../role-comments.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ADW = "steps:\n  - pr\n  - in-review\nnever:\n  - merge\n";
const SECRET_LOG = [
  "FAIL AssertionError: expected 2 to equal 1",
  "Authorization: Bearer ghp_secret_token",
  "GH_TOKEN=ghp_secret_token",
].join("\n");

/** KIT-116 class: a handful of workpad findings, not only the GitHub Slop thread. */
const KIT116_REVIEW_FEEDBACK = [
  "- Spec: Collection tab missing badge count",
  "- Standards: unused Badge export in apps/mobile/src/components/badge.tsx",
  "- Slop: unused import in apps/mobile/src/components/badge.tsx",
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

function promptFromSpawn(spawned) {
  const dash = spawned.args.indexOf("--");
  return dash >= 0 ? String(spawned.args[dash + 1] ?? "") : "";
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
    async commentIssue(input) {
      calls.push(["commentIssue", input]);
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
  const firstPrompt = promptFromSpawn(spawned[0]);
  assert.match(firstPrompt, /Do not Skip Scout/i);
  assert.match(firstPrompt, /Do not Skip helpers/i);
  assert.equal(/\bSkip Scout\. Skip helpers\b/i.test(firstPrompt), false);
  for (const spawn of spawned.slice(1)) {
    const prompt = promptFromSpawn(spawn);
    assert.match(prompt, /Skip Scout/i);
    assert.match(prompt, /Skip helpers/i);
    assert.match(prompt, /format vs Zod vs unique-email/i);
    assert.match(prompt, /AssertionError/);
    assert.match(prompt, /### Review feedback/);
  }
  const capComment = linear.calls.find((call) => call[0] === "commentIssue");
  assert.ok(capComment, "retry cap must post a Linear comment");
  assert.match(capComment[1].body, /implement retry cap/i);
  assert.match(capComment[1].body, /Linear Agent left empty/i);
  assert.equal(/Cursor Cloud Agent/i.test(capComment[1].body), true);
  assert.equal(
    spawned.every((spawn) =>
      spawn.args.some(
        (arg) =>
          String(arg).endsWith(".pi/roles/implement.md") ||
          String(arg).includes(".pi/generated/implement-context.md"),
      ),
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

test("job-queue re-runs implement on write-scope retry until In Review", async () => {
  const runs = [];
  const queue = createSerialQueue({
    async run(job) {
      runs.push(job.writeScopeRetryAttempt ?? 1);
      if ((job.writeScopeRetryAttempt ?? 1) < 2) {
        return { status: IMPLEMENTING, writeScopeRetry: true, ciRetry: false };
      }
      return { status: IN_REVIEW, writeScopeRetry: false, ciRetry: false };
    },
  });

  const result = await queue.enqueue({
    role: "implement",
    identifier: "KIT-119",
    issueId: "issue-119",
    adwFile: ".pi/adw/feature.yaml",
  });

  assert.deepEqual(runs, [1, 2]);
  assert.equal(result.status, IN_REVIEW);
  assert.equal(result.writeScopeRetry, false);
});

test("job-queue fail-closes when the implement write-scope retry cap is already exhausted", async () => {
  const runs = [];
  const queue = createSerialQueue({
    async run(job) {
      runs.push(job.writeScopeRetryAttempt ?? 1);
      return { ...job, writeScopeRetry: true, ciRetry: false, status: IMPLEMENTING };
    },
  });

  await assert.rejects(
    () =>
      queue.enqueue({
        role: "implement",
        identifier: "KIT-119",
        issueId: "issue-119",
        adwFile: ".pi/adw/feature.yaml",
        writeScopeRetryAttempt: IMPLEMENT_CI_RETRY_CAP,
      }),
    /implement write-scope retry cap hit/,
  );
  assert.deepEqual(runs, [IMPLEMENT_CI_RETRY_CAP]);
});

test("implement prompt and role/ADW text leave In Review to the harness", () => {
  const mobileCtx = selectImplementContext({
    writeScope: "apps/mobile/**",
    labels: ["mobile"],
    cheapRetry: false,
  });
  const prompt = implementPrompt("implement", "KIT-99", ".pi/adw/feature.yaml", {
    writeScope: "apps/mobile/**",
    implementContext: mobileCtx,
  });
  assert.equal(/move the issue to In Review/i.test(prompt), false);
  assert.match(prompt, /harness/i);
  assert.match(prompt, /Never merge/);
  assert.match(prompt, /Never spawn factory-checker/);
  assert.match(prompt, /First run/i);
  assert.match(prompt, /Spawn Scout/i);
  assert.match(prompt, /Required helpers: expo, ui-ux/);
  assert.match(prompt, /TDD:/i);
  assert.match(prompt, /not `pnpm test`/i);
  assert.match(prompt, /Do not Skip Scout/i);
  assert.match(prompt, /Do not Skip helpers/i);
  assert.equal(/\bSkip Scout\. Skip helpers\b/i.test(prompt), false);

  const cheap = implementPrompt("implement", "KIT-99", ".pi/adw/feature.yaml", {
    cheapRetry: true,
    reviewFeedback: "- CI: required check `test` failed\n  AssertionError: expected 2 to equal 1",
  });
  assert.match(cheap, /Skip Scout/i);
  assert.match(cheap, /Skip helpers/i);
  assert.match(cheap, /format vs Zod vs unique-email/i);
  assert.match(cheap, /AssertionError/);
  assert.match(cheap, /### Review feedback/);
  assert.equal(/move the issue to In Review/i.test(cheap), false);

  const checkerCtx = selectImplementContext({
    writeScope: "apps/mobile/**",
    labels: ["mobile"],
    cheapRetry: false,
  });
  const checkerFail = implementPrompt("implement", "KIT-116", ".pi/adw/feature.yaml", {
    reviewFeedback: KIT116_REVIEW_FEEDBACK,
    writeScope: "apps/mobile/**",
    implementContext: checkerCtx,
  });
  assert.match(checkerFail, /### Review feedback/);
  assert.match(checkerFail, /Collection tab missing badge count/);
  assert.match(checkerFail, /unused Badge export/);
  assert.match(checkerFail, /unused import/);
  assert.match(checkerFail, /every workpad axis|every axis/i);
  assert.match(checkerFail, /Spec/);
  assert.match(checkerFail, /Standards/);
  assert.match(checkerFail, /subset/i);
  assert.match(checkerFail, /\[factory-checker\/slop\]/);
  assert.match(checkerFail, /Do not Skip Scout/i);
  assert.match(checkerFail, /Do not Skip helpers/i);
  assert.match(checkerFail, /Required helpers: expo, ui-ux/);
  assert.equal(/Skip Scout\. Skip helpers/i.test(checkerFail), false);
  assert.equal(isCheapImplementRetry({ role: "implement" }), false);
  assert.equal(isCheapImplementRetry({ role: "implement", ciRetryAttempt: 2 }), true);
  assert.equal(isCheapImplementRetry({ role: "implement", writeScopeRetryAttempt: 2 }), true);
  assert.equal(isCheapImplementRetry({ role: "implement", formatRetryAttempt: 2 }), true);

  const role = readFileSync(join(ROOT, ".pi/roles/implement.md"), "utf8");
  assert.equal(/move the issue to In Review/i.test(role), false);
  assert.match(role, /harness/i);
  assert.match(role, /selectImplementContext/);

  for (const file of [".pi/adw/feature.yaml", ".pi/adw/bug.yaml", ".pi/adw/improvement.yaml"]) {
    const text = readFileSync(join(ROOT, file), "utf8");
    assert.match(text, /^ {2}- in-review$/m, file);
    assert.equal(/move to In Review/i.test(text), false, file);
    assert.match(text, /harness/i, file);
  }
});

test("checker-fail resume inlines workpad findings and does not Skip Scout or helpers", async () => {
  const gh = fakeGh();
  const linear = fakeLinear();
  linear.comments[0].body = `${WORKPAD_HEADING}\n\n### Review feedback\n\n${KIT116_REVIEW_FEEDBACK}\n`;
  linear.getIssue = async () => ({
    status: IMPLEMENTING,
    attachments: [],
    description: "write-scope: apps/mobile/**",
    labels: ["mobile"],
  });
  const spawned = [];
  const runner = implementRunner({ gh, linear, spawned });
  await runner.run({
    role: "implement",
    identifier: "KIT-116",
    issueId: "issue-1",
    adwFile: ".pi/adw/feature.yaml",
  });

  assert.equal(spawned.length, 1);
  const prompt = promptFromSpawn(spawned[0]);
  assert.match(prompt, /### Review feedback/);
  assert.match(prompt, /Collection tab missing badge count/);
  assert.match(prompt, /unused Badge export/);
  assert.match(prompt, /unused import/);
  assert.match(prompt, /every workpad axis|every axis/i);
  assert.match(prompt, /subset/i);
  assert.match(prompt, /Do not Skip Scout/i);
  assert.match(prompt, /Do not Skip helpers/i);
  assert.equal(/Skip Scout\. Skip helpers/i.test(prompt), false);
  assert.match(prompt, /Required helpers: expo, ui-ux/);
});

test("implement does not spawn Pi when comments already hold the retry cap", async () => {
  const gh = fakeGh();
  const linear = fakeLinear();
  linear.comments.push({
    id: "c-cap",
    body: implementRetryCapComment("KIT-99"),
  });
  const spawned = [];
  const runner = implementRunner({ gh, linear, spawned });
  const result = await runner.run({
    role: "implement",
    identifier: "KIT-99",
    issueId: "issue-1",
    adwFile: ".pi/adw/feature.yaml",
  });

  assert.equal(spawned.length, 0);
  assert.equal(result.ciRetry, false);
  assert.equal(result.retryCapHold, true);
  assert.equal(result.status, IMPLEMENTING);
  assert.equal(commentsHoldImplementRetryCap(linear.comments), true);
  assert.equal(
    linear.calls.some((call) => call[0] === "setStatus"),
    false,
  );
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

test("merge-fail resume uses dedicated prompt and skips Scout and helpers", async () => {
  const gh = fakeGh();
  const linear = fakeLinear();
  linear.comments[0].body = `${WORKPAD_HEADING}\n\n### Review feedback\n\n- PR is UNKNOWN\n`;
  linear.getIssue = async () => ({
    status: IMPLEMENTING,
    attachments: [],
    description: "write-scope: apps/mobile/**",
    labels: ["mobile"],
  });
  const spawned = [];
  const runner = implementRunner({ gh, linear, spawned });
  await runner.run({
    role: "implement",
    identifier: "KIT-119",
    issueId: "issue-119",
    adwFile: ".pi/adw/feature.yaml",
  });

  assert.equal(spawned.length, 1);
  const prompt = promptFromSpawn(spawned[0]);
  assert.match(prompt, /Merge-fail resume/);
  assert.match(prompt, /Skip Scout/);
  assert.match(prompt, /Skip helpers/);
  assert.match(prompt, /Do not re-implement the feature/);
  assert.equal(/Checker-fail resume/i.test(prompt), false);
  assert.equal(/Required helpers:/i.test(prompt), false);
});

function fakeGhWithOpenPr({
  mergeable = "MERGEABLE",
  checks = [{ name: "test", conclusion: "success", isRequired: true }],
} = {}) {
  const calls = [];
  const pr = {
    url: "https://github.com/KitCollective/kit-collective/pull/119",
    mergeable,
    checks,
  };
  return {
    calls,
    async rebase(input) {
      calls.push(["rebase", input]);
    },
    async viewPr(input) {
      calls.push(["viewPr", input]);
      return pr;
    },
    async findOpenIssuePr() {
      calls.push(["findOpenIssuePr"]);
      return pr;
    },
    async createPr(input) {
      calls.push(["createPr", input]);
      return pr;
    },
    async fetchCheckLog() {
      return "";
    },
    merge() {
      throw new Error("implement never merges");
    },
  };
}

test("merge-fail fast path skips Pi when PR is MERGEABLE and checks are green", async () => {
  const gh = fakeGhWithOpenPr();
  const linear = fakeLinear();
  linear.comments[0].body = `${WORKPAD_HEADING}\n\n### Review feedback\n\n- PR is UNKNOWN\n`;
  linear.getIssue = async () => ({
    status: IMPLEMENTING,
    attachments: [{ url: "https://github.com/KitCollective/kit-collective/pull/119" }],
    description: "",
    labels: ["Feature"],
  });
  const spawned = [];
  const runner = implementRunner({ gh, linear, spawned });
  const result = await runner.run({
    role: "implement",
    identifier: "KIT-119",
    issueId: "issue-119",
    adwFile: ".pi/adw/feature.yaml",
  });

  assert.equal(spawned.length, 0);
  assert.equal(result.mergeFailFastPath, true);
  assert.equal(result.status, IN_REVIEW);
  assert.equal(
    linear.calls.some((call) => call[0] === "setStatus" && call[1].status === IN_REVIEW),
    true,
  );
});
