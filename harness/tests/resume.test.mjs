/**
 * KIT-103 — Worker resumes started factory states after rebuild / missed webhook.
 * Seam: runResume / startResumePoller. Fake Linear + enqueue. No Pi spawn.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { LINEAR_CLI_PIN } from "../boot-env.mjs";
import { createDelegateGateConfig } from "../delegate-gate.mjs";
import { createWorkerSlots } from "../job-queue.mjs";
import { RESUME_ORPHANS_QUERY } from "../linear-cli.mjs";
import { REQUIRED_PI_PACKAGES } from "../pi-job.mjs";
import { DEFAULT_PLANNER_POLL_MS } from "../planner.mjs";
import { runResume, startResumePoller } from "../resume.mjs";
import { startWorkerServer } from "../server.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SECRET = "test-linear-webhook-secret";
const DELEGATE_GATE = createDelegateGateConfig({ LINEAR_PI_APP_USER_ID: "pi-app-user-1" });

function validWorkerEnv() {
  return {
    CURSOR_API_KEY: "cursor_test",
    LINEAR_CLI_API_KEY: "lin_cli_test",
    LINEAR_WEBHOOK_SECRET: SECRET,
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

function orphan({
  id = "issue-94",
  identifier = "KIT-94",
  status = "Implementing",
  labels = ["Feature"],
  linearType = "Feature",
  delegate = null,
  description = "write-scope: harness/**",
  priority = 2,
  createdAt = "2026-08-27T00:00:00.000Z",
  ...rest
} = {}) {
  return {
    id,
    identifier,
    status,
    labels,
    linearType,
    delegate,
    description,
    priority,
    createdAt,
    blockedBy: [],
    ...rest,
  };
}

function fakeLinear(issues) {
  return {
    async listOrphans() {
      return issues;
    },
    async claimIssue() {
      throw new Error("resume must not claim");
    },
    async setStatus() {
      throw new Error("resume must not move status");
    },
    async clearDelegate() {
      throw new Error("resume must not clear delegate");
    },
  };
}

function fakeEnqueue() {
  const jobs = [];
  return {
    jobs,
    enqueue(job) {
      jobs.push(job);
      return job;
    },
  };
}

test("runResume enqueues implement for Implementing with empty Agent without moving status", async () => {
  const enqueue = fakeEnqueue();
  const result = await runResume({
    linear: fakeLinear([orphan()]),
    enqueue,
    delegateGateConfig: DELEGATE_GATE,
  });

  assert.equal(enqueue.jobs.length, 1);
  assert.equal(enqueue.jobs[0].role, "implement");
  assert.equal(enqueue.jobs[0].identifier, "KIT-94");
  assert.equal(enqueue.jobs[0].issueId, "issue-94");
  assert.equal(enqueue.jobs[0].adwFile, ".pi/adw/feature.yaml");
  assert.deepEqual(result.enqueued, [{ identifier: "KIT-94", role: "implement" }]);
});

test("runResume enqueues checker, auto-merge, and land for started factory states", async () => {
  const enqueue = fakeEnqueue();
  await runResume({
    linear: fakeLinear([
      orphan({
        id: "issue-47",
        identifier: "KIT-47",
        status: "In Review",
        description: "",
        createdAt: "2026-08-20T00:00:00.000Z",
      }),
      orphan({
        id: "issue-90",
        identifier: "KIT-90",
        status: "Ready for merge",
        description: "",
        createdAt: "2026-08-21T00:00:00.000Z",
      }),
      orphan({
        id: "issue-51",
        identifier: "KIT-51",
        status: "Merging",
        delegate: null,
        description: "",
        createdAt: "2026-08-22T00:00:00.000Z",
      }),
    ]),
    enqueue,
    delegateGateConfig: DELEGATE_GATE,
  });

  assert.deepEqual(
    enqueue.jobs.map((job) => [job.role, job.identifier]),
    [
      ["land", "KIT-51"],
      ["auto-merge", "KIT-90"],
      ["factory-checker", "KIT-47"],
    ],
  );
});

test("runResume skips Parked and Implementing with Cursor Agent", async () => {
  const enqueue = fakeEnqueue();
  const result = await runResume({
    linear: fakeLinear([
      orphan({
        id: "issue-park",
        identifier: "KIT-72",
        status: "Parked",
        delegate: { name: "Pi" },
      }),
      orphan({
        id: "issue-cursor",
        identifier: "KIT-11",
        status: "Implementing",
        delegate: { name: "Cursor" },
      }),
    ]),
    enqueue,
    delegateGateConfig: DELEGATE_GATE,
  });

  assert.equal(enqueue.jobs.length, 0);
  assert.ok(result.skipped.some((row) => row.identifier === "KIT-72"));
  assert.ok(result.skipped.some((row) => row.identifier === "KIT-11"));
});

test("runResume skips overlapping Implementing write-scope after first priority", async () => {
  const enqueue = fakeEnqueue();
  const result = await runResume({
    linear: fakeLinear([
      orphan({
        id: "issue-97",
        identifier: "KIT-97",
        priority: 4,
        createdAt: "2026-08-26T00:00:00.000Z",
        description: "write-scope: harness/**",
      }),
      orphan({
        id: "issue-94",
        identifier: "KIT-94",
        priority: 2,
        createdAt: "2026-08-27T00:00:00.000Z",
        description: "write-scope: harness/**",
      }),
    ]),
    enqueue,
    delegateGateConfig: DELEGATE_GATE,
  });

  assert.deepEqual(
    enqueue.jobs.map((job) => job.identifier),
    ["KIT-94"],
  );
  assert.ok(
    result.skipped.some(
      (row) => row.identifier === "KIT-97" && row.reason === "write-scope overlap",
    ),
  );
});

test("runResume skips identifiers already on the coding slot", async () => {
  const enqueue = fakeEnqueue();
  const result = await runResume({
    linear: fakeLinear([orphan()]),
    enqueue,
    delegateGateConfig: DELEGATE_GATE,
    queuedIdentifiers: ["KIT-94"],
  });

  assert.equal(enqueue.jobs.length, 0);
  assert.ok(
    result.skipped.some((row) => row.identifier === "KIT-94" && row.reason === "already queued"),
  );
});

test("resume poller enqueues immediately and on the planner interval", async () => {
  const jobs = [];
  const timers = [];
  const stop = startResumePoller({
    enqueue: {
      enqueue(job) {
        jobs.push(job);
      },
    },
    intervalMs: DEFAULT_PLANNER_POLL_MS,
    setIntervalFn(fn, ms) {
      timers.push({ fn, ms });
      return 1;
    },
  });

  assert.deepEqual(jobs, [{ role: "resume" }]);
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, 300_000);
  timers[0].fn();
  assert.deepEqual(jobs, [{ role: "resume" }, { role: "resume" }]);
  stop();
});

test("resume enqueues factory-checker while planner is still in flight", async () => {
  let releasePlanner;
  const holdPlanner = new Promise((resolve) => {
    releasePlanner = resolve;
  });
  let plannerStarted;
  const plannerStartedPromise = new Promise((resolve) => {
    plannerStarted = resolve;
  });
  let releaseChecker;
  const holdChecker = new Promise((resolve) => {
    releaseChecker = resolve;
  });
  const ran = [];
  const slots = createWorkerSlots({
    async run(job) {
      ran.push(job.role);
      if (job.role === "planner") {
        plannerStarted();
        await holdPlanner;
        return job;
      }
      if (job.role === "resume") {
        return runResume({
          linear: fakeLinear([
            orphan({
              id: "issue-126",
              identifier: "KIT-126",
              status: "In Review",
              description: "",
            }),
          ]),
          enqueue: slots,
          delegateGateConfig: DELEGATE_GATE,
        });
      }
      if (job.role === "factory-checker") {
        await holdChecker;
      }
      return job;
    },
  });

  slots.enqueue({ role: "planner" });
  await plannerStartedPromise;
  await Promise.race([
    slots.enqueue({ role: "resume" }),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("resume blocked behind hung planner")), 500);
    }),
  ]);
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(ran.includes("resume"), true);
  assert.deepEqual(
    slots.health().jobs.find((job) => job.role === "factory-checker"),
    { role: "factory-checker", identifier: "KIT-126" },
  );
  releaseChecker();
  releasePlanner();
});

test("resume enqueue does not occupy the coding slot", async () => {
  const planner = [];
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
      if (job.role === "resume" || job.role === "planner") {
        planner.push(job);
        return job;
      }
      codingStarted();
      await hold;
      return job;
    },
  });

  const codingPromise = slots.enqueue({ role: "implement", identifier: "KIT-1" });
  await started;
  await slots.enqueue({ role: "resume" });
  assert.equal(planner.length, 1);
  assert.equal(planner[0].role, "resume");
  assert.equal(slots.health().job.role, "implement");
  releaseCoding();
  await codingPromise;
});

test("planner and resume enqueue during three live implements without extra Pi slots", async () => {
  let releaseImplements;
  const holdImplements = new Promise((resolve) => {
    releaseImplements = resolve;
  });
  const planner = [];
  const slots = createWorkerSlots({
    async run(job) {
      if (job.role === "planner" || job.role === "resume" || job.role === "intake") {
        planner.push(job);
        return job;
      }
      if (job.role === "implement") {
        await holdImplements;
      }
      return job;
    },
  });

  for (const identifier of ["KIT-1", "KIT-2", "KIT-3"]) {
    slots.enqueue({ role: "implement", identifier });
  }
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(slots.health().jobs.length, 3);

  await slots.enqueue({ role: "planner" });
  await slots.enqueue({ role: "resume" });
  await slots.enqueue({ role: "intake" });
  assert.equal(planner.length, 3);
  assert.equal(slots.health().jobs.length, 3);

  releaseImplements();
});

test("coding slot reports queued identifiers including pending jobs", async () => {
  let releaseImplement;
  const holdImplement = new Promise((resolve) => {
    releaseImplement = resolve;
  });
  let releaseChecker;
  const holdChecker = new Promise((resolve) => {
    releaseChecker = resolve;
  });
  const slots = createWorkerSlots({
    async run(job) {
      if (job.identifier === "KIT-94") {
        await holdImplement;
      }
      if (job.role === "factory-checker") {
        await holdChecker;
      }
      return job;
    },
  });

  const first = slots.enqueue({ role: "implement", identifier: "KIT-94" });
  slots.enqueue({ role: "factory-checker", identifier: "KIT-47" });
  await new Promise((resolve) => setTimeout(resolve, 5));
  const queued = slots.queuedIdentifiers();
  assert.equal(queued.includes("KIT-94"), true);
  assert.equal(queued.includes("KIT-47"), true);
  releaseChecker();
  releaseImplement();
  await first;
});

test("RESUME_ORPHANS_QUERY lists started factory states and never Parked", () => {
  assert.match(RESUME_ORPHANS_QUERY, /Implementing/);
  assert.match(RESUME_ORPHANS_QUERY, /In Review/);
  assert.match(RESUME_ORPHANS_QUERY, /Ready for merge/);
  assert.match(RESUME_ORPHANS_QUERY, /Merging/);
  assert.equal(RESUME_ORPHANS_QUERY.includes("Parked"), false);
  assert.equal(RESUME_ORPHANS_QUERY.includes("Backlog"), false);
});

test("server starts resume on listen and image copies resume.mjs", () => {
  const server = readFileSync(join(ROOT, "harness/server.mjs"), "utf8");
  assert.match(server, /startResumePoller/);
  assert.match(server, /role === "resume"/);
  assert.match(server, /findOpenIssuePr/);
  assert.match(readFileSync(join(ROOT, "harness/Dockerfile"), "utf8"), /resume\.mjs/);
  assert.match(readFileSync(join(ROOT, "WORKFLOW.md"), "utf8"), /boot and on the resume poller/);
  assert.match(readFileSync(join(ROOT, "docs/agents/automations.md"), "utf8"), /resume poller/);
});

test("startWorkerServer resume on listen enqueues implement for an orphan", async () => {
  const ran = [];
  let finished;
  const done = new Promise((resolve) => {
    finished = resolve;
  });
  const server = await startWorkerServer({
    env: validWorkerEnv(),
    listenHost: "127.0.0.1",
    listenPort: 0,
    plannerPollMs: 60_000,
    intakePollMs: 0,
    linear: {
      async listOrphans() {
        return [orphan()];
      },
      async getIssue() {
        return null;
      },
    },
    run: async (job) => {
      ran.push(job);
      if (job.role === "implement") {
        finished(job);
      }
      return job;
    },
    async listPackages() {
      return REQUIRED_PI_PACKAGES.join("\n");
    },
  });
  try {
    await Promise.race([
      done,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error("resume did not enqueue implement")), 1000);
      }),
    ]);
    assert.equal(
      ran.some((job) => job.role === "implement" && job.identifier === "KIT-94"),
      true,
    );
    assert.equal(
      ran.some((job) => job.role === "resume"),
      false,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
