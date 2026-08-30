/**
 * KIT-90 — Auto-merge wakes on Ready for merge, flips to Merging under the
 * loop cap. Fake Linear + fake `gh` at the worker job-lifecycle seam.
 * Do not spawn a model. Counters live under workpad `### Loop counters`.
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  completeAutoMerge,
  LOOP_CAP,
  LOOP_COUNTERS_HEADING,
  parseLoopCounters,
} from "../auto-merge.mjs";
import { LINEAR_CLI_PIN } from "../boot-env.mjs";
import { completeChecker } from "../checker-exit.mjs";
import {
  completeImplementAdw,
  IMPLEMENTING,
  IN_REVIEW,
  WORKPAD_HEADING,
} from "../implement-exit.mjs";
import { createWorkerSlots } from "../job-queue.mjs";
import { completeLand, LAND_LANES } from "../land.mjs";
import { createPiJobRunner } from "../pi-job.mjs";
import { routeWebhook } from "../webhook-router.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ISSUE_SECRET = "test-linear-webhook-secret";
const NOW = 1_700_000_000_000;
const ISSUE_ID = "issue-kit-90";
const PR_URL = "https://github.com/KitCollective/kit-collective/pull/90";
const SHA = "abc1234def567890";
const ADW = "steps:\n  - pr\n  - in-review\nnever:\n  - merge\n";

function sign(rawBody, secret) {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

function validWorkerEnv() {
  return {
    CURSOR_API_KEY: "cursor_test",
    LINEAR_CLI_API_KEY: "lin_cli_test",
    LINEAR_WEBHOOK_SECRET: ISSUE_SECRET,
    GH_TOKEN: "ghp_test",
    LINEAR_CLI_VERSION: LINEAR_CLI_PIN.version,
    LINEAR_PI_APP_USER_ID: "pi-app-user-1",
    PI_MODEL: "cursor/composer-2.5",
    PI_MODEL_FAST: "cursor/grok-4.6",
    OPENROUTER_API_KEY: "or_test",
  };
}

function issueUpdatePayload({ updatedFrom = { stateId: "prev-state" } } = {}) {
  return {
    action: "update",
    type: "Issue",
    data: { id: ISSUE_ID, identifier: "KIT-90" },
    updatedFrom,
    webhookTimestamp: NOW,
  };
}

function loopCountersBody({ ciFailCycles = 0, reviewLoops = 0 } = {}) {
  return `${WORKPAD_HEADING}

${LOOP_COUNTERS_HEADING}

- ciFailCycles: ${ciFailCycles}
- reviewLoops: ${reviewLoops}

### Review feedback

- (none)
`;
}

function snapshot(overrides = {}) {
  return {
    id: ISSUE_ID,
    identifier: "KIT-90",
    status: "Ready for merge",
    labels: ["Feature"],
    linearType: "Feature",
    blockedBy: [],
    delegate: { name: "Pi" },
    attachments: [{ url: PR_URL, title: "KIT-90: Auto-merge Ready for merge under the loop cap" }],
    ...overrides,
  };
}

function greenPr(overrides = {}) {
  return {
    number: 90,
    url: PR_URL,
    mergeable: "MERGEABLE",
    baseRef: "development",
    requiredChecks: [{ name: "test", conclusion: "success" }],
    ...overrides,
  };
}

function fakeEnqueue() {
  const jobs = [];
  return {
    jobs,
    enqueue(job) {
      jobs.push(job);
    },
  };
}

async function routeIssue(issue, extras = {}) {
  const rawBody = JSON.stringify(extras.payload ?? issueUpdatePayload());
  const signature = sign(rawBody, ISSUE_SECRET);
  const enqueue = extras.enqueue ?? fakeEnqueue();
  const result = await routeWebhook({
    rawBody,
    signature,
    secret: ISSUE_SECRET,
    now: NOW,
    linear: extras.linear ?? {
      async getIssue() {
        return issue;
      },
    },
    gh: extras.gh ?? { calls: [] },
    enqueue,
    allowedDelegates: ["Pi"],
    session: extras.session,
  });
  return { result, enqueue };
}

function fakeGh({ pr = greenPr(), mergeOk = true, sha = SHA } = {}) {
  const calls = [];
  return {
    calls,
    async viewPr(input) {
      calls.push(["viewPr", input]);
      return pr;
    },
    merge(args) {
      calls.push(["merge", args]);
      if (args.includes("--force")) {
        return { ok: false, error: "refusing --force" };
      }
      return mergeOk ? { ok: true, sha } : { ok: false, error: "merge failed" };
    },
  };
}

function fakeLinear(issue = snapshot(), { body = loopCountersBody() } = {}) {
  const calls = [];
  const comments = [{ id: "c1", body }];
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
    async commentIssue(input) {
      calls.push(["commentIssue", input]);
    },
    async setStatus(input) {
      calls.push(["setStatus", input]);
      this.issue = { ...this.issue, status: input.status };
    },
    async clearDelegate(input) {
      calls.push(["clearDelegate", input]);
      this.issue = { ...this.issue, delegate: null };
    },
  };
}

test("parseLoopCounters reads ### Loop counters from the workpad, not a synthetic field", () => {
  assert.deepEqual(parseLoopCounters(loopCountersBody({ ciFailCycles: 2, reviewLoops: 4 })), {
    ciFailCycles: 2,
    reviewLoops: 4,
  });
  assert.equal(parseLoopCounters(`${WORKPAD_HEADING}\n\n### Review feedback\n\n- (none)\n`), null);
  assert.equal(parseLoopCounters(`${WORKPAD_HEADING}\n\nloopCounters: 0\n`), null);
  assert.equal(LOOP_CAP, 5);
});

test("status change to Ready for merge enqueues auto-merge and no Pi role", async () => {
  const { result, enqueue } = await routeIssue(snapshot());
  assert.deepEqual(result, { kind: "enqueue", role: "auto-merge" });
  assert.equal(enqueue.jobs.length, 1);
  assert.equal(enqueue.jobs[0].role, "auto-merge");
  assert.equal(enqueue.jobs[0].issueId, ISSUE_ID);
  assert.equal(enqueue.jobs[0].adwFile, undefined);
});

test("Ready for merge does not hand off as a human-only turn", async () => {
  const session = {
    handedOff: false,
    async handOff() {
      this.handedOff = true;
    },
  };
  const { result, enqueue } = await routeIssue(snapshot(), { session });
  assert.equal(result.kind, "enqueue");
  assert.equal(enqueue.jobs[0].role, "auto-merge");
  assert.equal(session.handedOff, false);
});

test("Auto-merge occupies the coding slot and not the planner mutex", async () => {
  const plannerMutex = [];
  const coding = [];
  let codingStarted;
  const started = new Promise((resolve) => {
    codingStarted = resolve;
  });
  let releaseCoding;
  const hold = new Promise((resolve) => {
    releaseCoding = resolve;
  });
  const slots = createWorkerSlots({
    async run(job) {
      if (job.role === "planner" || job.role === "intake") {
        plannerMutex.push(job);
        return job;
      }
      coding.push(job);
      codingStarted();
      await hold;
      return job;
    },
  });

  const autoMergePromise = slots.enqueue({ role: "auto-merge", identifier: "KIT-90" });
  await started;
  await slots.enqueue({ role: "planner", identifier: "KIT-1" });
  assert.equal(coding.length, 1);
  assert.equal(coding[0].role, "auto-merge");
  assert.equal(plannerMutex.length, 1);
  assert.equal(slots.health().job.role, "auto-merge");
  releaseCoding();
  await autoMergePromise;
});

test("Auto-merge job does not spawn Pi", async () => {
  const spawned = [];
  const gh = fakeGh();
  const linear = fakeLinear();
  const runner = createPiJobRunner({
    env: validWorkerEnv(),
    workspace: ROOT,
    gh: {
      merge() {
        throw new Error("auto-merge never merges");
      },
    },
    landGh: gh,
    linear,
    spawnProcess(command, args, options) {
      spawned.push({ command, args, options });
      return Promise.resolve({ status: 0 });
    },
  });

  const result = await runner.run({
    role: "auto-merge",
    identifier: "KIT-90",
    issueId: ISSUE_ID,
  });
  assert.equal(spawned.length, 0);
  assert.equal(result.nextStatus, "Merging");
  assert.equal(
    linear.calls.some((call) => call[0] === "setStatus" && call[1].status === "Merging"),
    true,
  );
});

test("MERGEABLE + green checks + delegate Pi moves Ready for merge to Merging without clearing delegate", async () => {
  const gh = fakeGh();
  const linear = fakeLinear();
  const result = await completeAutoMerge({
    job: { issueId: ISSUE_ID, identifier: "KIT-90" },
    linear,
    gh,
  });

  assert.equal(result.flipped, true);
  assert.equal(result.nextStatus, "Merging");
  assert.equal(linear.issue.delegate?.name, "Pi");
  assert.equal(
    linear.calls.some((call) => call[0] === "clearDelegate"),
    false,
  );
  assert.deepEqual(linear.calls.find((call) => call[0] === "setStatus")[1], {
    issueId: ISSUE_ID,
    status: "Merging",
  });
  const flipComment = linear.calls.find((call) => call[0] === "commentIssue")[1];
  assert.match(flipComment.body, /Auto-merge → Merging/);
  assert.equal(
    gh.calls.some((call) => call[0] === "merge"),
    false,
  );
});

test("MERGEABLE + green checks + counters 0 moves Ready for merge to Merging and never merges", async () => {
  const gh = fakeGh();
  const linear = fakeLinear();
  const result = await completeAutoMerge({
    job: { issueId: ISSUE_ID, identifier: "KIT-90" },
    linear,
    gh,
  });

  assert.equal(result.flipped, true);
  assert.equal(result.nextStatus, "Merging");
  assert.deepEqual(linear.calls.find((call) => call[0] === "setStatus")[1], {
    issueId: ISSUE_ID,
    status: "Merging",
  });
  assert.equal(
    gh.calls.some((call) => call[0] === "merge"),
    false,
  );
});

test("land still performs gh pr merge onto development only after Merging", async () => {
  const gh = fakeGh();
  const linear = fakeLinear();
  const auto = await completeAutoMerge({
    job: { issueId: ISSUE_ID, identifier: "KIT-90" },
    linear,
    gh,
  });
  assert.equal(auto.nextStatus, "Merging");
  assert.equal(
    gh.calls.some((call) => call[0] === "merge"),
    false,
  );

  const landed = await completeLand({
    job: { issueId: ISSUE_ID, identifier: "KIT-90" },
    linear,
    gh,
    lanes: LAND_LANES,
  });
  assert.equal(landed.merged, true);
  assert.equal(landed.nextStatus, "Done");
  const merge = gh.calls.find((call) => call[0] === "merge");
  assert.ok(merge);
  assert.deepEqual(merge[1], ["pr", "merge", "90", "--merge"]);
  assert.equal(merge[1].includes("--force"), false);
});

test("ciFailCycles >= 5 or reviewLoops >= 5 stays Ready for merge with one workpad note", async () => {
  for (const counters of [
    { ciFailCycles: 5, reviewLoops: 0 },
    { ciFailCycles: 0, reviewLoops: 5 },
  ]) {
    const gh = fakeGh();
    const linear = fakeLinear(snapshot(), { body: loopCountersBody(counters) });
    const result = await completeAutoMerge({
      job: { issueId: ISSUE_ID, identifier: "KIT-90" },
      linear,
      gh,
    });
    assert.equal(result.flipped, false, JSON.stringify(counters));
    assert.equal(result.nextStatus, "Ready for merge", JSON.stringify(counters));
    assert.equal(linear.issue.status, "Ready for merge", JSON.stringify(counters));
    assert.equal(
      linear.calls.some((call) => call[0] === "setStatus" && call[1].status === "Merging"),
      false,
      JSON.stringify(counters),
    );
    assert.match(linear.comments[0].body, /### Review feedback/);
    assert.match(linear.comments[0].body, /Auto-merge blocked/);
    assert.equal(linear.comments[0].body.split("Auto-merge blocked").length - 1, 1);
    assert.equal(
      linear.calls.some((call) => call[0] === "clearDelegate"),
      true,
      JSON.stringify(counters),
    );
    assert.equal(
      gh.calls.some((call) => call[0] === "merge"),
      false,
    );
  }
});

test("Nicklas can still move Merging after Auto-merge is blocked by the loop cap", async () => {
  const gh = fakeGh();
  const linear = fakeLinear(snapshot(), { body: loopCountersBody({ ciFailCycles: 5 }) });
  const blocked = await completeAutoMerge({
    job: { issueId: ISSUE_ID, identifier: "KIT-90" },
    linear,
    gh,
  });
  assert.equal(blocked.flipped, false);

  linear.issue = snapshot({ status: "Merging" });
  const landed = await completeLand({
    job: { issueId: ISSUE_ID, identifier: "KIT-90" },
    linear,
    gh,
    lanes: LAND_LANES,
  });
  assert.equal(landed.merged, true);
  assert.equal(landed.nextStatus, "Done");
});

test("CONFLICTING or missing ### Loop counters stays Ready for merge (fail closed)", async () => {
  const conflictingLinear = fakeLinear();
  const conflicting = await completeAutoMerge({
    job: { issueId: ISSUE_ID, identifier: "KIT-90" },
    linear: conflictingLinear,
    gh: fakeGh({ pr: greenPr({ mergeable: "CONFLICTING" }) }),
  });
  assert.equal(conflicting.flipped, false);
  assert.equal(conflicting.nextStatus, "Ready for merge");
  assert.equal(conflictingLinear.issue.status, "Ready for merge");
  assert.match(conflictingLinear.comments[0].body, /CONFLICTING/);
  const refuseComment = conflictingLinear.calls.find((call) => call[0] === "commentIssue")[1];
  assert.match(refuseComment.body, /Auto-merge refused/);
  assert.equal(
    conflictingLinear.calls.some((call) => call[0] === "clearDelegate"),
    true,
  );

  const missingLinear = fakeLinear(snapshot(), {
    body: `${WORKPAD_HEADING}\n\n### Review feedback\n\n- (none)\n`,
  });
  const missing = await completeAutoMerge({
    job: { issueId: ISSUE_ID, identifier: "KIT-90" },
    linear: missingLinear,
    gh: fakeGh(),
  });
  assert.equal(missing.flipped, false);
  assert.equal(missing.nextStatus, "Ready for merge");
  assert.equal(missingLinear.issue.status, "Ready for merge");
  assert.equal(parseLoopCounters(missingLinear.comments[0].body), null);
  assert.match(missingLinear.comments[0].body, /missing ### Loop counters/);
  assert.equal(
    missingLinear.calls.some((call) => call[0] === "clearDelegate"),
    true,
  );
});

test("missing ### Loop counters does not invent a synthetic loopCounters field", async () => {
  const linear = fakeLinear(snapshot(), {
    body: `${WORKPAD_HEADING}\n\n### Review feedback\n\n- (none)\n`,
  });
  await completeAutoMerge({
    job: { issueId: ISSUE_ID, identifier: "KIT-90" },
    linear,
    gh: fakeGh(),
  });
  assert.equal(linear.issue.status, "Ready for merge");
  assert.equal(linear.issue.loopCounters, undefined);
  assert.equal(parseLoopCounters(linear.comments[0].body), null);
  assert.match(linear.comments[0].body, /missing ### Loop counters/);
});

test("Implement CI retry does not increment ciFailCycles — cheap retry is not a try", async () => {
  const linear = {
    calls: [],
    comments: [{ id: "c1", body: loopCountersBody() }],
    async listComments() {
      return this.comments;
    },
    async updateWorkpad(input) {
      this.calls.push(["updateWorkpad", input]);
      this.comments[0].body = input.body;
      return { id: "c1", created: false };
    },
    async setStatus(input) {
      this.calls.push(["setStatus", input]);
    },
  };
  const gh = {
    calls: [],
    async rebase() {},
    async viewPr() {
      return {
        url: PR_URL,
        mergeable: "MERGEABLE",
        checks: [{ name: "test", conclusion: "failure", isRequired: true, log: "AssertionError" }],
      };
    },
    async createPr() {
      throw new Error("PR already exists");
    },
    async fetchCheckLog() {
      return "AssertionError";
    },
    merge() {
      throw new Error("implement never merges");
    },
  };

  const result = await completeImplementAdw({
    job: { identifier: "KIT-90", issueId: ISSUE_ID, adwFile: ".pi/adw/feature.yaml" },
    checkout: { path: "/var/lib/kit-pi/worktrees/KIT-90", branch: "kit-90" },
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
  assert.deepEqual(parseLoopCounters(linear.comments[0].body), {
    ciFailCycles: 0,
    reviewLoops: 0,
  });
  assert.match(linear.comments[0].body, /### Loop counters/);
  assert.equal(linear.comments[0].body.includes("loopCounters:"), false);
});

test("Checker fail increments reviewLoops on ### Loop counters", async () => {
  const linear = fakeLinear(snapshot({ status: IN_REVIEW }), { body: loopCountersBody() });
  linear.getIssue = async () => snapshot({ status: IN_REVIEW });
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
  linear.comments[0].body = `${WORKPAD_HEADING}

${LOOP_COUNTERS_HEADING}

- ciFailCycles: 0
- reviewLoops: 0

### Review feedback

- Spec: missing AC evidence
`;

  const failed = await completeChecker({
    job: { issueId: ISSUE_ID, identifier: "KIT-90" },
    linear,
    gh,
  });
  assert.equal(failed.passed, false);
  assert.equal(failed.nextStatus, IMPLEMENTING);
  assert.deepEqual(parseLoopCounters(linear.comments[0].body), {
    ciFailCycles: 0,
    reviewLoops: 1,
  });
  assert.match(linear.comments[0].body, /### Loop counters/);
});

test("Land fail increments reviewLoops on ### Loop counters — return to Implementing is a try", async () => {
  const linear = fakeLinear(snapshot({ status: "Merging" }), { body: loopCountersBody() });
  const gh = fakeGh({ mergeOk: false });
  const landed = await completeLand({
    job: { issueId: ISSUE_ID, identifier: "KIT-90" },
    linear,
    gh,
    lanes: LAND_LANES,
  });
  assert.equal(landed.merged, false);
  assert.equal(landed.nextStatus, "Implementing");
  assert.deepEqual(parseLoopCounters(linear.comments[0].body), {
    ciFailCycles: 0,
    reviewLoops: 1,
  });
});

test("Missing Linear Type on Implementing still skips implement (no ADW)", async () => {
  const spawned = [];
  const { result, enqueue } = await routeIssue(
    snapshot({
      status: IMPLEMENTING,
      delegate: null,
      labels: ["ready-for-agent"],
      linearType: undefined,
    }),
  );
  assert.equal(result.kind, "skip");
  assert.equal(result.reason, "missing Linear Type for ADW");
  assert.equal(enqueue.jobs.length, 0);
  assert.equal(spawned.length, 0);
});

test("empty Agent is not an auto-merge refuse reason", async () => {
  const gh = fakeGh();
  const linear = fakeLinear(snapshot({ delegate: null }));
  const result = await completeAutoMerge({
    job: { issueId: ISSUE_ID, identifier: "KIT-95" },
    linear,
    gh,
  });
  assert.equal(result.flipped, true);
  assert.equal(result.nextStatus, "Merging");
  assert.equal(
    linear.calls.some((call) => call[0] === "clearDelegate"),
    false,
  );
  assert.equal(
    gh.calls.some((call) => call[0] === "merge"),
    false,
  );
});

test("Nicklas can still move Merging when delegate is null and land merges onto development", async () => {
  const gh = fakeGh();
  const linear = fakeLinear(snapshot({ status: "Merging", delegate: null }));
  const landed = await completeLand({
    job: { issueId: ISSUE_ID, identifier: "KIT-95" },
    linear,
    gh,
    lanes: LAND_LANES,
  });
  assert.equal(landed.merged, true);
  assert.equal(landed.nextStatus, "Done");
  const merge = gh.calls.find((call) => call[0] === "merge");
  assert.ok(merge);
  assert.deepEqual(merge[1], ["pr", "merge", "90", "--merge"]);
});

test("Done and Canceled clear leftover Pi delegate on the webhook seam", async () => {
  for (const status of ["Done", "Canceled"]) {
    const linear = {
      calls: [],
      async getIssue() {
        return {
          id: ISSUE_ID,
          identifier: "KIT-95",
          status,
          delegate: { name: "Pi" },
          labels: ["Feature"],
        };
      },
      async clearDelegate(input) {
        this.calls.push(["clearDelegate", input]);
      },
    };
    const enqueue = fakeEnqueue();
    const { result } = await routeIssue(
      { id: ISSUE_ID, identifier: "KIT-95", status, delegate: { name: "Pi" } },
      { linear, enqueue },
    );
    assert.equal(result.kind, "skip", status);
    assert.equal(
      linear.calls.some((call) => call[0] === "clearDelegate"),
      true,
      status,
    );
    assert.equal(enqueue.jobs.length, 0, status);
  }
});

test("Dockerfile copies the auto-merge job", () => {
  const dockerfile = readFileSync(join(ROOT, "harness/Dockerfile"), "utf8");
  assert.match(dockerfile, /auto-merge\.mjs/);
});
