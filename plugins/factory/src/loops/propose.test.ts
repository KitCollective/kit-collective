// Proposing a change to what a Loop or Staff member is: Optio starts a thread that opens a pull
// request, links it, and changes nothing itself until the pull request is merged (ADR-0065).
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import plugin from "../../server.js";
import type { rpcContract } from "../contract.js";

type Contract = typeof rpcContract;
type Rpc = <M extends keyof Contract & string>(
  method: M,
  input: unknown,
) => Promise<z.output<Contract[M]["output"]>>;

const loop = {
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
  maxLive: 3,
};
const registry = JSON.stringify({ loops: [loop], flow: { maxRunsPerDay: 5 } });
const charter = "---\nname: Max\n---\n\n# Max\n\nNever merges.\n";

type PullRequest =
  | { outcome: "absent" }
  | {
      outcome: "available";
      pullRequest: { number: number; url: string; state: "open" | "draft" | "merged" | "closed" };
    };

async function load({ withCharter = true, board = true } = {}) {
  const spawned: { prompt: string; title: string; projectId: string }[] = [];
  let pull: PullRequest = { outcome: "absent" };
  const files: Record<string, string> = {
    "factory.config.json": registry,
    ...(withCharter ? { "staff/max.md": charter } : {}),
  };
  const host = createFakePluginHost({
    pluginId: "optio",
    settings: { linearApiKey: "lin_key" },
    agentSkillIds: ["optio"],
    sdk: {
      threads: {
        spawn: async (request: { prompt?: string; title?: string; projectId: string }) => {
          spawned.push({
            prompt: request.prompt ?? "",
            title: request.title ?? "",
            projectId: request.projectId,
          });
          return { id: `thr_${spawned.length}` };
        },
        get: async () => ({ status: "active", archivedAt: null, environmentId: "env_1" }),
      },
      environments: { pullRequest: async () => pull },
      projects: {
        list: async () => [{ id: "proj_1", name: "acme" }],
        fileContent: async ({ path }: { path: string }) => {
          const content = files[path];
          if (content === undefined) throw new Error(`no ${path}`);
          return {
            content,
            contentEncoding: "utf8",
            mimeType: "text/plain",
            sizeBytes: content.length,
          };
        },
      },
      hosts: { list: async () => [{ id: "host_1", name: "Mac" }] },
    },
  });
  await plugin(host.bb);
  // SAFETY: the fake host's callRpc parses every result with the method's output schema in rpcContract.
  const rpc = host.harness.behavior.callRpc as Rpc;
  if (board) {
    await rpc("board_setup", {
      projectId: "proj_1",
      teamKey: "ENG",
      backlogState: "Icebox",
      activeStates: ["Doing"],
      blockedState: null,
    });
    await rpc("board_update", {
      mode: "off",
      machines: [{ id: "mac", hostId: "host_1", branch: "origin/main", cap: 2, capabilities: [] }],
    });
  }
  const agent = await rpc("agent_create", {
    name: "Max",
    description: "Engineering Manager",
    projectId: "proj_1",
    instructions: "",
    enabled: true,
    httpTrigger: false,
  });
  return {
    rpc,
    spawned,
    agent,
    setPullRequest: (next: PullRequest) => {
      pull = next;
    },
  };
}

const opened = {
  outcome: "available",
  pullRequest: { number: 12, url: "https://github.com/acme/app/pull/12", state: "open" },
} as const;

describe("proposing a change to a Loop", () => {
  it("starts a thread that opens a pull request against the lane with the text, and links it once it has", async () => {
    const { rpc, spawned, setPullRequest } = await load();

    const proposal = await rpc("loops_propose", {
      loop: "Issue run",
      text: "Make the trigger state Doing.",
      by: "Ada",
    });

    expect(proposal).toMatchObject({
      subject: "Issue run",
      file: "factory.config.json",
      text: "Make the trigger state Doing.",
      by: "Ada",
      threadId: "thr_1",
      pr: null,
    });
    expect(spawned).toHaveLength(1);
    expect(spawned[0]?.projectId).toBe("proj_1");
    const task = spawned[0]?.prompt ?? "";
    expect(task).toContain("Open one pull request that proposes a change to factory.config.json");
    expect(task).toContain("--base main");
    expect(task).toContain("Make the trigger state Doing.");
    expect(task).toContain("Do not merge");

    expect((await rpc("loops_proposals", null)).proposals[0]?.pr).toBeNull();
    setPullRequest(opened);
    expect((await rpc("loops_proposals", null)).proposals[0]?.pr).toEqual({
      number: 12,
      url: "https://github.com/acme/app/pull/12",
      state: "open",
    });
  });

  it("changes nothing about the Loop until the pull request is merged: no override, no setting, no log entry", async () => {
    const { rpc } = await load();
    const before = await rpc("loops_list", null);

    await rpc("loops_propose", { loop: "Issue run", text: "Raise maxLive to 9.", by: "Ada" });

    expect(await rpc("loops_list", null)).toEqual(before);
    const after = (await rpc("loops_list", null)).loops[0];
    expect(after?.settings.maxLive).toEqual({ value: 3, file: 3, override: null });
    expect((await rpc("loops_list", null)).log).toEqual([]);
  });

  it("refuses an empty text, an unknown Loop and a Board without a machine, and starts no thread", async () => {
    const { rpc, spawned } = await load();
    await expect(
      rpc("loops_propose", { loop: "Issue run", text: "   ", by: "Ada" }),
    ).rejects.toThrow(/write what should change/);
    await expect(rpc("loops_propose", { loop: "Nope", text: "Do it.", by: "Ada" })).rejects.toThrow(
      /no Loop "Nope"/,
    );
    expect(spawned).toEqual([]);

    const unset = await load({ board: false });
    await expect(
      unset.rpc("loops_propose", { loop: "Issue run", text: "Do it.", by: "Ada" }),
    ).rejects.toThrow();
    expect(unset.spawned).toEqual([]);
  });
});

describe("proposing a change to a Staff member's Charter", () => {
  it("shows the Charter read-only and opens a pull request against it with the text", async () => {
    const { rpc, spawned, agent, setPullRequest } = await load();

    expect(await rpc("agent_charter", { id: agent.id })).toEqual({
      file: "staff/max.md",
      content: charter,
      proposals: [],
    });

    const proposal = await rpc("agent_propose", {
      id: agent.id,
      text: "Add: never touches production.",
      by: "Ada",
    });
    expect(proposal).toMatchObject({ subject: agent.id, file: "staff/max.md", pr: null });
    const task = spawned[0]?.prompt ?? "";
    expect(task).toContain("proposes a change to staff/max.md");
    expect(task).toContain("Add: never touches production.");

    setPullRequest(opened);
    const shown = await rpc("agent_charter", { id: agent.id });
    expect(shown.proposals[0]?.pr?.url).toBe("https://github.com/acme/app/pull/12");
    expect(shown.content).toBe(charter);
  });

  it("changes nothing about the agent until the pull request is merged", async () => {
    const { rpc, agent } = await load();
    const before = await rpc("agent_get", { id: agent.id });

    await rpc("agent_propose", { id: agent.id, text: "Grant it Bash.", by: "Ada" });

    expect(await rpc("agent_get", { id: agent.id })).toEqual(before);
  });

  it("says a member without a Charter file has none and starts no thread", async () => {
    const { rpc, spawned, agent } = await load({ withCharter: false });
    expect(await rpc("agent_charter", { id: agent.id })).toEqual({
      file: null,
      content: null,
      proposals: [],
    });
    await expect(rpc("agent_propose", { id: agent.id, text: "Do it.", by: "Ada" })).rejects.toThrow(
      /no Charter file/,
    );
    expect(spawned).toEqual([]);
  });
});
