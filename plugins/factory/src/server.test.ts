import { createHmac } from "node:crypto";
import { readdirSync } from "node:fs";
import {
  createFakePluginHost,
  makePluginAgentConfigurationContext,
  makeThreadResponse,
} from "@get-bb/plugin-sdk/testing";
import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import plugin from "../server.js";
import type { rpcContract } from "./contract.js";

type Contract = typeof rpcContract;
type Rpc = <M extends keyof Contract & string>(
  method: M,
  input: unknown,
) => Promise<z.output<Contract[M]["output"]>>;

async function load(settings: Record<string, unknown> = {}) {
  let threads = 0;
  /** What the project checkout holds: the registry the board reads every tick. */
  const checkout: { registry: string; encoding: "utf8" | "base64" } = {
    registry: "",
    encoding: "utf8",
  };
  const host = createFakePluginHost({
    pluginId: "optio",
    settings: { linearWebhookSecret: "whsec", ...settings },
    agentSkillIds: ["optio"],
    sdk: {
      threads: {
        spawn: async () => {
          threads += 1;
          return { id: `thr_${threads}` };
        },
        get: async () => ({ status: "active", archivedAt: null }),
      },
      projects: {
        list: async () => [{ id: "proj_1", name: "acme" }],
        fileContent: async () => ({
          content:
            checkout.encoding === "base64"
              ? Buffer.from(checkout.registry).toString("base64")
              : checkout.registry,
          contentEncoding: checkout.encoding,
          mimeType: "application/json",
          sizeBytes: checkout.registry.length,
        }),
      },
      hosts: { list: async () => [{ id: "host_1", name: "Mac" }] },
    },
  });
  await plugin(host.bb);
  // SAFETY: the fake host's callRpc parses every result with the method's output schema in rpcContract;
  // the input stays unknown so a test can send what the contract refuses.
  const rpc = host.harness.behavior.callRpc as Rpc;
  const agent = await rpc("agent_create", {
    name: "DevOps",
    description: "CI and deploys",
    projectId: "proj_1",
    instructions: "Own the pipelines.",
    enabled: true,
    httpTrigger: true,
  });
  return { harness: host.harness, rpc, agent, checkout };
}

type Loaded = Awaited<ReturnType<typeof load>>;
const spawns = ({ harness }: Loaded) => harness.inspection.sdk.callsTo("threads.spawn");

describe("the Agents page RPC", () => {
  it("creates, edits and lists agents with the projects to choose from", async () => {
    const loaded = await load();
    const { rpc, agent } = loaded;
    expect(agent.id).toBe("devops");
    await rpc("agent_update", { ...pick(agent), id: agent.id, instructions: "Own CI." });
    const listed = await rpc("agents_list", null);
    expect(listed.agents[0]).toMatchObject({
      id: "devops",
      instructions: "Own CI.",
      memories: 0,
      automations: 0,
    });
    expect(listed.projects).toEqual([{ id: "proj_1", name: "acme" }]);
  });

  it("starts a chat as the agent and lists it as a session", async () => {
    const loaded = await load();
    const { rpc } = loaded;
    expect(await rpc("agent_chat", { id: "devops", message: "Why is CI red?" })).toEqual({
      threadId: "thr_1",
    });
    const detail = await rpc("agent_get", { id: "devops" });
    expect(detail.sessions[0]).toMatchObject({
      source: "chat",
      status: "running",
      threadId: "thr_1",
    });
  });

  it("keeps memory that the page and the agent both write", async () => {
    const { rpc, harness } = await load();
    await rpc("memory_add", { agentId: "devops", text: "Deploys go through Coolify." });
    const saved = await harness.behavior.runCli([
      "memory",
      "add",
      "devops",
      "Never",
      "rerun",
      "a",
      "deploy",
      "by",
      "hand.",
    ]);
    expect(saved.exitCode).toBe(0);
    const brief = await harness.behavior.runCli(["brief", "devops"]);
    expect(brief.stdout).toContain("Own the pipelines.");
    expect(brief.stdout).toContain("Never rerun a deploy by hand.");
    const { memories } = await rpc("agent_get", { id: "devops" });
    expect(memories).toHaveLength(2);
    await rpc("memory_delete", { id: memories[0].id });
    expect((await rpc("agent_get", { id: "devops" })).memories).toHaveLength(1);
  });

  it("refuses an automation with a bad schedule or nothing to do", async () => {
    const { rpc } = await load();
    const base = {
      agentId: "devops",
      name: "CI",
      prompt: "Check CI.",
      workflow: null,
      workflowArgs: {},
      enabled: true,
    };
    await expect(rpc("automation_save", { ...base, cron: "every day" })).rejects.toThrow();
    await expect(
      rpc("automation_save", { ...base, cron: "0 8 * * *", prompt: " " }),
    ).rejects.toThrow();
    const saved = await rpc("automation_save", { ...base, cron: "0 8 * * *" });
    expect(await rpc("automation_run", { id: saved.id })).toEqual({ threadId: "thr_1" });
  });

  it("runs due automations from the schedule, unless paused", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-12T07:30:00"), toFake: ["Date"] });
    try {
      const loaded = await load();
      await loaded.rpc("automation_save", {
        agentId: "devops",
        name: "CI",
        cron: "0 8 * * *",
        prompt: "Check CI.",
        workflow: null,
        workflowArgs: {},
        enabled: true,
      });
      vi.setSystemTime(new Date("2026-10-12T08:01:00"));
      await loaded.harness.behavior.setSettings({ paused: true });
      await loaded.harness.behavior.runSchedule("automations");
      expect(spawns(loaded)).toHaveLength(0);
      await loaded.harness.behavior.setSettings({ paused: false });
      await loaded.harness.behavior.runSchedule("automations");
      await loaded.harness.behavior.runSchedule("automations");
      expect(spawns(loaded)).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

const pick = (agent: Record<string, unknown>) => ({
  name: agent.name,
  description: agent.description,
  projectId: agent.projectId,
  instructions: agent.instructions,
  enabled: agent.enabled,
  httpTrigger: agent.httpTrigger,
});

describe("session instructions", () => {
  it("briefs a thread of a known agent and no other thread", async () => {
    const { harness } = await load();
    const forAgent = await harness.behavior.resolveAgentConfiguration(
      makePluginAgentConfigurationContext({ pluginMetadata: { standingAgent: "devops" } }),
    );
    expect(JSON.stringify(forAgent)).toContain("bb optio brief devops");
    const others: Record<string, string | number>[] = [
      {},
      { standingAgent: "nope" },
      { standingAgent: 7 },
    ];
    for (const pluginMetadata of others) {
      const other = await harness.behavior.resolveAgentConfiguration(
        makePluginAgentConfigurationContext({ pluginMetadata }),
      );
      expect(JSON.stringify(other)).not.toContain("optio brief");
    }
  });
});

describe("the gate tool", () => {
  it("is selected for every thread, so a workflow worker can call it", async () => {
    const { harness } = await load();
    const metadata: Record<string, string>[] = [
      {},
      { standingAgent: "devops" },
      { dispatch: "dsp_1" },
    ];
    for (const pluginMetadata of metadata) {
      const configuration = await harness.behavior.resolveAgentConfiguration(
        makePluginAgentConfigurationContext({ pluginMetadata }),
      );
      expect(JSON.stringify(configuration)).toContain("optio_gate");
    }
  });
});

describe("bb optio hand-over", () => {
  it("sets, shows and switches off the states of the hand-over", async () => {
    const { harness, rpc } = await load();
    await rpc("board_setup", {
      projectId: "proj_1",
      teamKey: "ENG",
      backlogState: "Icebox",
      activeStates: ["Doing"],
      blockedState: null,
    });
    const run = async (...args: string[]) =>
      (await harness.behavior.runCli(["hand-over", ...args])).stdout;
    expect(await run()).toBe("Hand-over is off");
    expect(await run("--review", "Reviewing", "--approval", "Accepted")).toContain(
      "Reviewing -> Accepted",
    );
    expect((await rpc("board_get", null)).handOver).toEqual({
      reviewState: "Reviewing",
      approvalState: "Accepted",
    });
    expect(await run()).toContain("Reviewing -> Accepted");
    expect(
      (await harness.behavior.runCli(["hand-over", "--review", "Reviewing"])).exitCode,
    ).not.toBe(0);
    expect(await run("--off")).toBe("Hand-over is off");
    expect((await rpc("board_get", null)).handOver).toBeNull();
  });
});

describe("the board", () => {
  it("is set up from the page in dry-run and edited without JSON", async () => {
    const { rpc, checkout } = await load();
    expect(await rpc("board_get", null)).toMatchObject({ configured: false, mode: "off" });
    await expect(rpc("board_setup", { projectId: "proj_1", teamKey: "ENG" })).rejects.toThrow();
    expect(await rpc("board_get", null)).toMatchObject({ configured: false });
    await rpc("board_setup", {
      projectId: "proj_1",
      teamKey: "ENG",
      backlogState: "Icebox",
      activeStates: ["Doing", "Reviewing"],
      blockedState: null,
    });
    await rpc("board_update", {
      focus: "Launch 1.0",
      maxAttempts: 3,
      machines: [
        { id: "mac", hostId: "host_1", branch: "origin/main", cap: 1, capabilities: ["postgres"] },
      ],
      requirements: [{ capability: "postgres", labels: ["api"], scope: [] }],
    });
    const board = await rpc("board_get", null);
    expect(board).toMatchObject({
      configured: true,
      mode: "dry-run",
      focus: "Launch 1.0",
      maxAttempts: 3,
      teamKey: "ENG",
      machines: [{ id: "mac", cap: 1 }],
      requirements: [{ capability: "postgres" }],
    });
    // The checkout holds no registry yet: the board refuses before it asks Linear anything.
    expect(board.registryError).toContain("factory.config.json is not valid JSON");
    expect(board.error).toBeNull();
    // With one, but no Linear key in this host, the plan cannot be read, and the page is told why.
    checkout.registry = JSON.stringify({
      loops: [
        {
          name: "Issue run",
          enabled: true,
          workflow: "issue-run",
          trigger: { kind: "issue", state: "Ready", label: "agent-ready", unblocked: true },
          machines: ["mac"],
          maxLive: 1,
        },
      ],
    });
    expect((await rpc("board_get", null)).error).toContain("no Linear API key");
    await rpc("board_update", { focus: null });
    expect((await rpc("board_get", null)).focus).toBeNull();
    // The hand-over states are off until set, kept by other edits, and cleared with null.
    expect((await rpc("board_get", null)).handOver).toBeNull();
    const handOver = { reviewState: "In Review", approvalState: "Approval" };
    await rpc("board_update", { handOver });
    expect((await rpc("board_get", null)).handOver).toEqual(handOver);
    await rpc("board_update", { maxAttempts: 2 });
    expect((await rpc("board_get", null)).handOver).toEqual(handOver);
    await rpc("board_update", { handOver: null });
    expect((await rpc("board_get", null)).handOver).toBeNull();
    expect((await rpc("hosts_list", null)).hosts).toEqual([{ id: "host_1", name: "Mac" }]);
  });
});

describe("the board reads the Loop registry", () => {
  const registry = (loops: unknown[] = [loop]) =>
    JSON.stringify({ loops, flow: { maxRunsPerDay: 3 } });
  const loop = {
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
  };
  const linearBoard = () =>
    vi.fn(async () => {
      const node = (identifier: string, labels: string[]) => ({
        id: `id-${identifier}`,
        identifier,
        title: `Title of ${identifier}`,
        priority: 2,
        createdAt: "2026-10-01T00:00:00Z",
        description: "",
        state: { name: "Ready" },
        labels: { nodes: labels.map((name) => ({ name })) },
        projectMilestone: null,
        project: null,
        inverseRelations: { nodes: [] },
      });
      return new Response(
        JSON.stringify({
          data: {
            teams: { nodes: [{ states: { nodes: [{ id: "s1", name: "Ready" }] } }] },
            issues: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [node("ENG-1", ["agent-ready"]), node("ENG-2", ["agent-ready", "on-hold"])],
            },
          },
        }),
      );
    });

  async function boardOn(mode: "dry-run" | "live") {
    const loaded = await load({ linearApiKey: "lin_key" });
    const { rpc } = loaded;
    await rpc("board_setup", {
      projectId: "proj_1",
      teamKey: "ENG",
      backlogState: "Icebox",
      activeStates: ["Doing"],
      blockedState: null,
    });
    await rpc("board_update", {
      mode,
      machines: [{ id: "mac", hostId: "host_1", branch: "origin/main", cap: 2, capabilities: [] }],
    });
    return loaded;
  }

  it("shows the plan in dry-run from the registry, records it and starts nothing", async () => {
    vi.stubGlobal("fetch", linearBoard());
    try {
      const loaded = await boardOn("dry-run");
      const { rpc, checkout, harness } = loaded;
      checkout.registry = registry();
      const board = await rpc("board_get", null);
      expect(board.registryError).toBeNull();
      expect(board.loops).toEqual([
        {
          name: "Issue run",
          workflow: "issue-run",
          kind: "issue",
          enabled: true,
          machines: ["mac"],
          maxLive: 2,
          running: 0,
        },
      ]);
      expect(board.start).toMatchObject([
        { identifier: "ENG-1", loop: "Issue run", machineId: "mac" },
      ]);
      expect(board.waiting).toEqual([
        { identifier: "ENG-2", loop: "Issue run", reason: "labelled on-hold" },
      ]);
      // Reading the page records nothing; the scheduled tick does, and applies nothing.
      expect(board.decisions).toEqual([]);
      await harness.behavior.runSchedule("orchestrator-tick");
      expect(spawns(loaded)).toHaveLength(0);
      expect((await rpc("board_get", null)).decisions).toMatchObject(
        [
          { kind: "skip", issue: "ENG-2", mode: "dry-run", reason: "labelled on-hold" },
          { kind: "start", issue: "ENG-1", mode: "dry-run", reason: "would start on mac" },
        ].reverse(),
      );
      const cli = await harness.behavior.runCli(["board", "--json"], { threadId: "thr_x" });
      expect(cli.exitCode).toBe(0);
      expect(JSON.parse(cli.stdout)).toMatchObject({
        loops: [{ name: "Issue run", workflow: "issue-run" }],
        start: [{ identifier: "ENG-1", loop: "Issue run" }],
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("starts the Loop's workflow in live, and reads the file whatever its encoding", async () => {
    vi.stubGlobal("fetch", linearBoard());
    try {
      const loaded = await boardOn("live");
      loaded.checkout.registry = registry([{ ...loop, workflow: "other-run" }]);
      loaded.checkout.encoding = "base64";
      await loaded.harness.behavior.runSchedule("orchestrator-tick");
      const [spawned] = spawns(loaded);
      expect(JSON.stringify(spawned)).toContain("--name other-run ");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("a registry that does not parse starts nothing and says why", async () => {
    const fetchMock = linearBoard();
    vi.stubGlobal("fetch", fetchMock);
    try {
      const loaded = await boardOn("live");
      const { rpc, checkout, harness } = loaded;
      checkout.registry = registry([{ ...loop, maxLive: -1 }]);
      await harness.behavior.runSchedule("orchestrator-tick");
      expect(spawns(loaded)).toHaveLength(0);
      expect(fetchMock).not.toHaveBeenCalled();
      const board = await rpc("board_get", null);
      expect(board.registryError).toContain("factory.config.json.loops.0.maxLive");
      expect(board.loops).toEqual([]);
      expect(board.start).toEqual([]);
      expect(board.decisions).toMatchObject([
        { kind: "refusal", loop: null, issue: null, mode: "live" },
      ]);
      const cli = await harness.behavior.runCli(["board"], { threadId: "thr_x" });
      expect(cli.exitCode).toBe(1);
      expect(cli.stdout).toContain("nothing is planned or started");
      // Fixed in the checkout, the next tick starts without a reload.
      checkout.registry = registry();
      await harness.behavior.runSchedule("orchestrator-tick");
      expect(spawns(loaded)).toHaveLength(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("the example seeds", () => {
  const examples = new URL("../examples/", import.meta.url);
  const seeds = readdirSync(examples).filter((file) => file.endsWith(".seed.mjs"));

  it("set up a board the RPC contract accepts", async () => {
    expect(seeds.length).toBeGreaterThan(0);
    for (const seed of seeds) {
      const { rpc } = await load();
      const { boardSetup, boardRouting } = await import(new URL(seed, examples).href);
      await rpc("board_setup", { ...boardSetup, projectId: "proj_1" });
      await rpc("board_update", boardRouting);
      expect(await rpc("board_get", null)).toMatchObject({ configured: true, mode: "dry-run" });
    }
  });
});

describe("POST /trigger", () => {
  const post = ({ harness }: Loaded, body: unknown) =>
    harness.behavior.fetchHttp("POST", "/trigger", {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });

  it("starts an agent that allows it, once per delivery", async () => {
    const loaded = await load();
    expect(
      (
        await post(loaded, {
          agent: "devops",
          task: "CI failed.",
          payload: { run: 7 },
          deliveryId: "d1",
        })
      ).status,
    ).toBe(202);
    await vi.waitFor(() => expect(spawns(loaded)).toHaveLength(1));
    await post(loaded, { agent: "devops", task: "CI failed.", deliveryId: "d1" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(spawns(loaded)).toHaveLength(1);
  });

  it("refuses unknown agents, agents that do not allow it, bad bodies, and everything while paused", async () => {
    const loaded = await load();
    await loaded.rpc("agent_create", {
      name: "Frontend",
      description: "",
      projectId: "proj_1",
      instructions: "",
      enabled: true,
      httpTrigger: false,
    });
    expect((await post(loaded, { agent: "nope" })).status).toBe(404);
    expect((await post(loaded, { agent: "frontend" })).status).toBe(409);
    expect((await post(loaded, { task: "x" })).status).toBe(400);
    await loaded.harness.behavior.setSettings({ paused: true });
    expect((await post(loaded, { agent: "devops" })).status).toBe(503);
    expect(spawns(loaded)).toHaveLength(0);
  });
});

describe("POST /linear", () => {
  function request(secret = "whsec") {
    const body = JSON.stringify({ type: "Issue", action: "update", webhookTimestamp: Date.now() });
    return {
      body,
      headers: {
        "content-type": "application/json",
        "linear-signature": createHmac("sha256", secret).update(body).digest("hex"),
      },
    };
  }

  it("accepts a signed delivery and rejects another secret", async () => {
    const { harness } = await load();
    expect((await harness.behavior.fetchHttp("POST", "/linear", request())).status).toBe(200);
    expect((await harness.behavior.fetchHttp("POST", "/linear", request("other"))).status).toBe(
      401,
    );
  });

  it("answers 503 until the signing secret is set", async () => {
    const { harness } = await load({ linearWebhookSecret: "" });
    expect((await harness.behavior.fetchHttp("POST", "/linear", request())).status).toBe(503);
  });
});

describe("bb optio", () => {
  it("triggers by hand and closes the session when the thread goes idle", async () => {
    const { harness } = await load();
    const started = await harness.behavior.runCli([
      "trigger",
      "devops",
      "--task",
      "Check the deploy.",
      "--json",
    ]);
    expect(started.exitCode).toBe(0);
    expect(JSON.parse(started.stdout ?? "{}")).toMatchObject({
      status: "running",
      threadId: "thr_1",
    });
    await harness.behavior.emitThreadEvent("thread.idle", {
      thread: makeThreadResponse({ id: "thr_1" }),
      lastAssistantText: "done",
    });
    const rows = JSON.parse((await harness.behavior.runCli(["runs", "--json"])).stdout ?? "[]");
    expect(rows[0]).toMatchObject({ status: "done" });
  });

  it("schedules a follow-up from a thread and delivers its report back there", async () => {
    const loaded = await load();
    const { harness, rpc } = loaded;
    harness.sdk.stub("threads.send", async () => ({}));
    const scheduled = await harness.behavior.runCli(
      ["follow-up", "add", "devops", "--task", "Check the deploy."],
      {
        threadId: "thr_origin",
      },
    );
    expect(scheduled.exitCode).toBe(0);
    expect(scheduled.stdout).toContain("its report comes back to this thread");
    expect((await rpc("agent_get", { id: "devops" })).followUps).toHaveLength(1);

    await harness.behavior.runSchedule("automations");
    expect(spawns(loaded)).toHaveLength(1);
    await harness.behavior.emitThreadEvent("thread.idle", {
      thread: makeThreadResponse({ id: "thr_1" }),
      lastAssistantText: "The deploy is green.",
    });
    await vi.waitFor(() => expect(harness.inspection.sdk.callsTo("threads.send")).toHaveLength(1));
    const sent = JSON.stringify(harness.inspection.sdk.callsTo("threads.send")[0]);
    expect(sent).toContain("thr_origin");
    expect(sent).toContain("The deploy is green.");
    expect((await rpc("agent_get", { id: "devops" })).followUps).toHaveLength(0);
  });

  it("refuses a follow-up time it cannot read", async () => {
    const { harness } = await load();
    const bad = await harness.behavior.runCli([
      "follow-up",
      "add",
      "devops",
      "--task",
      "x",
      "--at",
      "tomorrow-ish",
    ]);
    expect(bad.exitCode).not.toBe(0);
    expect(bad.stderr).toContain("is not a time");
  });

  it("keeps Linear triggers per agent", async () => {
    const { rpc } = await load();
    const trigger = await rpc("linear_trigger_add", {
      agentId: "devops",
      teamKey: "ENG",
      project: null,
      event: "created",
      value: "ignored",
      task: "Triage it.",
    });
    expect(trigger).toMatchObject({ event: "created", value: null, enabled: true });
    await rpc("linear_trigger_toggle", { id: trigger.id, enabled: false });
    expect((await rpc("agent_get", { id: "devops" })).linearTriggers[0]).toMatchObject({
      enabled: false,
    });
    await rpc("linear_trigger_delete", { id: trigger.id });
    expect((await rpc("agent_get", { id: "devops" })).linearTriggers).toEqual([]);
    // No Linear key in this host: the form is told why it has no teams.
    expect(await rpc("linear_options", null)).toMatchObject({ teams: [] });
  });

  it("names the missing agent", async () => {
    const { harness } = await load();
    const brief = await harness.behavior.runCli(["brief", "nope"]);
    expect(brief.exitCode).not.toBe(0);
    expect(brief.stderr).toContain('no agent "nope"');
  });
});
