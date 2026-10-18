import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import plugin from "../../server.js";
import type { rpcContract } from "../contract.js";

type Contract = typeof rpcContract;
type Rpc = <M extends keyof Contract & string>(
  method: M,
  input: unknown,
) => Promise<z.output<Contract[M]["output"]>>;

const registry = JSON.stringify({
  linear: { teamKey: "ENG" },
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
        skipLabels: [],
        priorityOrder: [1, 2, 3, 4, 0],
      },
      machines: ["mac"],
      maxLive: 2,
    },
  ],
  agent: { workpadHeading: "## Workpad" },
});

type Entry = { identifier: string; labels: string[]; since: string };

/** A fake Linear: every issue is in `Waiting` since the given time. */
const linear = (rows: () => Entry[]) =>
  vi.fn(async () => {
    const nodes = rows().map((entry) => ({
      identifier: entry.identifier,
      title: `Title of ${entry.identifier}`,
      url: `https://linear.app/acme/issue/${entry.identifier}`,
      createdAt: "2026-09-01T00:00:00Z",
      labels: { nodes: entry.labels.map((name) => ({ name })) },
      attachments: { nodes: [] },
      comments: { nodes: [] },
      history: { nodes: [{ createdAt: entry.since, toState: { name: "Waiting" } }] },
    }));
    return new Response(
      JSON.stringify({
        data: { issues: { pageInfo: { hasNextPage: false, endCursor: null }, nodes } },
      }),
    );
  });

async function homeOn(rows: () => Entry[], { inbox = true } = {}) {
  vi.stubGlobal("fetch", linear(rows));
  const host = createFakePluginHost({
    pluginId: "optio",
    settings: { linearWebhookSecret: "whsec", linearApiKey: "lin_key" },
    agentSkillIds: ["optio"],
    sdk: {
      projects: {
        list: async () => [{ id: "proj_1", name: "acme" }],
        fileContent: async () => ({
          content: registry,
          contentEncoding: "utf8",
          mimeType: "application/json",
          sizeBytes: registry.length,
        }),
      },
    },
  });
  await plugin(host.bb);
  if (inbox) {
    const set = await host.harness.behavior.runCli([
      "inbox",
      "--state",
      "Waiting",
      "--labels",
      "asks",
      "--project",
      "proj_1",
    ]);
    expect(set.exitCode).toBe(0);
  }
  // SAFETY: the fake host's callRpc parses every result with the method's output schema in rpcContract.
  return host.harness.behavior.callRpc as Rpc;
}

const issue = (identifier: string, day: number, labels: string[] = []): Entry => ({
  identifier,
  labels,
  since: `2026-10-${String(day).padStart(2, "0")}T00:00:00Z`,
});

afterEach(() => vi.unstubAllGlobals());

describe("Venter på dig on bb's Home", () => {
  it("counts every Inbox card and lists the three newest by when they began to wait", async () => {
    const rpc = await homeOn(() => [
      issue("ENG-1", 2),
      issue("ENG-2", 9, ["asks"]),
      issue("ENG-3", 5),
      issue("ENG-4", 7, ["asks"]),
      issue("ENG-5", 1),
    ]);
    const home = await rpc("home_waiting", null);
    expect(home.error).toBeNull();
    expect(home.count).toBe(5);
    expect(home.newest).toEqual([
      {
        identifier: "ENG-2",
        title: "Title of ENG-2",
        kind: "question",
        since: "2026-10-09T00:00:00.000Z",
      },
      {
        identifier: "ENG-4",
        title: "Title of ENG-4",
        kind: "question",
        since: "2026-10-07T00:00:00.000Z",
      },
      {
        identifier: "ENG-3",
        title: "Title of ENG-3",
        kind: "review",
        since: "2026-10-05T00:00:00.000Z",
      },
    ]);
  });

  it("shows fewer than three when fewer wait, and none when nothing does", async () => {
    let rows = [issue("ENG-1", 2)];
    const rpc = await homeOn(() => rows);
    const one = await rpc("home_waiting", null);
    expect(one.newest.map((card) => card.identifier)).toEqual(["ENG-1"]);
    rows = [];
    expect(await rpc("home_waiting", null)).toEqual({ error: null, count: 0, newest: [] });
  });

  it("says why it cannot count when the Inbox is not set up", async () => {
    const rpc = await homeOn(() => [issue("ENG-1", 2)], { inbox: false });
    const home = await rpc("home_waiting", null);
    expect(home.error).toContain("the Inbox is not set up");
    expect(home.count).toBe(0);
    expect(home.newest).toEqual([]);
  });
});
