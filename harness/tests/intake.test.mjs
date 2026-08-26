import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { LINEAR_CLI_PIN } from "../boot-env.mjs";
import {
  DEFAULT_INTAKE_POLL_MS,
  FORBIDDEN_INTAKE_STATES,
  INTAKE_COMMENT_HEADING,
  runIntake,
  startIntakePoller,
} from "../intake.mjs";
import { createWorkerSlots } from "../job-queue.mjs";
import {
  createLinearCliClient,
  FORBIDDEN_INTAKE_MUTATION_STATES,
  INTAKE_CREATE_MUTATION,
  INTAKE_DUPLICATE_MUTATION,
  INTAKE_PROMOTE_MUTATION,
  INTAKE_TRIAGE_QUERY,
} from "../linear-cli.mjs";
import { createPiJobRunner } from "../pi-job.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PI_APP_USER_ID = "pi-app-user-1";
const IMPLEMENTING_STATE_ID = "state-implementing";
const BACKLOG_STATE_ID = "state-backlog";
const DUPLICATE_STATE_ID = "state-duplicate";

function validWorkerEnv(overrides = {}) {
  return {
    CURSOR_API_KEY: "cursor_test",
    LINEAR_CLI_API_KEY: "lin_cli_test",
    LINEAR_WEBHOOK_SECRET: "secret",
    GH_TOKEN: "ghp_test",
    LINEAR_CLI_VERSION: LINEAR_CLI_PIN.version,
    LINEAR_PI_APP_USER_ID: PI_APP_USER_ID,
    PI_MODEL: "cursor/composer-2.5",
    PI_MODEL_FAST: "cursor/grok-4.6",
    ...overrides,
  };
}

function wellFormedBody() {
  return `## What to build

Promote well-formed Triage slices.

write-scope: harness/**

## Acceptance criteria

- [ ] Backlog with ready-for-agent
`;
}

function leftoverBody(className) {
  return `Out of scope leftover.

class: ${className}
`;
}

function triageNode(overrides = {}) {
  return {
    id: "issue-slice",
    identifier: "KIT-80",
    title: "Shaped slice",
    description: wellFormedBody(),
    state: { name: "Triage", type: "triage" },
    labels: {
      nodes: [
        { id: "label-feature", name: "Feature" },
        { id: "label-signal", name: "signal-up" },
      ],
    },
    attachments: { nodes: [] },
    comments: { nodes: [] },
    relations: { nodes: [] },
    inverseRelations: { nodes: [] },
    ...overrides,
  };
}

function parseVariables(args) {
  const flag = args.indexOf("--variables-json");
  if (flag < 0) {
    return {};
  }
  return JSON.parse(args[flag + 1]);
}

function fakeIntakeCli({ triage = [] } = {}) {
  const calls = [];
  const updates = [];
  const created = [];
  const relations = [];
  const comments = [];
  const commentUpdates = [];

  async function runCommand(command, args, options) {
    calls.push({ command, args, env: options.env });
    const query = args[1] ?? "";
    const variables = parseVariables(args);

    if (query.includes("IntakeTriage")) {
      return JSON.stringify({
        data: {
          team: { nodes: [{ id: "team-kit" }] },
          backlogState: { nodes: [{ id: BACKLOG_STATE_ID, name: "Backlog" }] },
          duplicateState: { nodes: [{ id: DUPLICATE_STATE_ID, name: "Duplicate" }] },
          labels: {
            nodes: [
              { id: "label-rfa", name: "ready-for-agent" },
              { id: "label-signal", name: "signal-up" },
              { id: "label-improvement", name: "Improvement" },
              { id: "label-feature", name: "Feature" },
            ],
          },
          triage: { nodes: triage },
        },
      });
    }

    if (query.includes("issueUpdate")) {
      updates.push(variables);
      return JSON.stringify({
        data: { issueUpdate: { success: true, issue: { id: variables.id } } },
      });
    }

    if (query.includes("issueCreate")) {
      created.push(variables);
      return JSON.stringify({
        data: {
          issueCreate: {
            success: true,
            issue: { id: "tech-1", identifier: "KIT-100" },
          },
        },
      });
    }

    if (query.includes("issueRelationCreate")) {
      relations.push(variables);
      return JSON.stringify({ data: { issueRelationCreate: { success: true } } });
    }

    if (query.includes("commentUpdate")) {
      commentUpdates.push(variables);
      return JSON.stringify({ data: { commentUpdate: { success: true } } });
    }

    if (query.includes("commentCreate")) {
      comments.push(variables);
      return JSON.stringify({
        data: { commentCreate: { success: true, comment: { id: "intake-comment-1" } } },
      });
    }

    throw new Error(`unexpected Linear CLI query: ${query.slice(0, 80)}`);
  }

  return { calls, updates, created, relations, comments, commentUpdates, runCommand };
}

async function intakeWith(triage, env = validWorkerEnv()) {
  const fake = fakeIntakeCli({ triage });
  const linear = createLinearCliClient({ env, runCommand: fake.runCommand });
  const result = await runIntake({ env, linear });
  return { ...fake, result, linear };
}

test("Intake poller enqueues once an hour on the planner mutex", () => {
  const jobs = [];
  const timers = [];
  const stop = startIntakePoller({
    enqueue: {
      enqueue(job) {
        jobs.push(job);
      },
    },
    intervalMs: DEFAULT_INTAKE_POLL_MS,
    setIntervalFn(fn, ms) {
      timers.push({ fn, ms });
      return 1;
    },
  });

  assert.equal(DEFAULT_INTAKE_POLL_MS, 3_600_000);
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, 3_600_000);
  timers[0].fn();
  assert.deepEqual(jobs, [{ role: "intake" }]);
  stop();
});

test("Intake poller does not enqueue onto the coding slot", async () => {
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

  const codingPromise = slots.enqueue({ role: "implement", identifier: "KIT-1" });
  await started;
  const stop = startIntakePoller({
    enqueue: slots,
    intervalMs: DEFAULT_INTAKE_POLL_MS,
    setIntervalFn(fn) {
      fn();
      return 1;
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(plannerMutex.length, 1);
  assert.equal(plannerMutex[0].role, "intake");
  assert.equal(coding.length, 1);
  assert.equal(slots.health().job.role, "implement");
  stop();
  releaseCoding();
  await codingPromise;
});

test("Intake job uses the Linear CLI wrapper and does not spawn Pi, bash, or file tools", async () => {
  const env = validWorkerEnv();
  const fake = fakeIntakeCli({
    triage: [triageNode({ id: "issue-ok", identifier: "KIT-80" })],
  });
  const spawned = [];
  const runner = createPiJobRunner({
    env,
    workspace: ROOT,
    runCommand: fake.runCommand,
    spawnProcess(command, args) {
      spawned.push({ command, args });
      return Promise.resolve({ status: 0 });
    },
  });

  const result = await runner.run({ role: "intake", identifier: "KIT-80" });

  assert.equal(spawned.length, 0);
  assert.equal(fake.updates.length, 1);
  assert.equal(fake.updates[0].id, "issue-ok");
  assert.equal(result.promoted[0].identifier, "KIT-80");
  assert.equal(
    fake.calls.every((call) => call.command === "linear"),
    true,
  );
  assert.equal(
    fake.calls.some((call) => call.args.includes("bash") || call.command === "bash"),
    false,
  );
});

test("well-formed Triage slice moves to Backlog with ready-for-agent and without signal-up", async () => {
  const { updates, result } = await intakeWith([
    triageNode({ id: "issue-ok", identifier: "KIT-80" }),
  ]);

  assert.equal(updates.length, 1);
  assert.equal(updates[0].id, "issue-ok");
  assert.equal(updates[0].stateId, BACKLOG_STATE_ID);
  assert.deepEqual(updates[0].addedLabelIds, ["label-rfa"]);
  assert.equal(updates[0].removedLabelIds.includes("label-signal"), true);
  assert.equal(Object.hasOwn(updates[0], "delegateId"), false);
  assert.deepEqual(
    result.promoted.map((row) => row.identifier),
    ["KIT-80"],
  );
});

test("related leftovers of the same class become one Backlog tech issue; origins become Duplicate", async () => {
  const { created, updates, relations, result } = await intakeWith([
    triageNode({
      id: "leftover-a",
      identifier: "KIT-81",
      title: "CI graph miss A",
      description: leftoverBody("ci-graph"),
      labels: { nodes: [{ id: "label-signal", name: "signal-up" }] },
      relations: {
        nodes: [{ type: "related", issue: { id: "leftover-b", identifier: "KIT-82" } }],
      },
    }),
    triageNode({
      id: "leftover-b",
      identifier: "KIT-82",
      title: "CI graph miss B",
      description: leftoverBody("ci-graph"),
      labels: { nodes: [{ id: "label-signal", name: "signal-up" }] },
      relations: {
        nodes: [{ type: "related", issue: { id: "leftover-a", identifier: "KIT-81" } }],
      },
    }),
  ]);

  assert.equal(created.length, 1);
  assert.equal(created[0].input.stateId, BACKLOG_STATE_ID);
  assert.equal(created[0].input.teamId, "team-kit");
  assert.match(created[0].input.title, /ci-graph/i);
  assert.equal(Object.hasOwn(created[0].input, "delegateId"), false);
  assert.deepEqual(updates.map((row) => row.id).sort(), ["leftover-a", "leftover-b"]);
  assert.equal(
    updates.every((row) => row.stateId === DUPLICATE_STATE_ID),
    true,
  );
  assert.equal(relations.length, 2);
  assert.equal(
    relations.every((row) => row.relatedIssueId === "tech-1"),
    true,
  );
  assert.deepEqual(result.consolidated.identifier, "KIT-100");
  assert.deepEqual(result.consolidated.origins.sort(), ["KIT-81", "KIT-82"]);
});

test("unshaped Sentry issue stays in Triage with one comment, updated in place on later runs", async () => {
  const sentry = triageNode({
    id: "sentry-1",
    identifier: "KIT-83",
    title: "TypeError in api",
    description: "https://sentry.io/issues/abc",
    labels: { nodes: [] },
    attachments: {
      nodes: [{ url: "https://sentry.io/issues/abc", title: "Sentry" }],
    },
  });
  const first = await intakeWith([sentry]);

  assert.equal(first.updates.length, 0);
  assert.equal(first.created.length, 0);
  assert.equal(first.comments.length, 1);
  assert.equal(first.comments[0].issueId, "sentry-1");
  assert.match(first.comments[0].body, new RegExp(INTAKE_COMMENT_HEADING));
  assert.equal(first.result.commented[0], "KIT-83");
  assert.equal(first.result.promoted.length, 0);

  const secondFake = fakeIntakeCli({
    triage: [
      {
        ...sentry,
        comments: {
          nodes: [{ id: "intake-comment-1", body: `${INTAKE_COMMENT_HEADING}\n\nprevious` }],
        },
      },
    ],
  });
  const linear = createLinearCliClient({
    env: validWorkerEnv(),
    runCommand: secondFake.runCommand,
  });
  await runIntake({ env: validWorkerEnv(), linear });

  assert.equal(secondFake.comments.length, 0);
  assert.equal(secondFake.commentUpdates.length, 1);
  assert.equal(secondFake.commentUpdates[0].id, "intake-comment-1");
  assert.match(secondFake.commentUpdates[0].body, new RegExp(INTAKE_COMMENT_HEADING));
  assert.equal(secondFake.updates.length, 0);
});

test("Intake never issueUpdates to Implementing, In Review, Merging, or Done and never sets Linear Agent to Cursor", async () => {
  const { updates, created, relations } = await intakeWith([
    triageNode({ id: "issue-ok", identifier: "KIT-80" }),
  ]);

  assert.deepEqual(FORBIDDEN_INTAKE_STATES, ["Implementing", "In Review", "Merging", "Done"]);
  assert.deepEqual(FORBIDDEN_INTAKE_MUTATION_STATES, FORBIDDEN_INTAKE_STATES);
  assert.equal(updates[0].stateId, BACKLOG_STATE_ID);
  assert.equal(updates[0].stateId === IMPLEMENTING_STATE_ID, false);
  assert.equal(Object.hasOwn(updates[0], "delegateId"), false);
  const payloads = JSON.stringify({ updates, created, relations });
  assert.equal(payloads.includes("Cursor"), false);
  assert.equal(payloads.includes(IMPLEMENTING_STATE_ID), false);
  for (const status of FORBIDDEN_INTAKE_STATES) {
    assert.equal(INTAKE_PROMOTE_MUTATION.includes(status), false);
    assert.equal(INTAKE_CREATE_MUTATION.includes(status), false);
    assert.equal(INTAKE_DUPLICATE_MUTATION.includes(status), false);
    assert.equal(INTAKE_TRIAGE_QUERY.includes(status), false);
  }
});

test("server starts Intake poller from PI_INTAKE_POLL_MS and image copies intake.mjs", () => {
  const server = readFileSync(join(ROOT, "harness/server.mjs"), "utf8");
  assert.match(server, /PI_INTAKE_POLL_MS/);
  assert.match(server, /startIntakePoller/);
  assert.match(server, /DEFAULT_INTAKE_POLL_MS/);
  assert.match(readFileSync(join(ROOT, "harness/Dockerfile"), "utf8"), /intake\.mjs/);
  assert.match(readFileSync(join(ROOT, "harness/host.md"), "utf8"), /Intake/);
  assert.match(readFileSync(join(ROOT, ".pi/roles/planner.md"), "utf8"), /Intake/);
});
