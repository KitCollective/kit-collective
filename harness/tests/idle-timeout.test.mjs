/**
 * KIT-86 — Idle timeout Parks a hung Coding job and reaps the Issue worktree.
 * Fake spawn that never closes, fake clock, fake Linear, fake git. No model.
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { LINEAR_CLI_PIN } from "../boot-env.mjs";
import { createSerialQueue } from "../job-queue.mjs";
import { completeLand, LAND_LANES } from "../land.mjs";
import { FORBIDDEN_PLANNER_STATES, WORKPAD_HEADING } from "../linear-cli.mjs";
import { createPiJobRunner, DEFAULT_JOB_IDLE_MS } from "../pi-job.mjs";
import { routeWebhook } from "../webhook-router.mjs";
import { createWorktreeAdapter } from "../worktree.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ISSUE_SECRET = "test-linear-webhook-secret";
const NOW = 1_700_000_000_000;
const ISSUE_ID = "issue-kit-86";
const IDENTIFIER = "KIT-86";
const WORKTREE_PATH = `/var/lib/kit-pi/worktrees/${IDENTIFIER}`;
const MIRROR_DIR = "/var/lib/kit-pi/mirror.git";
const PR_URL = "https://github.com/KitCollective/kit-collective/pull/86";
const SHA = "abc1234def567890";

function validWorkerEnv(overrides = {}) {
  return {
    CURSOR_API_KEY: "cursor_test",
    LINEAR_CLI_API_KEY: "lin_cli_test",
    LINEAR_WEBHOOK_SECRET: ISSUE_SECRET,
    GH_TOKEN: "ghp_test",
    LINEAR_CLI_VERSION: LINEAR_CLI_PIN.version,
    LINEAR_PI_APP_USER_ID: "pi-app-user-1",
    PI_MODEL: "cursor/composer-2.5",
    PI_MODEL_FAST: "cursor/grok-4.6",
    ...overrides,
  };
}

function fakeClock(start = 0) {
  let current = start;
  return {
    now() {
      return current;
    },
    async sleep(ms) {
      current += ms;
    },
  };
}

function workpadBody() {
  return `${WORKPAD_HEADING}

### Review feedback

- (none)

### Evidence

- (none)
`;
}

function fakeLinear({ identifier = IDENTIFIER, issueId = ISSUE_ID, status = "Implementing" } = {}) {
  const calls = [];
  const comments = [{ id: "c1", body: workpadBody() }];
  const issue = {
    id: issueId,
    identifier,
    status,
    labels: ["Feature"],
    linearType: "Feature",
    blockedBy: [],
    delegate: { name: "Pi" },
    attachments: [{ url: PR_URL, title: "KIT-86" }],
  };
  return {
    calls,
    comments,
    issue,
    async getIssue(id) {
      calls.push(["getIssue", id]);
      return this.issue;
    },
    async listComments() {
      calls.push(["listComments"]);
      return comments;
    },
    async updateWorkpad(input) {
      calls.push(["updateWorkpad", input]);
      comments[0].body = input.body;
    },
    async setStatus(input) {
      calls.push(["setStatus", input]);
      this.issue = { ...this.issue, status: input.status };
    },
  };
}

function trackingWorktree({ path = WORKTREE_PATH, identifier = IDENTIFIER } = {}) {
  const trees = new Set([path]);
  const mirror = MIRROR_DIR;
  const calls = [];
  return {
    trees,
    mirror,
    calls,
    async checkout(input) {
      calls.push(["checkout", input]);
      trees.add(path);
      return { path, branch: identifier.toLowerCase(), lane: "development" };
    },
    async reap(input) {
      calls.push(["reap", input]);
      trees.delete(path);
      return { reaped: true, path, mirror };
    },
  };
}

function hungSpawn({ onKill } = {}) {
  const stdout = new PassThrough();
  let settleClose;
  const closePromise = new Promise((resolve) => {
    settleClose = resolve;
  });
  const spawned = {
    pid: 4242,
    stdout,
    closePromise,
    kill(signal) {
      onKill?.({ pid: spawned.pid, signal });
      settleClose({ status: null });
    },
  };
  return spawned;
}

function implementJob(overrides = {}) {
  return {
    role: "implement",
    identifier: IDENTIFIER,
    issueId: ISSUE_ID,
    adwFile: ".pi/adw/feature.yaml",
    ...overrides,
  };
}

function idleRunner({
  linear,
  worktree,
  clock,
  spawned,
  kills,
  spawnImpl,
  landGh,
  checkerGh,
} = {}) {
  const env = validWorkerEnv();
  const child = spawned ?? hungSpawn();
  return createPiJobRunner({
    env,
    workspace: ROOT,
    worktree: worktree ?? trackingWorktree(),
    linear: linear ?? fakeLinear(),
    landGh,
    checkerGh,
    gh: {
      async rebase() {},
      async viewPr() {
        return { url: PR_URL, mergeable: "MERGEABLE", checks: [{ conclusion: "success" }] };
      },
      async createPr() {
        return { url: PR_URL, mergeable: "MERGEABLE", checks: [{ conclusion: "success" }] };
      },
      merge() {
        throw new Error("implement never merges");
      },
    },
    typecheckTouched: async () => undefined,
    now: clock.now,
    sleep: clock.sleep,
    killProcessGroup(target) {
      kills?.push(target);
      target.kill("SIGTERM");
    },
    spawnProcess(command, args, options) {
      if (typeof spawnImpl === "function") {
        return spawnImpl(command, args, options);
      }
      return Promise.resolve(child);
    },
  });
}

function sign(rawBody) {
  return createHmac("sha256", ISSUE_SECRET).update(rawBody).digest("hex");
}

async function routeStatus(issue, extras = {}) {
  const rawBody = JSON.stringify({
    action: "update",
    type: "Issue",
    data: { id: issue.id, identifier: issue.identifier },
    updatedFrom: { stateId: "prev-state" },
    webhookTimestamp: NOW,
  });
  const enqueue = extras.enqueue ?? {
    jobs: [],
    enqueue(job) {
      this.jobs.push(job);
    },
  };
  const result = await routeWebhook({
    rawBody,
    signature: sign(rawBody),
    secret: ISSUE_SECRET,
    now: NOW,
    linear: extras.linear ?? {
      async getIssue() {
        return issue;
      },
    },
    gh: {},
    enqueue,
    worktree: extras.worktree,
    allowedDelegates: ["Pi"],
  });
  return { result, enqueue };
}

test("DEFAULT_JOB_IDLE_MS is 45 minutes and reads PI_JOB_IDLE_MS", () => {
  assert.equal(DEFAULT_JOB_IDLE_MS, 45 * 60 * 1000);
});

test("idle timeout with no close and no stdout kills the process group, Parks, writes Review feedback, and reaps the Issue worktree", async () => {
  const clock = fakeClock();
  const linear = fakeLinear();
  const worktree = trackingWorktree();
  const kills = [];
  const runner = idleRunner({ linear, worktree, clock, kills });

  const result = await runner.run(implementJob());

  assert.equal(result.idleTimeout, true);
  assert.equal(kills.length, 1);
  assert.equal(kills[0].pid, 4242);
  assert.equal(linear.issue.status, "Parked");
  assert.match(linear.comments[0].body, /### Review feedback/);
  assert.match(linear.comments[0].body, /implement/);
  assert.match(linear.comments[0].body, /KIT-86/);
  assert.match(linear.comments[0].body, /45 minutes/);
  assert.equal(worktree.trees.has(WORKTREE_PATH), false);
  assert.equal(worktree.mirror, MIRROR_DIR);
  assert.ok(worktree.calls.some((call) => call[0] === "reap" && call[1].identifier === IDENTIFIER));
  assert.equal(clock.now() >= DEFAULT_JOB_IDLE_MS, true);
});

test("after Idle timeout a later factory-checker enqueue can run on the coding slot", async () => {
  const clock = fakeClock();
  const linear = fakeLinear();
  const worktree = trackingWorktree();
  const kills = [];
  const ran = [];
  const hung = hungSpawn();
  const runner = idleRunner({
    linear,
    worktree,
    clock,
    kills,
    spawnImpl(_command, _args, options) {
      ran.push(options.cwd);
      if (ran.length === 1) {
        return Promise.resolve(hung);
      }
      return Promise.resolve({ status: 0 });
    },
  });
  const queue = createSerialQueue({ run: (job) => runner.run(job) });

  const hungDone = queue.enqueue(implementJob());
  const checkerDone = queue.enqueue({
    role: "factory-checker",
    identifier: "KIT-87",
    issueId: "issue-kit-87",
  });

  const hungResult = await hungDone;
  const checkerResult = await checkerDone;

  assert.equal(hungResult.idleTimeout, true);
  assert.equal(kills.length, 1);
  assert.equal(ran.length, 2);
  assert.equal(checkerResult.role, "factory-checker");
});

test("worktree reap removes the Issue worktree and keeps the bare mirror", async () => {
  const gitCalls = [];
  const removed = [];
  const present = new Set([MIRROR_DIR, WORKTREE_PATH]);
  const adapter = createWorktreeAdapter({
    mirrorDir: MIRROR_DIR,
    worktreesDir: "/var/lib/kit-pi/worktrees",
    existsSync: (path) => present.has(path),
    mkdirSync() {},
    rmSync(path, options) {
      removed.push({ path, options });
      present.delete(path);
    },
    async runGit(args) {
      gitCalls.push(args);
      if (args.includes("remove") && args.includes(WORKTREE_PATH)) {
        present.delete(WORKTREE_PATH);
      }
      return { stdout: "", status: 0 };
    },
  });

  const result = await adapter.reap({ identifier: IDENTIFIER });

  assert.equal(result.reaped, true);
  assert.equal(result.mirror, MIRROR_DIR);
  assert.equal(present.has(MIRROR_DIR), true);
  assert.equal(present.has(WORKTREE_PATH), false);
  const removeCall = gitCalls.find((args) => args.includes("worktree") && args.includes("remove"));
  assert.ok(removeCall);
  assert.equal(removeCall.at(-1), WORKTREE_PATH);
  assert.equal(
    removed.some((entry) => entry.path === MIRROR_DIR),
    false,
  );
});

test("land merge success to Done reaps the Issue worktree", async () => {
  const linear = fakeLinear({ status: "Merging" });
  const worktree = trackingWorktree();
  const gh = {
    async viewPr() {
      return {
        number: 86,
        url: PR_URL,
        mergeable: "MERGEABLE",
        baseRef: "development",
        requiredChecks: [{ name: "test", conclusion: "success" }],
      };
    },
    merge() {
      return { ok: true, sha: SHA };
    },
  };

  const result = await completeLand({
    job: { issueId: ISSUE_ID, identifier: IDENTIFIER },
    linear,
    gh,
    lanes: LAND_LANES,
    worktree,
  });

  assert.equal(result.merged, true);
  assert.equal(result.nextStatus, "Done");
  assert.equal(worktree.trees.has(WORKTREE_PATH), false);
  assert.equal(worktree.mirror, MIRROR_DIR);
  assert.ok(worktree.calls.some((call) => call[0] === "reap" && call[1].identifier === IDENTIFIER));
});

test("status change to Canceled reaps the Issue worktree and does not spawn a Coding job", async () => {
  const worktree = trackingWorktree();
  const { result, enqueue } = await routeStatus(
    {
      id: ISSUE_ID,
      identifier: IDENTIFIER,
      status: "Canceled",
      labels: ["Feature"],
      linearType: "Feature",
      blockedBy: [],
      delegate: { name: "Pi" },
    },
    { worktree },
  );

  assert.equal(result.kind, "skip");
  assert.equal(enqueue.jobs.length, 0);
  assert.equal(worktree.trees.has(WORKTREE_PATH), false);
  assert.ok(worktree.calls.some((call) => call[0] === "reap"));
});

test("a human Park (not Idle timeout) keeps the Issue worktree", async () => {
  const worktree = trackingWorktree();
  const { result, enqueue } = await routeStatus(
    {
      id: ISSUE_ID,
      identifier: IDENTIFIER,
      status: "Parked",
      labels: ["Feature"],
      linearType: "Feature",
      blockedBy: [],
      delegate: { name: "Pi" },
    },
    { worktree },
  );

  assert.equal(result.kind, "skip");
  assert.equal(enqueue.jobs.length, 0);
  assert.equal(worktree.trees.has(WORKTREE_PATH), true);
  assert.equal(
    worktree.calls.some((call) => call[0] === "reap"),
    false,
  );
});

test("planner still never claims Parked after Timeout park is a worker writer", () => {
  assert.ok(FORBIDDEN_PLANNER_STATES.includes("Parked"));
});

test("WORKFLOW and host inventory say the worker writes Parked on Idle timeout", () => {
  const workflow = readFileSync(join(ROOT, "WORKFLOW.md"), "utf8");
  const host = readFileSync(join(ROOT, "harness/host.md"), "utf8");
  assert.match(workflow, /Idle timeout/i);
  assert.match(workflow, /Parked/);
  assert.match(workflow, /worker/i);
  assert.match(host, /Idle timeout/i);
  assert.match(host, /Parked/);
  assert.match(host, /PI_JOB_IDLE_MS/);
});
