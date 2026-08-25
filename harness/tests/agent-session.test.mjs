/**
 * KIT-59 — AgentSession UI is display-only. Issue HMAC may enqueue a factory
 * role; AgentSession HMAC never does. Fake Linear at this seam; do not call Pi.
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import { test } from "node:test";
import { createDelegateGateConfig, PI_BOT_AGENT_NAME } from "../delegate-gate.mjs";
import { createLinearSessionAdapter, createMemorySessionAdapter } from "../session-adapter.mjs";
import { createHttpHandler, createMemoryAdapter, routeWebhook } from "../webhook-router.mjs";

const ISSUE_SECRET = "test-linear-webhook-secret";
const SESSION_SECRET = "test-pi-agent-session-secret";
const NOW = 1_700_000_000_000;
const PI_APP_USER_ID = "pi-app-user-1";
const DELEGATE_GATE = createDelegateGateConfig({ LINEAR_PI_APP_USER_ID: PI_APP_USER_ID });
const ISSUE_ID = "issue-kit-99";
const SESSION_ID = "session-kit-99";

const CREATED_UNCLAIMED_THOUGHT =
  "Factory coding jobs start only from the Issue status webhook after a planner claim. This session is display-only.";
const CREATED_CLAIMED_THOUGHT =
  "Pi is working from the Issue webhook. This AgentSession is display-only.";
const PROMPTED_THOUGHT =
  "This session does not enqueue a coding job. Durable evidence stays on the workpad.";
const HANDOFF_ELICITATION = "Ready for merge. This is Nicklas's turn.";

function sign(rawBody, secret) {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

function signed(payload, secret) {
  const rawBody = JSON.stringify(payload);
  return { rawBody, signature: sign(rawBody, secret), payload };
}

function issueUpdatePayload({
  issueId = ISSUE_ID,
  updatedFrom = { stateId: "prev-state" },
  extras = {},
} = {}) {
  return {
    action: "update",
    type: "Issue",
    data: { id: issueId, identifier: "KIT-99" },
    updatedFrom,
    webhookTimestamp: NOW,
    ...extras,
  };
}

function sessionPayload({
  action = "created",
  sessionId = SESSION_ID,
  issueId = ISSUE_ID,
  extras = {},
} = {}) {
  return {
    action,
    type: "AgentSessionEvent",
    agentSession: {
      id: sessionId,
      issueId,
      issue: { id: issueId, identifier: "KIT-99" },
    },
    webhookTimestamp: NOW,
    ...extras,
  };
}

function snapshot(overrides = {}) {
  return {
    id: ISSUE_ID,
    identifier: "KIT-99",
    status: "Backlog",
    labels: ["ready-for-agent", "Feature"],
    linearType: "Feature",
    blockedBy: [],
    delegate: null,
    ...overrides,
  };
}

function fakeLinear(issue, extras = {}) {
  const calls = [];
  const workpad = [];
  const postedActivities = [];
  return {
    calls,
    workpad,
    postedActivities,
    async getIssue(id) {
      calls.push(["getIssue", id]);
      return issue;
    },
    async updateWorkpad(input) {
      workpad.push(input);
    },
    async clearDelegate(input) {
      calls.push(["clearDelegate", input]);
    },
    async getAgentSessionId(id) {
      calls.push(["getAgentSessionId", id]);
      return extras.agentSessionId;
    },
    async createAgentActivity(input) {
      postedActivities.push(input);
    },
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

function fakeGh() {
  return { calls: [] };
}

async function routeSession(payload, issue, extras = {}) {
  const { rawBody, signature } = signed(payload, SESSION_SECRET);
  const linear = extras.linear ?? fakeLinear(issue);
  const enqueue = extras.enqueue ?? fakeEnqueue();
  const session = extras.session ?? createMemorySessionAdapter({ linear });
  const result = await routeWebhook({
    rawBody,
    signature,
    secret: ISSUE_SECRET,
    sessionSecret: SESSION_SECRET,
    hmacChannel: "session",
    now: NOW,
    linear,
    gh: fakeGh(),
    enqueue,
    session,
    delegateGateConfig: DELEGATE_GATE,
  });
  return { result, linear, enqueue, session, rawBody, signature };
}

async function routeIssue(payload, issue, extras = {}) {
  const { rawBody, signature } = signed(payload, ISSUE_SECRET);
  const linear = extras.linear ?? fakeLinear(issue);
  const enqueue = extras.enqueue ?? fakeEnqueue();
  const session = extras.session ?? createMemorySessionAdapter({ linear });
  const result = await routeWebhook({
    rawBody,
    signature,
    secret: ISSUE_SECRET,
    sessionSecret: SESSION_SECRET,
    hmacChannel: "issue",
    now: NOW,
    linear,
    gh: fakeGh(),
    enqueue,
    session,
    delegateGateConfig: DELEGATE_GATE,
  });
  return { result, linear, enqueue, session, rawBody, signature };
}

test("AgentSession HMAC forgery is rejected and never acks or enqueues", async () => {
  const { rawBody } = signed(sessionPayload(), SESSION_SECRET);
  const linear = fakeLinear(snapshot());
  const enqueue = fakeEnqueue();
  const session = createMemorySessionAdapter({ linear });
  const result = await routeWebhook({
    rawBody,
    signature: "deadbeef",
    secret: ISSUE_SECRET,
    sessionSecret: SESSION_SECRET,
    hmacChannel: "session",
    now: NOW,
    linear,
    gh: fakeGh(),
    enqueue,
    session,
  });

  assert.equal(result.kind, "rejected");
  assert.equal(enqueue.jobs.length, 0);
  assert.equal(session.activities.length, 0);
  assert.equal(linear.calls.length, 0);
});

test("Issue payload signed with the session HMAC on the session channel does not enqueue", async () => {
  const { rawBody, signature } = signed(issueUpdatePayload(), SESSION_SECRET);
  const enqueue = fakeEnqueue();
  const result = await routeWebhook({
    rawBody,
    signature,
    secret: ISSUE_SECRET,
    sessionSecret: SESSION_SECRET,
    hmacChannel: "session",
    now: NOW,
    linear: fakeLinear(snapshot({ status: "Implementing", delegate: { name: "Pi" } })),
    gh: fakeGh(),
    enqueue,
    session: createMemorySessionAdapter(),
  });

  assert.notEqual(result.kind, "enqueue");
  assert.equal(enqueue.jobs.length, 0);
});

test("AgentSession created posts a thought before return and never enqueues", async () => {
  const { result, enqueue, session } = await routeSession(
    sessionPayload(),
    snapshot({ status: "Backlog", delegate: { name: "Pi" } }),
  );

  assert.equal(result.kind, "skip");
  assert.equal(enqueue.jobs.length, 0);
  assert.equal(session.activities.length, 1);
  assert.equal(session.activities[0].sessionId, SESSION_ID);
  assert.equal(session.activities[0].content.type, "thought");
  assert.equal(session.activities[0].content.body, CREATED_UNCLAIMED_THOUGHT);
  assert.equal(session.activities[0].ephemeral, false);
  assert.ok(session.ackedAt <= NOW);
});

test("AgentSession created on a factory claim still does not enqueue Pi", async () => {
  const { result, enqueue, session } = await routeSession(
    sessionPayload(),
    snapshot({
      status: "Implementing",
      delegate: { name: "Pi" },
      labels: ["Feature"],
      linearType: "Feature",
    }),
  );

  assert.equal(result.kind, "skip");
  assert.equal(enqueue.jobs.length, 0);
  assert.equal(session.activities[0].content.body, CREATED_CLAIMED_THOUGHT);
});

test("AgentSession prompted never enqueues a coding job", async () => {
  const { result, enqueue, session } = await routeSession(
    sessionPayload({
      action: "prompted",
      extras: { agentActivity: { body: "please also fix tests" } },
    }),
    snapshot({
      status: "Implementing",
      delegate: { name: "Pi" },
      labels: ["Feature"],
      linearType: "Feature",
    }),
  );

  assert.equal(result.kind, "skip");
  assert.equal(enqueue.jobs.length, 0);
  assert.equal(session.activities[0].content.type, "thought");
  assert.equal(session.activities[0].content.body, PROMPTED_THOUGHT);
});

test("assignee-click without Implementing factory claim does not start Pi", async () => {
  const { result, enqueue, session } = await routeSession(
    sessionPayload(),
    snapshot({
      status: "Backlog",
      labels: ["ready-for-agent", "Feature"],
      linearType: "Feature",
      delegate: { name: "Pi" },
    }),
  );

  assert.equal(result.kind, "skip");
  assert.equal(enqueue.jobs.length, 0);
  assert.equal(session.activities[0].content.body, CREATED_UNCLAIMED_THOUGHT);
});

test("Issue status webhook still enqueues implement; session webhook on the same issue does not", async () => {
  const claimed = snapshot({
    status: "Implementing",
    delegate: { name: "Pi" },
    labels: ["Feature"],
    linearType: "Feature",
  });

  const issueRoute = await routeIssue(issueUpdatePayload(), claimed);
  const sessionRoute = await routeSession(sessionPayload(), claimed);

  assert.equal(issueRoute.result.kind, "enqueue");
  assert.equal(issueRoute.enqueue.jobs.length, 1);
  assert.equal(issueRoute.enqueue.jobs[0].role, "implement");
  assert.equal(sessionRoute.result.kind, "skip");
  assert.equal(sessionRoute.enqueue.jobs.length, 0);
});

test("implement enqueue accepts Pi Bot Agent production display name", async () => {
  const { result, enqueue } = await routeIssue(
    issueUpdatePayload(),
    snapshot({
      status: "Implementing",
      delegate: { id: PI_APP_USER_ID, name: PI_BOT_AGENT_NAME },
      labels: ["Bug"],
      linearType: "Bug",
    }),
  );

  assert.equal(result.kind, "enqueue");
  assert.equal(enqueue.jobs.length, 1);
  assert.equal(enqueue.jobs[0].role, "implement");
  assert.equal(enqueue.jobs[0].adwFile, ".pi/adw/bug.yaml");
});

test("implement enqueue emits ephemeral action and does not write the workpad", async () => {
  const { result, enqueue, session, linear } = await routeIssue(
    issueUpdatePayload(),
    snapshot({
      status: "Implementing",
      delegate: { name: "Pi" },
      labels: ["Feature"],
      linearType: "Feature",
    }),
  );

  assert.equal(result.kind, "enqueue");
  assert.equal(enqueue.jobs[0].role, "implement");
  const ephemeral = session.activities.filter((activity) => activity.ephemeral === true);
  assert.equal(ephemeral.length, 1);
  assert.equal(ephemeral[0].content.type, "action");
  assert.equal(ephemeral[0].content.action, "Implementing");
  assert.equal(ephemeral[0].content.parameter, "KIT-99");
  assert.equal(linear.workpad.length, 0);
});

test("factory-checker enqueue emits ephemeral thought and leaves workpad durable", async () => {
  const { enqueue, session, linear } = await routeIssue(
    issueUpdatePayload(),
    snapshot({
      status: "In Review",
      delegate: { name: "Pi" },
      labels: ["Feature"],
      linearType: "Feature",
    }),
  );

  assert.equal(enqueue.jobs[0].role, "factory-checker");
  const ephemeral = session.activities.filter((activity) => activity.ephemeral === true);
  assert.equal(ephemeral.length, 1);
  assert.equal(ephemeral[0].content.type, "thought");
  assert.equal(ephemeral[0].content.body, "Factory checker is reviewing KIT-99.");
  assert.equal(linear.workpad.length, 0);
});

test("Ready for merge clears delegate and sets awaitingInput without enqueueing", async () => {
  const { result, enqueue, session, linear } = await routeIssue(
    issueUpdatePayload(),
    snapshot({
      status: "Ready for merge",
      delegate: { name: "Pi" },
      labels: ["Feature"],
      linearType: "Feature",
    }),
  );

  assert.equal(result.kind, "skip");
  assert.equal(enqueue.jobs.length, 0);
  assert.equal(
    linear.calls.some((call) => call[0] === "clearDelegate"),
    true,
  );
  const elicitation = session.activities.find(
    (activity) => activity.content.type === "elicitation",
  );
  assert.ok(elicitation);
  assert.equal(elicitation.content.body, HANDOFF_ELICITATION);
  assert.equal(session.handedOff, true);
});

test("HTTP adapter uses Issue HMAC on /webhooks/linear and session HMAC on /agent-session", async () => {
  const claimed = snapshot({
    status: "Implementing",
    delegate: { name: "Pi" },
    labels: ["Feature"],
    linearType: "Feature",
  });
  const linear = fakeLinear(claimed);
  const enqueue = fakeEnqueue();
  const session = createMemorySessionAdapter({ linear });
  const handler = createHttpHandler({
    secret: ISSUE_SECRET,
    sessionSecret: SESSION_SECRET,
    now: () => NOW,
    linear,
    gh: fakeGh(),
    enqueue,
    session,
    delegateGateConfig: DELEGATE_GATE,
  });
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  const issue = signed(issueUpdatePayload(), ISSUE_SECRET);
  const agent = signed(sessionPayload(), SESSION_SECRET);
  const cross = signed(sessionPayload(), ISSUE_SECRET);

  try {
    const spawned = await fetch(`http://127.0.0.1:${port}/webhooks/linear`, {
      method: "POST",
      headers: { "content-type": "application/json", "linear-signature": issue.signature },
      body: issue.rawBody,
    });
    const acked = await fetch(`http://127.0.0.1:${port}/webhooks/linear/agent-session`, {
      method: "POST",
      headers: { "content-type": "application/json", "linear-signature": agent.signature },
      body: agent.rawBody,
    });
    const forged = await fetch(`http://127.0.0.1:${port}/webhooks/linear/agent-session`, {
      method: "POST",
      headers: { "content-type": "application/json", "linear-signature": cross.signature },
      body: cross.rawBody,
    });

    assert.equal(spawned.status, 200);
    assert.equal(acked.status, 200);
    assert.equal(forged.status, 401);
    assert.equal(enqueue.jobs.length, 1);
    assert.equal(enqueue.jobs[0].role, "implement");
    assert.equal(
      session.activities.some((activity) => activity.content.type === "thought"),
      true,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("Issue implement enqueue posts ephemeral action to Linear without a prior session ack", async () => {
  const linear = fakeLinear(
    snapshot({
      status: "Implementing",
      delegate: { name: "Pi" },
      labels: ["Feature"],
      linearType: "Feature",
    }),
    { agentSessionId: SESSION_ID },
  );
  const { result, enqueue } = await routeIssue(issueUpdatePayload(), undefined, {
    linear,
    session: createLinearSessionAdapter({ linear }),
  });

  assert.equal(result.kind, "enqueue");
  assert.equal(enqueue.jobs[0].role, "implement");
  assert.equal(linear.workpad.length, 0);
  assert.deepEqual(linear.postedActivities, [
    {
      sessionId: SESSION_ID,
      ephemeral: true,
      content: { type: "action", action: "Implementing", parameter: "KIT-99" },
    },
  ]);
});

test("Issue checker enqueue posts ephemeral thought to Linear without a prior session ack", async () => {
  const linear = fakeLinear(
    snapshot({
      status: "In Review",
      delegate: { name: "Pi" },
      labels: ["Feature"],
      linearType: "Feature",
    }),
    { agentSessionId: SESSION_ID },
  );
  const { enqueue } = await routeIssue(issueUpdatePayload(), undefined, {
    linear,
    session: createLinearSessionAdapter({ linear }),
  });

  assert.equal(enqueue.jobs[0].role, "factory-checker");
  assert.equal(linear.workpad.length, 0);
  assert.deepEqual(linear.postedActivities, [
    {
      sessionId: SESSION_ID,
      ephemeral: true,
      content: { type: "thought", body: "Factory checker is reviewing KIT-99." },
    },
  ]);
});

test("Ready for merge posts elicitation to Linear without a prior session ack", async () => {
  const linear = fakeLinear(
    snapshot({
      status: "Ready for merge",
      delegate: { name: "Pi" },
      labels: ["Feature"],
      linearType: "Feature",
    }),
    { agentSessionId: SESSION_ID },
  );
  const { result, enqueue } = await routeIssue(issueUpdatePayload(), undefined, {
    linear,
    session: createLinearSessionAdapter({ linear }),
  });

  assert.equal(result.kind, "skip");
  assert.equal(enqueue.jobs.length, 0);
  assert.equal(
    linear.calls.some((call) => call[0] === "clearDelegate"),
    true,
  );
  assert.deepEqual(linear.postedActivities, [
    {
      sessionId: SESSION_ID,
      ephemeral: false,
      content: { type: "elicitation", body: HANDOFF_ELICITATION },
    },
  ]);
});

test("in-memory adapter matches HTTP session-channel skip for the same fixture", async () => {
  const claimed = snapshot({
    status: "Implementing",
    delegate: { name: "Pi" },
    labels: ["Feature"],
    linearType: "Feature",
  });
  const { rawBody, signature } = signed(sessionPayload(), SESSION_SECRET);
  const memoryDeps = {
    secret: ISSUE_SECRET,
    sessionSecret: SESSION_SECRET,
    now: NOW,
    linear: fakeLinear(claimed),
    gh: fakeGh(),
    enqueue: fakeEnqueue(),
    session: createMemorySessionAdapter(),
    delegateGateConfig: DELEGATE_GATE,
  };
  const memory = createMemoryAdapter(memoryDeps);
  const memoryResult = await memory.handle({
    rawBody,
    signature,
    hmacChannel: "session",
  });
  assert.equal(memoryResult.kind, "skip");
  assert.equal(memoryDeps.enqueue.jobs.length, 0);
  assert.ok(memoryDeps.session.activities.length > 0);
});
