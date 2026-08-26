import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { assertWorkerEnv, LINEAR_CLI_PIN, WORKER_SECRET_NAMES } from "../boot-env.mjs";
import { createDelegateGateConfig, PI_BOT_AGENT_NAME } from "../delegate-gate.mjs";
import { createSerialQueue } from "../job-queue.mjs";
import { createActorTokenProvider } from "../linear-actor-token.mjs";
import { createLinearCliClient } from "../linear-cli.mjs";
import { assertPiPackagesReady, createPiJobRunner, REQUIRED_PI_PACKAGES } from "../pi-job.mjs";
import { createWorkerHandler, startWorkerServer } from "../server.mjs";
import { createLinearSessionAdapter } from "../session-adapter.mjs";
import { createMemoryAdapter } from "../webhook-router.mjs";
import { createWorktreeAdapter } from "../worktree.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SECRET = "test-linear-webhook-secret";
const NOW = 1_700_000_000_000;

function validWorkerEnv() {
  return {
    CURSOR_API_KEY: "cursor_test",
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
  };
}

const DELEGATE_GATE = createDelegateGateConfig({ LINEAR_PI_APP_USER_ID: "pi-app-user-1" });

function dispatchableIssue(overrides = {}) {
  return {
    id: "issue-1",
    identifier: "KIT-99",
    status: "Implementing",
    labels: ["Feature"],
    linearType: "Feature",
    blockedBy: [],
    delegate: { name: "Pi" },
    ...overrides,
  };
}

test("worker env lists Cursor SDK, Linear CLI key, webhook HMAC, gh, and the pinned Linear CLI", () => {
  assert.deepEqual(WORKER_SECRET_NAMES, [
    "CURSOR_API_KEY",
    "LINEAR_CLI_API_KEY",
    "LINEAR_WEBHOOK_SECRET",
    "GH_TOKEN",
    "LINEAR_PI_APP_USER_ID",
  ]);
  assert.equal(LINEAR_CLI_PIN.npmPackage, "@schpet/linear-cli");
  assert.equal(LINEAR_CLI_PIN.version, "2.5.0");
  assert.equal(assertWorkerEnv(validWorkerEnv()), true);
});

test("worker env refuses DATABASE_URL so the PI box cannot see Postgres", () => {
  assert.throws(
    () => assertWorkerEnv({ ...validWorkerEnv(), DATABASE_URL: "postgres://kit:kit@db/kit" }),
    /DATABASE_URL/,
  );
});

test("worker env fails closed when a named secret is missing", () => {
  const env = validWorkerEnv();
  delete env.CURSOR_API_KEY;
  assert.throws(() => assertWorkerEnv(env), /CURSOR_API_KEY/);
});

test("serial queue runs only one Pi job at a time", async () => {
  const running = [];
  const maxSeen = [];
  const queue = createSerialQueue({
    async run(job) {
      running.push(job.id);
      maxSeen.push(running.length);
      await new Promise((resolve) => setTimeout(resolve, 20));
      running.splice(running.indexOf(job.id), 1);
      return job.id;
    },
  });

  const [a, b] = await Promise.all([queue.enqueue({ id: "a" }), queue.enqueue({ id: "b" })]);

  assert.equal(a, "a");
  assert.equal(b, "b");
  assert.equal(Math.max(...maxSeen), 1);
});

test("Compose HTTP adapter serves /health without enqueueing a Pi job", async () => {
  const enqueue = {
    jobs: [],
    enqueue(job) {
      this.jobs.push(job);
    },
  };
  const handler = createWorkerHandler({
    secret: SECRET,
    now: () => NOW,
    linear: {
      async getIssue() {
        return null;
      },
    },
    gh: {},
    enqueue,
    delegateGateConfig: DELEGATE_GATE,
  });
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.planner, "active");
    assert.equal(enqueue.jobs.length, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("Compose HTTP adapter still verifies Linear HMAC on POST /webhooks/linear", async () => {
  const enqueue = {
    jobs: [],
    enqueue(job) {
      this.jobs.push(job);
    },
  };
  const handler = createWorkerHandler({
    secret: SECRET,
    now: () => NOW,
    linear: {
      async getIssue() {
        return null;
      },
    },
    gh: {},
    enqueue,
    delegateGateConfig: DELEGATE_GATE,
  });
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const rawBody = JSON.stringify({
    action: "update",
    type: "Issue",
    data: { id: "issue-1" },
    updatedFrom: { stateId: "prev" },
    webhookTimestamp: NOW,
  });
  const signature = createHmac("sha256", SECRET).update(rawBody).digest("hex");
  try {
    const forged = await fetch(`http://127.0.0.1:${port}/webhooks/linear`, {
      method: "POST",
      headers: { "content-type": "application/json", "linear-signature": "00".repeat(32) },
      body: rawBody,
    });
    assert.equal(forged.status, 401);

    const ok = await fetch(`http://127.0.0.1:${port}/webhooks/linear`, {
      method: "POST",
      headers: { "content-type": "application/json", "linear-signature": signature },
      body: rawBody,
    });
    assert.equal(ok.status, 200);
    assert.equal(enqueue.jobs.length, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("docker-compose runs webhook + one replica, no Coolify, no DATABASE_URL", () => {
  const compose = readFileSync(join(ROOT, "harness/docker-compose.yml"), "utf8");
  assert.match(compose, /replicas:\s*1/);
  assert.match(compose, /\/health/);
  assert.doesNotMatch(compose, /coolify/i);
  assert.doesNotMatch(compose, /DATABASE_URL/);
  assert.match(compose, /@schpet\/linear-cli@2\.5\.0|LINEAR_CLI_VERSION:\s*"2\.5\.0"/);
});

test("Dockerfile pins Linear CLI 2.5.0 and does not apply @piagent/platform onboard", () => {
  const dockerfile = readFileSync(join(ROOT, "harness/Dockerfile"), "utf8");
  assert.match(dockerfile, /@schpet\/linear-cli@2\.5\.0/);
  assert.match(dockerfile, /session-adapter\.mjs/);
  assert.match(dockerfile, /delegate-gate\.mjs/);
  assert.match(dockerfile, /linear-actor-token\.mjs/);
  assert.doesNotMatch(dockerfile, /piagent\/platform/);
  assert.doesNotMatch(dockerfile, /\/onboard/);
  assert.doesNotMatch(dockerfile, /DATABASE_URL/);
  assert.match(dockerfile, /COPY \.pi /);
  assert.match(dockerfile, /pi install/);
  assert.match(dockerfile, /PI_WORKSPACE=\/workspace/);
});

test("compose build context includes the repo so .pi lands in the image", () => {
  const compose = readFileSync(join(ROOT, "harness/docker-compose.yml"), "utf8");
  assert.match(compose, /context:\s*\.\./);
  assert.match(compose, /dockerfile:\s*harness\/Dockerfile/);
  assert.match(compose, /PI_WORKSPACE:\s*"\/workspace"/);
});

test("Pi roles, ADW files, pi-subagents, empty MCP, and reviewed damage-control exist", () => {
  const files = [
    ".pi/roles/planner.md",
    ".pi/roles/implement.md",
    ".pi/roles/factory-checker.md",
    ".pi/roles/land.md",
    ".pi/adw/feature.yaml",
    ".pi/adw/bug.yaml",
    ".pi/adw/improvement.yaml",
    ".pi/agents/scout.md",
    ".pi/agents/nest.md",
    ".pi/agents/expo.md",
    ".pi/agents/drizzle.md",
    ".pi/agents/ui-ux.md",
    ".pi/mcp.json",
    ".pi/damage-control.yaml",
    ".pi/extensions.json",
    ".pi/settings.json",
    "harness/host.md",
  ];
  for (const relative of files) {
    assert.equal(existsSync(join(ROOT, relative)), true, `missing ${relative}`);
  }

  const mcp = JSON.parse(readFileSync(join(ROOT, ".pi/mcp.json"), "utf8"));
  assert.deepEqual(mcp.mcpServers, {});

  const extensions = JSON.parse(readFileSync(join(ROOT, ".pi/extensions.json"), "utf8"));
  assert.equal(extensions["piagent-platform-onboard"], false);

  const settings = JSON.parse(readFileSync(join(ROOT, ".pi/settings.json"), "utf8"));
  assert.deepEqual(settings.packages, [...REQUIRED_PI_PACKAGES]);

  const policy = readFileSync(join(ROOT, ".pi/damage-control.yaml"), "utf8");
  assert.match(policy, /\.env/);
  assert.match(policy, /rm/);
  assert.match(policy, /DROP DATABASE/i);

  const envExample = readFileSync(join(ROOT, ".env.example"), "utf8");
  for (const name of WORKER_SECRET_NAMES) {
    assert.match(envExample, new RegExp(`^${name}=`, "m"));
  }
  assert.match(envExample, /LINEAR_CLI_VERSION=2\.5\.0/);
  assert.match(envExample, /Do not set DATABASE_URL on the CX33 worker/i);
  assert.match(envExample, /LINEAR_PI_ACCESS_TOKEN=/);
  assert.match(envExample, /30-day/);
  assert.match(envExample, /PI_MODEL_FAST=cursor\/grok-4\.6/);
  const bootstrapKeyIndex = envExample.indexOf(
    "# Linear admin key for scripts/bootstrap-linear.mjs only.",
  );
  const firstLinearApiKey = envExample.indexOf("LINEAR_API_KEY=");
  const workerKeyIndex = envExample.indexOf("LINEAR_CLI_API_KEY=");
  assert.ok(bootstrapKeyIndex >= 0 && firstLinearApiKey > bootstrapKeyIndex);
  assert.ok(workerKeyIndex > firstLinearApiKey);

  const host = readFileSync(join(ROOT, "harness/host.md"), "utf8");
  assert.match(host, /kit-harness/);
  assert.match(host, /416348660/);
  assert.match(host, /62\.238\.125\.114/);
  assert.match(host, /\/opt\/kit-collective\/harness\/\.env/);
  assert.match(host, /LINEAR_PI_WEBHOOK_SECRET/);
  assert.match(host, /LINEAR_PI_ACCESS_TOKEN/);
  assert.match(host, /30-day/);
  assert.doesNotMatch(host, /\/opt\/kit-collective\/\.env/);
  assert.doesNotMatch(host, /:8080\/health/);

  const wizard = readFileSync(join(ROOT, "harness/cx33-wizard.sh"), "utf8");
  assert.match(wizard, /harness\/\.env/);
  assert.match(wizard, /LINEAR_CLI_API_KEY/);
  assert.doesNotMatch(wizard, /:8080\/health/);
  assert.doesNotMatch(wizard, /Copy worker keys into \/opt\/kit-collective\/\.env/);
});

test("worker env does not accept the bootstrap LINEAR_API_KEY as the CLI secret", () => {
  const env = validWorkerEnv();
  delete env.LINEAR_CLI_API_KEY;
  env.LINEAR_API_KEY = "lin_api_bootstrap";
  assert.throws(() => assertWorkerEnv(env), /LINEAR_CLI_API_KEY/);
});

test("Linear CLI getIssue maps GraphQL JSON into the KIT-52 dispatch snapshot", async () => {
  const calls = [];
  const linear = createLinearCliClient({
    env: validWorkerEnv(),
    async runCommand(command, args, options) {
      calls.push({ command, args, env: options.env });
      return JSON.stringify({
        data: {
          issue: {
            id: "issue-1",
            identifier: "KIT-99",
            state: { name: "Implementing", type: "started" },
            labels: { nodes: [{ name: "Feature" }, { name: "ready-for-agent" }] },
            delegate: { name: "Pi" },
            inverseRelations: {
              nodes: [
                {
                  type: "blocks",
                  issue: { identifier: "KIT-1", state: { name: "Done", type: "completed" } },
                },
              ],
            },
          },
        },
      });
    },
  });

  const issue = await linear.getIssue("issue-1");
  assert.deepEqual(issue, {
    id: "issue-1",
    identifier: "KIT-99",
    status: "Implementing",
    labels: ["Feature", "ready-for-agent"],
    linearType: "Feature",
    blockedBy: [{ status: "Done", statusType: "completed" }],
    delegate: { name: "Pi" },
    attachments: [],
  });
  assert.equal(calls[0].command, "linear");
  assert.equal(calls[0].args[0], "api");
  assert.equal(calls[0].env.LINEAR_API_KEY, "lin_cli_test");
  assert.equal(calls[0].env.LINEAR_CLI_API_KEY, "lin_cli_test");
});

test("Linear CLI getAgentSessionId reads the issue AgentSession id", async () => {
  const calls = [];
  const linear = createLinearCliClient({
    env: validWorkerEnv(),
    async runCommand(command, args) {
      calls.push({ command, args });
      return JSON.stringify({
        data: {
          issue: {
            agentSessions: { nodes: [{ id: "session-kit-99" }] },
          },
        },
      });
    },
  });

  assert.equal(await linear.getAgentSessionId("issue-1"), "session-kit-99");
  assert.equal(calls[0].command, "linear");
  assert.equal(calls[0].args[0], "api");
  assert.match(calls[0].args[1], /IssueAgentSession/);
});

test("boot fails when required Pi packages are missing from pi list", async () => {
  await assert.rejects(
    () =>
      assertPiPackagesReady({
        root: ROOT,
        async listPackages() {
          return "other-extension";
        },
      }),
    /pi-subagents/,
  );
});

test("Pi job runner starts one non-interactive Pi process with the role file", async () => {
  const spawned = [];
  const runner = createPiJobRunner({
    env: validWorkerEnv(),
    workspace: ROOT,
    worktree: {
      async checkout() {
        return { path: "/var/lib/kit-pi/worktrees/KIT-99", branch: "kit-99", lane: "development" };
      },
    },
    gh: {
      calls: [],
      async rebase() {},
      async viewPr() {
        return {
          url: "https://github.com/KitCollective/kit-collective/pull/1",
          mergeable: "MERGEABLE",
          checks: [{ conclusion: "success" }],
        };
      },
      async createPr() {
        return {
          url: "https://github.com/KitCollective/kit-collective/pull/1",
          mergeable: "MERGEABLE",
          checks: [{ conclusion: "success" }],
        };
      },
      merge() {
        throw new Error("implement never merges");
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
    spawnProcess(command, args, options) {
      spawned.push({ command, args, options });
      return Promise.resolve({ status: 0 });
    },
  });

  await runner.run({
    role: "implement",
    identifier: "KIT-99",
    issueId: "issue-1",
    adwFile: ".pi/adw/feature.yaml",
  });

  assert.equal(spawned.length, 1);
  assert.equal(spawned[0].command, "pi");
  assert.ok(spawned[0].args.includes("-p"));
  assert.ok(spawned[0].args.includes("cursor/composer-2.5"));
  assert.ok(spawned[0].args.some((arg) => String(arg).endsWith(".pi/roles/implement.md")));
  assert.equal(spawned[0].options.env.CURSOR_API_KEY, "cursor_test");
  assert.equal(spawned[0].options.env.GH_TOKEN, "ghp_test");
  assert.equal(spawned[0].options.env.LINEAR_API_KEY, "lin_cli_test");
});

test("production adapter fetches Linear and runs one Pi job on a dispatchable Issue POST", async () => {
  const ran = [];
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
    linear: {
      async getIssue() {
        return dispatchableIssue();
      },
    },
    run: async (job) => {
      ran.push(job);
      finished(job);
      return job;
    },
    async listPackages() {
      return REQUIRED_PI_PACKAGES.join("\n");
    },
  });
  const { port } = server.address();
  const rawBody = JSON.stringify({
    action: "update",
    type: "Issue",
    data: { id: "issue-1" },
    updatedFrom: { stateId: "prev" },
    webhookTimestamp: NOW,
  });
  const signature = createHmac("sha256", SECRET).update(rawBody).digest("hex");
  try {
    const ok = await fetch(`http://127.0.0.1:${port}/webhooks/linear`, {
      method: "POST",
      headers: { "content-type": "application/json", "linear-signature": signature },
      body: rawBody,
    });
    assert.equal(ok.status, 200);
    await Promise.race([
      done,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Pi job was never run")), 1000);
      }),
    ]);
    assert.equal(ran.length, 1);
    assert.equal(ran[0].role, "implement");
    assert.equal(ran[0].adwFile, ".pi/adw/feature.yaml");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("createAgentActivity uses the actor=app token, not the personal LINEAR_CLI_API_KEY", async () => {
  const calls = [];
  const linear = createLinearCliClient({
    env: validWorkerEnv(),
    actorTokenProvider: createActorTokenProvider({ env: validWorkerEnv() }),
    async runCommand(command, args, options) {
      calls.push({ command, args, env: options.env });
      if (args[1]?.includes("AgentActivityCreate")) {
        return JSON.stringify({ data: { agentActivityCreate: { success: true } } });
      }
      return JSON.stringify({ data: {} });
    },
  });

  await linear.createAgentActivity({
    sessionId: "session-1",
    content: { type: "thought", body: "ack" },
    ephemeral: false,
  });

  const activityCall = calls.find((call) => call.args[1]?.includes("AgentActivityCreate"));
  assert.ok(activityCall);
  assert.equal(activityCall.env.LINEAR_API_KEY, "actor-token");
  assert.notEqual(activityCall.env.LINEAR_API_KEY, "lin_cli_test");
});

test("createAgentActivity remints via client_credentials after a 401", async () => {
  let mintCount = 0;
  const keys = [];
  const linear = createLinearCliClient({
    env: validWorkerEnv(),
    actorTokenProvider: createActorTokenProvider({
      env: {
        LINEAR_PI_ACCESS_TOKEN: "expired-actor-token",
        LINEAR_PI_CLIENT_ID: "client-id",
        LINEAR_PI_CLIENT_SECRET: "client-secret",
      },
      async mint() {
        mintCount += 1;
        return `minted-${mintCount}`;
      },
    }),
    async runCommand(_command, args, options) {
      keys.push(options.env.LINEAR_API_KEY);
      if (options.env.LINEAR_API_KEY === "expired-actor-token") {
        throw new Error("HTTP 401 unauthorized");
      }
      if (args[1]?.includes("AgentActivityCreate")) {
        return JSON.stringify({ data: { agentActivityCreate: { success: true } } });
      }
      return JSON.stringify({ data: {} });
    },
  });

  await linear.createAgentActivity({
    sessionId: "session-1",
    content: { type: "thought", body: "ack" },
    ephemeral: false,
  });

  assert.equal(mintCount, 1);
  assert.deepEqual(keys, ["expired-actor-token", "minted-1"]);
});

test("compose worker ACKs AgentSession and enqueues implement when delegate is Pi Bot Agent", async () => {
  const postedActivities = [];
  const gitCalls = [];
  const linear = {
    async getIssue() {
      return {
        id: "issue-1",
        identifier: "KIT-99",
        status: "Implementing",
        labels: ["Bug"],
        linearType: "Bug",
        blockedBy: [],
        delegate: { id: "pi-app-user-1", name: PI_BOT_AGENT_NAME },
      };
    },
    async createAgentActivity(input) {
      postedActivities.push(input);
    },
    async getAgentSessionId() {
      return "session-kit-99";
    },
    async clearDelegate() {},
  };
  const enqueue = {
    jobs: [],
    enqueue(job) {
      this.jobs.push(job);
    },
  };
  const adapter = createMemoryAdapter({
    secret: SECRET,
    sessionSecret: "session-secret",
    now: () => NOW,
    linear,
    gh: {},
    enqueue,
    session: createLinearSessionAdapter({ linear }),
    delegateGateConfig: DELEGATE_GATE,
  });

  const sessionBody = JSON.stringify({
    action: "created",
    type: "AgentSessionEvent",
    agentSession: { id: "session-kit-99", issueId: "issue-1" },
    webhookTimestamp: NOW,
  });
  const sessionSignature = createHmac("sha256", "session-secret").update(sessionBody).digest("hex");
  const sessionResult = await adapter.handle({
    rawBody: sessionBody,
    signature: sessionSignature,
    hmacChannel: "session",
  });
  assert.equal(sessionResult.kind, "skip");
  assert.equal(postedActivities.length, 1);

  const issueBody = JSON.stringify({
    action: "update",
    type: "Issue",
    data: { id: "issue-1" },
    updatedFrom: { stateId: "prev" },
    webhookTimestamp: NOW,
  });
  const issueSignature = createHmac("sha256", SECRET).update(issueBody).digest("hex");
  const issueResult = await adapter.handle({ rawBody: issueBody, signature: issueSignature });
  assert.equal(issueResult.kind, "enqueue");
  assert.equal(issueResult.role, "implement");
  assert.equal(enqueue.jobs.length, 1);

  const worktree = createWorktreeAdapter({
    mirrorDir: "/var/lib/kit-pi/mirror.git",
    worktreesDir: "/var/lib/kit-pi/worktrees",
    existsSync: () => false,
    mkdirSync() {},
    async runGit(args) {
      gitCalls.push(args);
      return { stdout: "", status: 0 };
    },
  });
  const checkout = await worktree.checkout({ identifier: "KIT-99" });
  assert.equal(checkout.lane, "development");
  assert.ok(gitCalls.some((args) => args.includes("development")));
  assert.equal(enqueue.jobs[0].adwFile, ".pi/adw/bug.yaml");
});
