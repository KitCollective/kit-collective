import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import plugin from "../../server.js";
import type { rpcContract } from "../contract.js";
import { createGateStore } from "../gate-store.js";
import { GATE_CALL_TIMEOUT_MS } from "../host-contract.js";

type Contract = typeof rpcContract;
type Rpc = <M extends keyof Contract & string>(
  method: M,
  input: unknown,
) => Promise<z.output<Contract[M]["output"]>>;

const registry = JSON.stringify({
  loops: [
    {
      name: "Issue run",
      enabled: true,
      workflow: "issue-run",
      trigger: {
        kind: "issue",
        state: "Ready",
        label: "agent-ready",
        unblocked: true,
        skipLabels: ["on-hold"],
        priorityOrder: [1, 2, 3, 4, 0],
      },
      machines: ["mac"],
      maxLive: 2,
    },
  ],
  agent: { workpadHeading: "## Workpad" },
  approver: "Pat",
});

type HostCall = { method: string; input: unknown };

async function load(
  registryText = registry,
  {
    board = true,
    callHost,
  }: { board?: boolean; callHost?: (call: HostCall) => Promise<unknown> } = {},
) {
  const host = createFakePluginHost({
    pluginId: "optio",
    settings: { linearWebhookSecret: "whsec", linearApiKey: "lin_key" },
    agentSkillIds: ["optio"],
    sdk: {
      projects: {
        list: async () => [{ id: "proj_1", name: "acme" }],
        fileContent: async () => ({
          content: registryText,
          contentEncoding: "utf8",
          mimeType: "application/json",
          sizeBytes: registryText.length,
        }),
      },
    },
    ...(callHost === undefined ? {} : { experimental_callHostRpc: callHost }),
  });
  await plugin(host.bb);
  // SAFETY: the fake host's callRpc parses every result with the method's output schema in rpcContract.
  const rpc = host.harness.behavior.callRpc as Rpc;
  if (board)
    await rpc("board_setup", {
      projectId: "proj_1",
      teamKey: "ENG",
      backlogState: "Icebox",
      activeStates: ["Doing"],
      blockedState: null,
    });
  createGateStore(host.bb.storage.database()).record({
    at: Date.now(),
    threadId: "thr_r",
    gate: "review",
    pr: 7,
    issue: "ENG-1",
    outcome: "ran",
    exitCode: 0,
    verdictLine: "review: open (0 findings)",
    sha: "abc",
    hostId: null,
    reason: null,
  });
  return { rpc, cli: host.harness.behavior.runCli, host };
}

const workpad = (ask: string, stage: string) =>
  `## Workpad\n\n### Waiting\n\n- ${ask}\n- Stage: ${stage}. Asked: 2026-10-01\n\n### Plan\n\n- (none)\n`;

type Entry = {
  identifier: string;
  labels: string[];
  since: string;
  comments: string[];
  attachments: { url: string; title: string }[];
};
const newer: Entry = {
  identifier: "ENG-3",
  labels: ["asks"],
  since: "2026-10-03T00:00:00Z",
  comments: ["chatter", workpad("Newer question?", "pre-review gate")],
  attachments: [],
};
const older: Entry = {
  identifier: "ENG-2",
  labels: ["decide"],
  since: "2026-10-02T00:00:00Z",
  comments: [workpad("Older question?", "plan")],
  attachments: [],
};
const reviewed: Entry = {
  identifier: "ENG-1",
  labels: [],
  since: "2026-10-05T00:00:00Z",
  comments: [],
  attachments: [{ url: "https://github.com/acme/app/pull/7", title: "ENG-1: Add the thing" }],
};
const entries = [newer, older, reviewed];

/** A fake Linear that answers with the rows as they are at each call. */
const linear = (rows: () => Entry[]) =>
  vi.fn(async () => {
    const nodes = rows().map((entry) => ({
      identifier: entry.identifier,
      title: `Title of ${entry.identifier}`,
      url: `https://linear.app/acme/issue/${entry.identifier}`,
      createdAt: "2026-09-01T00:00:00Z",
      labels: { nodes: entry.labels.map((name) => ({ name })) },
      attachments: { nodes: entry.attachments },
      comments: { nodes: entry.comments.map((body) => ({ body })) },
      history: {
        nodes: [
          { createdAt: "2026-09-15T00:00:00Z", toState: { name: "Elsewhere" } },
          { createdAt: entry.since, toState: { name: "Waiting" } },
        ],
      },
    }));
    return new Response(
      JSON.stringify({
        data: { issues: { pageInfo: { hasNextPage: false, endCursor: null }, nodes } },
      }),
    );
  });

/** The plugin with the Inbox set up on `Waiting`, and Linear behind `fetch`. */
async function inboxOn(rows: () => Entry[] = () => entries, registryText = registry) {
  const fetchMock = linear(rows);
  vi.stubGlobal("fetch", fetchMock);
  const loaded = await load(registryText);
  const set = await loaded.cli(["inbox", "--state", "Waiting", "--labels", "asks, decide"]);
  expect(set.exitCode).toBe(0);
  return { ...loaded, fetchMock };
}

describe("the Inbox", () => {
  it("lists a card per issue: reviews first, then questions, oldest first", async () => {
    try {
      const { rpc } = await inboxOn();
      const inbox = await rpc("inbox_list", null);
      expect(inbox.error).toBeNull();
      expect(inbox.cards.map((card) => card.identifier)).toEqual(["ENG-1", "ENG-2", "ENG-3"]);
      expect(inbox.cards[0]).toEqual({
        identifier: "ENG-1",
        title: "Title of ENG-1",
        url: "https://linear.app/acme/issue/ENG-1",
        pullRequest: { number: 7, url: "https://github.com/acme/app/pull/7" },
        kind: "review",
        label: null,
        choices: [],
        waiting: null,
        review: { verdict: "review: open (0 findings)", change: "ENG-1: Add the thing" },
        since: "2026-10-05T00:00:00.000Z",
        landing: null,
      });
      expect(inbox.cards[1]).toMatchObject({
        kind: "question",
        label: "decide",
        pullRequest: null,
        waiting: { ask: "Older question?", stage: "plan", asked: "2026-10-01" },
        review: null,
      });
      expect(inbox.cards[2]?.waiting).toEqual({
        ask: "Newer question?",
        stage: "pre-review gate",
        asked: "2026-10-01",
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("reads Linear on every call, so an issue that left the state is gone", async () => {
    let rows = entries;
    try {
      const { rpc, fetchMock } = await inboxOn(() => rows);
      expect((await rpc("inbox_list", null)).cards).toHaveLength(3);
      rows = entries.filter((entry) => entry.identifier !== "ENG-2");
      const again = await rpc("inbox_list", null);
      expect(again.cards.map((card) => card.identifier)).toEqual(["ENG-1", "ENG-3"]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps a card whose workpad, verdict or pull request title is missing", async () => {
    const untitled = "https://github.com/acme/app/pull/9";
    try {
      const { rpc } = await inboxOn(() => [
        { ...newer, comments: ["no workpad here"] },
        { ...reviewed, identifier: "ENG-9", attachments: [{ url: untitled, title: untitled }] },
      ]);
      const { cards } = await rpc("inbox_list", null);
      expect(cards[0]).toMatchObject({
        identifier: "ENG-9",
        pullRequest: { number: 9 },
        review: { verdict: null, change: null },
      });
      expect(cards[1]).toMatchObject({ identifier: "ENG-3", waiting: null });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("reports a registry it cannot read instead of listing cards without workpads", async () => {
    try {
      const { rpc, cli, fetchMock } = await inboxOn(() => entries, "{ not json");
      const inbox = await rpc("inbox_list", null);
      expect(inbox.cards).toEqual([]);
      expect(inbox.error).toContain("factory.config.json is not valid JSON");
      expect((await cli(["inbox"])).exitCode).toBe(1);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("says how to set it up when it is not, and `bb optio inbox` follows the setting", async () => {
    vi.stubGlobal(
      "fetch",
      linear(() => entries),
    );
    try {
      const { rpc, cli } = await load();
      const unset = await rpc("inbox_list", null);
      expect(unset.cards).toEqual([]);
      expect(unset.error).toContain("bb optio inbox --state");
      const failed = await cli(["inbox", "--json"]);
      expect(failed.exitCode).toBe(1);
      expect(JSON.parse(failed.stdout).error).toContain("bb optio inbox --state");
      expect((await cli(["inbox", "--state", "Waiting"])).exitCode).toBe(1);
      expect((await cli(["inbox", "--state", "Waiting", "--labels", "asks"])).exitCode).toBe(0);
      const listed = await cli(["inbox", "--json"]);
      expect(listed.exitCode).toBe(0);
      expect(JSON.parse(listed.stdout).cards).toHaveLength(3);
      expect((await cli(["inbox", "--off"])).exitCode).toBe(0);
      expect((await rpc("inbox_list", null)).error).toContain("not set up");
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("works without the Board: its own project, and the team from factory.config.json", async () => {
    const fetchMock = linear(() => entries);
    vi.stubGlobal("fetch", fetchMock);
    try {
      const withTeam = JSON.stringify({ ...JSON.parse(registry), linear: { teamKey: "ENG" } });
      const { rpc, cli } = await load(withTeam, { board: false });
      expect((await cli(["inbox", "--state", "Waiting", "--labels", "asks"])).exitCode).toBe(0);
      const projectless = await rpc("inbox_list", null);
      expect(projectless.cards).toEqual([]);
      expect(projectless.error).toContain("the Inbox has no project");
      const set = await cli([
        "inbox",
        "--state",
        "Waiting",
        "--labels",
        "asks,decide",
        "--project",
        "proj_1",
      ]);
      expect(set.exitCode).toBe(0);
      const inbox = await rpc("inbox_list", null);
      expect(inbox.error).toBeNull();
      expect(inbox.cards.map((card) => card.identifier)).toEqual(["ENG-1", "ENG-2", "ENG-3"]);
      // The Linear read went to the team factory.config.json names.
      expect(JSON.stringify(fetchMock.mock.calls.at(-1))).toContain('\\"team\\":\\"ENG\\"');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("names the missing Linear team when neither the config nor a Board gives one", async () => {
    vi.stubGlobal(
      "fetch",
      linear(() => entries),
    );
    try {
      const { rpc, cli } = await load(registry, { board: false });
      await cli(["inbox", "--state", "Waiting", "--labels", "asks", "--project", "proj_1"]);
      expect((await rpc("inbox_list", null)).error).toContain("linear.teamKey");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("offers the lettered choices of an ask as buttons, in order", async () => {
    const asks = [
      "Which? (A) run it on the Mac, (B) skip the flow, or (C) wait",
      "Which? A) run it on the Mac; B) skip the flow",
      "Sent by Dr. A. Smith, no choice here",
      "Only one: A) the Mac",
    ];
    try {
      const { rpc } = await inboxOn(() =>
        asks.map((ask, index) => ({
          ...older,
          identifier: `ENG-${20 + index}`,
          comments: [workpad(ask, "plan")],
        })),
      );
      const { cards } = await rpc("inbox_list", null);
      expect(cards.map((card) => card.choices)).toEqual([
        [
          { letter: "A", text: "run it on the Mac" },
          { letter: "B", text: "skip the flow" },
          { letter: "C", text: "wait" },
        ],
        [
          { letter: "A", text: "run it on the Mac" },
          { letter: "B", text: "skip the flow" },
        ],
        [],
        [],
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

/** A fake Linear that also takes writes: a comment is kept, a move changes the rows. */
function linearWithWrites(rows: Entry[], fail: { move?: boolean; comment?: boolean } = {}) {
  const writes: { query: string; variables: Record<string, unknown> }[] = [];
  const ids: Record<string, string> = {
    asks: "l-asks",
    decide: "l-decide",
    "triage-me": "l-other",
    "agent-ready": "l-ready",
  };
  const moved = new Set<string>();
  const comments = new Map<string, string>();
  let commentCount = 0;
  const read = linear(() => rows.filter((entry) => !moved.has(entry.identifier)));
  const respond = (data: unknown) => new Response(JSON.stringify({ data }));
  const mock = vi.fn(async (_url: unknown, init?: RequestInit) => {
    // SAFETY: the plugin sends `{ query, variables }` as the body of every Linear call.
    const { query, variables } = JSON.parse(String(init?.body)) as {
      query: string;
      variables: Record<string, unknown>;
    };
    if (query.includes("query Waiting")) return read();
    if (query.includes("query Approve")) {
      const entry = rows.find((row) => row.identifier === variables.id);
      return respond({
        issue:
          entry === undefined
            ? null
            : {
                id: `id-${entry.identifier}`,
                title: `Title of ${entry.identifier}`,
                url: `https://linear.app/acme/issue/${entry.identifier}`,
                state: { name: moved.has(entry.identifier) ? "Merge" : "Waiting" },
                labels: { nodes: entry.labels.map((name) => ({ name })) },
                attachments: { nodes: entry.attachments },
                team: {
                  key: "ENG",
                  states: {
                    nodes: [
                      { id: "s-ready", name: "Ready" },
                      { id: "s-wait", name: "Waiting" },
                      { id: "s-merge", name: "Merge" },
                    ],
                  },
                },
              },
      });
    }
    if (query.includes("query Settle")) {
      const entry = rows.find((row) => row.identifier === variables.id);
      return respond({
        issue:
          entry === undefined
            ? null
            : {
                id: `id-${entry.identifier}`,
                state: { name: moved.has(entry.identifier) ? "Ready" : "Waiting" },
                labels: { nodes: entry.labels.map((name) => ({ id: ids[name], name })) },
                team: {
                  key: "ENG",
                  states: {
                    nodes: [
                      { id: "s-ready", name: "Ready" },
                      { id: "s-wait", name: "Waiting" },
                    ],
                  },
                },
              },
        issueLabels: { nodes: [{ id: "l-ready", team: { key: "ENG" } }] },
      });
    }
    writes.push({ query, variables });
    if (query.includes("commentCreate")) {
      if (fail.comment)
        return new Response(JSON.stringify({ errors: [{ message: "comment refused" }] }), {
          status: 400,
        });
      commentCount += 1;
      comments.set(`c-${commentCount}`, String(variables.body));
      return respond({ commentCreate: { success: true, comment: { id: `c-${commentCount}` } } });
    }
    if (query.includes("commentDelete")) {
      comments.delete(String(variables.id));
      return respond({ commentDelete: { success: true } });
    }
    if (fail.move)
      return new Response(JSON.stringify({ errors: [{ message: "move refused" }] }), {
        status: 400,
      });
    moved.add(String(variables.id).replace("id-", ""));
    return respond({ issueUpdate: { success: true } });
  });
  return { mock, writes, comments, moved };
}

const waitingQuestion: Entry = {
  ...older,
  labels: ["decide", "triage-me"],
  comments: [workpad("Which? (A) one, (B) two", "plan")],
};

describe("answering and rejecting from the Inbox", () => {
  async function inboxWith(rows: Entry[], fail = {}) {
    const fake = linearWithWrites(rows, fail);
    vi.stubGlobal("fetch", fake.mock);
    const loaded = await load();
    await loaded.cli(["inbox", "--state", "Waiting", "--labels", "asks, decide"]);
    return { ...loaded, ...fake };
  }
  const identifiers = async (rpc: Rpc) =>
    (await rpc("inbox_list", null)).cards.map((card) => card.identifier);

  it("writes the answer as a comment, swaps the question label for the Loop's and moves the issue", async () => {
    try {
      const { rpc, writes, comments } = await inboxWith([waitingQuestion, reviewed]);
      expect(await rpc("inbox_answer", { identifier: "ENG-2", answer: "  A  " })).toEqual({
        error: null,
      });
      expect([...comments.values()]).toEqual(["A"]);
      // The unrelated label stays, the question label goes, the Loop's label and state come.
      expect(writes.find((write) => write.query.includes("issueUpdate"))?.variables).toEqual({
        id: "id-ENG-2",
        stateId: "s-ready",
        labelIds: ["l-other", "l-ready"],
      });
      expect(await identifiers(rpc)).toEqual(["ENG-1"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("rejects a green review with the comment, back to the Loop's state and label", async () => {
    try {
      const { rpc, writes, comments } = await inboxWith([waitingQuestion, reviewed]);
      expect(
        await rpc("inbox_reject", { identifier: "ENG-1", comment: "Fix the empty state." }),
      ).toEqual({
        error: null,
      });
      expect([...comments.values()]).toEqual(["Fix the empty state."]);
      expect(writes.find((write) => write.query.includes("issueUpdate"))?.variables).toEqual({
        id: "id-ENG-1",
        stateId: "s-ready",
        labelIds: ["l-ready"],
      });
      expect(await identifiers(rpc)).toEqual(["ENG-2"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("refuses an empty answer and a rejection without a comment, writing nothing", async () => {
    try {
      const { rpc, writes } = await inboxWith([waitingQuestion, reviewed]);
      expect((await rpc("inbox_answer", { identifier: "ENG-2", answer: "  " })).error).toContain(
        "answer",
      );
      expect((await rpc("inbox_reject", { identifier: "ENG-1", comment: "\n" })).error).toContain(
        "comment",
      );
      expect(writes).toEqual([]);
      expect(await identifiers(rpc)).toEqual(["ENG-1", "ENG-2"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("refuses a card of the other kind or one that left the state, writing nothing", async () => {
    try {
      const { rpc, writes } = await inboxWith([waitingQuestion, reviewed]);
      expect((await rpc("inbox_answer", { identifier: "ENG-1", answer: "yes" })).error).toContain(
        "a review now",
      );
      expect((await rpc("inbox_reject", { identifier: "ENG-2", comment: "no" })).error).toContain(
        "a question now",
      );
      expect((await rpc("inbox_answer", { identifier: "ENG-404", answer: "yes" })).error).toContain(
        "no issue ENG-404",
      );
      expect(writes).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("leaves the card as it was and says why when the comment is refused", async () => {
    try {
      const { rpc, comments } = await inboxWith([waitingQuestion], { comment: true });
      const result = await rpc("inbox_answer", { identifier: "ENG-2", answer: "A" });
      expect(result.error).toContain("comment refused");
      expect(comments.size).toBe(0);
      expect(await identifiers(rpc)).toEqual(["ENG-2"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("takes the comment back and keeps the card when the move is refused", async () => {
    try {
      const { rpc, comments } = await inboxWith([waitingQuestion], { move: true });
      const result = await rpc("inbox_answer", { identifier: "ENG-2", answer: "A" });
      expect(result.error).toContain("move refused");
      expect(comments.size).toBe(0);
      expect(await identifiers(rpc)).toEqual(["ENG-2"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("says so when the Inbox is not set up", async () => {
    vi.stubGlobal("fetch", linearWithWrites([waitingQuestion]).mock);
    try {
      const { rpc } = await load();
      expect((await rpc("inbox_answer", { identifier: "ENG-2", answer: "A" })).error).toContain(
        "not set up",
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

/** A runs machine whose landing script answers when the test says so, one slice at a time. */
function steppedHost() {
  const calls: { method: string; input: unknown }[] = [];
  const answers: ((result: unknown) => void)[] = [];
  const callHost = (call: HostCall) => {
    calls.push({ method: call.method, input: call.input });
    return new Promise<unknown>((resolve) => answers.push(resolve));
  };
  async function answer(exitCode: number, lastLine: string) {
    await vi.waitFor(() => expect(answers.length).toBeGreaterThan(0));
    answers.shift()?.({ exitCode, lastLine, hostname: "runs", cwd: "/srv/main", durationMs: 1 });
  }
  return { calls, callHost, answer };
}

const LANDING = [
  "--approve-to",
  "Merge",
  "--land-host",
  "host_runs",
  "--land-checkout",
  "/srv/main",
];

describe("approving from the Inbox", () => {
  async function approving(rows: Entry[], { landing = true } = {}) {
    const fake = linearWithWrites(rows);
    vi.stubGlobal("fetch", fake.mock);
    const machine = steppedHost();
    const loaded = await load(registry, { callHost: machine.callHost });
    await loaded.cli(["inbox", "--state", "Waiting", "--labels", "asks, decide"]);
    if (landing) expect((await loaded.cli(["inbox", ...LANDING])).exitCode).toBe(0);
    return { ...loaded, ...fake, machine };
  }
  const cardOf = async (rpc: Rpc, identifier: string) =>
    (await rpc("inbox_list", null)).cards.find((card) => card.identifier === identifier);
  const phaseIs = (rpc: Rpc, identifier: string, phase: string) =>
    vi.waitFor(async () => expect((await cardOf(rpc, identifier))?.landing?.phase).toBe(phase));

  it("comments the approver, moves the review to the merge state with its labels, and shows the landing until done", async () => {
    try {
      const { rpc, writes, comments, machine } = await approving([
        { ...reviewed, labels: ["agent-ready"] },
      ]);
      expect(await rpc("inbox_approve", { identifier: "ENG-1" })).toEqual({ error: null });
      expect([...comments.values()]).toEqual(["Pat approved it from the Inbox."]);
      // The move names only the state: the labels stay as they are.
      expect(writes.find((write) => write.query.includes("issueUpdate"))?.variables).toEqual({
        id: "id-ENG-1",
        stateId: "s-merge",
      });
      // The issue left the Inbox state; its card now comes from the landing.
      expect(await cardOf(rpc, "ENG-1")).toMatchObject({
        kind: "review",
        pullRequest: { number: 7 },
        review: { verdict: "review: open (0 findings)", change: "ENG-1: Add the thing" },
        landing: { phase: "approved", line: null },
      });

      await machine.answer(0, "QUEUED (land-approved): PR 7 at abc1234 is in the merge queue");
      await phaseIs(rpc, "ENG-1", "queued");
      await machine.answer(
        3,
        "WAITING (land-approved): merged: PR 7 merged as fffffff, the land gate is waiting",
      );
      await phaseIs(rpc, "ENG-1", "merged");
      expect((await cardOf(rpc, "ENG-1"))?.landing?.line).toContain("merged as fffffff");
      await machine.answer(
        0,
        "LANDED (land-approved): PR 7 merged as fffffff, the land gate is open; ENG-1 Done",
      );
      await phaseIs(rpc, "ENG-1", "done");
      // A done landing shows once.
      expect(await cardOf(rpc, "ENG-1")).toBeUndefined();

      // Optio ran the fixed script on the runs machine in its checkout, step by step.
      expect(machine.calls).toEqual([
        {
          method: "run_land",
          input: {
            cwd: "/srv/main",
            step: "start",
            pr: 7,
            issue: "ENG-1",
            timeoutMs: GATE_CALL_TIMEOUT_MS,
          },
        },
        {
          method: "run_land",
          input: {
            cwd: "/srv/main",
            step: "finish",
            pr: 7,
            issue: "ENG-1",
            timeoutMs: GATE_CALL_TIMEOUT_MS,
          },
        },
        {
          method: "run_land",
          input: {
            cwd: "/srv/main",
            step: "finish",
            pr: 7,
            issue: "ENG-1",
            timeoutMs: GATE_CALL_TIMEOUT_MS,
          },
        },
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("shows why a landing stopped on the card the stop brings back, until a person answers it", async () => {
    const row: Entry = { ...reviewed, labels: [] };
    try {
      const { rpc, moved, machine } = await approving([row]);
      await rpc("inbox_approve", { identifier: "ENG-1" });
      await machine.answer(0, "QUEUED (land-approved): PR 7 is in the merge queue");
      await phaseIs(rpc, "ENG-1", "queued");
      await machine.answer(
        1,
        "STOPPED (land-approved): queue-ejected: the merge queue dropped the PR",
      );
      await phaseIs(rpc, "ENG-1", "stopped");
      // The script handed the issue to a person: back in the Inbox state as a question.
      moved.delete("ENG-1");
      row.labels = ["decide"];
      const card = await cardOf(rpc, "ENG-1");
      expect(card).toMatchObject({ kind: "question", label: "decide" });
      expect(card?.landing?.line).toContain("queue-ejected");
      expect(
        (await rpc("inbox_list", null)).cards.filter((one) => one.identifier === "ENG-1"),
      ).toHaveLength(1);
      expect(await rpc("inbox_answer", { identifier: "ENG-1", answer: "Rebase it" })).toEqual({
        error: null,
      });
      expect(await cardOf(rpc, "ENG-1")).toBeUndefined();
      expect(machine.calls).toHaveLength(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("stops the landing with the reason when the runs machine does not answer", async () => {
    const fake = linearWithWrites([reviewed]);
    vi.stubGlobal("fetch", fake.mock);
    try {
      const { rpc, cli } = await load(registry, {
        callHost: async () => {
          throw new Error("host host_runs is offline");
        },
      });
      await cli(["inbox", "--state", "Waiting", "--labels", "asks", ...LANDING]);
      await rpc("inbox_approve", { identifier: "ENG-1" });
      await phaseIs(rpc, "ENG-1", "stopped");
      expect((await cardOf(rpc, "ENG-1"))?.landing?.line).toBe(
        "the runs machine did not answer: host host_runs is offline",
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("refuses a question, a card that left the state, and a missing landing setting, writing nothing", async () => {
    try {
      const unset = await approving([waitingQuestion, reviewed], { landing: false });
      expect((await unset.rpc("inbox_approve", { identifier: "ENG-1" })).error).toContain(
        "--land-checkout",
      );
      expect(unset.writes).toEqual([]);
      vi.unstubAllGlobals();

      const { rpc, writes, machine } = await approving([waitingQuestion, reviewed]);
      expect((await rpc("inbox_approve", { identifier: "ENG-2" })).error).toContain(
        "a question now",
      );
      expect((await rpc("inbox_approve", { identifier: "ENG-404" })).error).toContain(
        "no issue ENG-404",
      );
      expect(await rpc("inbox_approve", { identifier: "ENG-1" })).toEqual({ error: null });
      expect((await rpc("inbox_approve", { identifier: "ENG-1" })).error).toContain(
        "is in Merge now",
      );
      expect(writes.filter((write) => write.query.includes("commentCreate"))).toHaveLength(1);
      expect(machine.calls).toHaveLength(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("refuses a review with no pull request to land", async () => {
    try {
      const { rpc, writes } = await approving([{ ...reviewed, attachments: [] }]);
      expect((await rpc("inbox_approve", { identifier: "ENG-1" })).error).toContain(
        "no pull request",
      );
      expect(writes).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("starts the landing again after a plugin reload, from the stored phase", async () => {
    try {
      const { rpc, host, machine } = await approving([]);
      await host.bb.storage.kv.set("landing:ENG-1", {
        identifier: "ENG-1",
        title: "Title of ENG-1",
        url: "https://linear.app/acme/issue/ENG-1",
        pullRequest: { number: 7, url: "https://github.com/acme/app/pull/7" },
        change: null,
        hostId: "host_runs",
        checkout: "/srv/main",
        phase: "queued",
        line: "QUEUED (land-approved): PR 7 is in the merge queue",
        approvedAt: "2026-10-18T00:00:00.000Z",
        at: "2026-10-18T00:00:00.000Z",
      });
      expect((await cardOf(rpc, "ENG-1"))?.landing?.phase).toBe("queued");
      await vi.waitFor(() => expect(machine.calls).toHaveLength(1));
      expect(machine.calls[0]?.input).toMatchObject({ step: "finish", pr: 7 });
      // A second read does not start a second driver.
      await rpc("inbox_list", null);
      expect(machine.calls).toHaveLength(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("sets the landing settings alone, keeping where the Inbox looks, and refuses a relative checkout", async () => {
    try {
      const { cli, rpc } = await approving([reviewed], { landing: false });
      expect((await cli(["inbox", "--land-checkout", "srv/main"])).exitCode).not.toBe(0);
      expect((await cli(["inbox", ...LANDING])).exitCode).toBe(0);
      expect((await rpc("inbox_list", null)).cards.map((card) => card.identifier)).toEqual([
        "ENG-1",
      ]);
      // Setting where it looks again keeps the landing settings.
      await cli(["inbox", "--state", "Waiting", "--labels", "asks"]);
      expect(await rpc("inbox_approve", { identifier: "ENG-1" })).toEqual({ error: null });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
