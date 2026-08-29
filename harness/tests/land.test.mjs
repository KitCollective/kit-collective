/**
 * KIT-57 — Land wakes on Merging, merges into development via landAtMergeGate,
 * records SHA or returns Implementing. Fake `gh` at the merge gate.
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { LINEAR_CLI_PIN } from "../boot-env.mjs";
import {
  applyLandWorkpad,
  completeLand,
  createLandGh,
  LAND_LANES,
  pullRequestFromAttachments,
  requiredChecksForMergeGate,
} from "../land.mjs";
import { createLinearCliClient, WORKPAD_HEADING } from "../linear-cli.mjs";
import { createPiJobRunner } from "../pi-job.mjs";
import { routeWebhook } from "../webhook-router.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ISSUE_SECRET = "test-linear-webhook-secret";
const NOW = 1_700_000_000_000;
const ISSUE_ID = "issue-kit-57";
const PR_URL = "https://github.com/KitCollective/kit-collective/pull/57";
const SHA = "abc1234def567890";

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
  };
}

function issueUpdatePayload({ updatedFrom = { stateId: "prev-state" } } = {}) {
  return {
    action: "update",
    type: "Issue",
    data: { id: ISSUE_ID, identifier: "KIT-57" },
    updatedFrom,
    webhookTimestamp: NOW,
  };
}

function snapshot(overrides = {}) {
  return {
    id: ISSUE_ID,
    identifier: "KIT-57",
    status: "Merging",
    labels: ["Feature"],
    linearType: "Feature",
    blockedBy: [],
    delegate: null,
    attachments: [{ url: PR_URL, title: "KIT-57: Land from Merging to Done on development" }],
    ...overrides,
  };
}

function greenPr(overrides = {}) {
  return {
    number: 57,
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
  });
  return { result, enqueue };
}

function fakeGh({ pr = greenPr(), mergeOk = true, sha = SHA, error = "merge failed" } = {}) {
  const calls = [];
  return {
    calls,
    mergeOk,
    async viewPr(input) {
      calls.push(["viewPr", input]);
      return pr;
    },
    merge(args) {
      calls.push(["merge", args]);
      if (args.includes("--force")) {
        return { ok: false, error: "refusing --force" };
      }
      return this.mergeOk ? { ok: true, sha } : { ok: false, error };
    },
  };
}

function fakeLinear(issue = snapshot()) {
  const calls = [];
  const comments = [
    {
      id: "c1",
      body: `${WORKPAD_HEADING}\n\n### Review feedback\n\n- (none)\n\n### Evidence\n\n- (none)\n`,
    },
  ];
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
  };
}

test("status change to Merging enqueues land and no other factory role", async () => {
  const { result, enqueue } = await routeIssue(snapshot());
  assert.deepEqual(result, { kind: "enqueue", role: "land" });
  assert.equal(enqueue.jobs.length, 1);
  assert.equal(enqueue.jobs[0].role, "land");
  assert.equal(enqueue.jobs[0].issueId, ISSUE_ID);
});

test("land does not enqueue unless the webhook is a status change", async () => {
  const { result, enqueue } = await routeIssue(snapshot(), {
    payload: issueUpdatePayload({ updatedFrom: { title: "old" } }),
  });
  assert.equal(result.kind, "skip");
  assert.equal(enqueue.jobs.length, 0);
});

const notLand = [
  ["Backlog", "planner"],
  ["Implementing", "implement"],
  ["In Review", "factory-checker"],
];

for (const [status, role] of notLand) {
  test(`status ${status} does not enqueue land`, async () => {
    const issue = snapshot({
      status,
      labels: status === "Backlog" ? ["ready-for-agent", "Feature"] : ["Feature"],
      delegate: status === "Implementing" ? { name: "Pi" } : null,
    });
    const { result, enqueue } = await routeIssue(issue);
    assert.notEqual(result.role, "land");
    assert.equal(
      enqueue.jobs.some((job) => job.role === "land"),
      false,
    );
    if (result.kind === "enqueue") {
      assert.equal(result.role, role);
    }
  });
}

test("Ready for merge enqueues auto-merge, not land; Done never enqueues land", async () => {
  const ready = await routeIssue(snapshot({ status: "Ready for merge" }));
  assert.notEqual(ready.result.role, "land");
  assert.equal(ready.result.role, "auto-merge");
  assert.equal(ready.enqueue.jobs.length, 1);
  for (const status of ["Done", "Parked", "Canceled"]) {
    const { result, enqueue } = await routeIssue(snapshot({ status }));
    assert.notEqual(result.role, "land");
    assert.equal(enqueue.jobs.length, 0, status);
  }
});

test("pullRequestFromAttachments reads the linked GitHub PR number", () => {
  assert.deepEqual(pullRequestFromAttachments(snapshot().attachments), {
    number: 57,
    repo: "KitCollective/kit-collective",
    url: PR_URL,
  });
  assert.equal(pullRequestFromAttachments([]), null);
});

test("Merging + MERGEABLE + green checks merges into development without --force, sets Done, and records the SHA", async () => {
  const gh = fakeGh();
  const linear = fakeLinear();
  const result = await completeLand({
    job: { issueId: ISSUE_ID, identifier: "KIT-57" },
    linear,
    gh,
    lanes: LAND_LANES,
  });

  assert.equal(result.merged, true);
  assert.equal(result.nextStatus, "Done");
  assert.equal(result.sha, SHA);
  const merge = gh.calls.find((call) => call[0] === "merge");
  assert.ok(merge);
  assert.deepEqual(merge[1], ["pr", "merge", "57", "--merge"]);
  assert.equal(merge[1].includes("--force"), false);
  assert.deepEqual(linear.calls.find((call) => call[0] === "setStatus")[1], {
    issueId: ISSUE_ID,
    status: "Done",
  });
  const workpad = linear.calls.find((call) => call[0] === "updateWorkpad")[1];
  assert.match(workpad.body, /abc1234def567890/);
  assert.equal(workpad.commentId, "c1");
  const mergeComment = linear.calls.find((call) => call[0] === "commentIssue")[1];
  assert.match(mergeComment.body, /merged to development — abc1234def567890/);
});

test("land retries UNKNOWN mergeable before fail-closed return to Implementing", async () => {
  let viewCount = 0;
  const gh = {
    calls: [],
    async viewPr(input) {
      gh.calls.push(["viewPr", input]);
      viewCount += 1;
      if (viewCount <= 2) {
        return greenPr({ mergeable: "UNKNOWN" });
      }
      return greenPr({ mergeable: "MERGEABLE" });
    },
    merge(args) {
      gh.calls.push(["merge", args]);
      return { ok: true, sha: SHA };
    },
  };
  const sleeps = [];
  const linear = fakeLinear();
  const result = await completeLand({
    job: { issueId: ISSUE_ID, identifier: "KIT-57" },
    linear,
    gh,
    lanes: LAND_LANES,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    unknownRetryMs: 0,
  });

  assert.equal(result.merged, true);
  assert.equal(result.nextStatus, "Done");
  assert.equal(sleeps.length, 2);
  assert.equal(gh.calls.filter((call) => call[0] === "viewPr").length, 3);
});

test("land fail-closed after UNKNOWN mergeable retries exhaust", async () => {
  const gh = fakeGh({ pr: greenPr({ mergeable: "UNKNOWN" }) });
  const linear = fakeLinear();
  const result = await completeLand({
    job: { issueId: ISSUE_ID, identifier: "KIT-57" },
    linear,
    gh,
    lanes: LAND_LANES,
    sleep: async () => undefined,
    unknownRetryMs: 0,
  });

  assert.equal(result.merged, false);
  assert.equal(result.nextStatus, "Implementing");
  assert.match(result.reason, /UNKNOWN/);
  assert.equal(
    gh.calls.filter((call) => call[0] === "merge").length,
    0,
  );
});

test("merge failure returns Implementing with the error under Review feedback and never Done", async () => {
  const gh = fakeGh({ mergeOk: false, error: "protected branch hook declined" });
  const linear = fakeLinear();
  const result = await completeLand({
    job: { issueId: ISSUE_ID, identifier: "KIT-57" },
    linear,
    gh,
    lanes: LAND_LANES,
  });

  assert.equal(result.merged, false);
  assert.equal(result.nextStatus, "Implementing");
  assert.notEqual(result.nextStatus, "Done");
  assert.deepEqual(linear.calls.find((call) => call[0] === "setStatus")[1], {
    issueId: ISSUE_ID,
    status: "Implementing",
  });
  const workpad = linear.calls.find((call) => call[0] === "updateWorkpad")[1];
  assert.match(workpad.body, /### Review feedback/);
  assert.match(workpad.body, /protected branch hook declined/);
  assert.equal(linear.issue.status, "Implementing");
  const failComment = linear.calls.find((call) => call[0] === "commentIssue")[1];
  assert.match(failComment.body, /merge failed/);
});

test("land never merges a PR whose base is staging or production", async () => {
  for (const baseRef of ["staging", "production"]) {
    const gh = fakeGh({ pr: greenPr({ baseRef }) });
    const linear = fakeLinear();
    const result = await completeLand({
      job: { issueId: ISSUE_ID, identifier: "KIT-57" },
      linear,
      gh,
      lanes: LAND_LANES,
    });
    assert.equal(result.merged, false);
    assert.notEqual(result.nextStatus, "Done");
    assert.equal(
      gh.calls.some((call) => call[0] === "merge"),
      false,
      baseRef,
    );
  }
});

test("auto-merge is refused unless Merging, MERGEABLE, and required checks are green", async () => {
  const cases = [
    { issue: snapshot({ status: "Ready for merge" }), pr: greenPr(), label: "not Merging" },
    { issue: snapshot(), pr: greenPr({ mergeable: "CONFLICTING" }), label: "not MERGEABLE" },
    {
      issue: snapshot(),
      pr: greenPr({ requiredChecks: [{ name: "test", conclusion: "failure" }] }),
      label: "red required check",
    },
  ];
  for (const row of cases) {
    const gh = fakeGh({ pr: row.pr });
    const linear = fakeLinear(row.issue);
    const result = await completeLand({
      job: { issueId: ISSUE_ID, identifier: "KIT-57" },
      linear,
      gh,
      lanes: LAND_LANES,
    });
    assert.equal(result.merged, false, row.label);
    assert.notEqual(result.nextStatus, "Done", row.label);
    assert.equal(
      gh.calls.some((call) => call[0] === "merge"),
      false,
      row.label,
    );
  }
});

test("fail loop then success loop run on the same branch/PR", async () => {
  const gh = fakeGh({ mergeOk: false, error: "protected branch hook declined" });
  const linear = fakeLinear();

  const failed = await completeLand({
    job: { issueId: ISSUE_ID, identifier: "KIT-57" },
    linear,
    gh,
    lanes: LAND_LANES,
  });
  assert.equal(failed.merged, false);
  assert.equal(failed.nextStatus, "Implementing");
  assert.match(linear.comments[0].body, /protected branch hook declined/);

  linear.issue = snapshot();
  gh.mergeOk = true;
  const succeeded = await completeLand({
    job: { issueId: ISSUE_ID, identifier: "KIT-57" },
    linear,
    gh,
    lanes: LAND_LANES,
  });
  assert.equal(succeeded.merged, true);
  assert.equal(succeeded.nextStatus, "Done");
  assert.equal(succeeded.sha, SHA);
  const merges = gh.calls.filter((call) => call[0] === "merge");
  assert.equal(merges.length, 2);
  assert.deepEqual(merges[0][1], merges[1][1]);
  assert.deepEqual(merges[0][1], ["pr", "merge", "57", "--merge"]);
  assert.match(linear.comments[0].body, /abc1234def567890/);
});

test("land job does not spawn Pi", async () => {
  const spawned = [];
  const gh = fakeGh();
  const linear = fakeLinear();
  const runner = createPiJobRunner({
    env: validWorkerEnv(),
    workspace: ROOT,
    gh: {
      merge() {
        throw new Error("implement never merges");
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
    role: "land",
    identifier: "KIT-57",
    issueId: ISSUE_ID,
  });
  assert.equal(spawned.length, 0);
  assert.equal(result.nextStatus, "Done");
  assert.equal(
    linear.calls.some((call) => call[0] === "setStatus" && call[1].status === "Done"),
    true,
  );
});

test("applyLandWorkpad records SHA on success and the merge error under Review feedback on failure", () => {
  const success = applyLandWorkpad(`${WORKPAD_HEADING}\n`, { sha: SHA });
  assert.match(success, /abc1234def567890/);
  const failure = applyLandWorkpad(`${WORKPAD_HEADING}\n`, {
    error: "protected branch hook declined",
  });
  assert.match(failure, /### Review feedback/);
  assert.match(failure, /protected branch hook declined/);
  assert.equal(failure.includes("Done"), false);
});

test("production createLandGh calls gh pr merge without --force and reads the merge commit SHA", async () => {
  const calls = [];
  const gh = createLandGh({
    env: { GH_TOKEN: "ghp_secret_token" },
    repo: "KitCollective/kit-collective",
    async runCommand(command, args) {
      calls.push({ command, args, mode: "async" });
      if (args[0] === "pr" && args[1] === "view") {
        return JSON.stringify({
          number: 57,
          url: PR_URL,
          mergeable: "MERGEABLE",
          baseRefName: "development",
          statusCheckRollup: [{ name: "test", conclusion: "SUCCESS", status: "COMPLETED" }],
        });
      }
      if (args[0] === "pr" && args[1] === "checks") {
        return JSON.stringify([{ name: "test", state: "pass" }]);
      }
      return "";
    },
    runSync(command, args) {
      calls.push({ command, args, mode: "sync" });
      if (args[0] === "pr" && args[1] === "merge") {
        return "";
      }
      if (args.includes("mergeCommit")) {
        return JSON.stringify({ mergeCommit: { oid: SHA } });
      }
      return "";
    },
  });

  const pr = await gh.viewPr({ number: 57 });
  assert.equal(pr.number, 57);
  assert.equal(pr.baseRef, "development");
  assert.equal(pr.mergeable, "MERGEABLE");
  const merged = gh.merge(["pr", "merge", "57", "--merge"]);
  assert.equal(merged.ok, true);
  assert.equal(merged.sha, SHA);
  assert.equal(
    calls.some((call) => call.args.includes("--force")),
    false,
  );
  assert.equal(
    calls.some(
      (call) => call.command === "gh" && call.args[0] === "pr" && call.args[1] === "merge",
    ),
    true,
  );
  for (const call of calls) {
    assert.equal(call.args.join(" ").includes("ghp_secret_token"), false);
  }
});

test("requiredChecksForMergeGate drops optional rollup entries and keeps required conclusions", () => {
  assert.deepEqual(
    requiredChecksForMergeGate([
      { name: "test", conclusion: "SUCCESS", isRequired: true },
      { name: "Cursor Bugbot", conclusion: "", isRequired: false },
      { name: "lint", conclusion: "FAILURE", isRequired: false },
    ]),
    [{ name: "test", conclusion: "success" }],
  );
  assert.equal(requiredChecksForMergeGate([]), undefined);
});

test("production viewPr ignores optional pending or failing checks when required checks are green", async () => {
  const gh = createLandGh({
    env: { GH_TOKEN: "ghp_secret_token" },
    repo: "KitCollective/kit-collective",
    async runCommand(_command, args) {
      if (args[0] === "pr" && args[1] === "view") {
        return JSON.stringify({
          number: 57,
          url: PR_URL,
          mergeable: "MERGEABLE",
          baseRefName: "development",
          statusCheckRollup: [
            { name: "test", conclusion: "SUCCESS", status: "COMPLETED" },
            { name: "Cursor Bugbot", conclusion: "", status: "IN_PROGRESS" },
            { name: "lint", conclusion: "FAILURE", status: "COMPLETED" },
          ],
        });
      }
      if (args[0] === "pr" && args[1] === "checks") {
        return JSON.stringify([{ name: "test", state: "pass" }]);
      }
      return "";
    },
    runSync(_command, args) {
      if (args[0] === "pr" && args[1] === "merge") {
        return "";
      }
      if (args.includes("mergeCommit")) {
        return JSON.stringify({ mergeCommit: { oid: SHA } });
      }
      return "";
    },
  });

  const pr = await gh.viewPr({ number: 57 });
  assert.deepEqual(pr.requiredChecks, [{ name: "test", conclusion: "success" }]);
  assert.equal(
    pr.requiredChecks.some((check) => check.name === "Cursor Bugbot" || check.name === "lint"),
    false,
  );

  const linear = fakeLinear();
  const result = await completeLand({
    job: { issueId: ISSUE_ID, identifier: "KIT-57" },
    linear,
    gh,
    lanes: LAND_LANES,
  });
  assert.equal(result.merged, true);
  assert.equal(result.nextStatus, "Done");
});

test("production viewPr still refuses when a required check is red even if optional checks are green", async () => {
  const gh = createLandGh({
    env: { GH_TOKEN: "ghp_secret_token" },
    repo: "KitCollective/kit-collective",
    async runCommand(_command, args) {
      if (args[0] === "pr" && args[1] === "view") {
        return JSON.stringify({
          number: 57,
          url: PR_URL,
          mergeable: "MERGEABLE",
          baseRefName: "development",
          statusCheckRollup: [
            { name: "test", conclusion: "FAILURE", status: "COMPLETED" },
            { name: "Cursor Bugbot", conclusion: "SUCCESS", status: "COMPLETED" },
          ],
        });
      }
      if (args[0] === "pr" && args[1] === "checks") {
        return JSON.stringify([{ name: "test", state: "fail" }]);
      }
      return "";
    },
    runSync() {
      throw new Error("gh merge must not run when a required check is red");
    },
  });

  const pr = await gh.viewPr({ number: 57 });
  assert.deepEqual(pr.requiredChecks, [{ name: "test", conclusion: "failure" }]);

  const linear = fakeLinear();
  const result = await completeLand({
    job: { issueId: ISSUE_ID, identifier: "KIT-57" },
    linear,
    gh,
    lanes: LAND_LANES,
  });
  assert.equal(result.merged, false);
  assert.notEqual(result.nextStatus, "Done");
});

test("Dockerfile copies the land job and the KIT-51 merge gate", () => {
  const dockerfile = readFileSync(join(ROOT, "harness/Dockerfile"), "utf8");
  assert.match(dockerfile, /land\.mjs/);
  assert.match(dockerfile, /land-policy\.mjs/);
});

test("Linear getIssue maps GitHub PR attachments for land", async () => {
  const linear = createLinearCliClient({
    env: validWorkerEnv(),
    async runCommand(_command, args) {
      assert.match(args[1], /attachments/);
      return JSON.stringify({
        data: {
          issue: {
            id: ISSUE_ID,
            identifier: "KIT-57",
            state: { name: "Merging", type: "started" },
            labels: { nodes: [{ name: "Feature" }] },
            delegate: null,
            inverseRelations: { nodes: [] },
            attachments: { nodes: [{ url: PR_URL, title: "KIT-57 PR" }] },
          },
        },
      });
    },
  });
  const issue = await linear.getIssue(ISSUE_ID);
  assert.equal(issue.status, "Merging");
  assert.deepEqual(issue.attachments, [{ url: PR_URL, title: "KIT-57 PR" }]);
});
