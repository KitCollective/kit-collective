/**
 * KIT-113 — AgentSession factory path removed. Issue HMAC still enqueues factory roles.
 * POST /webhooks/linear/agent-session returns 404 (no session HMAC). Fake Linear; no Pi.
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import { test } from "node:test";
import { createDelegateGateConfig, PI_BOT_AGENT_NAME } from "../delegate-gate.mjs";
import { createHttpHandler, createMemoryAdapter, routeWebhook } from "../webhook-router.mjs";

const ISSUE_SECRET = "test-linear-webhook-secret";
const NOW = 1_700_000_000_000;
const PI_APP_USER_ID = "pi-app-user-1";
const DELEGATE_GATE = createDelegateGateConfig({ LINEAR_PI_APP_USER_ID: PI_APP_USER_ID });
const ISSUE_ID = "issue-kit-99";
const SESSION_ID = "session-kit-99";
const AGENT_SESSION_REMOVED = "AgentSession path removed (KIT-113)";

function sign(rawBody, secret) {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
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
  return {
    calls,
    workpad,
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
    ...extras,
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

function fakeGh() {
  return { calls: [], tokenName: "GH_TOKEN" };
}

async function routeIssue(payload, issue, extras = {}) {
  const rawBody = JSON.stringify(payload);
  const signature = sign(rawBody, ISSUE_SECRET);
  const enqueue = extras.enqueue ?? fakeEnqueue();
  const linear = extras.linear ?? fakeLinear(issue);
  const result = await routeWebhook({
    rawBody,
    signature,
    secret: ISSUE_SECRET,
    now: NOW,
    linear,
    gh: extras.gh ?? fakeGh(),
    enqueue,
    delegateGateConfig: extras.delegateGateConfig ?? DELEGATE_GATE,
  });
  return { result, enqueue, linear };
}

test("AgentSession payload on Issue channel skips without enqueue or Linear activity", async () => {
  const rawBody = JSON.stringify(sessionPayload());
  const signature = sign(rawBody, ISSUE_SECRET);
  const enqueue = fakeEnqueue();
  const linear = fakeLinear(snapshot());
  const result = await routeWebhook({
    rawBody,
    signature,
    secret: ISSUE_SECRET,
    now: NOW,
    linear,
    gh: fakeGh(),
    enqueue,
    delegateGateConfig: DELEGATE_GATE,
  });

  assert.equal(result.kind, "skip");
  assert.equal(result.reason, AGENT_SESSION_REMOVED);
  assert.equal(enqueue.jobs.length, 0);
  assert.equal(linear.calls.length, 0);
});

test("Issue status webhook enqueues implement when Linear Agent is empty", async () => {
  const { result, enqueue } = await routeIssue(
    issueUpdatePayload(),
    snapshot({
      status: "Implementing",
      delegate: null,
      labels: ["ready-for-agent", "Feature"],
      linearType: "Feature",
    }),
  );

  assert.equal(result.kind, "enqueue");
  assert.equal(result.role, "implement");
  assert.equal(enqueue.jobs.length, 1);
  assert.equal(enqueue.jobs[0].adwFile, ".pi/adw/feature.yaml");
});

test("implement skips when Linear Agent is Cursor", async () => {
  const { result, enqueue } = await routeIssue(
    issueUpdatePayload(),
    snapshot({
      status: "Implementing",
      delegate: { name: "Cursor" },
      labels: ["ready-for-agent", "Feature"],
      linearType: "Feature",
    }),
  );

  assert.equal(result.kind, "skip");
  assert.match(result.reason, /delegate is not Pi app|Cursor/);
  assert.equal(enqueue.jobs.length, 0);
});

test("implement enqueues leftover Pi delegate (empty Agent is not required)", async () => {
  const { result, enqueue } = await routeIssue(
    issueUpdatePayload(),
    snapshot({
      status: "Implementing",
      delegate: { id: PI_APP_USER_ID, name: PI_BOT_AGENT_NAME },
      labels: ["ready-for-agent", "Bug"],
      linearType: "Bug",
    }),
  );

  assert.equal(result.kind, "enqueue");
  assert.equal(enqueue.jobs.length, 1);
  assert.equal(enqueue.jobs[0].role, "implement");
  assert.equal(enqueue.jobs[0].adwFile, ".pi/adw/bug.yaml");
});

test("Issue status webhook still enqueues; AgentSession payload on issue channel does not", async () => {
  const claimed = snapshot({
    status: "Implementing",
    delegate: null,
    labels: ["ready-for-agent", "Feature"],
    linearType: "Feature",
  });

  const issueRoute = await routeIssue(issueUpdatePayload(), claimed);
  const rawBody = JSON.stringify(sessionPayload());
  const signature = sign(rawBody, ISSUE_SECRET);
  const sessionEnqueue = fakeEnqueue();
  const sessionResult = await routeWebhook({
    rawBody,
    signature,
    secret: ISSUE_SECRET,
    now: NOW,
    linear: fakeLinear(claimed),
    gh: fakeGh(),
    enqueue: sessionEnqueue,
    delegateGateConfig: DELEGATE_GATE,
  });

  assert.equal(issueRoute.result.kind, "enqueue");
  assert.equal(issueRoute.enqueue.jobs.length, 1);
  assert.equal(issueRoute.enqueue.jobs[0].role, "implement");
  assert.equal(sessionResult.kind, "skip");
  assert.equal(sessionResult.reason, AGENT_SESSION_REMOVED);
  assert.equal(sessionEnqueue.jobs.length, 0);
});

test("Ready for merge enqueues auto-merge without clearing delegate", async () => {
  const { result, enqueue, linear } = await routeIssue(
    issueUpdatePayload(),
    snapshot({
      status: "Ready for merge",
      delegate: { name: "Pi" },
      labels: ["ready-for-agent", "Feature"],
      linearType: "Feature",
    }),
  );

  assert.equal(result.kind, "enqueue");
  assert.equal(result.role, "auto-merge");
  assert.equal(enqueue.jobs.length, 1);
  assert.equal(
    linear.calls.some((call) => call[0] === "clearDelegate"),
    false,
  );
});

test("HTTP adapter returns 404 for agent-session path without enqueue or activity ack", async () => {
  const claimed = snapshot({
    status: "Implementing",
    delegate: null,
    labels: ["ready-for-agent", "Feature"],
    linearType: "Feature",
  });
  const linear = fakeLinear(claimed);
  const enqueue = fakeEnqueue();
  const handler = createHttpHandler({
    secret: ISSUE_SECRET,
    now: () => NOW,
    linear,
    gh: fakeGh(),
    enqueue,
    delegateGateConfig: DELEGATE_GATE,
  });
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  const issue = JSON.stringify(issueUpdatePayload());
  const issueSignature = sign(issue, ISSUE_SECRET);
  const sessionBody = JSON.stringify(sessionPayload());

  try {
    const spawned = await fetch(`http://127.0.0.1:${port}/webhooks/linear`, {
      method: "POST",
      headers: { "content-type": "application/json", "linear-signature": issueSignature },
      body: issue,
    });
    const removed = await fetch(`http://127.0.0.1:${port}/webhooks/linear/agent-session`, {
      method: "POST",
      headers: { "content-type": "application/json", "linear-signature": "deadbeef" },
      body: sessionBody,
    });

    assert.equal(spawned.status, 200);
    assert.equal(removed.status, 404);
    assert.equal(enqueue.jobs.length, 1);
    assert.equal(enqueue.jobs[0].role, "implement");
    assert.equal(
      linear.calls.some((call) => call[0] === "createAgentActivity"),
      false,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("in-memory adapter skips AgentSession payload without session HMAC channel", async () => {
  const adapter = createMemoryAdapter({
    secret: ISSUE_SECRET,
    now: () => NOW,
    linear: fakeLinear(snapshot()),
    gh: fakeGh(),
    enqueue: fakeEnqueue(),
    delegateGateConfig: DELEGATE_GATE,
  });
  const body = JSON.stringify(sessionPayload());
  const signature = sign(body, ISSUE_SECRET);
  const result = await adapter.handle({ rawBody: body, signature });
  assert.equal(result.kind, "skip");
  assert.equal(result.reason, AGENT_SESSION_REMOVED);
});

test("Done and Canceled clear leftover Pi delegate on the webhook seam", async () => {
  for (const status of ["Done", "Canceled"]) {
    const linear = {
      calls: [],
      async getIssue() {
        return {
          id: ISSUE_ID,
          identifier: "KIT-99",
          status,
          delegate: { name: "Pi" },
          labels: ["ready-for-agent", "Feature"],
        };
      },
      async clearDelegate(input) {
        this.calls.push(["clearDelegate", input]);
      },
    };
    const enqueue = fakeEnqueue();
    const { result } = await routeIssue(
      issueUpdatePayload(),
      { id: ISSUE_ID, identifier: "KIT-99", status, delegate: { name: "Pi" } },
      { linear, enqueue },
    );
    assert.equal(result.kind, "skip", status);
    assert.equal(
      linear.calls.some((call) => call[0] === "clearDelegate"),
      true,
      status,
    );
    assert.equal(enqueue.jobs.length, 0, status);
  }
});
