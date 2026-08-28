import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import { test } from "node:test";
import {
  createHttpHandler,
  createMemoryAdapter,
  routeWebhook,
} from "../../harness/webhook-router.mjs";

const SECRET = "test-linear-webhook-secret";
const NOW = 1_700_000_000_000;
const ISSUE_ID = "issue-kit-99";

function sign(rawBody) {
  return createHmac("sha256", SECRET).update(rawBody).digest("hex");
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

function signed(payload) {
  const rawBody = JSON.stringify(payload);
  return { rawBody, signature: sign(rawBody), payload };
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

function fakeLinear(issue) {
  const calls = [];
  return {
    calls,
    async getIssue(id) {
      calls.push(id);
      return issue;
    },
  };
}

function fakeGh() {
  const calls = [];
  return {
    calls,
    merge(args) {
      calls.push(["merge", args]);
      return { ok: true };
    },
    viewPr(args) {
      calls.push(["viewPr", args]);
      return { mergeable: "MERGEABLE" };
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

function routeDeps(issue, extras = {}) {
  const linear = fakeLinear(issue);
  const gh = fakeGh();
  const enqueue = fakeEnqueue();
  return { linear, gh, enqueue, ...extras };
}

async function dispatch(payload, issue, extras = {}) {
  const { rawBody, signature } = signed(payload);
  const deps = routeDeps(issue, extras);
  const result = await routeWebhook({
    rawBody,
    signature,
    secret: SECRET,
    now: NOW,
    linear: deps.linear,
    gh: deps.gh,
    enqueue: deps.enqueue,
    allowedDelegates: ["Pi"],
  });
  return { result, ...deps, rawBody, signature };
}

function assertHiddenBehindInterface(result, jobs) {
  const blobs = [result, ...jobs].map((value) => JSON.stringify(value));
  for (const blob of blobs) {
    assert.equal(blob.includes("argv"), false, "Pi argv must stay behind the interface");
    assert.equal(blob.includes("worktree"), false, "worktree paths must stay behind the interface");
    assert.equal(
      blob.includes("/var/lib/kit-pi"),
      false,
      "worktree paths must stay behind the interface",
    );
    assert.equal(
      blob.includes("adwYaml"),
      false,
      "ADW yaml contents must stay behind the interface",
    );
    assert.equal(
      blob.includes("scout:"),
      false,
      "ADW yaml contents must stay behind the interface",
    );
  }
}

test("forgery without a valid HMAC is rejected and enqueues nothing", async () => {
  const { rawBody } = signed(issueUpdatePayload());
  const deps = routeDeps(snapshot());
  const result = await routeWebhook({
    rawBody,
    signature: "deadbeef",
    secret: SECRET,
    now: NOW,
    linear: deps.linear,
    gh: deps.gh,
    enqueue: deps.enqueue,
  });

  assert.equal(result.kind, "rejected");
  assert.equal(deps.enqueue.jobs.length, 0);
  assert.equal(deps.linear.calls.length, 0);
  assert.equal(deps.gh.calls.length, 0);
});

test("missing HMAC signature is rejected", async () => {
  const { rawBody } = signed(issueUpdatePayload());
  const deps = routeDeps(snapshot());
  const result = await routeWebhook({
    rawBody,
    signature: undefined,
    secret: SECRET,
    now: NOW,
    linear: deps.linear,
    gh: deps.gh,
    enqueue: deps.enqueue,
  });

  assert.equal(result.kind, "rejected");
  assert.equal(deps.enqueue.jobs.length, 0);
});

test("AgentSession created never enqueues a coding job", async () => {
  const { result, enqueue, linear, gh } = await dispatch(
    {
      action: "create",
      type: "AgentSession",
      data: { id: "session-1", issueId: ISSUE_ID },
      webhookTimestamp: NOW,
    },
    snapshot({ status: "Implementing", delegate: { name: "Pi" } }),
  );

  assert.equal(result.kind, "skip");
  assert.equal(enqueue.jobs.length, 0);
  assert.equal(linear.calls.length, 0);
  assert.equal(gh.calls.length, 0);
});

test("Backlog + ready-for-agent + unblocked enqueues planner", async () => {
  const { result, enqueue, gh } = await dispatch(issueUpdatePayload(), snapshot());

  assert.equal(result.kind, "enqueue");
  assert.equal(enqueue.jobs.length, 1);
  assert.equal(enqueue.jobs[0].role, "planner");
  assert.equal(enqueue.jobs[0].adwFile, undefined);
  assert.equal(gh.calls.length, 0);
  assertHiddenBehindInterface(result, enqueue.jobs);
});

test("unresolved blockedBy skips planner", async () => {
  const { result, enqueue } = await dispatch(
    issueUpdatePayload(),
    snapshot({
      blockedBy: [{ id: "blocker", status: "Merging", statusType: "started" }],
    }),
  );

  assert.equal(result.kind, "skip");
  assert.equal(enqueue.jobs.length, 0);
});

test("Backlog without ready-for-agent skips", async () => {
  const { result, enqueue } = await dispatch(
    issueUpdatePayload(),
    snapshot({ labels: ["Feature"], linearType: "Feature" }),
  );

  assert.equal(result.kind, "skip");
  assert.equal(enqueue.jobs.length, 0);
});

test("Issue update without status in updatedFrom skips", async () => {
  const { result, enqueue } = await dispatch(
    issueUpdatePayload({ updatedFrom: { title: "old title" } }),
    snapshot(),
  );

  assert.equal(result.kind, "skip");
  assert.equal(enqueue.jobs.length, 0);
});

test("Cursor delegate skips every coding role", async () => {
  const { result, enqueue } = await dispatch(
    issueUpdatePayload(),
    snapshot({
      status: "Implementing",
      delegate: { name: "Cursor" },
    }),
  );

  assert.equal(result.kind, "skip");
  assert.equal(enqueue.jobs.length, 0);
});

test("unknown app delegate skips", async () => {
  const { result, enqueue } = await dispatch(
    issueUpdatePayload(),
    snapshot({
      status: "In Review",
      delegate: { name: "Slack" },
    }),
  );

  assert.equal(result.kind, "skip");
  assert.equal(enqueue.jobs.length, 0);
});

test("Implementing with empty Agent enqueues implement", async () => {
  const { result, enqueue } = await dispatch(
    issueUpdatePayload(),
    snapshot({ status: "Implementing", delegate: null, linearType: "Feature", labels: ["Feature"] }),
  );

  assert.equal(result.kind, "enqueue");
  assert.equal(enqueue.jobs.length, 1);
  assert.equal(enqueue.jobs[0].role, "implement");
});

test("Implementing with Pi delegate skips (requires empty Agent)", async () => {
  const { result, enqueue } = await dispatch(
    issueUpdatePayload(),
    snapshot({ status: "Implementing", delegate: { name: "Pi" }, linearType: "Feature", labels: ["Feature"] }),
  );

  assert.equal(result.kind, "skip");
  assert.equal(enqueue.jobs.length, 0);
});

test("Implementing + empty Agent + Feature enqueues implement and names feature ADW", async () => {
  const { result, enqueue } = await dispatch(
    issueUpdatePayload(),
    snapshot({
      status: "Implementing",
      delegate: null,
      labels: ["ready-for-agent", "Feature"],
      linearType: "Feature",
    }),
  );

  assert.equal(result.kind, "enqueue");
  assert.equal(enqueue.jobs.length, 1);
  assert.equal(enqueue.jobs[0].role, "implement");
  assert.equal(enqueue.jobs[0].adwFile, ".pi/adw/feature.yaml");
  assert.notEqual(enqueue.jobs[0].adwFile, "Feature");
  assert.notEqual(result.role, "Feature");
  assert.notEqual(enqueue.jobs[0].role, "Feature");
  assertHiddenBehindInterface(result, enqueue.jobs);
});

test("Implementing + empty Agent + Bug names bug ADW, not a Linear status", async () => {
  const { result, enqueue } = await dispatch(
    issueUpdatePayload(),
    snapshot({
      status: "Implementing",
      delegate: null,
      labels: ["Bug"],
      linearType: "Bug",
    }),
  );

  assert.equal(enqueue.jobs.length, 1);
  assert.equal(enqueue.jobs[0].role, "implement");
  assert.equal(enqueue.jobs[0].adwFile, ".pi/adw/bug.yaml");
  assert.equal(result.kind, "enqueue");
});

test("Implementing + empty Agent + Improvement names improvement ADW", async () => {
  const { enqueue } = await dispatch(
    issueUpdatePayload(),
    snapshot({
      status: "Implementing",
      delegate: null,
      labels: ["Improvement"],
      linearType: "Improvement",
    }),
  );

  assert.equal(enqueue.jobs.length, 1);
  assert.equal(enqueue.jobs[0].role, "implement");
  assert.equal(enqueue.jobs[0].adwFile, ".pi/adw/improvement.yaml");
});

test("In Review enqueues factory-checker and does not pick an ADW from Type", async () => {
  const { result, enqueue } = await dispatch(
    issueUpdatePayload(),
    snapshot({
      status: "In Review",
      delegate: { name: "Pi" },
      labels: ["Feature"],
      linearType: "Feature",
    }),
  );

  assert.equal(result.kind, "enqueue");
  assert.equal(enqueue.jobs.length, 1);
  assert.equal(enqueue.jobs[0].role, "factory-checker");
  assert.equal(enqueue.jobs[0].adwFile, undefined);
});

test("Merging enqueues land", async () => {
  const { result, enqueue, gh } = await dispatch(
    issueUpdatePayload(),
    snapshot({
      status: "Merging",
      labels: ["Feature"],
      linearType: "Feature",
    }),
  );

  assert.equal(result.kind, "enqueue");
  assert.equal(enqueue.jobs.length, 1);
  assert.equal(enqueue.jobs[0].role, "land");
  assert.equal(enqueue.jobs[0].adwFile, undefined);
  assert.equal(gh.calls.length, 0);
});

test("Ready for merge enqueues auto-merge (not a human-only skip)", async () => {
  const { result, enqueue } = await dispatch(
    issueUpdatePayload(),
    snapshot({ status: "Ready for merge" }),
  );

  assert.equal(result.kind, "enqueue");
  assert.equal(result.role, "auto-merge");
  assert.equal(enqueue.jobs.length, 1);
  assert.equal(enqueue.jobs[0].role, "auto-merge");
  assert.equal(enqueue.jobs[0].adwFile, undefined);
});

test("signal-up skips", async () => {
  const { result, enqueue } = await dispatch(
    issueUpdatePayload(),
    snapshot({ labels: ["signal-up", "ready-for-agent", "Feature"] }),
  );

  assert.equal(result.kind, "skip");
  assert.equal(enqueue.jobs.length, 0);
});

test("HTTP adapter rejects forgery with 401 and accepts a planner enqueue with 200", async () => {
  const planner = signed(issueUpdatePayload());
  const deps = routeDeps(snapshot());
  const handler = createHttpHandler({
    secret: SECRET,
    now: () => NOW,
    linear: deps.linear,
    gh: deps.gh,
    enqueue: deps.enqueue,
    allowedDelegates: ["Pi"],
  });

  async function post({ rawBody, signature }) {
    const server = createServer(handler);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    try {
      const response = await fetch(`http://127.0.0.1:${port}/webhook`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "linear-signature": signature,
        },
        body: rawBody,
      });
      return response.status;
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  }

  assert.equal(await post({ rawBody: planner.rawBody, signature: "00".repeat(32) }), 401);
  assert.equal(deps.enqueue.jobs.length, 0);

  assert.equal(await post(planner), 200);
  assert.equal(deps.enqueue.jobs.length, 1);
  assert.equal(deps.enqueue.jobs[0].role, "planner");
});

test("in-memory adapter matches HTTP dispatch for the same fixture", async () => {
  const { rawBody, signature } = signed(issueUpdatePayload());
  const memoryDeps = routeDeps(snapshot());
  const httpDeps = routeDeps(snapshot());
  const memory = createMemoryAdapter({
    secret: SECRET,
    now: NOW,
    linear: memoryDeps.linear,
    gh: memoryDeps.gh,
    enqueue: memoryDeps.enqueue,
    allowedDelegates: ["Pi"],
  });
  const handler = createHttpHandler({
    secret: SECRET,
    now: () => NOW,
    linear: httpDeps.linear,
    gh: httpDeps.gh,
    enqueue: httpDeps.enqueue,
    allowedDelegates: ["Pi"],
  });
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const memoryResult = await memory.handle({ rawBody, signature });
    const response = await fetch(`http://127.0.0.1:${port}/webhook`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "linear-signature": signature,
      },
      body: rawBody,
    });
    assert.equal(response.status, 200);
    assert.equal(memoryResult.kind, "enqueue");
    assert.equal(memoryDeps.enqueue.jobs[0].role, "planner");
    assert.equal(httpDeps.enqueue.jobs[0].role, memoryDeps.enqueue.jobs[0].role);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
