/**
 * KIT-79/KIT-113 — Pi JSON stdout pipe for token-use collection.
 * Outbound Agent Session timeline is display-only (linear-agent-session.mjs).
 * Inbound AgentSession webhooks stay skipped (KIT-113).
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { pipeReadableJsonLines, STREAMING_ROLES } from "../pi-event-stream.mjs";
import { createPiJobRunner } from "../pi-job.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ISSUE_ID = "issue-kit-79";

/** Minimal Pi --mode json fixture. */
export const PI_IMPLEMENT_FIXTURE = [
  '{"type":"session","version":3,"id":"sess-1","timestamp":"2026-01-01T00:00:00.000Z","cwd":"/workspace"}',
  '{"type":"agent_start"}',
  '{"type":"message_update","usage":{"input":10,"output":5},"assistantMessageEvent":{"type":"thinking_delta","contentIndex":0,"delta":"Scanning harness seams."}}',
  '{"type":"tool_execution_start","toolCallId":"t1","toolName":"read","args":{"path":"harness/pi-job.mjs"}}',
  '{"type":"tool_execution_end","toolCallId":"t1","toolName":"read","result":{},"isError":false}',
  '{"type":"agent_end","messages":[]}',
].join("\n");

test("STREAMING_ROLES includes implement and factory-checker", () => {
  assert.equal(STREAMING_ROLES.has("implement"), true);
  assert.equal(STREAMING_ROLES.has("factory-checker"), true);
  assert.equal(STREAMING_ROLES.has("planner"), false);
});

test("pipeReadableJsonLines delivers each stdout line to the consumer", async () => {
  const lines = [];
  await pipeReadableJsonLines(Readable.from("one\ntwo\nthree\n"), {
    async consumeLine(line) {
      lines.push(line);
    },
  });
  assert.deepEqual(lines, ["one", "two", "three"]);
});

test("pipeReadableJsonLines flushes a trailing line without a newline", async () => {
  const lines = [];
  await pipeReadableJsonLines(Readable.from("tail"), {
    async consumeLine(line) {
      lines.push(line);
    },
  });
  assert.deepEqual(lines, ["tail"]);
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
  const _consumedDuringChild = [];
  const runner = createPiJobRunner({
    env: {
      PI_MODEL: "cursor/composer-2.5",
      PI_MODEL_FAST: "cursor/grok-4.6",
      LINEAR_CLI_API_KEY: "lin_test",
      OPENROUTER_API_KEY: "or_test",
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
    linear: {
      async listComments() {
        return [{ id: "c1", body: "## Agent Workpad\n" }];
      },
      async updateWorkpad() {},
      async setStatus() {},
    },
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
  assert.equal(closeResolved, true);
});

test("factory-checker spawn also pipes Pi json stdout", async () => {
  const spawned = [];
  let resolveClose;
  const closePromise = new Promise((resolve) => {
    resolveClose = (status) => resolve({ status });
  });
  const runner = createPiJobRunner({
    env: {
      PI_MODEL: "cursor/composer-2.5",
      PI_MODEL_FAST: "cursor/grok-4.6",
      LINEAR_CLI_API_KEY: "lin_test",
      OPENROUTER_API_KEY: "or_test",
    },
    workspace: ROOT,
    worktree: {
      async checkout() {
        return { path: ROOT, branch: "kit-79", lane: "development" };
      },
    },
    gh: {
      async viewPr() {
        return {
          url: "https://github.com/KitCollective/kit-collective/pull/64",
          mergeable: "MERGEABLE",
          checks: [{ conclusion: "success" }],
        };
      },
    },
    linear: {
      async listComments() {
        return [{ id: "c1", body: "## Agent Workpad\n" }];
      },
      async updateWorkpad() {},
      async setStatus() {},
      async getIssue() {
        return {
          id: ISSUE_ID,
          identifier: "KIT-79",
          status: "In Review",
          labels: ["Feature"],
          linearType: "Feature",
          blockedBy: [],
          delegate: null,
        };
      },
    },
    typecheckTouched: async () => undefined,
    spawnProcess(_command, args, options) {
      spawned.push({ args, options });
      const stdout = Readable.from(`${PI_IMPLEMENT_FIXTURE}\n`);
      setImmediate(() => resolveClose(0));
      return Promise.resolve({ stdout, closePromise });
    },
  });

  await runner.run({
    role: "factory-checker",
    identifier: "KIT-79",
    issueId: ISSUE_ID,
  });

  assert.equal(spawned.length, 1);
  assert.deepEqual(spawned[0].options.stdio, ["inherit", "pipe", "inherit"]);
});

test("implement streams a thought then a file-read action, never raw CLI", async () => {
  const posts = [];
  let resolveClose;
  const closePromise = new Promise((resolve) => {
    resolveClose = (status) => resolve({ status });
  });
  const runner = createPiJobRunner({
    env: {
      PI_MODEL: "cursor/composer-2.5",
      PI_MODEL_FAST: "cursor/grok-4.6",
      LINEAR_CLI_API_KEY: "lin_test",
      LINEAR_PI_ACCESS_TOKEN: "actor-token",
      OPENROUTER_API_KEY: "or_test",
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
    linear: {
      async listComments() {
        return [{ id: "c1", body: "## Agent Workpad\n" }];
      },
      async updateWorkpad() {},
      async setStatus() {},
    },
    typecheckTouched: async () => undefined,
    async fetchImpl(_url, init) {
      const body = JSON.parse(String(init.body));
      posts.push(body);
      if (String(body.query).includes("agentSessionCreateOnIssue")) {
        return {
          ok: true,
          async json() {
            return {
              data: {
                agentSessionCreateOnIssue: {
                  success: true,
                  agentSession: { id: "session-kit-79" },
                },
              },
            };
          },
        };
      }
      return {
        ok: true,
        async json() {
          return { data: { agentActivityCreate: { success: true } } };
        },
      };
    },
    spawnProcess(_command, _args, options) {
      const stdout = Readable.from(`${PI_IMPLEMENT_FIXTURE}\n`);
      setImmediate(() => resolveClose(0));
      return Promise.resolve({ stdout, closePromise, options });
    },
  });

  await runner.run({
    role: "implement",
    identifier: "KIT-79",
    issueId: ISSUE_ID,
    adwFile: ".pi/adw/feature.yaml",
  });

  const contents = posts
    .map((row) => row.variables?.input?.content)
    .filter((content) => content && typeof content === "object");
  assert.equal(contents[0]?.type, "thought");
  assert.match(contents[0]?.body ?? "", /Starting implement on KIT-79/);
  assert.ok(contents.some((content) => content.action === "Reading a file"));
  assert.ok(contents.some((content) => content.parameter === "pi-job.mjs"));
  assert.ok(contents.some((content) => content.type === "response"));
  assert.doesNotMatch(JSON.stringify(posts), /actor-token/);
  assert.doesNotMatch(JSON.stringify(posts), /grep |pnpm |Authorization/);
});
