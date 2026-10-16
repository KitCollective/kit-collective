import { createHmac } from "node:crypto";
import {
  createFakePluginHost,
  makePluginAgentConfigurationContext,
  makeThreadResponse,
} from "@get-bb/plugin-sdk/testing";
import { describe, expect, it, vi } from "vitest";
import plugin from "../server.js";

async function load(settings: Record<string, unknown> = {}) {
  let threads = 0;
  const host = createFakePluginHost({
    pluginId: "optio",
    settings: { linearWebhookSecret: "whsec", ...settings },
    agentSkillIds: ["optio"],
    sdk: {
      threads: { spawn: async () => ({ id: `thr_${(threads += 1)}` }), get: async () => ({ status: "active", archivedAt: null }) },
      projects: { list: async () => [{ id: "proj_1", name: "kit-collective" }] },
      hosts: { list: async () => [{ id: "host_1", name: "Mac" }] },
    },
  });
  await plugin(host.bb);
  const rpc = host.harness.behavior.callRpc as (method: string, input: unknown) => Promise<any>;
  const agent = await rpc("agent_create", {
    name: "DevOps",
    description: "CI and deploys",
    projectId: "proj_1",
    instructions: "Own the pipelines.",
    enabled: true,
    httpTrigger: true,
  });
  return { harness: host.harness, rpc, agent };
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
    expect(listed.agents[0]).toMatchObject({ id: "devops", instructions: "Own CI.", memories: 0, automations: 0 });
    expect(listed.projects).toEqual([{ id: "proj_1", name: "kit-collective" }]);
  });

  it("starts a chat as the agent and lists it as a session", async () => {
    const loaded = await load();
    const { rpc } = loaded;
    expect(await rpc("agent_chat", { id: "devops", message: "Why is CI red?" })).toEqual({ threadId: "thr_1" });
    const detail = await rpc("agent_get", { id: "devops" });
    expect(detail.sessions[0]).toMatchObject({ source: "chat", status: "running", threadId: "thr_1" });
  });

  it("keeps memory that the page and the agent both write", async () => {
    const { rpc, harness } = await load();
    await rpc("memory_add", { agentId: "devops", text: "Deploys go through Coolify." });
    const saved = await harness.behavior.runCli(["memory", "add", "devops", "Never", "rerun", "a", "deploy", "by", "hand."]);
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
    const base = { agentId: "devops", name: "CI", prompt: "Check CI.", workflow: null, workflowArgs: {}, enabled: true };
    await expect(rpc("automation_save", { ...base, cron: "every day" })).rejects.toThrow();
    await expect(rpc("automation_save", { ...base, cron: "0 8 * * *", prompt: " " })).rejects.toThrow();
    const saved = await rpc("automation_save", { ...base, cron: "0 8 * * *" });
    expect(await rpc("automation_run", { id: saved.id })).toEqual({ threadId: "thr_1" });
  });

  it("runs due automations from the schedule, unless paused", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-12T07:30:00"), toFake: ["Date"] });
    try {
      const loaded = await load();
      await loaded.rpc("automation_save", {
        agentId: "devops", name: "CI", cron: "0 8 * * *", prompt: "Check CI.", workflow: null, workflowArgs: {}, enabled: true,
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
    for (const pluginMetadata of [{}, { standingAgent: "nope" }, { standingAgent: 7 }] as Record<string, string | number>[]) {
      const other = await harness.behavior.resolveAgentConfiguration(
        makePluginAgentConfigurationContext({ pluginMetadata }),
      );
      expect(JSON.stringify(other)).not.toContain("optio brief");
    }
  });
});

describe("the board", () => {
  it("is set up from the page in dry-run and edited without JSON", async () => {
    const { rpc } = await load();
    expect(await rpc("board_get", null)).toMatchObject({ configured: false, mode: "off" });
    await rpc("board_setup", { projectId: "proj_1", teamKey: "KIT", workflow: "kit-issue" });
    await rpc("board_update", {
      focus: "Samling 1.0",
      maxAttempts: 3,
      machines: [{ id: "mac", hostId: "host_1", branch: "origin/development", cap: 1, capabilities: ["postgres"] }],
      requirements: [{ capability: "postgres", labels: ["api"], scope: [] }],
    });
    const board = await rpc("board_get", null);
    expect(board).toMatchObject({
      configured: true,
      mode: "dry-run",
      focus: "Samling 1.0",
      maxAttempts: 3,
      teamKey: "KIT",
      machines: [{ id: "mac", cap: 1 }],
      requirements: [{ capability: "postgres" }],
    });
    // No Linear key in this host: the plan cannot be read, and the page is told why.
    expect(board.error).toContain("no Linear API key");
    await rpc("board_update", { focus: null });
    expect((await rpc("board_get", null)).focus).toBeNull();
    expect((await rpc("hosts_list", null)).hosts).toEqual([{ id: "host_1", name: "Mac" }]);
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
    expect((await post(loaded, { agent: "devops", task: "CI failed.", payload: { run: 7 }, deliveryId: "d1" })).status).toBe(202);
    await vi.waitFor(() => expect(spawns(loaded)).toHaveLength(1));
    await post(loaded, { agent: "devops", task: "CI failed.", deliveryId: "d1" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(spawns(loaded)).toHaveLength(1);
  });

  it("refuses unknown agents, agents that do not allow it, bad bodies, and everything while paused", async () => {
    const loaded = await load();
    await loaded.rpc("agent_create", {
      name: "Frontend", description: "", projectId: "proj_1", instructions: "", enabled: true, httpTrigger: false,
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
    expect((await harness.behavior.fetchHttp("POST", "/linear", request("other"))).status).toBe(401);
  });

  it("answers 503 until the signing secret is set", async () => {
    const { harness } = await load({ linearWebhookSecret: "" });
    expect((await harness.behavior.fetchHttp("POST", "/linear", request())).status).toBe(503);
  });
});

describe("bb optio", () => {
  it("triggers by hand and closes the session when the thread goes idle", async () => {
    const { harness } = await load();
    const started = await harness.behavior.runCli(["trigger", "devops", "--task", "Check the deploy.", "--json"]);
    expect(started.exitCode).toBe(0);
    expect(JSON.parse(started.stdout ?? "{}")).toMatchObject({ status: "running", threadId: "thr_1" });
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
    const scheduled = await harness.behavior.runCli(["follow-up", "add", "devops", "--task", "Check the deploy."], {
      threadId: "thr_origin",
    });
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
    const bad = await harness.behavior.runCli(["follow-up", "add", "devops", "--task", "x", "--at", "tomorrow-ish"]);
    expect(bad.exitCode).not.toBe(0);
    expect(bad.stderr).toContain("is not a time");
  });

  it("keeps Linear triggers per agent", async () => {
    const { rpc } = await load();
    const trigger = await rpc("linear_trigger_add", {
      agentId: "devops", teamKey: "KIT", project: null, event: "created", value: "ignored", task: "Triage it.",
    });
    expect(trigger).toMatchObject({ event: "created", value: null, enabled: true });
    await rpc("linear_trigger_toggle", { id: trigger.id, enabled: false });
    expect((await rpc("agent_get", { id: "devops" })).linearTriggers[0]).toMatchObject({ enabled: false });
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
