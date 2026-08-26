import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { LINEAR_CLI_PIN } from "../boot-env.mjs";
import { createWorkerSlots } from "../job-queue.mjs";
import {
  createLinearCliClient,
  FORBIDDEN_PLANNER_STATES,
  PLANNER_CLAIM_MUTATION,
  PLANNER_DISPATCH_QUERY,
} from "../linear-cli.mjs";
import { createPiJobRunner } from "../pi-job.mjs";
import {
  DEFAULT_PLANNER_POLL_MS,
  findWriteScopeOverlap,
  globsOverlap,
  runPlanner,
  startPlannerPoller,
} from "../planner.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PI_APP_USER_ID = "pi-app-user-1";
const CURSOR_USER_ID = "cursor-app-user-1";
const IMPLEMENTING_STATE_ID = "state-implementing";
const IN_REVIEW_STATE_ID = "state-in-review";

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

function gqlNode(overrides = {}) {
  return {
    id: "issue-medium",
    identifier: "KIT-12",
    description: "write-scope: harness/**",
    priority: 3,
    createdAt: "2026-08-24T12:00:00.000Z",
    state: { name: "Backlog", type: "backlog" },
    labels: { nodes: [{ name: "ready-for-agent" }, { name: "Feature" }] },
    assignee: { id: "human-1", name: "Nicklas" },
    delegate: null,
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

function fakeLinearCli({
  backlog = [],
  implementing = [],
  implementingState = { id: IMPLEMENTING_STATE_ID, name: "Implementing" },
  users = { [PI_APP_USER_ID]: { id: PI_APP_USER_ID, name: "Pi" } },
} = {}) {
  const calls = [];
  const claims = [];
  const comments = [];

  async function runCommand(command, args, options) {
    calls.push({ command, args, env: options.env });
    const query = args[1] ?? "";
    const variables = parseVariables(args);

    if (query.includes("PlannerUser") || query.includes("user(id:")) {
      const user = users[variables.id];
      return JSON.stringify({ data: { user: user ?? null } });
    }

    if (query.includes("PlannerDispatch") || query.includes("workflowStates")) {
      return JSON.stringify({
        data: {
          implementingState: { nodes: implementingState ? [implementingState] : [] },
          implementing: { nodes: implementing },
          backlog: { nodes: backlog },
        },
      });
    }

    if (query.includes("issueUpdate")) {
      claims.push(variables);
      const node = backlog.find((issue) => issue.id === variables.id);
      return JSON.stringify({
        data: {
          issueUpdate: {
            success: true,
            issue: {
              id: variables.id,
              assignee: node?.assignee ?? { id: "human-1", name: "Nicklas" },
              delegate: { id: variables.delegateId, name: "Pi" },
              state: { name: "Implementing" },
            },
          },
        },
      });
    }

    if (query.includes("commentCreate")) {
      comments.push(variables);
      return JSON.stringify({
        data: { commentCreate: { success: true, comment: { id: "comment-1" } } },
      });
    }

    throw new Error(`unexpected Linear CLI query: ${query.slice(0, 80)}`);
  }

  return { calls, claims, comments, runCommand };
}

async function claimWith(backlog, env = validWorkerEnv(), implementing = []) {
  const fake = fakeLinearCli({ backlog, implementing });
  const linear = createLinearCliClient({ env, runCommand: fake.runCommand });
  const result = await runPlanner({ env, linear });
  return { ...fake, result, linear };
}

test("globsOverlap detects shared paths and ignores disjoint trees", () => {
  assert.equal(globsOverlap("harness/planner.mjs", "harness/**"), true);
  assert.equal(globsOverlap("harness/**", "harness/tests/**"), true);
  assert.equal(globsOverlap("apps/api/**", "packages/db/**"), false);
});

test("planner skips Backlog issue whose write-scope overlaps an Implementing issue", async () => {
  const { claims, comments, result } = await claimWith(
    [
      gqlNode({
        id: "issue-overlap",
        identifier: "KIT-92",
        priority: 1,
        description: "write-scope: harness/planner.mjs, harness/linear-cli.mjs",
      }),
    ],
    validWorkerEnv(),
    [
      {
        id: "issue-active",
        identifier: "KIT-89",
        description: "write-scope: harness/planner.mjs, harness/intake.mjs",
      },
    ],
  );

  assert.equal(claims.length, 0);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.skipped[0].reason, "write-scope overlap");
  assert.equal(comments.length, 1);
  assert.match(comments[0].body, /KIT-92: skipped — write-scope overlaps KIT-89/);
  assert.match(comments[0].body, /harness\/planner\.mjs/);
});

test("planner does not skip Backlog issue without write-scope for path overlap", async () => {
  const { claims, comments } = await claimWith(
    [
      gqlNode({
        id: "issue-no-scope",
        identifier: "KIT-93",
        description: "What to build\n\nNo write-scope line here.",
      }),
    ],
    validWorkerEnv(),
    [
      {
        id: "issue-active",
        identifier: "KIT-89",
        description: "write-scope: harness/**",
      },
    ],
  );

  assert.equal(claims.length, 1);
  assert.equal(comments.length, 0);
});

test("planner continues claiming after a write-scope overlap skip", async () => {
  const { claims, comments, result } = await claimWith(
    [
      gqlNode({
        id: "issue-overlap",
        identifier: "KIT-92",
        priority: 1,
        description: "write-scope: harness/planner.mjs",
      }),
      gqlNode({
        id: "issue-ok",
        identifier: "KIT-94",
        priority: 2,
        description: "write-scope: apps/mobile/**",
      }),
    ],
    validWorkerEnv(),
    [
      {
        id: "issue-active",
        identifier: "KIT-89",
        description: "write-scope: harness/**",
      },
    ],
  );

  assert.deepEqual(
    claims.map((claim) => claim.id),
    ["issue-ok"],
  );
  assert.equal(result.claimed[0].identifier, "KIT-94");
  assert.equal(comments.length, 1);
  assert.match(comments[0].body, /KIT-92: skipped — write-scope overlaps KIT-89/);
});

test("findWriteScopeOverlap ignores Implementing issues without write-scope", () => {
  const overlap = findWriteScopeOverlap({ description: "write-scope: harness/planner.mjs" }, [
    { identifier: "KIT-89", description: "No scope declared." },
  ]);
  assert.equal(overlap, null);
});

test("planner claims Backlog + ready-for-agent + unblocked issues in Linear priority order", async () => {
  const { claims, calls, result } = await claimWith([
    gqlNode({
      id: "issue-none",
      identifier: "KIT-1",
      priority: 0,
      createdAt: "2026-08-20T00:00:00.000Z",
    }),
    gqlNode({
      id: "issue-urgent-old",
      identifier: "KIT-2",
      priority: 1,
      createdAt: "2026-08-21T00:00:00.000Z",
    }),
    gqlNode({
      id: "issue-urgent-new",
      identifier: "KIT-3",
      priority: 1,
      createdAt: "2026-08-22T00:00:00.000Z",
    }),
    gqlNode({
      id: "issue-high",
      identifier: "KIT-4",
      priority: 2,
      createdAt: "2026-08-19T00:00:00.000Z",
    }),
  ]);

  assert.deepEqual(
    claims.map((claim) => claim.id),
    ["issue-urgent-old", "issue-urgent-new", "issue-high", "issue-none"],
  );
  assert.deepEqual(
    result.claimed.map((row) => row.identifier),
    ["KIT-2", "KIT-3", "KIT-4", "KIT-1"],
  );
  assert.equal(
    calls.every((call) => call.command === "linear"),
    true,
  );
  assert.equal(
    calls.some((call) => call.args.includes("bash") || call.command === "bash"),
    false,
  );
});

test("planner skips missing ready-for-agent, signal-up, unresolved blockedBy, and Cursor agent", async () => {
  const { claims, comments } = await claimWith([
    gqlNode({
      id: "issue-ok",
      identifier: "KIT-10",
      labels: { nodes: [{ name: "ready-for-agent" }] },
    }),
    gqlNode({
      id: "issue-no-label",
      identifier: "KIT-11",
      labels: { nodes: [{ name: "Feature" }] },
    }),
    gqlNode({
      id: "issue-signal",
      identifier: "KIT-12",
      labels: { nodes: [{ name: "ready-for-agent" }, { name: "signal-up" }] },
    }),
    gqlNode({
      id: "issue-blocked",
      identifier: "KIT-13",
      inverseRelations: {
        nodes: [
          {
            type: "blocks",
            issue: { identifier: "KIT-1", state: { name: "Merging", type: "started" } },
          },
        ],
      },
    }),
    gqlNode({
      id: "issue-cursor",
      identifier: "KIT-14",
      delegate: { id: CURSOR_USER_ID, name: "Cursor" },
    }),
  ]);

  assert.deepEqual(
    claims.map((claim) => claim.id),
    ["issue-ok"],
  );
  assert.equal(
    comments.some((comment) => String(comment.body).includes("KIT-14")),
    true,
  );
});

test("claim sets delegate to the Pi app user, keeps the human assignee, and never names Cursor", async () => {
  const { claims, result } = await claimWith([gqlNode({ id: "issue-ok", identifier: "KIT-20" })]);

  assert.equal(claims.length, 1);
  assert.equal(claims[0].delegateId, PI_APP_USER_ID);
  assert.equal(claims[0].stateId, IMPLEMENTING_STATE_ID);
  assert.equal(Object.hasOwn(claims[0], "assigneeId"), false);
  assert.equal(JSON.stringify(claims).includes(CURSOR_USER_ID), false);
  assert.equal(PLANNER_CLAIM_MUTATION.includes("assigneeId"), false);
  assert.equal(PLANNER_CLAIM_MUTATION.includes("delegateId"), true);
  assert.equal(result.claimed[0].assignee.id, "human-1");
  assert.equal(result.claimed[0].delegate.id, PI_APP_USER_ID);
});

test("planner refuses when LINEAR_PI_APP_USER_ID is the Cursor app user", async () => {
  const env = validWorkerEnv({ LINEAR_PI_APP_USER_ID: CURSOR_USER_ID });
  const fake = fakeLinearCli({
    backlog: [gqlNode()],
    users: { [CURSOR_USER_ID]: { id: CURSOR_USER_ID, name: "Cursor" } },
  });
  const linear = createLinearCliClient({ env, runCommand: fake.runCommand });

  await assert.rejects(() => runPlanner({ env, linear }), /Cursor/);
  assert.equal(fake.claims.length, 0);
});

test("planner never issueUpdates to In Review, Ready for merge, Merging, Done, Parked, or Canceled", async () => {
  const { claims } = await claimWith([gqlNode({ id: "issue-ok" })]);

  assert.deepEqual(FORBIDDEN_PLANNER_STATES, [
    "In Review",
    "Ready for merge",
    "Merging",
    "Done",
    "Parked",
    "Canceled",
  ]);
  assert.equal(claims[0].stateId, IMPLEMENTING_STATE_ID);
  assert.equal(claims[0].stateId === IN_REVIEW_STATE_ID, false);
  for (const status of FORBIDDEN_PLANNER_STATES) {
    assert.equal(PLANNER_CLAIM_MUTATION.includes(status), false);
    assert.equal(PLANNER_DISPATCH_QUERY.includes(status), false);
  }
});

test("planner job uses the Linear CLI wrapper and does not spawn Pi, bash, or file tools", async () => {
  const env = validWorkerEnv();
  const fake = fakeLinearCli({ backlog: [gqlNode({ id: "issue-ok", identifier: "KIT-30" })] });
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

  const result = await runner.run({ role: "planner", identifier: "KIT-30" });

  assert.equal(spawned.length, 0);
  assert.equal(fake.claims.length, 1);
  assert.equal(fake.claims[0].delegateId, PI_APP_USER_ID);
  assert.equal(result.claimed[0].identifier, "KIT-30");
  assert.equal(
    fake.calls.every((call) => call.command === "linear"),
    true,
  );
});

test("Linear-only poller enqueues planner on the same skip/claim path as the webhook role", () => {
  const jobs = [];
  const timers = [];
  const stop = startPlannerPoller({
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

  assert.equal(DEFAULT_PLANNER_POLL_MS, 300_000);
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, 300_000);
  timers[0].fn();
  assert.deepEqual(jobs, [{ role: "planner" }]);
  stop();
});

test("planner poller does not enqueue onto the coding slot", async () => {
  const planner = [];
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
      if (job.role === "planner") {
        planner.push(job);
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
  const stop = startPlannerPoller({
    enqueue: slots,
    intervalMs: DEFAULT_PLANNER_POLL_MS,
    setIntervalFn(fn) {
      fn();
      return 1;
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(planner.length, 1);
  assert.equal(coding.length, 1);
  assert.equal(slots.health().job.role, "implement");
  stop();
  releaseCoding();
  await codingPromise;
});

test("planner role and host inventory keep Cursor cron paused while the PI planner job is Active", () => {
  const role = readFileSync(join(ROOT, ".pi/roles/planner.md"), "utf8");
  assert.match(role, /Linear CLI/);
  assert.match(role, /No file tools/i);
  assert.match(role, /No general bash/i);
  assert.match(role, /Never set Linear Agent to Cursor/i);
  assert.doesNotMatch(role, /`read`|`edit`|`write`|`git`|`gh`/);

  const host = readFileSync(join(ROOT, "harness/host.md"), "utf8");
  assert.match(host, /planner/i);
  assert.match(host, /Cursor/);
  assert.match(host, /Inactive|paused|removed/i);
  assert.match(host, /Active/);
  assert.match(host, /LINEAR_PI_APP_USER_ID/);
  assert.match(readFileSync(join(ROOT, "harness/Dockerfile"), "utf8"), /planner\.mjs/);
});
