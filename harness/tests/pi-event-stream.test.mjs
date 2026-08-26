/**
 * KIT-79 — Pi JSON stdout maps to Linear AgentSession thought/action activities.
 * Fake Linear and a fake Pi event fixture; do not spawn a model.
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  createPiEventStreamConsumer,
  mapPiEventToActivity,
  pipeReadableJsonLines,
  redactSensitiveArgs,
  summarizeToolArgs,
  truncateText,
} from "../pi-event-stream.mjs";
import { createPiJobRunner } from "../pi-job.mjs";
import { createLinearSessionAdapter, createMemorySessionAdapter } from "../session-adapter.mjs";
import { createMemoryAdapter } from "../webhook-router.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ISSUE_ID = "issue-kit-79";
const SESSION_ID = "session-kit-79";
const NOW = 1_700_000_000_000;

/** Minimal Pi --mode json fixture: thinking, then a read tool. */
export const PI_IMPLEMENT_FIXTURE = [
  '{"type":"session","version":3,"id":"sess-1","timestamp":"2026-01-01T00:00:00.000Z","cwd":"/workspace"}',
  '{"type":"agent_start"}',
  '{"type":"message_update","usage":{},"assistantMessageEvent":{"type":"thinking_delta","contentIndex":0,"delta":"Scanning harness seams."}}',
  '{"type":"tool_execution_start","toolCallId":"t1","toolName":"read","args":{"path":"harness/pi-job.mjs"}}',
  '{"type":"tool_execution_end","toolCallId":"t1","toolName":"read","result":{},"isError":false}',
  '{"type":"agent_end","messages":[]}',
].join("\n");

function fakeLinear(overrides = {}) {
  const postedActivities = [];
  return {
    postedActivities,
    async getAgentSessionId() {
      return SESSION_ID;
    },
    async createAgentActivity(input) {
      if (overrides.throwOnActivity) {
        throw new Error("linear down");
      }
      postedActivities.push(input);
    },
    async clearDelegate() {},
    ...overrides,
  };
}

test("mapPiEventToActivity maps tool starts to ephemeral actions", () => {
  assert.deepEqual(
    mapPiEventToActivity({
      type: "tool_execution_start",
      toolName: "grep",
      args: { pattern: "session" },
    }),
    {
      type: "action",
      action: "grep",
      parameter: '{"pattern":"session"}',
    },
  );
});

test("summarizeToolArgs truncates long JSON parameters", () => {
  const long = summarizeToolArgs({ note: `word ${"segment ".repeat(30)}` });
  assert.ok(long.endsWith("…"));
  assert.ok(long.length <= 120);
});

test("summarizeToolArgs redacts secrets from tool parameters", () => {
  const summary = summarizeToolArgs({
    command: "curl https://api.example.com",
    headers: { Authorization: "Bearer secret-token-value" },
    cookie: "session=super-secret-cookie",
  });
  assert.equal(summary.includes("secret-token-value"), false);
  assert.equal(summary.includes("super-secret-cookie"), false);
  assert.match(summary, /\[redacted\]/);
  assert.deepEqual(redactSensitiveArgs({ token: "ghp_abcdefghijklmnopqrstuvwxyz1234567890" }), {
    token: "[redacted]",
  });
});

test("truncateText caps thought bodies for Linear", () => {
  assert.equal(truncateText("short"), "short");
  assert.ok(truncateText("x".repeat(600)).endsWith("…"));
});

test("Pi fixture stream posts thought then action without touching the workpad", async () => {
  const linear = fakeLinear();
  const session = createLinearSessionAdapter({ linear });
  const consumer = createPiEventStreamConsumer({
    session,
    issueId: ISSUE_ID,
    minIntervalMs: 0,
    now: () => NOW,
  });
  await pipeReadableJsonLines(Readable.from(`${PI_IMPLEMENT_FIXTURE}\n`), consumer);

  const ephemeral = session.activities.filter((activity) => activity.ephemeral === true);
  assert.equal(ephemeral.length, 2);
  assert.equal(ephemeral[0].sessionId, SESSION_ID);
  assert.equal(ephemeral[0].content.type, "thought");
  assert.equal(ephemeral[0].content.body, "Scanning harness seams.");
  assert.equal(ephemeral[1].content.type, "action");
  assert.equal(ephemeral[1].content.action, "read");
  assert.match(ephemeral[1].content.parameter, /pi-job\.mjs/);
  assert.equal(linear.postedActivities.length, 2);
});

test("streamed tool args redact secrets before posting to Linear", async () => {
  const linear = fakeLinear();
  const session = createLinearSessionAdapter({ linear });
  const consumer = createPiEventStreamConsumer({
    session,
    issueId: ISSUE_ID,
    minIntervalMs: 0,
  });
  await consumer.consumeLine(
    JSON.stringify({
      type: "tool_execution_start",
      toolName: "bash",
      args: {
        command: "curl https://api.example.com",
        headers: { Authorization: "Bearer ghp_supersecrettokenvalue1234567890" },
      },
    }),
  );

  const action = session.activities.find((activity) => activity.content.type === "action");
  assert.ok(action);
  assert.equal(action.content.parameter.includes("ghp_supersecrettokenvalue1234567890"), false);
  assert.equal(action.content.parameter.includes("Bearer"), false);
  assert.match(action.content.parameter, /\[redacted\]/);
});

test("stream consumer swallows Linear failures without throwing", async () => {
  const linear = fakeLinear({ throwOnActivity: true });
  const session = createLinearSessionAdapter({ linear });
  const consumer = createPiEventStreamConsumer({
    session,
    issueId: ISSUE_ID,
    minIntervalMs: 0,
  });
  await assert.doesNotReject(async () => {
    await consumer.consumeLine(
      '{"type":"tool_execution_start","toolName":"bash","args":{"command":"pnpm test"}}',
    );
  });
});

test("Issue webhook enqueue is unchanged when the session stream adapter throws", async () => {
  const enqueue = {
    jobs: [],
    enqueue(job) {
      this.jobs.push(job);
    },
  };
  const linear = {
    async getIssue() {
      return {
        id: ISSUE_ID,
        identifier: "KIT-79",
        status: "Implementing",
        labels: ["Feature"],
        linearType: "Feature",
        blockedBy: [],
        delegate: { name: "Pi" },
      };
    },
    async getAgentSessionId() {
      return SESSION_ID;
    },
    async createAgentActivity() {
      throw new Error("stream path failed");
    },
  };
  const session = createLinearSessionAdapter({ linear });
  const adapter = createMemoryAdapter({
    secret: "issue-secret",
    sessionSecret: "session-secret",
    now: NOW,
    linear,
    gh: {},
    enqueue,
    session,
  });
  const rawBody = JSON.stringify({
    action: "update",
    type: "Issue",
    data: { id: ISSUE_ID },
    updatedFrom: { stateId: "prev" },
    webhookTimestamp: NOW,
  });
  const signature = createHmac("sha256", "issue-secret").update(rawBody).digest("hex");
  const result = await adapter.handle({ rawBody, signature, hmacChannel: "issue" });

  assert.equal(result.kind, "enqueue");
  assert.equal(result.role, "implement");
  assert.equal(enqueue.jobs.length, 1);
});

test("implement Pi spawn pipes stdout before spawn close resolves", async () => {
  const spawned = [];
  let closeResolved = false;
  let resolveClose;
  const closePromise = new Promise((resolve) => {
    resolveClose = (status) => {
      closeResolved = true;
      resolve({ status });
    };
  });
  const activitiesDuringChild = [];
  const linear = {
    async listComments() {
      return [{ id: "c1", body: "## Agent Workpad\n" }];
    },
    async updateWorkpad() {},
    async setStatus() {},
    async getAgentSessionId() {
      return SESSION_ID;
    },
    async createAgentActivity(input) {
      if (!closeResolved) {
        activitiesDuringChild.push(input);
      }
    },
  };
  const session = createLinearSessionAdapter({ linear });
  const runner = createPiJobRunner({
    env: {
      PI_MODEL: "cursor/composer-2.5",
      PI_MODEL_FAST: "cursor/grok-4.6",
      LINEAR_CLI_API_KEY: "lin_test",
    },
    workspace: ROOT,
    worktree: {
      async checkout() {
        return { path: ROOT, branch: "kit-79", lane: "development" };
      },
    },
    gh: {
      async rebase() {},
      async viewPr() {
        return {
          url: "https://github.com/KitCollective/kit-collective/pull/60",
          mergeable: "MERGEABLE",
          checks: [{ conclusion: "success" }],
        };
      },
      async createPr() {
        return {
          url: "https://github.com/KitCollective/kit-collective/pull/60",
          mergeable: "MERGEABLE",
          checks: [{ conclusion: "success" }],
        };
      },
    },
    linear,
    session,
    typecheckTouched: async () => undefined,
    spawnProcess(_command, args, options) {
      spawned.push({ args, options });
      const stdout = Readable.from(`${PI_IMPLEMENT_FIXTURE}\n`);
      setImmediate(() => resolveClose(0));
      return Promise.resolve({ stdout, closePromise });
    },
  });

  await runner.run({
    role: "implement",
    identifier: "KIT-79",
    issueId: ISSUE_ID,
    adwFile: ".pi/adw/feature.yaml",
  });

  assert.equal(spawned.length, 1);
  assert.ok(spawned[0].args.includes("--mode"));
  assert.ok(spawned[0].args.includes("json"));
  assert.deepEqual(spawned[0].options.stdio, ["inherit", "pipe", "inherit"]);
  assert.ok(activitiesDuringChild.length >= 2);
  assert.ok(activitiesDuringChild.some((activity) => activity.content.type === "thought"));
  assert.ok(activitiesDuringChild.some((activity) => activity.content.type === "action"));
  const streamed = session.activities.filter((activity) => activity.ephemeral === true);
  assert.ok(streamed.length >= 2);
});

test("factory-checker spawn also streams Pi json events", async () => {
  const spawned = [];
  let resolveClose;
  const closePromise = new Promise((resolve) => {
    resolveClose = (status) => resolve({ status });
  });
  const session = createMemorySessionAdapter({
    linear: {
      async getAgentSessionId() {
        return SESSION_ID;
      },
      async createAgentActivity() {},
    },
  });
  const runner = createPiJobRunner({
    env: {
      PI_MODEL: "cursor/composer-2.5",
      PI_MODEL_FAST: "cursor/grok-4.6",
      LINEAR_CLI_API_KEY: "lin_test",
    },
    workspace: ROOT,
    worktree: {
      async checkout() {
        return { path: ROOT, branch: "kit-79", lane: "development" };
      },
    },
    linear: {
      async getIssue() {
        return {
          id: ISSUE_ID,
          identifier: "KIT-79",
          status: "In Review",
          attachments: [{ url: "https://github.com/KitCollective/kit-collective/pull/64" }],
        };
      },
      async listComments() {
        return [{ id: "c1", body: "## Agent Workpad\n\n### Review feedback\n\n- (none)\n" }];
      },
      async updateWorkpad() {},
      async setStatus() {},
    },
    checkerGh: {
      async viewPr() {
        return {
          url: "https://github.com/KitCollective/kit-collective/pull/64",
          mergeable: "MERGEABLE",
          requiredChecks: [{ name: "test", conclusion: "success" }],
        };
      },
    },
    session,
    spawnProcess(_command, args, options) {
      spawned.push({ args, options });
      const stdout = Readable.from(
        '{"type":"tool_execution_start","toolName":"grep","args":{"pattern":"KIT-79"}}\n',
      );
      setImmediate(() => resolveClose(0));
      return Promise.resolve({ stdout, closePromise });
    },
  });

  await runner.run({
    role: "factory-checker",
    identifier: "KIT-79",
    issueId: ISSUE_ID,
  });

  assert.ok(spawned[0].args.includes("json"));
  assert.equal(
    session.activities.some(
      (activity) => activity.content.type === "action" && activity.content.action === "grep",
    ),
    true,
  );
});
