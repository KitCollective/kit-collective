import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import plugin from "../../server.js";
import type { rpcContract } from "../contract.js";
import { createGateStore } from "../gate-store.js";

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
});

async function load(registryText = registry, { board = true } = {}) {
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
  return { rpc, cli: host.harness.behavior.runCli };
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
        waiting: null,
        review: { verdict: "review: open (0 findings)", change: "ENG-1: Add the thing" },
        since: "2026-10-05T00:00:00.000Z",
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
});
