/**
 * KIT-93 — After implement / factory-checker Pi exit, token use lands on the
 * workpad and `/health`. Fake spawn JSON usage. Do not spawn a model.
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { LINEAR_CLI_PIN } from "../boot-env.mjs";
import { ALWAYS_READY_CAPACITY } from "../job-queue.mjs";
import { WORKPAD_HEADING } from "../linear-cli.mjs";
import { createPiJobRunner, REQUIRED_PI_PACKAGES, TOKEN_USE_HEADING } from "../pi-job.mjs";
import { createWorkerHandler, startWorkerServer } from "../server.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SECRET = "test-linear-webhook-secret";
const NOW = 1_700_000_000_000;
const ISSUE_ID = "issue-kit-93";
const PR_URL = "https://github.com/KitCollective/kit-collective/pull/93";
const API_KEY = "sk-cursor-secret-value-do-not-leak";

function validWorkerEnv() {
  return {
    CURSOR_API_KEY: API_KEY,
    LINEAR_CLI_API_KEY: "lin_cli_test",
    LINEAR_WEBHOOK_SECRET: SECRET,
    LINEAR_PI_WEBHOOK_SECRET: "session-secret",
    GH_TOKEN: "ghp_test",
    LINEAR_PI_APP_USER_ID: "pi-app-user-1",
    LINEAR_PI_CLIENT_ID: "client-id",
    LINEAR_PI_CLIENT_SECRET: "client-secret",
    LINEAR_PI_ACCESS_TOKEN: "actor-token",
    LINEAR_CLI_VERSION: LINEAR_CLI_PIN.version,
    PI_MODEL: "cursor/composer-2.5",
    PI_MODEL_FAST: "cursor/grok-4.6",
    OPENROUTER_API_KEY: "or_test_secret_key",
  };
}

/** Pi JSON fixture: parent Composer usage plus Scout/Gate Hy3 on subagent tool results. */
const PI_IMPLEMENT_USAGE_FIXTURE = [
  '{"type":"session","version":3,"id":"sess-93","timestamp":"2026-01-01T00:00:00.000Z","cwd":"/workspace"}',
  '{"type":"agent_start"}',
  '{"type":"message_update","usage":{"input":1200,"output":400,"cacheRead":0,"cacheWrite":0,"totalTokens":1600},"assistantMessageEvent":{"type":"thinking_delta","contentIndex":0,"delta":"Working."}}',
  '{"type":"tool_execution_start","toolCallId":"t-scout","toolName":"subagent","args":{"agent":"scout","task":"map seams"}}',
  '{"type":"tool_execution_end","toolCallId":"t-scout","toolName":"subagent","result":{"agent":"scout","usage":{"input":100,"output":20}},"isError":false}',
  '{"type":"tool_execution_start","toolCallId":"t-gate","toolName":"subagent","args":{"agent":"gate","task":"pre-review"}}',
  '{"type":"tool_execution_end","toolCallId":"t-gate","toolName":"subagent","result":{"agent":"gate","usage":{"input":80,"output":15}},"isError":false}',
  '{"type":"agent_end","messages":[]}',
].join("\n");

const PI_UNKNOWN_USAGE_FIXTURE = [
  '{"type":"session","version":3,"id":"sess-93","timestamp":"2026-01-01T00:00:00.000Z","cwd":"/workspace"}',
  '{"type":"agent_start"}',
  '{"type":"message_update","usage":{},"assistantMessageEvent":{"type":"thinking_delta","contentIndex":0,"delta":"Scanning."}}',
  '{"type":"agent_end","messages":[]}',
].join("\n");

const PI_SECRET_USAGE_FIXTURE = [
  '{"type":"session","version":3,"id":"sess-93","timestamp":"2026-01-01T00:00:00.000Z","cwd":"/workspace"}',
  '{"type":"agent_start"}',
  `{"type":"message_update","usage":{"input":90,"output":10,"apiKey":"${API_KEY}"},"assistantMessageEvent":{"type":"text_delta","contentIndex":0,"delta":"ok"}}`,
  `{"type":"tool_execution_start","toolName":"bash","args":{"headers":{"Authorization":"Bearer ${API_KEY}"}}}`,
  '{"type":"agent_end","messages":[]}',
].join("\n");

const PI_CHECKER_USAGE_FIXTURE = [
  '{"type":"session","version":3,"id":"sess-93c","timestamp":"2026-01-01T00:00:00.000Z","cwd":"/workspace"}',
  '{"type":"agent_start"}',
  '{"type":"message_update","usage":{"input":500,"output":80},"assistantMessageEvent":{"type":"text_delta","contentIndex":0,"delta":"review"}}',
  '{"type":"agent_end","messages":[]}',
].join("\n");

function workpadStore(initial = `${WORKPAD_HEADING}\n\n### Review feedback\n\n- (none)\n`) {
  const comments = [{ id: "c1", body: initial }];
  const updates = [];
  return {
    comments,
    updates,
    async listComments() {
      return comments.map((comment) => ({ id: comment.id, body: comment.body }));
    },
    async updateWorkpad(input) {
      updates.push(input);
      const found = comments.find((comment) => comment.id === (input.commentId ?? "c1"));
      if (found) {
        found.body = input.body;
      } else {
        comments.push({ id: input.commentId ?? "c1", body: input.body });
      }
    },
  };
}

function implementGh() {
  return {
    async rebase() {},
    async viewPr() {
      return {
        url: PR_URL,
        mergeable: "MERGEABLE",
        checks: [{ conclusion: "success" }],
      };
    },
    async createPr() {
      return {
        url: PR_URL,
        mergeable: "MERGEABLE",
        checks: [{ conclusion: "success" }],
      };
    },
    merge() {
      throw new Error("implement never merges");
    },
  };
}

function spawnFromFixture(fixture) {
  return function spawnProcess(_command, _args, _options) {
    let resolveClose;
    const closePromise = new Promise((resolve) => {
      resolveClose = (status) => resolve({ status });
    });
    const stdout = Readable.from(`${fixture}\n`);
    setImmediate(() => resolveClose(0));
    return Promise.resolve({ stdout, closePromise });
  };
}

test("GET /health includes tokens: null and stays HTTP 200 when no coding job has finished", async () => {
  const handler = createWorkerHandler({
    secret: SECRET,
    now: () => NOW,
    linear: {
      async getIssue() {
        return null;
      },
    },
    gh: {},
    enqueue: { enqueue() {} },
  });
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.tokens, null);
    assert.deepEqual(body.capacity, ALWAYS_READY_CAPACITY);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("after implement, the workpad records token counts per role and model (input and output)", async () => {
  const pad = workpadStore();
  const runner = createPiJobRunner({
    env: validWorkerEnv(),
    workspace: ROOT,
    worktree: {
      async checkout() {
        return { path: ROOT, branch: "kit-93", lane: "development" };
      },
    },
    gh: implementGh(),
    linear: {
      ...pad,
      async setStatus() {},
    },
    typecheckTouched: async () => undefined,
    spawnProcess: spawnFromFixture(PI_IMPLEMENT_USAGE_FIXTURE),
  });

  const result = await runner.run({
    role: "implement",
    identifier: "KIT-93",
    issueId: ISSUE_ID,
    adwFile: ".pi/adw/feature.yaml",
  });

  const body = pad.comments[0].body;
  assert.match(body, new RegExp(TOKEN_USE_HEADING));
  assert.match(body, /Implement \(Composer\): input 1200, output 400/);
  assert.equal(body.includes(API_KEY), false);
  assert.equal(result.tokens.role, "implement");
  assert.equal(result.tokens.identifier, "KIT-93");
  assert.deepEqual(result.tokens.lines, [
    { role: "implement", model: "Composer", input: 1200, output: 400 },
    { role: "scout", model: "Hy3", input: 100, output: 20 },
    { role: "gate", model: "Hy3", input: 80, output: 15 },
  ]);
});

test("Scout and Gate (Hy3) are separate lines from the Implement parent (Composer) when those counts exist", async () => {
  const pad = workpadStore();
  const runner = createPiJobRunner({
    env: validWorkerEnv(),
    workspace: ROOT,
    worktree: {
      async checkout() {
        return { path: ROOT, branch: "kit-93", lane: "development" };
      },
    },
    gh: implementGh(),
    linear: {
      ...pad,
      async setStatus() {},
    },
    typecheckTouched: async () => undefined,
    spawnProcess: spawnFromFixture(PI_IMPLEMENT_USAGE_FIXTURE),
  });

  await runner.run({
    role: "implement",
    identifier: "KIT-93",
    issueId: ISSUE_ID,
    adwFile: ".pi/adw/feature.yaml",
  });

  const body = pad.comments[0].body;
  const implementLine = body.match(/^- Implement \(Composer\):.+$/m)?.[0];
  const scoutLine = body.match(/^- Scout \(Hy3\):.+$/m)?.[0];
  const gateLine = body.match(/^- Gate \(Hy3\):.+$/m)?.[0];
  assert.equal(implementLine, "- Implement (Composer): input 1200, output 400");
  assert.equal(scoutLine, "- Scout (Hy3): input 100, output 20");
  assert.equal(gateLine, "- Gate (Hy3): input 80, output 15");
  assert.notEqual(implementLine, scoutLine);
  assert.notEqual(implementLine, gateLine);
});

test("factory-checker workpad records Grok token counts for the checker role", async () => {
  const pad = workpadStore();
  const runner = createPiJobRunner({
    env: validWorkerEnv(),
    workspace: ROOT,
    worktree: {
      async checkout() {
        return { path: ROOT, branch: "kit-93", lane: "development" };
      },
    },
    linear: {
      ...pad,
      async getIssue() {
        return {
          id: ISSUE_ID,
          identifier: "KIT-93",
          status: "In Review",
          attachments: [{ url: PR_URL }],
        };
      },
      async setStatus() {},
    },
    checkerGh: {
      async viewPr() {
        return {
          url: PR_URL,
          mergeable: "MERGEABLE",
          requiredChecks: [{ name: "test", conclusion: "success" }],
        };
      },
      merge() {
        throw new Error("checker never merges");
      },
    },
    spawnProcess: spawnFromFixture(PI_CHECKER_USAGE_FIXTURE),
  });

  const result = await runner.run({
    role: "factory-checker",
    identifier: "KIT-93",
    issueId: ISSUE_ID,
  });

  const body = pad.comments[0].body;
  assert.match(body, /Factory-checker \(Grok\): input 500, output 80/);
  assert.equal(body.includes("Scout (Hy3)"), false);
  assert.deepEqual(result.tokens.lines, [
    { role: "factory-checker", model: "Grok", input: 500, output: 80 },
  ]);
});

test("unknown counts are written as unknown — the job still completes; numbers are not invented", async () => {
  const pad = workpadStore();
  const runner = createPiJobRunner({
    env: validWorkerEnv(),
    workspace: ROOT,
    worktree: {
      async checkout() {
        return { path: ROOT, branch: "kit-93", lane: "development" };
      },
    },
    gh: implementGh(),
    linear: {
      ...pad,
      async setStatus() {},
    },
    typecheckTouched: async () => undefined,
    spawnProcess: spawnFromFixture(PI_UNKNOWN_USAGE_FIXTURE),
  });

  const result = await runner.run({
    role: "implement",
    identifier: "KIT-93",
    issueId: ISSUE_ID,
    adwFile: ".pi/adw/feature.yaml",
  });

  const body = pad.comments[0].body;
  assert.match(body, /Implement \(Composer\): input unknown, output unknown/);
  assert.equal(body.includes("input 0"), false);
  assert.equal(result.status, "In Review");
  assert.deepEqual(result.tokens.lines, [
    { role: "implement", model: "Composer", input: "unknown", output: "unknown" },
  ]);
});

test("tokens and secrets never appear as raw API keys in the workpad or health JSON", async () => {
  const pad = workpadStore();
  const runner = createPiJobRunner({
    env: validWorkerEnv(),
    workspace: ROOT,
    worktree: {
      async checkout() {
        return { path: ROOT, branch: "kit-93", lane: "development" };
      },
    },
    gh: implementGh(),
    linear: {
      ...pad,
      async setStatus() {},
    },
    typecheckTouched: async () => undefined,
    spawnProcess: spawnFromFixture(PI_SECRET_USAGE_FIXTURE),
  });

  const result = await runner.run({
    role: "implement",
    identifier: "KIT-93",
    issueId: ISSUE_ID,
    adwFile: ".pi/adw/feature.yaml",
  });

  const workpad = pad.comments[0].body;
  assert.equal(workpad.includes(API_KEY), false);
  assert.equal(workpad.includes("or_test_secret_key"), false);
  assert.equal(workpad.includes("Bearer"), false);
  const health = JSON.stringify(result.tokens);
  assert.equal(health.includes(API_KEY), false);
  assert.equal(health.includes("or_test_secret_key"), false);
});

test("Planner does not write model token lines", async () => {
  const pad = workpadStore();
  const spawned = [];
  const runner = createPiJobRunner({
    env: validWorkerEnv(),
    workspace: ROOT,
    linear: {
      ...pad,
      async lookupUser() {
        return { id: "pi-app-user-1", name: "Pi" };
      },
      async listDispatch() {
        return {
          implementingState: { id: "state-implementing", name: "Implementing" },
          implementingIssues: [],
          issues: [],
        };
      },
      async commentIssue() {
        throw new Error("planner should not comment in this fixture");
      },
    },
    spawnProcess(command, args) {
      spawned.push({ command, args });
      return Promise.resolve({ status: 0 });
    },
  });

  await runner.run({ role: "planner" });
  assert.equal(spawned.length, 0);
  assert.equal(pad.updates.length, 0);
  assert.equal(pad.comments[0].body.includes(TOKEN_USE_HEADING), false);
});

test("Intake does not write model token lines", async () => {
  const workpadWrites = [];
  const spawned = [];
  const runner = createPiJobRunner({
    env: validWorkerEnv(),
    workspace: ROOT,
    linear: {
      async listTriage() {
        return {
          teamId: "team-kit",
          backlogState: { id: "state-backlog", name: "Backlog" },
          duplicateState: { id: "state-duplicate", name: "Duplicate" },
          labels: {},
          issues: [],
        };
      },
      async listComments() {
        return [{ id: "c1", body: `${WORKPAD_HEADING}\n` }];
      },
      async updateWorkpad(input) {
        workpadWrites.push(input);
      },
    },
    spawnProcess(command, args) {
      spawned.push({ command, args });
      return Promise.resolve({ status: 0 });
    },
  });

  await runner.run({ role: "intake" });
  assert.equal(spawned.length, 0);
  assert.equal(workpadWrites.length, 0);
});

test("/health includes the last coding job token totals after implement; HTTP stays 200", async () => {
  let finished;
  const done = new Promise((resolve) => {
    finished = resolve;
  });
  const server = await startWorkerServer({
    env: validWorkerEnv(),
    listenHost: "127.0.0.1",
    listenPort: 0,
    now: () => NOW,
    plannerPollMs: 0,
    intakePollMs: 0,
    linear: {
      async getIssue() {
        return {
          id: ISSUE_ID,
          identifier: "KIT-93",
          status: "Implementing",
          labels: ["Feature"],
          linearType: "Feature",
          blockedBy: [],
          delegate: { name: "Pi" },
        };
      },
    },
    run: async (job) => {
      const tokens = {
        role: "implement",
        identifier: "KIT-93",
        lines: [{ role: "implement", model: "Composer", input: 1200, output: 400 }],
      };
      finished(tokens);
      return { ...job, tokens };
    },
    async listPackages() {
      return REQUIRED_PI_PACKAGES.join("\n");
    },
  });
  const { port } = server.address();
  const rawBody = JSON.stringify({
    action: "update",
    type: "Issue",
    data: { id: ISSUE_ID },
    updatedFrom: { stateId: "prev" },
    webhookTimestamp: NOW,
  });
  const signature = createHmac("sha256", SECRET).update(rawBody).digest("hex");
  try {
    const idle = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(idle.status, 200);
    assert.equal((await idle.json()).tokens, null);

    const ok = await fetch(`http://127.0.0.1:${port}/webhooks/linear`, {
      method: "POST",
      headers: { "content-type": "application/json", "linear-signature": signature },
      body: rawBody,
    });
    assert.equal(ok.status, 200);
    await Promise.race([
      done,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error("implement job never finished")), 1000);
      }),
    ]);

    const deadline = Date.now() + 1000;
    let response;
    let body;
    while (Date.now() < deadline) {
      response = await fetch(`http://127.0.0.1:${port}/health`);
      assert.equal(response.status, 200);
      body = await response.json();
      if (body.tokens) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(body.ok, true);
    assert.equal(body.job, null);
    assert.deepEqual(body.tokens, {
      role: "implement",
      identifier: "KIT-93",
      lines: [{ role: "implement", model: "Composer", input: 1200, output: 400 }],
    });
    assert.equal(JSON.stringify(body).includes(API_KEY), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
