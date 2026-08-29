/**
 * KIT-56 — Factory checker wakes on In Review as a separate Pi process.
 * Pass/fail Linear moves are tested from fixture issue+PR summaries.
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { LOOP_COUNTERS_HEADING, parseLoopCounters } from "../auto-merge.mjs";
import { LINEAR_CLI_PIN } from "../boot-env.mjs";
import {
  applyCheckerFailWorkpad,
  applyCheckerPassWorkpad,
  applyRatchetNudge,
  completeChecker,
  createCheckerGh,
  ghGateFailures,
  hasRatchetNudge,
  IMPLEMENTING,
  RATCHET_NUDGE_TEXT,
  READY_FOR_MERGE,
  REVIEW_PASS_FEEDBACK_LINES,
  reviewFeedbackHasFindings,
  reviewFeedbackIsClean,
  reviewFeedbackMissingSlopAxis,
  reviewFeedbackSection,
} from "../checker-exit.mjs";
import {
  applySlopAgentSpawnEnv,
  FACTORY_CHECKER_ALLOWED_TOOLS,
  FACTORY_CHECKER_EXCLUDED_TOOLS,
  FACTORY_CHECKER_MEMORY_TOOLS,
  factoryCheckerPiArgs,
  factoryCheckerToolArgs,
  SLOP_AGENT_MEMORY_EXCLUDED_TOOLS,
  SLOP_AGENT_PI_ARGS_ENV,
  slopAgentToolArgs,
} from "../checker-spawn.mjs";
import { IN_REVIEW } from "../implement-exit.mjs";
import { pullRequestFromAttachments } from "../land.mjs";
import { WORKPAD_HEADING } from "../linear-cli.mjs";
import { createPiJobRunner, implementPrompt } from "../pi-job.mjs";
import { routeWebhook } from "../webhook-router.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ISSUE_SECRET = "test-linear-webhook-secret";
const NOW = 1_700_000_000_000;
const ISSUE_ID = "issue-kit-56";
const PR_URL = "https://github.com/KitCollective/kit-collective/pull/56";

const CLEAN_REVIEW_FEEDBACK = REVIEW_PASS_FEEDBACK_LINES.join("\n");

function cleanWorkpad(extra = "") {
  return `${WORKPAD_HEADING}\n\n### Review feedback\n\n${CLEAN_REVIEW_FEEDBACK}\n${extra}`;
}

function sign(rawBody) {
  return createHmac("sha256", ISSUE_SECRET).update(rawBody).digest("hex");
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
    data: { id: ISSUE_ID, identifier: "KIT-56" },
    updatedFrom,
    webhookTimestamp: NOW,
  };
}

function snapshot(overrides = {}) {
  return {
    id: ISSUE_ID,
    identifier: "KIT-56",
    status: IN_REVIEW,
    labels: ["Feature"],
    linearType: "Feature",
    blockedBy: [],
    delegate: { name: "Pi" },
    attachments: [{ url: PR_URL, title: "KIT-56: Factory checker" }],
    description: `## Acceptance criteria\n\n- [ ] Spec is met\n- [ ] Standards are clean\n`,
    ...overrides,
  };
}

function greenPr(overrides = {}) {
  return {
    number: 56,
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
  const signature = sign(rawBody);
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

function fakeGh({ pr = greenPr(), slopSync } = {}) {
  const calls = [];
  return {
    calls,
    async viewPr(input) {
      calls.push(["viewPr", input]);
      return pr;
    },
    async syncSlopReviewThreads(input) {
      calls.push(["syncSlopReviewThreads", input]);
      if (typeof slopSync === "function") {
        return slopSync(input);
      }
      return { posted: [], resolved: [] };
    },
    merge() {
      calls.push(["merge"]);
      throw new Error("checker never merges");
    },
    approve() {
      calls.push(["approve"]);
      throw new Error("checker never approves");
    },
  };
}

function fakeLinear(issue = snapshot(), workpadBody) {
  const calls = [];
  const comments = [
    {
      id: "c1",
      body: workpadBody ?? `${cleanWorkpad()}\n\n### Evidence\n\n- KIT-56 PR: ${PR_URL}\n`,
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
    async updateIssueDescription(input) {
      calls.push(["updateIssueDescription", input]);
      this.issue = { ...this.issue, description: input.description };
    },
    async setStatus(input) {
      calls.push(["setStatus", input]);
      this.issue = { ...this.issue, status: input.status };
    },
  };
}

function fakeWorktree({ path = "/var/lib/kit-pi/worktrees/KIT-56", branch = "kit-56" } = {}) {
  const calls = [];
  return {
    calls,
    async checkout(input) {
      calls.push(input);
      return { path, branch, lane: "development" };
    },
  };
}

function checkerRunner({ gh, linear, worktree, spawned, sleep, waitTimeoutMs, waitIntervalMs }) {
  return createPiJobRunner({
    env: validWorkerEnv(),
    workspace: ROOT,
    worktree: worktree ?? fakeWorktree(),
    checkerGh: gh,
    linear,
    spawnProcess(command, args, options) {
      spawned.push({ command, args, options });
      return Promise.resolve({ status: 0 });
    },
    sleep,
    waitTimeoutMs,
    waitIntervalMs,
  });
}

test("status change to In Review enqueues factory-checker and no ADW file", async () => {
  const { result, enqueue } = await routeIssue(snapshot());
  assert.deepEqual(result, { kind: "enqueue", role: "factory-checker" });
  assert.equal(enqueue.jobs.length, 1);
  assert.equal(enqueue.jobs[0].role, "factory-checker");
  assert.equal(enqueue.jobs[0].issueId, ISSUE_ID);
  assert.equal(enqueue.jobs[0].adwFile, undefined);
});

test("Issue update without updatedFrom still enqueues checker when status is In Review", async () => {
  const payload = issueUpdatePayload();
  delete payload.updatedFrom;
  const { result, enqueue } = await routeIssue(snapshot({ delegate: null }), { payload });
  assert.deepEqual(result, { kind: "enqueue", role: "factory-checker" });
  assert.equal(enqueue.jobs[0].role, "factory-checker");
});

test("reviewFeedbackHasFindings treats three-axis (none) as pass and bullets as fail", () => {
  assert.equal(reviewFeedbackIsClean(cleanWorkpad()), true);
  assert.equal(reviewFeedbackHasFindings(cleanWorkpad()), false);
  assert.equal(
    reviewFeedbackIsClean(`${WORKPAD_HEADING}\n\n### Review feedback\n\n- (none)\n`),
    false,
  );
  assert.equal(
    reviewFeedbackHasFindings(`${WORKPAD_HEADING}\n\n### Review feedback\n\n- (none)\n`),
    true,
  );
  assert.equal(reviewFeedbackIsClean(`${WORKPAD_HEADING}\n\n### Review feedback\n\n`), false);
  assert.equal(reviewFeedbackHasFindings(`${WORKPAD_HEADING}\n\n### Review feedback\n\n`), true);
  assert.equal(reviewFeedbackIsClean(`${WORKPAD_HEADING}\n`), false);
  assert.equal(
    reviewFeedbackHasFindings(
      `${WORKPAD_HEADING}\n\n### Review feedback\n\n- Spec: missing AC\n- Standards: lint\n`,
    ),
    true,
  );
  assert.equal(
    reviewFeedbackMissingSlopAxis(
      `${WORKPAD_HEADING}\n\n### Review feedback\n\n- Spec: missing AC\n- Standards: lint\n`,
    ),
    true,
  );
  assert.equal(reviewFeedbackMissingSlopAxis(cleanWorkpad()), false);
  assert.equal(reviewFeedbackSection("### Review feedback\n\n- Spec miss\n"), "- Spec miss");
});

test("applyRatchetNudge does not rewrite an inline ### Review feedback mention", () => {
  const body = `${WORKPAD_HEADING}

### Plan

- [x] Hard findings use a prefix in \`### Review feedback\`

${LOOP_COUNTERS_HEADING}

- ciFailCycles: 0
- reviewLoops: 2

### Review feedback

- Spec: missing evidence
`;
  const next = applyRatchetNudge(body);
  assert.match(next, /prefix in `### Review feedback`/);
  assert.match(next, /### Notes/);
  assert.equal(reviewFeedbackSection(next), "- Spec: missing evidence");
  assert.equal(hasRatchetNudge(next), true);
});

test("clean workpad with Description AC rewrites ticks the renamed line and comments why on that verdict only", async () => {
  const gh = fakeGh();
  const workpad = `${WORKPAD_HEADING}

### Review feedback

${CLEAN_REVIEW_FEEDBACK}

### Description AC rewrites

- Spec is met → Spec AC is met | contract renamed in PR
`;
  const linear = fakeLinear(snapshot(), workpad);
  const result = await completeChecker({
    job: { issueId: ISSUE_ID, identifier: "KIT-56" },
    linear,
    gh,
  });

  assert.equal(result.passed, true);
  const passComment = linear.calls.find((call) => call[0] === "commentIssue")[1];
  assert.match(passComment.body, /✓ Spec AC is met \(rewrote: contract renamed in PR\)/);
  assert.doesNotMatch(passComment.body, /Standards are clean \(rewrote/);
  const descriptionUpdate = linear.calls.find((call) => call[0] === "updateIssueDescription")[1];
  assert.match(descriptionUpdate.description, /- \[x\] Spec AC is met/);
  assert.match(descriptionUpdate.description, /- \[x\] Standards are clean/);
  assert.doesNotMatch(descriptionUpdate.description, /- \[x\] Spec is met/);
});

test("clean workpad + MERGEABLE + green checks moves to Ready for merge and never merges", async () => {
  const gh = fakeGh();
  const linear = fakeLinear();
  const result = await completeChecker({
    job: { issueId: ISSUE_ID, identifier: "KIT-56" },
    linear,
    gh,
  });

  assert.equal(result.passed, true);
  assert.equal(result.nextStatus, READY_FOR_MERGE);
  assert.deepEqual(linear.calls.find((call) => call[0] === "setStatus")[1], {
    issueId: ISSUE_ID,
    status: READY_FOR_MERGE,
  });
  assert.equal(
    gh.calls.some((call) => call[0] === "merge"),
    false,
  );
  const workpad = linear.calls.find((call) => call[0] === "updateWorkpad")[1];
  assert.equal(workpad.commentId, "c1");
  assert.match(workpad.body, /### Status\nAll good — checker pass/);
  assert.equal(reviewFeedbackIsClean(workpad.body), true);
  assert.equal(linear.calls.filter((call) => call[0] === "updateWorkpad").length, 1);
  const passComment = linear.calls.find((call) => call[0] === "commentIssue")[1];
  assert.match(passComment.body, /checker pass/);
  assert.match(passComment.body, /✓ Spec is met/);
  const descriptionUpdate = linear.calls.find((call) => call[0] === "updateIssueDescription")[1];
  assert.match(descriptionUpdate.description, /- \[x\] Spec is met/);
  assert.match(descriptionUpdate.description, /- \[x\] Standards are clean/);
});

test("applyCheckerPassWorkpad keeps Review feedback as three-axis pass lines", () => {
  const next = applyCheckerPassWorkpad(
    `${WORKPAD_HEADING}\n\n### Status\nIn Review\n\n### Review feedback\n\n- Spec: (none)\n- Standards: (none)\n- Slop: (none)\n`,
  );
  assert.match(next, /### Status\nAll good — checker pass/);
  assert.equal(reviewFeedbackIsClean(next), true);
  assert.equal(reviewFeedbackHasFindings(next), false);
  for (const line of REVIEW_PASS_FEEDBACK_LINES) {
    assert.match(next, new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("Pi review findings move to Implementing with complete Review feedback preserved", async () => {
  const gh = fakeGh();
  const linear = fakeLinear(
    snapshot(),
    `${WORKPAD_HEADING}\n\n### Review feedback\n\n- Spec: AC missing\n- Standards: smell in harness/foo.mjs\n`,
  );
  const result = await completeChecker({
    job: { issueId: ISSUE_ID, identifier: "KIT-56" },
    linear,
    gh,
  });

  assert.equal(result.passed, false);
  assert.equal(result.nextStatus, IMPLEMENTING);
  assert.deepEqual(linear.calls.find((call) => call[0] === "setStatus")[1], {
    issueId: ISSUE_ID,
    status: IMPLEMENTING,
  });
  const workpad = linear.calls.find((call) => call[0] === "updateWorkpad")[1];
  assert.match(workpad.body, /### Review feedback/);
  assert.match(workpad.body, /Spec: AC missing/);
  assert.match(workpad.body, /Standards: smell/);
  assert.equal(
    gh.calls.some((call) => call[0] === "merge"),
    false,
  );
  const failComment = linear.calls.find((call) => call[0] === "commentIssue")[1];
  assert.match(failComment.body, /returned to Implementing/);
  assert.equal(
    linear.calls.some((call) => call[0] === "updateIssueDescription"),
    false,
  );
});

test("red required checks fail to Implementing even when workpad is clean", async () => {
  const gh = fakeGh({
    pr: greenPr({ requiredChecks: [{ name: "test", conclusion: "failure" }] }),
  });
  const linear = fakeLinear();
  const result = await completeChecker({
    job: { issueId: ISSUE_ID, identifier: "KIT-56" },
    linear,
    gh,
  });

  assert.equal(result.passed, false);
  assert.equal(result.nextStatus, IMPLEMENTING);
  const workpad = linear.calls.find((call) => call[0] === "updateWorkpad")[1];
  assert.match(workpad.body, /Required GitHub checks failed/);
});

test("CONFLICTING mergeable fails to Implementing", async () => {
  const gh = fakeGh({ pr: greenPr({ mergeable: "CONFLICTING" }) });
  const linear = fakeLinear();
  const result = await completeChecker({
    job: { issueId: ISSUE_ID, identifier: "KIT-56" },
    linear,
    gh,
  });

  assert.equal(result.passed, false);
  assert.equal(result.nextStatus, IMPLEMENTING);
  assert.match(linear.calls.find((call) => call[0] === "updateWorkpad")[1].body, /not MERGEABLE/);
});

test("pending required checks timeout moves to Implementing with feedback", async () => {
  const gh = fakeGh({ pr: greenPr({ requiredChecks: [{ name: "test", conclusion: "" }] }) });
  const linear = fakeLinear();
  const result = await completeChecker({
    job: { issueId: ISSUE_ID, identifier: "KIT-56" },
    linear,
    gh,
    sleep: async () => undefined,
    waitTimeoutMs: 0,
    waitIntervalMs: 0,
  });
  assert.equal(result.passed, false);
  assert.equal(result.nextStatus, IMPLEMENTING);
  assert.match(
    linear.calls.find((call) => call[0] === "updateWorkpad")[1].body,
    /timed out before turning green/,
  );
});

test("missing linked PR moves to Implementing with feedback", async () => {
  const gh = fakeGh();
  const linear = fakeLinear(snapshot({ attachments: [] }));
  const result = await completeChecker({
    job: { issueId: ISSUE_ID, identifier: "KIT-56" },
    linear,
    gh,
  });
  assert.equal(result.passed, false);
  assert.equal(result.nextStatus, IMPLEMENTING);
  assert.match(
    linear.calls.find((call) => call[0] === "updateWorkpad")[1].body,
    /Linked GitHub PR is required/,
  );
});

test("missing Review feedback section fails even when GitHub gates are green", async () => {
  const gh = fakeGh();
  const linear = fakeLinear(
    snapshot(),
    `${WORKPAD_HEADING}\n\n### Evidence\n\n- no feedback section\n`,
  );
  const result = await completeChecker({
    job: { issueId: ISSUE_ID, identifier: "KIT-56" },
    linear,
    gh,
  });
  assert.equal(result.passed, false);
  assert.equal(result.nextStatus, IMPLEMENTING);
  assert.match(
    linear.calls.find((call) => call[0] === "updateWorkpad")[1].body,
    /Spec, Standards, and Slop axis lines/,
  );
});

test("checker never moves to Merging or Done", async () => {
  const gh = fakeGh();
  const linear = fakeLinear();
  await completeChecker({
    job: { issueId: ISSUE_ID, identifier: "KIT-56" },
    linear,
    gh,
  });
  assert.notEqual(linear.issue.status, "Merging");
  assert.notEqual(linear.issue.status, "Done");
});

const notChecker = [
  ["Backlog", "planner"],
  ["Implementing", "implement"],
  ["Merging", "land"],
];

for (const [status, role] of notChecker) {
  test(`status ${status} does not enqueue factory-checker`, async () => {
    const issue = snapshot({
      status,
      labels: status === "Backlog" ? ["ready-for-agent", "Feature"] : ["Feature"],
      delegate: status === "Implementing" ? { name: "Pi" } : null,
      attachments: status === "Implementing" ? [] : snapshot().attachments,
    });
    const { result, enqueue } = await routeIssue(issue);
    assert.notEqual(result.role, "factory-checker");
    assert.equal(
      enqueue.jobs.some((job) => job.role === "factory-checker"),
      false,
    );
    if (result.kind === "enqueue") {
      assert.equal(result.role, role);
    }
  });
}

test("factory-checker job spawns Pi in the issue worktree then applies harness pass/fail", async () => {
  const worktree = fakeWorktree();
  const gh = fakeGh();
  const linear = fakeLinear();
  const spawned = [];
  await checkerRunner({ gh, linear, worktree, spawned }).run({
    role: "factory-checker",
    identifier: "KIT-56",
    issueId: ISSUE_ID,
  });

  assert.deepEqual(worktree.calls, [{ identifier: "KIT-56", mode: "reuse" }]);
  assert.equal(spawned.length, 1);
  assert.equal(spawned[0].options.cwd, "/var/lib/kit-pi/worktrees/KIT-56");
  assert.equal(
    spawned[0].args.some((arg) => String(arg).endsWith(".pi/roles/factory-checker.md")),
    true,
  );
  assert.equal(
    spawned[0].args.some((arg) => String(arg).includes("/code-review")),
    true,
  );
  assert.deepEqual(linear.calls.find((call) => call[0] === "setStatus")[1], {
    issueId: ISSUE_ID,
    status: READY_FOR_MERGE,
  });
  assert.equal(
    gh.calls.some((call) => call[0] === "merge"),
    false,
  );
});

test("factory-checker spawn uses tool allowlist and linear_cli extension", async () => {
  const spawned = [];
  await checkerRunner({
    gh: fakeGh(),
    linear: fakeLinear(),
    spawned,
  }).run({
    role: "factory-checker",
    identifier: "KIT-56",
    issueId: ISSUE_ID,
  });
  assert.equal(spawned[0].args.includes("--no-builtin-tools"), true);
  assert.equal(
    spawned[0].args.some((arg) => String(arg).includes(FACTORY_CHECKER_ALLOWED_TOOLS.join(","))),
    true,
  );
  for (const tool of FACTORY_CHECKER_MEMORY_TOOLS) {
    assert.equal(
      spawned[0].args.some((arg) => String(arg).includes(tool)),
      true,
      `spawn args missing ${tool}`,
    );
  }
  assert.equal(
    spawned[0].args.some((arg) => String(arg).includes(FACTORY_CHECKER_EXCLUDED_TOOLS.join(","))),
    true,
  );
  assert.equal(
    spawned[0].args.some((arg) => String(arg).endsWith("harness/factory-checker-tools.ts")),
    true,
  );
  assert.equal(spawned[0].options.env.LINEAR_ISSUE_ID, ISSUE_ID);
  assert.equal(typeof spawned[0].options.env.SLOP_AGENT_MEMORY_EXCLUDED_TOOLS, "string");
  assert.equal(typeof spawned[0].options.env[SLOP_AGENT_PI_ARGS_ENV], "string");
  assert.ok(spawned[0].options.env[SLOP_AGENT_PI_ARGS_ENV].includes("--exclude-tools"));
});

test("factory-checker tools extension sits next to checker-spawn, not PI_WORKSPACE/harness", () => {
  const args = factoryCheckerToolArgs();
  const extension = args[args.indexOf("-e") + 1];
  assert.equal(extension.includes("/workspace/harness/"), false);
  assert.equal(extension.endsWith("factory-checker-tools.ts"), true);
  assert.equal(existsSync(extension), true);
});

test("factory-checker allowlist includes memory tools and excludes skill_manage", () => {
  for (const tool of FACTORY_CHECKER_MEMORY_TOOLS) {
    assert.ok(FACTORY_CHECKER_ALLOWED_TOOLS.includes(tool), `missing allow ${tool}`);
  }
  assert.equal(FACTORY_CHECKER_ALLOWED_TOOLS.includes("skill_manage"), false);
  assert.equal(FACTORY_CHECKER_ALLOWED_TOOLS.includes("write"), false);
  assert.equal(FACTORY_CHECKER_ALLOWED_TOOLS.includes("edit"), false);
  assert.equal(FACTORY_CHECKER_ALLOWED_TOOLS.includes("bash"), false);
});

test("factory-checker spawn uses Memory writer Hermes config", async () => {
  const spawned = [];
  await checkerRunner({
    gh: fakeGh(),
    linear: fakeLinear(),
    spawned,
  }).run({
    role: "factory-checker",
    identifier: "KIT-112",
    issueId: ISSUE_ID,
  });
  const agentDir = spawned[0].options.env.PI_CODING_AGENT_DIR;
  assert.match(agentDir, /agent-checker$/);
  const configPath = join(agentDir, "hermes-memory-config.json");
  assert.equal(existsSync(configPath), true);
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  assert.equal(config.reviewEnabled, true);
  assert.equal(config.correctionDetection, true);
  assert.equal(config.flushOnShutdown, true);
  assert.equal(config.memoryMode, "policy-only");
});

test("factoryCheckerPiArgs pins role file and prompt", () => {
  const args = factoryCheckerPiArgs({
    workspace: ROOT,
    roleFile: ".pi/roles/factory-checker.md",
    model: "cursor/grok-4.6",
    prompt: "Factory role factory-checker for KIT-56.",
  });
  assert.equal(args.includes("--exclude-tools"), true);
  assert.equal(
    args.some((arg) => String(arg).includes("linear_cli")),
    true,
  );
  assert.equal(
    args.some((arg) => String(arg).endsWith(".pi/roles/factory-checker.md")),
    true,
  );
  assert.equal(args.at(-1), "Factory role factory-checker for KIT-56.");
});

test("factory-checker uses the fast Pi model, not implement Composer", async () => {
  const spawned = [];
  await checkerRunner({
    gh: fakeGh(),
    linear: fakeLinear(),
    spawned,
  }).run({
    role: "factory-checker",
    identifier: "KIT-56",
    issueId: ISSUE_ID,
  });
  const modelIdx = spawned[0].args.indexOf("--model");
  assert.equal(spawned[0].args[modelIdx + 1], "cursor/grok-4.6");
});

test("applyCheckerFailWorkpad replaces Review feedback in one pass", () => {
  const updated = applyCheckerFailWorkpad(`${WORKPAD_HEADING}\n\n### Review feedback\n\n- old\n`, {
    feedbackLines: ["- Spec: new finding", "- Required GitHub checks failed"],
  });
  assert.match(updated, /Spec: new finding/);
  assert.match(updated, /Required GitHub checks failed/);
  assert.doesNotMatch(updated, /- old/);
});

test("ghGateFailures reports mergeable and check failures", () => {
  assert.deepEqual(ghGateFailures(greenPr()), []);
  assert.match(ghGateFailures(greenPr({ mergeable: "CONFLICTING" }))[0], /not MERGEABLE/);
  assert.match(
    ghGateFailures(greenPr({ requiredChecks: [{ name: "test", conclusion: "failure" }] }))[0],
    /checks failed/,
  );
});

test("pullRequestFromAttachments reads the linked GitHub PR for checker", () => {
  assert.deepEqual(pullRequestFromAttachments(snapshot().attachments), {
    number: 56,
    repo: "KitCollective/kit-collective",
    url: PR_URL,
  });
});

test("createCheckerGh exposes viewPr and merge that throws", async () => {
  const gh = createCheckerGh({
    env: { GH_TOKEN: "ghp_secret_token" },
    repo: "KitCollective/kit-collective",
    async runCommand(_command, args) {
      if (args[0] === "pr" && args[1] === "view") {
        return JSON.stringify({
          number: 56,
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
    runSync() {
      throw new Error("checker merge must not run in viewPr test");
    },
  });
  const pr = await gh.viewPr({ number: 56 });
  assert.equal(pr.mergeable, "MERGEABLE");
  assert.throws(() => gh.merge(), /checker never merges/);
});

test("Dockerfile copies checker-exit for the factory-checker job", () => {
  const dockerfile = readFileSync(join(ROOT, "harness/Dockerfile"), "utf8");
  assert.match(dockerfile, /checker-exit\.mjs/);
  assert.match(dockerfile, /checker-spawn\.mjs/);
  assert.match(dockerfile, /factory-checker-tools\.ts/);
});

test("completeChecker skips when the issue is no longer In Review", async () => {
  const linear = fakeLinear(snapshot({ status: IMPLEMENTING }));
  const result = await completeChecker({
    job: { issueId: ISSUE_ID, identifier: "KIT-56" },
    linear,
    gh: fakeGh(),
  });
  assert.equal(result.skipped, true);
  assert.equal(
    linear.calls.some((call) => call[0] === "setStatus"),
    false,
  );
});

function loopCountersBody({ ciFailCycles = 0, reviewLoops = 0 } = {}) {
  return `${WORKPAD_HEADING}

${LOOP_COUNTERS_HEADING}

- ciFailCycles: ${ciFailCycles}
- reviewLoops: ${reviewLoops}

### Review feedback

- Spec: missing evidence
`;
}

test("checker fail incrementing reviewLoops from 1 to 2 writes ratchet nudge and stays Implementing", async () => {
  const gh = fakeGh({
    pr: greenPr({ requiredChecks: [{ name: "test", conclusion: "failure" }] }),
  });
  const linear = fakeLinear(snapshot(), loopCountersBody({ reviewLoops: 1 }));
  const result = await completeChecker({
    job: { issueId: ISSUE_ID, identifier: "KIT-109" },
    linear,
    gh,
  });

  assert.equal(result.passed, false);
  assert.equal(result.nextStatus, IMPLEMENTING);
  const workpad = linear.calls.find((call) => call[0] === "updateWorkpad")[1];
  assert.deepEqual(parseLoopCounters(workpad.body), {
    ciFailCycles: 0,
    reviewLoops: 2,
  });
  assert.equal(hasRatchetNudge(workpad.body), true);
  assert.match(workpad.body, new RegExp(RATCHET_NUDGE_TEXT));
});

test("checker fail incrementing reviewLoops from 0 to 1 does not write ratchet nudge", async () => {
  const gh = fakeGh({
    pr: greenPr({ requiredChecks: [{ name: "test", conclusion: "failure" }] }),
  });
  const linear = fakeLinear(snapshot(), loopCountersBody({ reviewLoops: 0 }));
  const result = await completeChecker({
    job: { issueId: ISSUE_ID, identifier: "KIT-109" },
    linear,
    gh,
  });

  assert.equal(result.passed, false);
  assert.equal(result.nextStatus, IMPLEMENTING);
  const workpad = linear.calls.find((call) => call[0] === "updateWorkpad")[1];
  assert.deepEqual(parseLoopCounters(workpad.body), {
    ciFailCycles: 0,
    reviewLoops: 1,
  });
  assert.equal(hasRatchetNudge(workpad.body), false);
});

test("missing Slop axis fails even when Spec and Standards are clean and GitHub gates are green", async () => {
  const gh = fakeGh();
  const linear = fakeLinear(
    snapshot(),
    `${WORKPAD_HEADING}\n\n### Review feedback\n\n- Spec: (none)\n- Standards: (none)\n`,
  );
  const result = await completeChecker({
    job: { issueId: ISSUE_ID, identifier: "KIT-126" },
    linear,
    gh,
  });
  assert.equal(result.passed, false);
  assert.equal(result.nextStatus, IMPLEMENTING);
  const workpad = linear.calls.find((call) => call[0] === "updateWorkpad")[1];
  assert.match(workpad.body, /Slop axis missing/);
});

test("Slop findings are preserved alongside Spec and Standards in one fail dump", async () => {
  const gh = fakeGh();
  const linear = fakeLinear(
    snapshot(),
    `${WORKPAD_HEADING}\n\n### Review feedback\n\n- Spec: AC missing\n- Standards: lint in harness/foo.mjs\n- Slop/ narrating comment in harness/bar.mjs\n`,
  );
  const result = await completeChecker({
    job: { issueId: ISSUE_ID, identifier: "KIT-126" },
    linear,
    gh,
  });
  assert.equal(result.passed, false);
  const workpad = linear.calls.find((call) => call[0] === "updateWorkpad")[1];
  assert.match(workpad.body, /Spec: AC missing/);
  assert.match(workpad.body, /Standards: lint/);
  assert.match(workpad.body, /Slop\/ narrating comment/);
});

test("factory-checker allowlist includes subagent and Slop child excludes memory writes", () => {
  assert.equal(FACTORY_CHECKER_ALLOWED_TOOLS.includes("subagent"), true);
  assert.deepEqual(SLOP_AGENT_MEMORY_EXCLUDED_TOOLS, [
    "memory_add",
    "memory_replace",
    "memory_remove",
  ]);
  const slopAgent = readFileSync(join(ROOT, ".pi/agents/slop.md"), "utf8");
  for (const tool of SLOP_AGENT_MEMORY_EXCLUDED_TOOLS) {
    assert.equal(new RegExp(`^tools:.*\\b${tool}\\b`, "m").test(slopAgent), false);
  }
});

test("applySlopAgentSpawnEnv calls slopAgentToolArgs and wires both env keys", () => {
  const spawnEnv = {};
  applySlopAgentSpawnEnv(spawnEnv);
  assert.equal(
    spawnEnv.SLOP_AGENT_MEMORY_EXCLUDED_TOOLS,
    SLOP_AGENT_MEMORY_EXCLUDED_TOOLS.join(","),
  );
  assert.equal(typeof spawnEnv[SLOP_AGENT_PI_ARGS_ENV], "string");
  const args = spawnEnv[SLOP_AGENT_PI_ARGS_ENV].split("\0");
  assert.deepEqual(args, slopAgentToolArgs());
});

test("slop.md loads slop-agent-tools via subagentOnlyExtensions", () => {
  const slopAgent = readFileSync(join(ROOT, ".pi/agents/slop.md"), "utf8");
  assert.match(slopAgent, /subagentOnlyExtensions:\s*harness\/slop-agent-tools\.ts/);
});

test("slopAgentToolArgs excludes memory writes and mirrors slop.md tools", () => {
  const args = slopAgentToolArgs();
  assert.equal(args.includes("--exclude-tools"), true);
  const excludeIdx = args.indexOf("--exclude-tools");
  const excluded = args[excludeIdx + 1].split(",");
  for (const tool of SLOP_AGENT_MEMORY_EXCLUDED_TOOLS) {
    assert.equal(excluded.includes(tool), true);
  }
  const toolsIdx = args.indexOf("--tools");
  const allowed = args[toolsIdx + 1].split(",");
  const slopAgent = readFileSync(join(ROOT, ".pi/agents/slop.md"), "utf8");
  const toolsMatch = slopAgent.match(/^tools:\s*(.+)$/m);
  assert.ok(toolsMatch);
  const frontmatterTools = toolsMatch[1].split(",").map((tool) => tool.trim());
  assert.deepEqual(allowed.sort(), frontmatterTools.sort());
});

test("applyCheckerFailWorkpad never falls back to legacy single - (none)", () => {
  const updated = applyCheckerFailWorkpad(`${WORKPAD_HEADING}\n\n### Review feedback\n\n- old\n`, {
    feedbackLines: [],
  });
  assert.doesNotMatch(updated, /^- \(none\)$/m);
  assert.match(updated, /Review feedback incomplete \(harness\)/);
});

test("implementPrompt names Standards + Spec + Slop for factory-checker", () => {
  const prompt = implementPrompt("factory-checker", "KIT-126");
  assert.match(prompt, /Standards \+ Spec \+ Slop/);
  assert.match(prompt, /Slop:\s*\(none\)/);
  assert.match(prompt, /Slop\//);
});

test("applyRatchetNudge ignores high ciFailCycles when reviewLoops stays below 2", () => {
  const body = loopCountersBody({ ciFailCycles: 5, reviewLoops: 1 });
  const next = applyRatchetNudge(body);
  assert.equal(hasRatchetNudge(next), false);
  assert.deepEqual(parseLoopCounters(next), { ciFailCycles: 5, reviewLoops: 1 });
});

test("checker fail with Slop findings syncs inline GitHub review comments", async () => {
  const gh = fakeGh({
    slopSync(input) {
      assert.equal(input.repo, "KitCollective/kit-collective");
      assert.equal(input.number, 56);
      assert.match(input.workpadBody, /Slop\/ narrating comment in harness\/bar.mjs:12/);
      return { posted: ["harness/bar.mjs:12"], resolved: [] };
    },
  });
  const linear = fakeLinear(
    snapshot(),
    `${WORKPAD_HEADING}\n\n### Review feedback\n\n- Spec: (none)\n- Standards: (none)\n- Slop/ narrating comment in harness/bar.mjs:12\n`,
  );
  const result = await completeChecker({
    job: { issueId: ISSUE_ID, identifier: "KIT-127" },
    linear,
    gh,
  });
  assert.equal(result.passed, false);
  assert.equal(
    gh.calls.some((call) => call[0] === "syncSlopReviewThreads"),
    true,
  );
});

test("checker pass resolves stale Slop review threads", async () => {
  const gh = fakeGh({
    slopSync(input) {
      assert.deepEqual(input.findings, []);
      return { posted: [], resolved: ["harness/old.mjs:4"] };
    },
  });
  const linear = fakeLinear(
    snapshot(),
    `${WORKPAD_HEADING}\n\n### Review feedback\n\n- Spec: (none)\n- Standards: (none)\n- Slop: (none)\n`,
  );
  const result = await completeChecker({
    job: { issueId: ISSUE_ID, identifier: "KIT-127" },
    linear,
    gh,
  });
  assert.equal(result.passed, true);
  assert.equal(
    gh.calls.some((call) => call[0] === "syncSlopReviewThreads"),
    true,
  );
});

test("factory-checker allowlist includes gh_cli comment-only host tool", () => {
  assert.equal(FACTORY_CHECKER_ALLOWED_TOOLS.includes("gh_cli"), true);
});

test("implementPrompt names gh_cli for factory-checker Slop threads", () => {
  const prompt = implementPrompt("factory-checker", "KIT-127");
  assert.match(prompt, /gh_cli/);
  assert.match(prompt, /Slop/);
  assert.match(prompt, /cannot merge or approve/);
});

test("createCheckerGh exposes approve that throws", () => {
  const gh = createCheckerGh();
  assert.throws(() => gh.approve(), /never approves/);
});
