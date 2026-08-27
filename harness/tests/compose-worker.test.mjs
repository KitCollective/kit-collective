import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { assertWorkerEnv, LINEAR_CLI_PIN, WORKER_SECRET_NAMES } from "../boot-env.mjs";
import { capacityCommentBody, floorsFromEnv, snapshotCapacity } from "../capacity.mjs";
import { createDelegateGateConfig, PI_BOT_AGENT_NAME } from "../delegate-gate.mjs";
import { ALWAYS_READY_CAPACITY, createSerialQueue, createWorkerSlots, parseImplementSlots } from "../job-queue.mjs";
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
    OPENROUTER_API_KEY: "or_test",
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
    "OPENROUTER_API_KEY",
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

test("worker env fails closed when OPENROUTER_API_KEY is missing", () => {
  const env = validWorkerEnv();
  delete env.OPENROUTER_API_KEY;
  assert.throws(() => assertWorkerEnv(env), /OPENROUTER_API_KEY/);
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

test("planner job runs on its own mutex while a Coding job occupies the slot", async () => {
  let codingStarted;
  const started = new Promise((resolve) => {
    codingStarted = resolve;
  });
  let releaseCoding;
  const hold = new Promise((resolve) => {
    releaseCoding = resolve;
  });
  const plannerFinished = [];
  const slots = createWorkerSlots({
    async run(job) {
      if (job.role === "planner") {
        plannerFinished.push(job);
        return job;
      }
      codingStarted();
      await hold;
      return job;
    },
  });

  const codingPromise = slots.enqueue({ role: "implement", identifier: "KIT-99" });
  await started;
  await slots.enqueue({ role: "planner" });
  assert.equal(plannerFinished.length, 1);
  assert.deepEqual(slots.health().job, { role: "implement", identifier: "KIT-99" });
  releaseCoding();
  await codingPromise;
  assert.equal(slots.health().job, null);
});

test("three implement jobs run concurrently; a fourth waits in queued", async () => {
  const running = [];
  const maxSeen = [];
  let releaseAll;
  const hold = new Promise((resolve) => {
    releaseAll = resolve;
  });
  const slots = createWorkerSlots({
    async run(job) {
      running.push(job.identifier);
      maxSeen.push(running.length);
      await hold;
      running.splice(running.indexOf(job.identifier), 1);
      return job;
    },
  });

  const jobs = ["KIT-1", "KIT-2", "KIT-3", "KIT-4"].map((identifier) =>
    slots.enqueue({ role: "implement", identifier }),
  );
  await new Promise((resolve) => setTimeout(resolve, 20));

  const health = slots.health();
  assert.equal(health.jobs.length, 3);
  assert.deepEqual(
    health.jobs.map((row) => row.identifier).sort(),
    ["KIT-1", "KIT-2", "KIT-3"],
  );
  assert.deepEqual(health.queued, ["KIT-4"]);
  assert.equal(Math.max(...maxSeen), 3);

  releaseAll();
  await Promise.all(jobs);
  assert.deepEqual(slots.health().jobs, []);
  assert.deepEqual(slots.health().queued, []);
});

test("factory-checker uses the Finisher slot while three implements stay live", async () => {
  let releaseImplements;
  const holdImplements = new Promise((resolve) => {
    releaseImplements = resolve;
  });
  let releaseFinisher;
  const holdFinisher = new Promise((resolve) => {
    releaseFinisher = resolve;
  });
  const slots = createWorkerSlots({
    async run(job) {
      if (job.role === "implement") {
        await holdImplements;
      }
      if (job.role === "factory-checker") {
        await holdFinisher;
      }
      return job;
    },
  });

  for (const identifier of ["KIT-1", "KIT-2", "KIT-3"]) {
    slots.enqueue({ role: "implement", identifier });
  }
  await new Promise((resolve) => setTimeout(resolve, 20));
  const checker = slots.enqueue({ role: "factory-checker", identifier: "KIT-99" });
  await new Promise((resolve) => setTimeout(resolve, 20));

  const health = slots.health();
  assert.equal(health.jobs.length, 4);
  assert.equal(
    health.jobs.filter((row) => row.role === "implement").length,
    3,
  );
  assert.deepEqual(health.jobs.find((row) => row.role === "factory-checker"), {
    role: "factory-checker",
    identifier: "KIT-99",
  });
  assert.deepEqual(health.queued, []);

  releaseFinisher();
  await checker;
  releaseImplements();
});

test("auto-merge and land use the Finisher slot and jump a queued fourth implement", async () => {
  let releaseImplements;
  const holdImplements = new Promise((resolve) => {
    releaseImplements = resolve;
  });
  const finisherGate = {
    promise: /** @type {Promise<void>} */ (Promise.resolve()),
    release: /** @type {(() => void) | null} */ (null),
  };
  function armFinisherGate() {
    finisherGate.promise = new Promise((resolve) => {
      finisherGate.release = resolve;
    });
  }
  armFinisherGate();
  const slots = createWorkerSlots({
    async run(job) {
      if (job.role === "implement") {
        await holdImplements;
      }
      if (job.role === "auto-merge" || job.role === "land") {
        await finisherGate.promise;
      }
      return job;
    },
  });

  for (const identifier of ["KIT-1", "KIT-2", "KIT-3", "KIT-4"]) {
    slots.enqueue({ role: "implement", identifier });
  }
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(slots.health().queued, ["KIT-4"]);

  const autoMerge = slots.enqueue({ role: "auto-merge", identifier: "KIT-90" });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(
    slots.health().jobs.find((row) => row.role === "auto-merge"),
    { role: "auto-merge", identifier: "KIT-90" },
  );
  assert.deepEqual(slots.health().queued, ["KIT-4"]);

  finisherGate.release?.();
  await autoMerge;

  armFinisherGate();
  const land = slots.enqueue({ role: "land", identifier: "KIT-51" });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(
    slots.health().jobs.find((row) => row.role === "land"),
    { role: "land", identifier: "KIT-51" },
  );
  assert.deepEqual(slots.health().queued, ["KIT-4"]);

  finisherGate.release?.();
  await land;
  releaseImplements();
});

test("Finisher is never stolen for a fourth implement", async () => {
  let releaseImplements;
  const holdImplements = new Promise((resolve) => {
    releaseImplements = resolve;
  });
  let releaseFinisher;
  const holdFinisher = new Promise((resolve) => {
    releaseFinisher = resolve;
  });
  const slots = createWorkerSlots({
    async run(job) {
      if (job.role === "implement") {
        await holdImplements;
      }
      if (job.role === "factory-checker") {
        await holdFinisher;
      }
      return job;
    },
  });

  for (const identifier of ["KIT-1", "KIT-2", "KIT-3"]) {
    slots.enqueue({ role: "implement", identifier });
  }
  slots.enqueue({ role: "implement", identifier: "KIT-4" });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(slots.health().queued, ["KIT-4"]);

  const checker = slots.enqueue({ role: "factory-checker", identifier: "KIT-47" });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(
    slots.health().jobs.find((row) => row.role === "factory-checker"),
    { role: "factory-checker", identifier: "KIT-47" },
  );
  assert.deepEqual(slots.health().queued, ["KIT-4"]);

  releaseFinisher();
  await checker;
  releaseImplements();
});

test("a second checker waits in queued while the Finisher slot is busy", async () => {
  let releaseChecker;
  const holdChecker = new Promise((resolve) => {
    releaseChecker = resolve;
  });
  const slots = createWorkerSlots({
    async run(job) {
      if (job.role === "factory-checker") {
        await holdChecker;
      }
      return job;
    },
  });

  const first = slots.enqueue({ role: "factory-checker", identifier: "KIT-47" });
  await new Promise((resolve) => setTimeout(resolve, 10));
  slots.enqueue({ role: "factory-checker", identifier: "KIT-48" });
  await new Promise((resolve) => setTimeout(resolve, 10));

  const health = slots.health();
  assert.equal(health.jobs.length, 1);
  assert.deepEqual(health.jobs[0], { role: "factory-checker", identifier: "KIT-47" });
  assert.deepEqual(health.queued, ["KIT-48"]);

  releaseChecker();
  await first;
});

test("each implement checkout uses its own Issue worktree path", async () => {
  const checkouts = [];
  const slots = createWorkerSlots({
    async run(job) {
      checkouts.push({
        identifier: job.identifier,
        path: `/var/lib/kit-pi/worktrees/${job.identifier}`,
      });
      return job;
    },
  });

  await Promise.all([
    slots.enqueue({ role: "implement", identifier: "KIT-10" }),
    slots.enqueue({ role: "implement", identifier: "KIT-11" }),
  ]);

  assert.deepEqual(
    checkouts.map((row) => row.identifier).sort(),
    ["KIT-10", "KIT-11"],
  );
  assert.deepEqual(
    checkouts.map((row) => row.path).sort(),
    ["/var/lib/kit-pi/worktrees/KIT-10", "/var/lib/kit-pi/worktrees/KIT-11"],
  );
});

test("parseImplementSlots defaults to 3 and clamps 1–3", () => {
  assert.equal(parseImplementSlots({}), 3);
  assert.equal(parseImplementSlots({ PI_IMPLEMENT_SLOTS: "2" }), 2);
  assert.equal(parseImplementSlots({ PI_IMPLEMENT_SLOTS: "0" }), 1);
  assert.equal(parseImplementSlots({ PI_IMPLEMENT_SLOTS: "9" }), 3);
  assert.equal(parseImplementSlots({ PI_IMPLEMENT_SLOTS: "bad" }), 3);
});

test("rejected coding job stays on the queue and does not become unhandled", async () => {
  const slots = createWorkerSlots({
    async run(job) {
      if (job.role === "factory-checker") {
        throw new Error("pi exited 1 for KIT-47");
      }
      return job;
    },
  });
  await assert.rejects(
    slots.enqueue({ role: "factory-checker", identifier: "KIT-47" }),
    /pi exited 1 for KIT-47/,
  );
  const next = await slots.enqueue({ role: "land", identifier: "KIT-51" });
  assert.equal(next.role, "land");
});

test("planner enqueue does not occupy the coding slot", async () => {
  const coding = [];
  const planner = [];
  const slots = createWorkerSlots({
    async run(job) {
      if (job.role === "planner") {
        planner.push(job);
        return job;
      }
      coding.push(job);
      return job;
    },
  });

  await slots.enqueue({ role: "planner" });
  assert.equal(coding.length, 0);
  assert.equal(planner.length, 1);
  assert.equal(slots.health().job, null);
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
    assert.equal(body.job, null);
    assert.deepEqual(body.capacity, ALWAYS_READY_CAPACITY);
    assert.equal(body.capacity.ready, true);
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
  assert.match(dockerfile, /pi-event-stream\.mjs/);
  assert.match(dockerfile, /delegate-gate\.mjs/);
  assert.match(dockerfile, /linear-actor-token\.mjs/);
  assert.doesNotMatch(dockerfile, /piagent\/platform/);
  assert.doesNotMatch(dockerfile, /\/onboard/);
  assert.doesNotMatch(dockerfile, /DATABASE_URL/);
  assert.match(dockerfile, /pr-write-scope\.mjs/);
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

test("root dockerignore re-includes Pi role and agent markdown after excluding **/*.md", () => {
  const lines = readFileSync(join(ROOT, ".dockerignore"), "utf8")
    .split("\n")
    .map((line) => line.trim());
  const excludeMd = lines.indexOf("**/*.md");
  assert.notEqual(excludeMd, -1);
  assert.equal(lines[excludeMd + 1], "!.pi/**/*.md");
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
    ".pi/agents/gate.md",
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
  assert.match(envExample, /^OPENROUTER_API_KEY=$/m);
  assert.match(envExample, /PI_MODEL=cursor\/composer-2\.5/);
  assert.match(envExample, /PI_IMPLEMENT_SLOTS=3/);
  assert.doesNotMatch(envExample, /stealth|ox-alpha/i);
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
  assert.match(host, /OPENROUTER_API_KEY/);
  assert.match(host, /30-day/);
  assert.match(host, /"job"/);
  assert.match(host, /"jobs"/);
  assert.match(host, /"queued"/);
  assert.match(host, /Implement pool/);
  assert.match(host, /Finisher/);
  assert.match(host, /PI_IMPLEMENT_SLOTS/);
  assert.match(host, /ramFreeMb/);
  assert.match(host, /diskFreeMb/);
  assert.doesNotMatch(host, /\/opt\/kit-collective\/\.env/);
  assert.doesNotMatch(host, /:8080\/health/);

  const wizard = readFileSync(join(ROOT, "harness/cx33-wizard.sh"), "utf8");
  assert.match(wizard, /harness\/\.env/);
  assert.match(wizard, /LINEAR_CLI_API_KEY/);
  assert.match(wizard, /OPENROUTER_API_KEY/);
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

async function postWebhook(port, payload, { path = "/webhooks/linear", secret = SECRET } = {}) {
  const rawBody = JSON.stringify(payload);
  const signature = createHmac("sha256", secret).update(rawBody).digest("hex");
  return fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "linear-signature": signature },
    body: rawBody,
  });
}

test("GET /health stays HTTP 200 during a live Coding job and reports role plus identifier", async () => {
  let release;
  const hold = new Promise((resolve) => {
    release = resolve;
  });
  let started;
  const startedPromise = new Promise((resolve) => {
    started = resolve;
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
      started();
      await hold;
      return job;
    },
    async listPackages() {
      return REQUIRED_PI_PACKAGES.join("\n");
    },
  });
  const { port } = server.address();
  try {
    const ok = await postWebhook(port, {
      action: "update",
      type: "Issue",
      data: { id: "issue-1" },
      updatedFrom: { stateId: "prev" },
      webhookTimestamp: NOW,
    });
    assert.equal(ok.status, 200);
    await Promise.race([
      startedPromise,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Coding job never started")), 1000);
      }),
    ]);

    const response = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(response.status, 200);
    assert.notEqual(response.status, 503);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.planner, "active");
    assert.deepEqual(body.job, { role: "implement", identifier: "KIT-99" });
    assert.equal(typeof body.capacity.ramFreeMb, "number");
    assert.equal(typeof body.capacity.diskFreeMb, "number");
    assert.equal(typeof body.capacity.ready, "boolean");
  } finally {
    release();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("planner webhook runs while a Coding job occupies the slot", async () => {
  let release;
  const hold = new Promise((resolve) => {
    release = resolve;
  });
  let codingStarted;
  const codingStartedPromise = new Promise((resolve) => {
    codingStarted = resolve;
  });
  let plannerFinished;
  const plannerDone = new Promise((resolve) => {
    plannerFinished = resolve;
  });
  const ran = [];
  const server = await startWorkerServer({
    env: validWorkerEnv(),
    listenHost: "127.0.0.1",
    listenPort: 0,
    now: () => NOW,
    plannerPollMs: 0,
    linear: {
      async getIssue(id) {
        if (id === "issue-planner") {
          return {
            id: "issue-planner",
            identifier: "KIT-10",
            status: "Backlog",
            labels: ["ready-for-agent", "Feature"],
            linearType: "Feature",
            blockedBy: [],
            delegate: null,
          };
        }
        return dispatchableIssue();
      },
    },
    run: async (job) => {
      ran.push(job);
      if (job.role === "planner") {
        plannerFinished(job);
        return job;
      }
      codingStarted();
      await hold;
      return job;
    },
    async listPackages() {
      return REQUIRED_PI_PACKAGES.join("\n");
    },
  });
  const { port } = server.address();
  try {
    const implementPost = await postWebhook(port, {
      action: "update",
      type: "Issue",
      data: { id: "issue-1" },
      updatedFrom: { stateId: "prev" },
      webhookTimestamp: NOW,
    });
    assert.equal(implementPost.status, 200);
    await codingStartedPromise;

    const plannerPost = await postWebhook(port, {
      action: "update",
      type: "Issue",
      data: { id: "issue-planner" },
      updatedFrom: { stateId: "prev" },
      webhookTimestamp: NOW,
    });
    assert.equal(plannerPost.status, 200);
    await Promise.race([
      plannerDone,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error("planner stuck on the coding mutex")), 500);
      }),
    ]);

    const health = await fetch(`http://127.0.0.1:${port}/health`).then((r) => r.json());
    assert.deepEqual(health.job, { role: "implement", identifier: "KIT-99" });
    assert.equal(
      ran.some((job) => job.role === "planner"),
      true,
    );
  } finally {
    release();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("AgentSession created and prompted still do not enqueue a Coding job", async () => {
  const ran = [];
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
      return job;
    },
    async listPackages() {
      return REQUIRED_PI_PACKAGES.join("\n");
    },
  });
  const { port } = server.address();
  try {
    for (const action of ["created", "prompted"]) {
      const response = await postWebhook(
        port,
        {
          action,
          type: "AgentSessionEvent",
          agentSession: { id: "session-kit-99", issueId: "issue-1" },
          webhookTimestamp: NOW,
        },
        { path: "/webhooks/linear/agent-session", secret: "session-secret" },
      );
      assert.equal(response.status, 200);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(ran.length, 0);
    const health = await fetch(`http://127.0.0.1:${port}/health`).then((r) => r.json());
    assert.equal(health.job, null);
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

const DEFAULT_RAM_FLOOR_MB = 2048;
const DEFAULT_DISK_FLOOR_MB = 5120;

function fakeCapacityLinear(overrides = {}) {
  const comments = [];
  const statusCalls = [];
  const claimed = [];
  let nextId = 1;
  const backlog = overrides.backlog ?? [];
  return {
    comments,
    statusCalls,
    claimed,
    async commentIssue({ issueId, body }) {
      const id = `cap-${nextId++}`;
      comments.push({ id, issueId, body });
      return { id };
    },
    async listComments() {
      return comments.map((comment) => ({ id: comment.id, body: comment.body }));
    },
    async updateComment({ id, body }) {
      const found = comments.find((comment) => comment.id === id);
      if (!found) {
        throw new Error(`missing comment ${id}`);
      }
      found.body = body;
    },
    async updateWorkpad() {},
    async setStatus(input) {
      statusCalls.push(input);
    },
    async lookupUser(id) {
      return { id, name: "Pi" };
    },
    async listDispatch() {
      return {
        implementingState: { id: "state-implementing", name: "Implementing" },
        issues: backlog,
      };
    },
    async claimIssue(input) {
      claimed.push(input);
      const issue = backlog.find((row) => row.id === input.id) ?? backlog[0];
      return {
        assignee: issue?.assignee ?? { id: "human-1", name: "Nicklas" },
        delegate: { id: "pi-app-user-1", name: "Pi" },
      };
    },
  };
}

function implementFakes(linear) {
  const spawned = [];
  return {
    spawned,
    worktree: {
      async checkout() {
        return { path: "/var/lib/kit-pi/worktrees/KIT-87", branch: "kit-87", lane: "development" };
      },
    },
    gh: {
      async rebase() {},
      async viewPr() {
        return {
          url: "https://github.com/KitCollective/kit-collective/pull/87",
          mergeable: "MERGEABLE",
          checks: [{ conclusion: "success" }],
        };
      },
      async createPr() {
        return {
          url: "https://github.com/KitCollective/kit-collective/pull/87",
          mergeable: "MERGEABLE",
          checks: [{ conclusion: "success" }],
        };
      },
      merge() {
        throw new Error("implement never merges");
      },
    },
    linear,
    typecheckTouched: async () => undefined,
    spawnProcess(command, args, options) {
      spawned.push({ command, args, options });
      return Promise.resolve({ status: 0 });
    },
  };
}

async function waitUntil(predicate, label) {
  const deadline = Date.now() + 1000;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${label}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

test("GET /health reports capacity numbers, ready false, and stays HTTP 200", async () => {
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
    readCapacity: async () => ({ ramFreeMb: 100, diskFreeMb: 200, ready: false }),
  });
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      planner: "active",
      jobs: [],
      queued: [],
      job: null,
      capacity: { ramFreeMb: 100, diskFreeMb: 200, ready: false },
      tokens: null,
    });
    assert.equal(enqueue.jobs.length, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("coding spawn waits on RAM and disk floors; job stays queued; status unchanged; one comment updated in place", async () => {
  const linear = fakeCapacityLinear();
  const fakes = implementFakes(linear);
  let ramFreeMb = 100;
  let diskFreeMb = 200;
  const sleepWaits = [];
  const runner = createPiJobRunner({
    env: validWorkerEnv(),
    workspace: ROOT,
    ...fakes,
    readCapacity: async () => ({
      ramFreeMb,
      diskFreeMb,
      ready: ramFreeMb >= DEFAULT_RAM_FLOOR_MB && diskFreeMb >= DEFAULT_DISK_FLOOR_MB,
    }),
    capacitySleep: () => new Promise((resolve) => sleepWaits.push(resolve)),
  });
  const slots = createWorkerSlots({ run: (job) => runner.run(job) });
  let settled = false;
  const pending = slots
    .enqueue({
      role: "implement",
      identifier: "KIT-87",
      issueId: "issue-87",
      adwFile: ".pi/adw/feature.yaml",
    })
    .then((result) => {
      settled = true;
      return result;
    });

  await waitUntil(
    () => linear.comments.length === 1 && sleepWaits.length === 1,
    "capacity comment",
  );
  assert.equal(fakes.spawned.length, 0);
  assert.equal(settled, false);
  assert.equal(linear.statusCalls.length, 0);
  assert.match(linear.comments[0].body, /## Capacity gate/);
  assert.match(linear.comments[0].body, /100/);
  assert.match(linear.comments[0].body, /200/);

  ramFreeMb = 101;
  sleepWaits[0]();
  await waitUntil(
    () => linear.comments[0].body.includes("101") && sleepWaits.length >= 2,
    "in-place comment update",
  );
  assert.equal(linear.comments.length, 1);
  assert.equal(fakes.spawned.length, 0);
  assert.equal(settled, false);
  assert.equal(linear.statusCalls.length, 0);
  assert.equal(
    linear.statusCalls.some((call) => call.status === "Parked"),
    false,
  );

  ramFreeMb = 4096;
  diskFreeMb = 10_240;
  sleepWaits[1]();
  await pending;
  assert.equal(settled, true);
  assert.equal(fakes.spawned.length, 1);
  assert.equal(fakes.spawned[0].command, "pi");
  assert.equal(linear.comments.length, 1);
  assert.equal(
    linear.statusCalls.some((call) => call.status === "Parked"),
    false,
  );
});

test("planner still runs while a coding job waits on capacity", async () => {
  const linear = fakeCapacityLinear({
    backlog: [
      {
        id: "issue-plan",
        identifier: "KIT-1",
        status: "Backlog",
        labels: ["ready-for-agent"],
        priority: 3,
        createdAt: "2026-08-26T00:00:00.000Z",
        assignee: { id: "human-1", name: "Nicklas" },
        blockedBy: [],
      },
    ],
  });
  const fakes = implementFakes(linear);
  const sleepWaits = [];
  const runner = createPiJobRunner({
    env: validWorkerEnv(),
    workspace: ROOT,
    ...fakes,
    readCapacity: async () => ({ ramFreeMb: 100, diskFreeMb: 200, ready: false }),
    capacitySleep: () => new Promise((resolve) => sleepWaits.push(resolve)),
  });

  const slots = createWorkerSlots({ run: (job) => runner.run(job) });
  const coding = slots.enqueue({
    role: "implement",
    identifier: "KIT-87",
    issueId: "issue-87",
    adwFile: ".pi/adw/feature.yaml",
  });
  await waitUntil(() => sleepWaits.length === 1, "capacity wait sleep");

  const planned = await slots.enqueue({ role: "planner", identifier: "KIT-1" });
  assert.equal(planned.claimed.length, 1);
  assert.equal(planned.claimed[0].identifier, "KIT-1");
  assert.equal(fakes.spawned.length, 0);
  assert.equal(linear.statusCalls.length, 0);

  coding.catch(() => undefined);
});

test("env floors override the 2 GB RAM and 5 GB disk defaults", async () => {
  const linear = fakeCapacityLinear();
  const fakes = implementFakes(linear);
  const sleepWaits = [];
  const runner = createPiJobRunner({
    env: {
      ...validWorkerEnv(),
      PI_CAPACITY_RAM_MB: "500",
      PI_CAPACITY_DISK_MB: "800",
    },
    workspace: ROOT,
    ...fakes,
    readCapacity: async () => ({ ramFreeMb: 400, diskFreeMb: 700 }),
    capacitySleep: () => new Promise((resolve) => sleepWaits.push(resolve)),
  });

  const pending = runner.run({
    role: "implement",
    identifier: "KIT-87",
    issueId: "issue-87",
    adwFile: ".pi/adw/feature.yaml",
  });
  pending.catch(() => undefined);
  await waitUntil(() => linear.comments.length === 1, "capacity comment at custom floor");
  assert.equal(fakes.spawned.length, 0);
  assert.match(linear.comments[0].body, /500/);
  assert.match(linear.comments[0].body, /800/);
});

test("capacity below floor on the second implement spawn keeps first in jobs and second queued", async () => {
  const linear = fakeCapacityLinear();
  let releaseFirst;
  const holdFirst = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  const sleepWaits = [];
  const floors = floorsFromEnv(validWorkerEnv());
  const slots = createWorkerSlots({
    env: { PI_IMPLEMENT_SLOTS: "1" },
    async run(job) {
      if (job.identifier === "KIT-87") {
        await holdFirst;
        return job;
      }
      await linear.commentIssue({
        issueId: job.issueId,
        body: capacityCommentBody(
          { ramFreeMb: 100, diskFreeMb: 200, ready: false },
          floors,
          job,
        ),
      });
      await new Promise((resolve) => sleepWaits.push(resolve));
      return job;
    },
  });

  const first = slots.enqueue({
    role: "implement",
    identifier: "KIT-87",
    issueId: "issue-87",
  });
  await waitUntil(() => slots.health().jobs.some((row) => row.identifier === "KIT-87"), "first job");
  assert.deepEqual(slots.health().queued, []);

  const second = slots.enqueue({
    role: "implement",
    identifier: "KIT-88",
    issueId: "issue-88",
  });
  await waitUntil(() => slots.health().queued.includes("KIT-88"), "second queued on full slot");
  assert.equal(linear.comments.length, 0);

  releaseFirst();
  await waitUntil(() => linear.comments.length === 1 && sleepWaits.length === 1, "capacity wait");
  assert.deepEqual(slots.health().jobs.map((row) => row.identifier), ["KIT-88"]);
  assert.deepEqual(slots.health().queued, []);
  assert.match(linear.comments[0].body, /## Capacity gate/);

  sleepWaits[0]();
  await second;
  await first;
});

test("host inventory and Dockerfile document worker health capacity", () => {
  const host = readFileSync(join(ROOT, "harness/host.md"), "utf8");
  assert.match(host, /ramFreeMb/);
  assert.match(host, /diskFreeMb/);
  assert.match(host, /PI_CAPACITY_RAM_MB/);
  assert.match(host, /PI_CAPACITY_DISK_MB/);
  assert.match(readFileSync(join(ROOT, "harness/Dockerfile"), "utf8"), /capacity\.mjs/);
});

const MISSING_WORKTREES = "/var/lib/kit-pi/worktrees";
const VOLUME_PARENT = "/var/lib/kit-pi";
const VOLUME_BLOCKS = { bavail: 20_000_000, bsize: 4096 };

function enoentError(path) {
  const error = new Error(`ENOENT: ${path}`);
  error.code = "ENOENT";
  return error;
}

test("missing worktrees dir still measures the worktree volume and is ready above the disk floor", async () => {
  const snapshot = await snapshotCapacity({
    worktreesDir: MISSING_WORKTREES,
    readRamFreeMb: async () => 4096,
    async statfs(path) {
      if (path === MISSING_WORKTREES) {
        throw enoentError(path);
      }
      assert.equal(path, VOLUME_PARENT);
      return VOLUME_BLOCKS;
    },
  });
  assert.equal(snapshot.diskFreeMb > DEFAULT_DISK_FLOOR_MB, true);
  assert.equal(snapshot.ready, true);
});

test("missing worktrees dir with disk above floor starts the queued coding job and does not Park", async () => {
  const linear = fakeCapacityLinear();
  const fakes = implementFakes(linear);
  const runner = createPiJobRunner({
    env: validWorkerEnv(),
    workspace: ROOT,
    ...fakes,
    readCapacity: () =>
      snapshotCapacity({
        worktreesDir: MISSING_WORKTREES,
        readRamFreeMb: async () => 4096,
        async statfs(path) {
          if (path === MISSING_WORKTREES) {
            throw enoentError(path);
          }
          return VOLUME_BLOCKS;
        },
      }),
  });

  await runner.run({
    role: "implement",
    identifier: "KIT-87",
    issueId: "issue-87",
    adwFile: ".pi/adw/feature.yaml",
  });

  assert.equal(fakes.spawned.length, 1);
  assert.equal(fakes.spawned[0].command, "pi");
  assert.equal(linear.comments.length, 0);
  assert.equal(
    linear.statusCalls.some((call) => call.status === "Parked"),
    false,
  );
});

test("unreadable worktree volume fails closed so the coding job does not spawn", async () => {
  const linear = fakeCapacityLinear();
  const fakes = implementFakes(linear);
  const sleepWaits = [];
  const runner = createPiJobRunner({
    env: validWorkerEnv(),
    workspace: ROOT,
    ...fakes,
    readCapacity: () =>
      snapshotCapacity({
        worktreesDir: MISSING_WORKTREES,
        readRamFreeMb: async () => 4096,
        async statfs() {
          const error = new Error("EIO");
          error.code = "EIO";
          throw error;
        },
      }),
    capacitySleep: () => new Promise((resolve) => sleepWaits.push(resolve)),
  });

  const pending = runner.run({
    role: "implement",
    identifier: "KIT-87",
    issueId: "issue-87",
    adwFile: ".pi/adw/feature.yaml",
  });
  pending.catch(() => undefined);
  await waitUntil(
    () => linear.comments.length === 1 && sleepWaits.length === 1,
    "fail-closed wait",
  );
  assert.equal(fakes.spawned.length, 0);
  assert.match(linear.comments[0].body, /0 MB/);
  assert.equal(
    linear.statusCalls.some((call) => call.status === "Parked"),
    false,
  );
});
