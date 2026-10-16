// Sessions, memory and automations: the agent store and the session starter.
import { createHmac } from "node:crypto";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { AGENT_MIGRATIONS, createAgentStore, slugify } from "./agent-store.js";
import { verifyLinearWebhook } from "./linear.js";
import type { LinearIssue } from "./linear-api.js";
import { createLinearPoller, deriveEvents, triggerMatches } from "./linear-triggers.js";
import {
  assertCron,
  coerceArgs,
  createSessions,
  isDue,
  mentionContext,
  renderBrief,
  sessionInstructions,
  taskWithPayload,
  workflowLauncherPrompt,
  type SpawnRequest,
} from "./sessions.js";
import { MIGRATIONS, createRunStore } from "./store.js";

function setup(spawnFails = false) {
  const db = new Database(":memory:");
  for (const statement of [...MIGRATIONS, ...AGENT_MIGRATIONS]) db.exec(statement);
  const agents = createAgentStore(db);
  const runs = createRunStore(db);
  const state = { clock: Date.parse("2026-10-12T07:30:00"), spawned: [] as SpawnRequest[] };
  const sessions = createSessions({
    runs,
    agents,
    async spawn(request) {
      if (spawnFails) throw new Error("project not found");
      state.spawned.push(request);
      return { id: `thr_${state.spawned.length}` };
    },
    now: () => state.clock,
    log: () => {},
  });
  const agent = agents.create(
    { name: "DevOps", description: "CI and deploys", projectId: "proj_1", instructions: "Own the pipelines.", enabled: true, httpTrigger: true },
    state.clock,
  );
  return { agents, runs, sessions, state, agent };
}

describe("agent store", () => {
  it("derives a unique id from the name", () => {
    const { agents, agent, state } = setup();
    expect(agent.id).toBe("devops");
    expect(slugify("  Frontend & UI agent ")).toBe("frontend-ui-agent");
    const twin = agents.create({ ...agent, name: "DevOps" }, state.clock);
    expect(twin.id).toBe("devops-2");
  });

  it("removes an agent together with its memory and automations", () => {
    const { agents, agent, state } = setup();
    agents.remember(agent.id, "Deploys go through Coolify.", null, state.clock);
    agents.saveAutomation({ agentId: agent.id, name: "CI", cron: "0 8 * * *", prompt: "Check CI.", workflow: null, workflowArgs: {}, enabled: true }, state.clock);
    expect(agents.remove(agent.id)).toBe(true);
    expect(agents.memories(agent.id)).toEqual([]);
    expect(agents.automations()).toEqual([]);
  });
});

describe("brief and instructions", () => {
  it("prints the instructions, the memory newest first, and how to save more", () => {
    const { agents, agent, state } = setup();
    agents.remember(agent.id, "Staging deploys need the approver.", null, state.clock);
    const newer = agents.remember(agent.id, "Never rerun a deploy by hand.", "thr_9", state.clock + 1000);
    const brief = renderBrief(agent, agents.memories(agent.id));
    expect(brief).toContain("# DevOps: instructions\n\nOwn the pipelines.");
    expect(brief).toContain("# Memory (2)");
    expect(brief.indexOf("Never rerun")).toBeLessThan(brief.indexOf("Staging deploys"));
    expect(brief).toContain(`(${newer.id})`);
    expect(brief).toContain('bb optio memory add devops "<fact>"');
  });

  it("points every thread of the agent at its brief", () => {
    const { agent } = setup();
    expect(sessionInstructions(agent)).toContain("run `bb optio brief devops`");
  });
});

describe("sessions", () => {
  it("starts one thread that belongs to the agent", async () => {
    const { sessions, agent, state, runs } = setup();
    const run = await sessions.start(agent, { source: "chat", task: "Why is CI red on development?" });
    expect(run).toMatchObject({ status: "running", threadId: "thr_1", source: "chat" });
    expect(state.spawned[0]).toMatchObject({
      projectId: "proj_1",
      prompt: "Why is CI red on development?",
      title: "DevOps: Why is CI red on development?",
      environment: { type: "project-default" },
      pluginMetadata: { standingAgent: "devops", source: "chat" },
    });
    expect(runs.list(10, "devops")).toHaveLength(1);
  });

  it("drops a repeated delivery", async () => {
    const { sessions, agent, state } = setup();
    await sessions.start(agent, { source: "http", task: "x", deliveryId: "d1" });
    expect(await sessions.start(agent, { source: "http", task: "x", deliveryId: "d1" })).toBeNull();
    expect(state.spawned).toHaveLength(1);
  });

  it("records the failure when the thread cannot be started", async () => {
    const { sessions, agent, runs } = setup(true);
    const run = await sessions.start(agent, { source: "manual", task: "x" });
    expect(run).toMatchObject({ status: "failed", reason: "project not found" });
    expect(runs.list(10)[0]).toMatchObject({ status: "failed" });
  });

  it("attaches an external payload as data", () => {
    const task = taskWithPayload("CI failed.", { run: 42 });
    expect(task.startsWith("CI failed.")).toBe(true);
    expect(task).toContain('<trigger-event>\n{\n  "run": 42\n}\n</trigger-event>');
    expect(taskWithPayload(undefined, undefined)).toContain("Another system triggered you");
  });
});

describe("automations", () => {
  const automation = (overrides = {}) => ({
    agentId: "devops",
    name: "Morning CI check",
    cron: "0 8 * * *",
    prompt: "Check last night's CI.",
    workflow: null,
    workflowArgs: {},
    enabled: true,
    ...overrides,
  });

  it("accepts a five-field schedule and names what is wrong with another", () => {
    expect(() => assertCron("0 8 * * 1-5")).not.toThrow();
    expect(() => assertCron("0 8 * *")).toThrow("five fields");
    expect(() => assertCron("99 8 * * *")).toThrow();
  });

  it("is due once a fire time has passed since it last ran or was created", () => {
    const { agents, state } = setup();
    const saved = agents.saveAutomation(automation(), state.clock); // created 07:30
    expect(isDue(saved, state.clock + 10 * 60_000)).toBe(false); // 07:40
    expect(isDue(saved, state.clock + 31 * 60_000)).toBe(true); // 08:01
    expect(isDue({ ...saved, lastRunAt: state.clock + 31 * 60_000 }, state.clock + 60 * 60_000)).toBe(false);
  });

  it("runs a due automation once per fire time, as the agent", async () => {
    const { agents, sessions, state } = setup();
    agents.saveAutomation(automation(), state.clock);
    expect(await sessions.runDueAutomations()).toHaveLength(0);
    state.clock += 31 * 60_000;
    expect(await sessions.runDueAutomations()).toHaveLength(1);
    expect(await sessions.runDueAutomations()).toHaveLength(0);
    expect(state.spawned[0]).toMatchObject({
      prompt: "Check last night's CI.",
      title: "DevOps: Morning CI check",
      pluginMetadata: { standingAgent: "devops", source: "automation" },
    });
  });

  it("skips disabled automations and automations of a disabled agent", async () => {
    const { agents, sessions, state, agent } = setup();
    agents.saveAutomation(automation({ enabled: false }), state.clock);
    agents.saveAutomation(automation({ name: "Second" }), state.clock);
    agents.update(agent.id, { ...agent, enabled: false }, state.clock);
    state.clock += 31 * 60_000;
    expect(await sessions.runDueAutomations()).toHaveLength(0);
  });

  it("starts a workflow through a launcher thread that is not briefed as the agent", async () => {
    const { agents, sessions, state } = setup();
    agents.saveAutomation(
      automation({ prompt: "", workflow: "kit-issue", workflowArgs: { issue: "KIT-12", resume: "true", maxRounds: "3" } }),
      state.clock,
    );
    state.clock += 31 * 60_000;
    await sessions.runDueAutomations();
    expect(state.spawned[0]?.prompt).toContain(
      `bb workflows run --name kit-issue --args '{"issue":"KIT-12","resume":true,"maxRounds":3}' --json`,
    );
    expect(state.spawned[0]?.pluginMetadata).toMatchObject({ launcherFor: "devops" });
    expect(state.spawned[0]?.pluginMetadata.standingAgent).toBeUndefined();
  });

  it("quotes workflow args so their text cannot leave the argument", () => {
    expect(workflowLauncherPrompt("kit-issue", coerceArgs({ issue: "KIT-1'; rm -rf ~ #" }))).toContain(
      `--args '{"issue":"KIT-1'\\''; rm -rf ~ #"}' --json`,
    );
  });
});

describe("composer mention", () => {
  it("carries the agent's brief as context", () => {
    const { agents, agent, state } = setup();
    agents.remember(agent.id, "Deploys go through Coolify.", null, state.clock);
    const context = mentionContext(agent, agents.memories(agent.id));
    expect(context).toContain('addressed the "DevOps" standing agent (id: devops)');
    expect(context).toContain("Own the pipelines.");
    expect(context).toContain("Deploys go through Coolify.");
  });
});

describe("follow-ups", () => {
  it("start in a new thread of the agent once their time has come, exactly once", async () => {
    const { agents, sessions, state } = setup();
    const followUp = agents.addFollowUp(
      { agentId: "devops", task: "Check that the deploy went green.", dueAt: state.clock + 60 * 60_000, reportThreadId: "thr_origin" },
      state.clock,
    );
    expect(await sessions.runDueFollowUps()).toHaveLength(0);
    state.clock += 61 * 60_000;
    expect(await sessions.runDueFollowUps()).toHaveLength(1);
    expect(await sessions.runDueFollowUps()).toHaveLength(0);
    expect(state.spawned[0]?.prompt).toContain("Check that the deploy went green.");
    expect(state.spawned[0]?.prompt).toContain("your last message is delivered to the thread that asked");
    expect(state.spawned[0]?.pluginMetadata).toMatchObject({ standingAgent: "devops", source: "follow-up" });
    expect(agents.startedFollowUpByThread("thr_1")).toMatchObject({ id: followUp.id, reportThreadId: "thr_origin" });
  });

  it("can be cancelled only while waiting", () => {
    const { agents, state } = setup();
    const followUp = agents.addFollowUp({ agentId: "devops", task: "x", dueAt: state.clock, reportThreadId: null }, state.clock);
    expect(agents.setFollowUp(followUp.id, "pending", "cancelled")).toBe(true);
    expect(agents.setFollowUp(followUp.id, "pending", "cancelled")).toBe(false);
    expect(agents.dueFollowUps(state.clock)).toEqual([]);
  });

  it("is cancelled when its thread cannot be started", async () => {
    const { agents, sessions, state } = setup(true);
    agents.addFollowUp({ agentId: "devops", task: "x", dueAt: state.clock, reportThreadId: null }, state.clock);
    expect(await sessions.runDueFollowUps()).toHaveLength(0);
    expect(agents.openFollowUps()).toEqual([]);
  });
});

describe("Linear triggers", () => {
  const issue = (overrides: Partial<LinearIssue> = {}): LinearIssue => ({
    id: "i1",
    identifier: "KIT-12",
    title: "Tab bar",
    url: "https://linear.app/x/KIT-12",
    teamKey: "KIT",
    project: "Samling",
    state: "To-do",
    labels: ["mobile"],
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-12T08:00:00.000Z",
    ...overrides,
  });
  const lastPoll = "2026-10-12T07:00:00.000Z";

  it("derives created, status and label events from what was seen before", () => {
    expect(deriveEvents(null, issue({ createdAt: "2026-10-12T07:30:00.000Z" }), lastPoll)).toEqual([{ event: "created", value: null }]);
    // An old issue seen for the first time has no known past: nothing fires.
    expect(deriveEvents(null, issue(), lastPoll)).toEqual([]);
    expect(deriveEvents({ state: "Backlog", labels: [] }, issue(), lastPoll)).toEqual([
      { event: "state", value: "To-do" },
      { event: "label", value: "mobile" },
    ]);
    expect(deriveEvents({ state: "To-do", labels: ["mobile"] }, issue(), lastPoll)).toEqual([]);
  });

  it("matches on team, project, event and value", () => {
    const trigger = { id: "t", agentId: "devops", teamKey: "KIT", project: null as string | null, event: "state" as const, value: "To-do" as string | null, task: "x", enabled: true, createdAt: 0 };
    const moved = { event: "state" as const, value: "To-do" };
    expect(triggerMatches(trigger, issue(), moved)).toBe(true);
    expect(triggerMatches({ ...trigger, value: null }, issue(), moved)).toBe(true);
    expect(triggerMatches({ ...trigger, value: "Done" }, issue(), moved)).toBe(false);
    expect(triggerMatches({ ...trigger, teamKey: "OPE" }, issue(), moved)).toBe(false);
    expect(triggerMatches({ ...trigger, project: "samling" }, issue(), moved)).toBe(true);
    expect(triggerMatches({ ...trigger, project: "E-mail" }, issue(), moved)).toBe(false);
    expect(triggerMatches({ ...trigger, enabled: false }, issue(), moved)).toBe(false);
    expect(triggerMatches(trigger, issue(), { event: "label", value: "To-do" })).toBe(false);
  });

  function poller(batches: LinearIssue[][]) {
    const base = setup();
    let cursor: string | null = null;
    const asked: string[] = [];
    const instance = createLinearPoller({
      agents: base.agents,
      sessions: base.sessions,
      async fetchUpdated(_teams, since) {
        asked.push(since);
        return batches.shift() ?? [];
      },
      getCursor: async () => cursor,
      setCursor: async (next) => void (cursor = next),
      now: () => base.state.clock,
      log: () => {},
    });
    return { ...base, instance, asked, cursor: () => cursor };
  }

  it("takes the first poll as the baseline, then starts the agent on a matching change, once", async () => {
    const { agents, instance, state, asked, cursor } = poller([[issue({ state: "Backlog" })], [issue()], [issue()]]);
    expect(await instance.poll()).toBe(0); // no trigger: Linear is not even asked
    expect(asked).toEqual([]);
    agents.addLinearTrigger(
      { agentId: "devops", teamKey: "KIT", project: "Samling", event: "state", value: "To-do", task: "Review the issue.", enabled: true },
      state.clock,
    );
    expect(await instance.poll()).toBe(0);
    expect(asked).toEqual(["1970-01-01T00:00:00.000Z"]);
    expect(await instance.poll()).toBe(1);
    expect(cursor()).toBe("2026-10-12T08:00:00.000Z");
    expect(await instance.poll()).toBe(0); // the same update again changes nothing
    expect(state.spawned).toHaveLength(1);
    expect(state.spawned[0]?.prompt).toContain("Review the issue.");
    expect(state.spawned[0]?.prompt).toContain('"identifier": "KIT-12"');
    expect(state.spawned[0]?.title).toBe("DevOps: KIT-12 To-do");
  });
});

describe("verifyLinearWebhook", () => {
  const secret = "whsec";
  const rawBody = JSON.stringify({ type: "Issue", action: "update", webhookTimestamp: 1_000 });
  const signature = createHmac("sha256", secret).update(rawBody).digest("hex");

  it("accepts a fresh, correctly signed body", () => {
    expect(verifyLinearWebhook({ rawBody, signature, secret, now: 1_500 })).toMatchObject({ ok: true });
  });

  it("rejects a wrong, missing or malformed signature", () => {
    for (const bad of [null, "", "zz", signature.replace(/^./, (c) => (c === "0" ? "1" : "0"))]) {
      expect(verifyLinearWebhook({ rawBody, signature: bad, secret, now: 1_500 })).toMatchObject({ ok: false, status: 401 });
    }
  });

  it("rejects a signed body that is older than a minute", () => {
    expect(verifyLinearWebhook({ rawBody, signature, secret, now: 62_000 })).toEqual({
      ok: false,
      status: 401,
      error: "stale webhookTimestamp",
    });
  });
});
