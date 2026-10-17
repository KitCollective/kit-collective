// bb-plugin-optio — standing agents with instructions, memory and
// automations, and the orchestrator's board.
//
// An agent is a row in the plugin's database: a name, a project and standing
// instructions. Every way of starting it (a chat from the Agents page, an
// automation, an HTTP trigger, `bb optio trigger`) spawns one bb thread
// that is told to read the agent's brief: its instructions plus the memory it
// has saved in earlier sessions. An automation can also start a named bb
// workflow instead of asking the agent.
//
// The board is the orchestrator's standing half: every minute it reads a
// Linear team's issues, starts the ones that are unblocked and fit a machine's
// capacity, and hands each run that stopped at a gate to the orchestrator
// agent's thread.
//
// This file only wires registrations; the logic lives in src/.
import { readFile } from "node:fs/promises";
import { type BbPluginApi, cliCommand, defineCli, PluginCliError } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { AGENT_MIGRATIONS, type Agent, createAgentStore } from "./src/agent-store.js";
import type { BoardSummary, Plan } from "./src/board.js";
import { type BoardDto, CHANGED, rpcContract } from "./src/contract.js";
import {
  createDispatchStore,
  DISPATCH_MIGRATIONS,
  LOOP_MIGRATIONS,
  RUN_MIGRATIONS,
} from "./src/dispatch-store.js";
import { createGateStore, GATE_MIGRATIONS } from "./src/gate-store.js";
import type { GateDeps } from "./src/gate-tool.js";
import { runGate } from "./src/gate-tool.js";
import { GATE_CALL_TIMEOUT_MS, hostContract } from "./src/host-contract.js";
import { type ProbeDeps, probeThread, renderProbe } from "./src/host-probe.js";
import { verifyLinearWebhook } from "./src/linear.js";
import {
  fetchBoard,
  fetchLinearOptions,
  fetchUpdatedIssues,
  moveIssue,
  promoteIssue,
  writeWorkpadNote,
} from "./src/linear-api.js";
import { createLinearPoller } from "./src/linear-triggers.js";
import { parseRegistry, type Registry } from "./src/loop-registry.js";
import { createScheduler } from "./src/scheduler.js";
import { parseScheduler, type SchedulerConfig } from "./src/scheduler-config.js";
import {
  assertCron,
  createSessions,
  mentionContext,
  renderBrief,
  type SpawnRequest,
  sessionInstructions,
  taskWithPayload,
} from "./src/sessions.js";
import { createRunStore, MIGRATIONS, type Run } from "./src/store.js";

const httpTriggerBody = z
  .object({
    agent: z.string().min(1),
    task: z.string().max(20_000).optional(),
    payload: z.unknown().optional(),
    deliveryId: z.string().min(1).max(200).optional(),
  })
  .strict();

const workflowRunSchema = z
  .object({
    id: z.string(),
    status: z.string(),
    currentPhase: z.string().nullable(),
    error: z.string().nullable(),
    /** What the workflow returned, once it ended. */
    result: z.unknown().optional(),
  })
  .loose();

const workflowResultSchema = z.object({
  prNumber: z.number().int().positive().nullish().catch(null),
  note: z.string().nullish().catch(null),
});

/** The pieces of a workflow's result the runs page shows: the PR it reported and its closing note. */
function workflowResult(result: unknown): { prNumber: number | null; note: string | null } {
  const parsed = workflowResultSchema.safeParse(result);
  const note = parsed.success ? (parsed.data.note ?? "") : "";
  return {
    prNumber: parsed.success ? (parsed.data.prNumber ?? null) : null,
    note: note === "" ? null : note.slice(0, 300),
  };
}

function describeRun(run: Run): string {
  return [
    new Date(run.createdAt).toISOString(),
    run.id,
    run.agentId,
    run.source,
    run.status,
    run.threadId ?? "-",
    run.reason ?? "",
  ]
    .join("  ")
    .trimEnd();
}

function describePlan(
  plan: Plan,
  summary: BoardSummary,
  mode: string,
  loops: { name: string; workflow: string; enabled: boolean; maxLive: number }[],
): string {
  const lines = [
    `Mode: ${mode}. Focus: ${plan.focus ?? "none"}.`,
    `Loops: ${loops.map((loop) => `${loop.name} (${loop.workflow}, ${loop.enabled ? `up to ${loop.maxLive} live` : "disabled"})`).join("; ")}.`,
    `Open issues: ${
      Object.entries(summary.states)
        .map(([state, count]) => `${state} ${count}`)
        .join(", ") || "none"
    }.`,
    "Milestones (open / ready to start):",
    ...Object.entries(summary.milestones).map(
      ([name, count]) => `  ${name}: ${count.open} / ${count.ready}`,
    ),
  ];
  const section = (title: string, rows: string[]) => {
    lines.push("", `${title} (${rows.length})`, ...rows.map((row) => `  ${row}`));
  };
  lines.push(
    `Queue: ${plan.ready} ready, room for ${plan.room} more; ${plan.promotable.length} backlog issues could be promoted.`,
  );
  section(
    "Running",
    plan.running.map(
      (run) =>
        `${run.identifier}  on ${run.machineId}${run.loop === null ? "" : `  [${run.loop}]`}`,
    ),
  );
  section(
    mode === "live" ? "Starting now" : "Would start",
    plan.start.map(
      ({ issue, loop, machineId, resume }) =>
        `${issue.identifier}  [${loop}]  on ${machineId}${resume ? " (resume)" : ""}  P${issue.priority}  ${issue.milestone ?? "no milestone"}  ${issue.title}`,
    ),
  );
  section(
    "Waiting",
    plan.waiting.map((wait) => `${wait.identifier}  [${wait.loop}]  ${wait.reason}`),
  );
  section(
    "Unblocked, moving back",
    plan.unblock.map((issue) => issue.identifier),
  );
  return lines.join("\n");
}

export default async function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    paused: {
      type: "boolean",
      label: "Paused",
      description: "Stop the board, the automations and the HTTP trigger. Chats still work.",
      default: false,
    },
    linearApiKey: {
      type: "string",
      label: "Linear API key",
      description: "Read by the board. Leave empty to use the key file below.",
      secret: true,
    },
    linearApiKeyFile: {
      type: "string",
      label: "Linear API key file",
      description: "A dotenv file on the bb server with a LINEAR_API_KEY line.",
      default: "",
    },
    linearWebhookSecret: {
      type: "string",
      label: "Linear webhook signing secret",
      description:
        "Optional. With it, a Linear webhook makes the board plan at once instead of at the next minute.",
      secret: true,
    },
  });

  const db = bb.storage.database();
  bb.storage.migrate(db, [
    ...MIGRATIONS,
    ...DISPATCH_MIGRATIONS,
    ...AGENT_MIGRATIONS,
    ...LOOP_MIGRATIONS,
    ...GATE_MIGRATIONS,
    ...RUN_MIGRATIONS,
  ]);
  const runs = createRunStore(db);
  const dispatches = createDispatchStore(db);
  const agents = createAgentStore(db);
  const gateRuns = createGateStore(db);
  runs.failInterrupted(Date.now());

  const changed = () => bb.realtime.publish(CHANGED, {});
  const spawnThread = (request: SpawnRequest) =>
    // SAFETY: the environment is built by machineEnvironment in src/ and validated again
    // by the server; the SDK's own union type is narrower than that object.
    bb.sdk.threads.spawn(request as Parameters<typeof bb.sdk.threads.spawn>[0]);

  const sessions = createSessions({
    runs,
    agents,
    spawn: spawnThread,
    now: Date.now,
    log: (message) => bb.log.info(message),
  });

  // Every thread of an agent is pointed at its brief. The metadata is written
  // by this plugin at spawn, but anyone can write it: it only ever selects
  // which brief to read, never a permission. Every thread gets the gate tool, because a
  // workflow worker is not a standing agent: the tool runs one fixed script in the
  // caller's own worktree and records what came back, so a model cannot widen it.
  bb.agents.configure((context) => {
    const id = context.pluginMetadata.standingAgent;
    const agent = typeof id === "string" ? agents.get(id) : null;
    return {
      tools: ["optio_gate"],
      skills: ["optio"],
      ...(agent === null ? {} : { instructions: sessionInstructions(agent) }),
    };
  });

  // The host bundle (host.ts) runs scripts on the machine a thread's worktree is on.
  // This spike only proves the path: thread -> environment -> machine -> script in the worktree.
  const hostClient = bb.hosts.experimental_client({ contract: hostContract });
  const probeDeps: ProbeDeps = {
    async threadEnvironment(threadId) {
      const thread = await bb.sdk.threads.get({ threadId });
      return thread.environmentId;
    },
    async environment(environmentId) {
      const environment = await bb.sdk.environments.get({ environmentId });
      return { hostId: environment.hostId, path: environment.path };
    },
    runProbe: (hostId, cwd) => hostClient.call("run_probe", { cwd }, { hostId, timeoutMs: 90_000 }),
  };

  bb.agents.registerTool({
    name: "optio_host_probe",
    description:
      "Spike: run a fixed, read-only repo script in a thread's worktree on that thread's machine, through Optio's host bundle. Returns the exit code and the last output line.",
    parameters: z.object({
      threadId: z.string().min(1).optional().describe("Defaults to the calling thread"),
    }),
    async execute(params, ctx) {
      try {
        const record = await probeThread(probeDeps, params.threadId ?? ctx.threadId);
        return { content: [{ type: "text", text: JSON.stringify(record) }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: message }], isError: true };
      }
    },
  });

  // The gate tool: the agent names a gate, Optio runs the repo's gate script on the thread's
  // machine and records the verdict itself, so a gate result is not a model's relay of one.
  const gateDeps: GateDeps = {
    ...probeDeps,
    runGate: (hostId, cwd, call) =>
      hostClient.call(
        "run_gate",
        { cwd, ...call, timeoutMs: GATE_CALL_TIMEOUT_MS },
        { hostId, timeoutMs: 28 * 60_000 },
      ),
    record: gateRuns.record,
    now: Date.now,
  };

  bb.agents.registerTool({
    name: "optio_gate",
    description:
      "Run one of the repo's flow gates (pre-review, review, land) for a pull request and an issue, on this thread's machine in its worktree. Optio records the exit code, verdict line, commit SHA, gate and thread, and returns the same. Exit 0 means open, 1 closed, 3 waiting (call again), 4 unknown. An unknown gate or a malformed argument is refused and recorded, not run.",
    // The parameters are loose on purpose: the fake and the real host parse them before
    // execute, and a strict schema would refuse a bad call before Optio could record it.
    parameters: z.object({
      gate: z.string().optional().describe("pre-review, review or land"),
      pr: z.union([z.number(), z.string()]).optional().describe("The pull request number"),
      issue: z.string().optional().describe("The issue key, for example ABC-12"),
    }),
    async execute(params, ctx) {
      const record = await runGate(gateDeps, params, ctx.threadId);
      return {
        content: [{ type: "text", text: JSON.stringify(record) }],
        ...(record.outcome === "ran" ? {} : { isError: true }),
      };
    },
  });

  // The composer integration: `@` lists the agents, and a picked agent's brief
  // travels with the message as agent-only context.
  bb.ui.registerMentionProvider({
    id: "agent",
    label: "Agents",
    search({ query }) {
      const needle = query.trim().toLowerCase();
      return agents
        .list()
        .filter(
          (agent) => agent.enabled && `${agent.name} ${agent.id}`.toLowerCase().includes(needle),
        )
        .slice(0, 20)
        .map((agent) => ({
          id: agent.id,
          title: agent.name,
          subtitle: agent.description,
          icon: "Bot",
        }));
    },
    resolve(itemId) {
      const agent = agents.get(itemId);
      if (agent === null)
        throw new Error(
          `The agent "${itemId}" no longer exists. Remove the mention and send again.`,
        );
      return { context: mentionContext(agent, agents.memories(agent.id)) };
    },
  });

  // ---- The board ---------------------------------------------------------------------------

  async function linearApiKey(): Promise<string> {
    const current = await settings.get();
    if (typeof current.linearApiKey === "string" && current.linearApiKey !== "") {
      return current.linearApiKey;
    }
    if (current.linearApiKeyFile !== "") {
      // A server-local file the user named; never a path from an event.
      const text = await readFile(current.linearApiKeyFile, "utf8");
      const line = /^\s*(?:export\s+)?LINEAR_API_KEY\s*=\s*(.+?)\s*$/m.exec(text);
      const value = line?.[1]?.replace(/^(["'])(.*)\1$/, "$2") ?? "";
      if (value !== "") return value;
    }
    throw new Error("no Linear API key: set it under Settings, Installed plugins, Optio");
  }

  /** The stored board config, or null when the board was never set up. */
  async function storedScheduler(): Promise<SchedulerConfig | null> {
    const parsed = parseScheduler(await bb.storage.kv.get<unknown>("scheduler"));
    if (!parsed.ok) throw new Error(parsed.error);
    return parsed.config;
  }
  async function requireScheduler(): Promise<SchedulerConfig> {
    const config = await storedScheduler();
    if (config === null) throw new Error("the board is not set up: open the Agents page, Board");
    return config;
  }
  async function saveScheduler(next: unknown): Promise<void> {
    const parsed = parseScheduler(next);
    if (!parsed.ok) throw new Error(parsed.error);
    await bb.storage.kv.set("scheduler", parsed.config);
    changed();
  }

  /** The orchestrator agent's standing thread; made on first use, remade when archived or deleted. */
  async function orchestratorThread(config: SchedulerConfig): Promise<string> {
    const saved = await bb.storage.kv.get<string>("orchestratorThread");
    if (typeof saved === "string") {
      const thread = await bb.sdk.threads.get({ threadId: saved }).catch(() => null);
      if (thread !== null && thread.archivedAt === null) return saved;
    }
    const agent = agents.get(config.orchestratorAgent);
    if (agent === null)
      throw new Error(
        `the board's orchestrator agent "${config.orchestratorAgent}" does not exist`,
      );
    const run = await sessions.start(agent, {
      source: "manual",
      task: "Run `bb optio board` and reply with a three-line summary. Reports about stopped runs will arrive in this thread.",
      label: "board",
    });
    if (run === null || run.threadId === null)
      throw new Error(run?.reason ?? "could not start the orchestrator thread");
    await bb.storage.kv.set("orchestratorThread", run.threadId);
    return run.threadId;
  }

  /** The text of `factory.config.json` in the project checkout. */
  async function registryText(config: SchedulerConfig): Promise<string> {
    const file = await bb.sdk.projects.fileContent({
      projectId: config.projectId,
      path: "factory.config.json",
    });
    return file.contentEncoding === "base64"
      ? Buffer.from(file.content, "base64").toString("utf8")
      : file.content;
  }

  let schedulerConfig: SchedulerConfig | null = null;
  const scheduler = createScheduler({
    store: dispatches,
    loadRegistry: registryText,
    loadBoard: async (config) => fetchBoard(await linearApiKey(), config.teamKey),
    moveIssue: async (issueId, stateId) => moveIssue(await linearApiKey(), issueId, stateId),
    latestReviewGate: gateRuns.latestReview,
    async prHead(hostId, repo, pr) {
      const { sha } = await hostClient.call("pr_head", { repo, pr }, { hostId, timeoutMs: 90_000 });
      return sha;
    },
    async noteOnWorkpad(issueId, heading, line) {
      return writeWorkpadNote(await linearApiKey(), issueId, heading, line);
    },
    spawn: spawnThread,
    async threadStatus(threadId) {
      const thread = await bb.sdk.threads.get({ threadId }).catch(() => null);
      return thread?.status ?? null;
    },
    async workflowRuns(threadId) {
      const call = <T>(
        method: string,
        input: Record<string, string | null>,
        outputSchema: z.ZodType<T>,
      ) => bb.sdk.plugins.callRpc({ pluginId: "workflows", method, input, outputSchema });
      const { runs: active } = await call(
        "workflowActiveRuns",
        { threadId },
        z.object({ runs: z.array(workflowRunSchema) }),
      );
      const { run } = await call(
        "workflowRunView",
        { threadId, runId: null },
        z.object({ run: workflowRunSchema.nullable() }),
      );
      const result = workflowResult(run?.result);
      return {
        active: active.length > 0,
        last:
          run === null
            ? null
            : `workflow run ${run.id} ${run.status}${run.currentPhase === null ? "" : ` in phase "${run.currentPhase}"`}${run.error === null ? "" : `: ${run.error}`}${result.note === null ? "" : `; it said: ${result.note}`}`,
        runId: run?.id ?? active[0]?.id ?? null,
        step: run?.currentPhase ?? active[0]?.currentPhase ?? null,
        prNumber: result.prNumber,
      };
    },
    async notify(text) {
      if (schedulerConfig === null) return;
      await bb.sdk.threads.send({
        threadId: await orchestratorThread(schedulerConfig),
        mode: "auto",
        input: [{ type: "text", text, mentions: [] }],
      });
    },
    getFocus: async () => (await bb.storage.kv.get<string>("focus")) ?? null,
    async promoteIssue(issue, stateId, comment, label) {
      if (schedulerConfig === null) throw new Error("the board is not loaded");
      await promoteIssue(await linearApiKey(), {
        issueId: issue.id,
        stateId,
        teamKey: schedulerConfig.teamKey,
        label,
        comment,
      });
    },
    getLastRefill: async () => (await bb.storage.kv.get<number>("lastRefill")) ?? null,
    setLastRefill: (at) => bb.storage.kv.set("lastRefill", at),
    now: Date.now,
    log: (message) => bb.log.info(message),
  });

  let ticking = false;
  /** One live tick at a time; a tick that finds one running does nothing. */
  async function liveTick(): Promise<void> {
    if (ticking || (await settings.get()).paused) return;
    const config = await storedScheduler();
    if (config === null || config.mode === "off") return;
    ticking = true;
    try {
      schedulerConfig = config;
      // Dry-run reads the registry and plans like live, applies nothing, and
      // records what it would do.
      const result = await scheduler.tick(config, config.mode === "live", true);
      if (
        result.started.length + result.stalled.length + result.unblocked.length + result.followed >
          0 ||
        result.refillRequested ||
        result.recorded.length > 0
      ) {
        changed();
      }
    } finally {
      ticking = false;
    }
  }
  bb.background.schedule("orchestrator-tick", "* * * * *", liveTick);
  bb.background.schedule("automations", "* * * * *", async () => {
    if ((await settings.get()).paused) return;
    const started = [
      ...(await sessions.runDueAutomations()),
      ...(await sessions.runDueFollowUps()),
    ];
    if (started.length > 0) changed();
  });

  const poller = createLinearPoller({
    agents,
    sessions,
    fetchUpdated: async (teamKeys, since) =>
      fetchUpdatedIssues(await linearApiKey(), teamKeys, since),
    getCursor: async () => (await bb.storage.kv.get<string>("linearCursor")) ?? null,
    setCursor: (cursor) => bb.storage.kv.set("linearCursor", cursor),
    now: Date.now,
    log: (message) => bb.log.info(message),
  });
  bb.background.schedule("linear-triggers", "* * * * *", async () => {
    if ((await settings.get()).paused) return;
    if ((await poller.poll()) > 0) changed();
  });

  // ---- Routes other systems call -----------------------------------------------------------

  // Linear calls this from the internet, so the route has no bb auth and trusts
  // only the HMAC signature. It carries no work: it makes the board plan now.
  bb.http.route(
    "POST",
    "/linear",
    async (c) => {
      const { linearWebhookSecret } = await settings.get();
      if (typeof linearWebhookSecret !== "string" || linearWebhookSecret === "") {
        return c.json({ ok: false, error: "linearWebhookSecret is not set" }, 503);
      }
      const verified = verifyLinearWebhook({
        rawBody: await c.req.text(),
        signature: c.req.header("linear-signature") ?? null,
        secret: linearWebhookSecret,
        now: Date.now(),
      });
      if (!verified.ok) return c.json({ ok: false, error: verified.error }, verified.status);
      void liveTick().catch((error: unknown) => bb.log.error(`tick failed: ${String(error)}`));
      return c.json({ ok: true });
    },
    { auth: "none" },
  );

  // Any other system: POST { agent, task?, payload?, deliveryId? } with the
  // plugin token. The agent must allow the HTTP trigger.
  bb.http.route(
    "POST",
    "/trigger",
    async (c) => {
      const body = httpTriggerBody.safeParse(await c.req.json().catch(() => null));
      if (!body.success) {
        return c.json(
          { ok: false, error: "expected { agent, task?, payload?, deliveryId? }" },
          400,
        );
      }
      const agent = agents.get(body.data.agent);
      if (agent === null) return c.json({ ok: false, error: "unknown agent" }, 404);
      if (!agent.enabled || !agent.httpTrigger) {
        return c.json({ ok: false, error: "the agent does not allow the HTTP trigger" }, 409);
      }
      if ((await settings.get()).paused) return c.json({ ok: false, error: "paused" }, 503);
      // The caller gets its answer before the thread exists: a worktree can take minutes.
      void sessions
        .start(agent, {
          source: "http",
          task: taskWithPayload(body.data.task, body.data.payload),
          deliveryId: body.data.deliveryId ?? null,
          label: body.data.task ?? "HTTP trigger",
        })
        .then(changed)
        .catch((error: unknown) => bb.log.error(`http trigger failed: ${String(error)}`));
      return c.json({ ok: true }, 202);
    },
    { auth: "token" },
  );

  bb.events.on("thread.idle", ({ thread, lastAssistantText }) => {
    runs.finishByThread(thread.id, "done", null, Date.now());
    // A follow-up's first finished turn is its report: deliver it to the thread that asked.
    const followUp = agents.startedFollowUpByThread(thread.id);
    if (followUp === null || !agents.setFollowUp(followUp.id, "started", "reported")) return;
    changed();
    if (followUp.reportThreadId === null) return;
    const name = agents.get(followUp.agentId)?.name ?? followUp.agentId;
    void bb.sdk.threads
      .send({
        threadId: followUp.reportThreadId,
        mode: "auto",
        input: [
          {
            type: "text",
            text: `[optio] Report from the follow-up ${name} scheduled ("${followUp.task.slice(0, 200)}"), thread ${thread.id}:\n\n${lastAssistantText ?? "(the follow-up ended without a message)"}`,
            mentions: [],
          },
        ],
      })
      .catch((error: unknown) =>
        bb.log.error(`could not deliver follow-up ${followUp.id}: ${String(error)}`),
      );
  });
  bb.events.on("thread.failed", ({ thread, error }) => {
    runs.finishByThread(thread.id, "failed", error ?? "thread failed", Date.now());
  });
  for (const gone of ["thread.archived", "thread.deleted"] as const) {
    bb.events.on(gone, ({ thread }) => {
      runs.finishByThread(thread.id, "done", "thread was archived or deleted", Date.now());
    });
  }

  // ---- The Agents page ---------------------------------------------------------------------

  const need = (id: string): Agent => {
    const agent = agents.get(id);
    if (agent === null) throw new Error(`no agent "${id}"`);
    return agent;
  };
  const threadOf = (run: Run | null): { threadId: string } => {
    if (run === null || run.threadId === null)
      throw new Error(run?.reason ?? "the thread could not be started");
    return { threadId: run.threadId };
  };

  const RUNS_PAGE = 100;

  /** The runs page: every run of the record, per Loop and state, with the links of each. */
  async function runsDto(input: {
    loop: string | null;
    state: "running" | "stopped" | "handed-over" | null;
  }) {
    const config = await storedScheduler();
    // A registry that is refused or unreadable still leaves the record of runs to list.
    let registry: Registry | null = null;
    if (config !== null) {
      const parsed = parseRegistry(await registryText(config).catch(() => ""));
      if (parsed.ok) registry = parsed.registry;
    }
    const repo = registry?.repo ?? null;
    const found = dispatches.runs({ ...input, limit: RUNS_PAGE + 1 });
    const known = new Set(registry?.loops.map((loop) => loop.name));
    for (const run of dispatches.runs({ loop: null, state: null, limit: 200 })) {
      if (run.loop !== null) known.add(run.loop);
    }
    return {
      loops: [...known],
      truncated: found.length > RUNS_PAGE,
      runs: found.slice(0, RUNS_PAGE).map((run) => ({
        id: run.id,
        loop: run.loop,
        issue: run.issue,
        machineId: run.machineId,
        state: run.state,
        resume: run.resume,
        step: run.step,
        stopReason: run.state === "stopped" ? run.outcome : null,
        handedOverTo: run.state === "handed-over" ? run.outcome : null,
        gates: run.gates.map(({ threadId: _thread, ...gate }) => gate),
        startedAt: run.startedAt,
        endedAt: run.endedAt,
        threadId: run.threadId,
        workflowRunId: run.workflowRunId,
        prNumber: run.prNumber,
        prUrl:
          run.prNumber === null || repo === null
            ? null
            : `https://github.com/${repo}/pull/${run.prNumber}`,
      })),
    };
  }

  async function boardDto(): Promise<BoardDto> {
    const paused = (await settings.get()).paused;
    const empty: BoardDto = {
      configured: false,
      error: null,
      mode: "off",
      paused,
      focus: (await bb.storage.kv.get<string>("focus")) ?? null,
      projectId: "",
      teamKey: "",
      registryError: null,
      loops: [],
      decisions: [],
      maxAttempts: 2,
      autoPromote: false,
      handOver: null,
      room: 0,
      promotable: 0,
      machines: [],
      requirements: [],
      states: [],
      milestones: [],
      running: [],
      start: [],
      waiting: [],
      stalled: [],
    };
    let config: SchedulerConfig | null;
    try {
      config = await storedScheduler();
    } catch (error) {
      return { ...empty, error: String(error instanceof Error ? error.message : error) };
    }
    if (config === null) return empty;
    const base: BoardDto = {
      ...empty,
      configured: true,
      mode: config.mode,
      projectId: config.projectId,
      teamKey: config.teamKey,
      decisions: dispatches.decisions(20),
      maxAttempts: config.maxAttempts,
      autoPromote: config.autoPromote,
      handOver: config.handOver ?? null,
      machines: config.machines,
      requirements: config.requirements,
      stalled: dispatches
        .list(200)
        .filter(
          (dispatch) =>
            dispatch.status === "stalled" && dispatches.latest(dispatch.issue)?.id === dispatch.id,
        )
        .map((dispatch) => ({
          issue: dispatch.issue,
          machineId: dispatch.machineId,
          outcome: dispatch.outcome,
        })),
    };
    try {
      const { plan, summary, registry, refusal } = await scheduler.tick(config, false);
      if (registry === null) return { ...base, registryError: refusal };
      return {
        ...base,
        loops: registry.loops.map((loop) => ({
          name: loop.name,
          workflow: loop.workflow,
          kind: loop.trigger.kind,
          enabled: loop.enabled,
          machines: loop.machines,
          maxLive: loop.maxLive,
          running: plan.running.filter((run) => run.loop === loop.name).length,
        })),
        states: Object.entries(summary.states).map(([name, count]) => ({ name, count })),
        milestones: Object.entries(summary.milestones).map(([name, count]) => ({ name, ...count })),
        room: plan.room,
        promotable: plan.promotable.length,
        running: plan.running,
        start: plan.start.map(({ issue, loop, machineId, resume }) => ({
          identifier: issue.identifier,
          loop,
          title: issue.title,
          machineId,
          resume,
          priority: issue.priority,
          milestone: issue.milestone,
        })),
        waiting: plan.waiting,
      };
    } catch (error) {
      return { ...base, error: error instanceof Error ? error.message : String(error) };
    }
  }

  bb.rpc.register(rpcContract, {
    async agents_list() {
      const projects = await bb.sdk.projects.list();
      return {
        agents: agents.list().map((agent) => ({
          ...agent,
          memories: agents.memories(agent.id).length,
          automations: agents.automations(agent.id).length,
        })),
        projects: projects.map((project) => ({ id: project.id, name: project.name })),
      };
    },
    agent_get({ id }) {
      return {
        agent: need(id),
        memories: agents.memories(id),
        automations: agents.automations(id),
        followUps: agents.openFollowUps(id),
        linearTriggers: agents.linearTriggers(id),
        sessions: runs.list(30, id).map((run) => ({
          id: run.id,
          source: run.source,
          status: run.status,
          reason: run.reason,
          threadId: run.threadId,
          createdAt: run.createdAt,
        })),
      };
    },
    agent_create(input) {
      const agent = agents.create(input, Date.now());
      changed();
      return agent;
    },
    agent_update({ id, ...input }) {
      const agent = agents.update(id, input, Date.now());
      if (agent === null) throw new Error(`no agent "${id}"`);
      changed();
      return agent;
    },
    agent_delete({ id }) {
      agents.remove(id);
      changed();
      return { ok: true as const };
    },
    async agent_chat({ id, message }) {
      const started = threadOf(await sessions.start(need(id), { source: "chat", task: message }));
      changed();
      return started;
    },
    memory_add({ agentId, text }) {
      const memory = agents.remember(need(agentId).id, text, null, Date.now());
      changed();
      return memory;
    },
    memory_delete({ id }) {
      agents.forget(id);
      changed();
      return { ok: true as const };
    },
    automation_save(input) {
      need(input.agentId);
      assertCron(input.cron);
      if (input.workflow === null && input.prompt.trim() === "") {
        throw new Error("an automation needs a task for the agent or a workflow to start");
      }
      const automation = agents.saveAutomation(input, Date.now());
      changed();
      return automation;
    },
    automation_delete({ id }) {
      agents.removeAutomation(id);
      changed();
      return { ok: true as const };
    },
    async automation_run({ id }) {
      const automation = agents.automation(id);
      if (automation === null) throw new Error("no such automation");
      const started = threadOf(await sessions.runAutomation(need(automation.agentId), automation));
      changed();
      return started;
    },
    followup_cancel({ id }) {
      agents.setFollowUp(id, "pending", "cancelled");
      changed();
      return { ok: true as const };
    },
    async linear_options() {
      try {
        return { error: null, teams: await fetchLinearOptions(await linearApiKey()) };
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error), teams: [] };
      }
    },
    linear_trigger_add(input) {
      need(input.agentId);
      const trigger = agents.addLinearTrigger(
        { ...input, value: input.event === "created" ? null : input.value, enabled: true },
        Date.now(),
      );
      changed();
      return trigger;
    },
    linear_trigger_toggle({ id, enabled }) {
      agents.setLinearTriggerEnabled(id, enabled);
      changed();
      return { ok: true as const };
    },
    linear_trigger_delete({ id }) {
      agents.removeLinearTrigger(id);
      changed();
      return { ok: true as const };
    },
    async hosts_list() {
      const hosts = await bb.sdk.hosts.list();
      return { hosts: hosts.map((host) => ({ id: host.id, name: host.name ?? host.id })) };
    },
    board_get: boardDto,
    runs_list: runsDto,
    async board_setup(input) {
      if ((await storedScheduler()) !== null) throw new Error("the board is already set up");
      await saveScheduler({ ...input, mode: "dry-run" });
      return { ok: true as const };
    },
    async board_update({ focus, handOver, ...patch }) {
      if (focus !== undefined) {
        if (focus === null) await bb.storage.kv.delete("focus");
        else await bb.storage.kv.set("focus", focus);
      }
      if (handOver !== undefined || Object.keys(patch).length > 0) {
        const { handOver: stored, ...current } = await requireScheduler();
        // Undefined keeps what is stored; null switches the hand-over off.
        const next = handOver === undefined ? stored : (handOver ?? undefined);
        await saveScheduler({
          ...current,
          ...(next === undefined ? {} : { handOver: next }),
          ...patch,
        });
      }
      changed();
      return { ok: true as const };
    },
  });

  // ---- bb optio ----------------------------------------------------------------------

  const json = { type: "boolean", description: "Emit machine-readable JSON" } as const;
  /** Turns a rejected promise into a CLI failure with the error's own text. */
  const cliFailure =
    (code: string) =>
    (error: unknown): never => {
      throw new PluginCliError(error instanceof Error ? error.message : String(error), { code });
    };
  const cliAgent = (id: string): Agent => {
    const agent = agents.get(id);
    if (agent === null) {
      throw new PluginCliError(`no agent "${id}"`, {
        code: "agent_not_found",
        hint: "Run `bb optio list` to see agent ids.",
      });
    }
    return agent;
  };
  const agentPositional = { name: "agent", description: "Agent id", required: true } as const;

  bb.cli.register(
    defineCli({
      name: "optio",
      summary: "Standing agents: their brief and memory, their runs, and the orchestrator's board",
      commands: {
        list: cliCommand({
          summary: "List the agents",
          options: { json },
          run(input) {
            const all = agents.list();
            if (input.options.json) return { exitCode: 0, stdout: JSON.stringify(all) };
            return {
              exitCode: 0,
              stdout:
                all.length === 0
                  ? "No agents. Create one on the Agents page."
                  : all
                      .map(
                        (agent) =>
                          `${agent.enabled ? "on " : "off"} ${agent.id}  ${agent.name}  (${agents.memories(agent.id).length} memories, ${agents.automations(agent.id).length} automations)`,
                      )
                      .join("\n"),
            };
          },
        }),
        brief: cliCommand({
          summary:
            "Print an agent's instructions and memory; an agent runs this first in every session",
          positionals: [agentPositional],
          run(input) {
            const agent = cliAgent(input.positionals.agent);
            return { exitCode: 0, stdout: renderBrief(agent, agents.memories(agent.id)) };
          },
        }),
        "memory add": cliCommand({
          summary: "Save one durable fact or decision to an agent's memory",
          positionals: [
            agentPositional,
            {
              name: "text",
              description: "One self-contained sentence, at most 2000 characters",
              required: true,
              variadic: true,
            },
          ],
          run(input, ctx) {
            const agent = cliAgent(input.positionals.agent);
            const text = input.positionals.text.join(" ").trim();
            if (text === "" || text.length > 2000) {
              throw new PluginCliError("a memory is 1 to 2000 characters", {
                code: "invalid_value",
              });
            }
            const memory = agents.remember(agent.id, text, ctx.threadId ?? null, Date.now());
            changed();
            return { exitCode: 0, stdout: `Saved ${memory.id}` };
          },
        }),
        "memory list": cliCommand({
          summary: "List an agent's memory, newest first",
          positionals: [agentPositional],
          options: { json },
          run(input) {
            const memories = agents.memories(cliAgent(input.positionals.agent).id);
            if (input.options.json) return { exitCode: 0, stdout: JSON.stringify(memories) };
            return {
              exitCode: 0,
              stdout:
                memories.length === 0
                  ? "No memories."
                  : memories
                      .map(
                        (memory) =>
                          `${memory.id}  ${new Date(memory.createdAt).toISOString().slice(0, 10)}  ${memory.text}`,
                      )
                      .join("\n"),
            };
          },
        }),
        "memory remove": cliCommand({
          summary: "Delete a memory that is wrong or was replaced",
          positionals: [
            { name: "memory", description: "Memory id, e.g. mem_1a2b3c4d", required: true },
          ],
          run(input) {
            if (!agents.forget(input.positionals.memory)) {
              throw new PluginCliError(`no memory "${input.positionals.memory}"`, {
                code: "memory_not_found",
              });
            }
            changed();
            return { exitCode: 0, stdout: `Removed ${input.positionals.memory}` };
          },
        }),
        "follow-up add": cliCommand({
          summary:
            "Schedule a new thread of an agent that does a task and reports back to this thread",
          positionals: [agentPositional],
          options: {
            task: {
              type: "string",
              required: true,
              description: "What to investigate or do",
              stdin: true,
            },
            in: {
              type: "duration",
              defaultUnit: "m",
              min: 0,
              max: 30 * 24 * 3600 * 1000,
              description:
                "How long from now: 30m, 2h, 3d (at most 30 days). Omit --in and --at to start now",
            },
            at: {
              type: "string",
              description: "A time, e.g. 2026-10-13T08:00, in the server's time zone",
            },
          },
          constraints: [{ kind: "at-most-one", options: ["in", "at"] }],
          run(input, ctx) {
            const agent = cliAgent(input.positionals.agent);
            const now = Date.now();
            let dueAt = now + (input.options.in ?? 0);
            if (input.options.at !== undefined) {
              dueAt = Date.parse(input.options.at);
              if (Number.isNaN(dueAt)) {
                throw new PluginCliError(`--at "${input.options.at}" is not a time`, {
                  code: "invalid_value",
                  hint: "Use a form like 2026-10-13T08:00.",
                });
              }
            }
            const followUp = agents.addFollowUp(
              {
                agentId: agent.id,
                task: input.options.task,
                dueAt,
                reportThreadId: ctx.threadId ?? null,
              },
              now,
            );
            changed();
            return {
              exitCode: 0,
              stdout: `Scheduled ${followUp.id} for ${new Date(dueAt).toISOString()}${ctx.threadId === undefined ? "" : "; its report comes back to this thread"}`,
            };
          },
        }),
        "follow-up list": cliCommand({
          summary: "List follow-ups that are waiting or running",
          options: { agent: { type: "string", description: "Only this agent id" }, json },
          run(input) {
            const rows = agents.openFollowUps(input.options.agent);
            if (input.options.json) return { exitCode: 0, stdout: JSON.stringify(rows) };
            return {
              exitCode: 0,
              stdout:
                rows.length === 0
                  ? "No follow-ups."
                  : rows
                      .map(
                        (row) =>
                          `${row.id}  ${row.agentId}  ${row.status}  ${new Date(row.dueAt).toISOString()}  ${row.task.slice(0, 100)}`,
                      )
                      .join("\n"),
            };
          },
        }),
        "follow-up cancel": cliCommand({
          summary: "Cancel a follow-up that has not started",
          positionals: [
            { name: "id", description: "Follow-up id, e.g. fup_1a2b3c4d", required: true },
          ],
          run(input) {
            if (!agents.setFollowUp(input.positionals.id, "pending", "cancelled")) {
              throw new PluginCliError(`${input.positionals.id} is not a waiting follow-up`, {
                code: "not_pending",
              });
            }
            changed();
            return { exitCode: 0, stdout: `Cancelled ${input.positionals.id}` };
          },
        }),
        runs: cliCommand({
          summary: "Show recent agent sessions, newest first",
          options: {
            agent: { type: "string", description: "Only sessions of this agent id" },
            limit: {
              type: "integer",
              min: 1,
              max: 200,
              default: 20,
              description: "How many to show (1-200, default 20)",
            },
            json,
          },
          run(input) {
            const rows = runs.list(input.options.limit, input.options.agent);
            if (input.options.json) return { exitCode: 0, stdout: JSON.stringify(rows) };
            return {
              exitCode: 0,
              stdout: rows.length === 0 ? "No runs." : rows.map(describeRun).join("\n"),
            };
          },
        }),
        trigger: cliCommand({
          summary: "Start an agent now with a task",
          positionals: [agentPositional],
          options: {
            task: {
              type: "string",
              required: true,
              description: "What the agent should do",
              stdin: true,
            },
            json,
          },
          async run(input) {
            const run = await sessions.start(cliAgent(input.positionals.agent), {
              source: "manual",
              task: input.options.task,
            });
            if (run === null) throw new PluginCliError("nothing was started");
            changed();
            return {
              exitCode: run.status === "running" ? 0 : 1,
              stdout: input.options.json ? JSON.stringify(run) : describeRun(run),
            };
          },
        }),
        board: cliCommand({
          summary: "Show the orchestrator's plan: running, starting next, and why the rest wait",
          options: { json },
          async run(input) {
            const config = await requireScheduler().catch(cliFailure("board_unavailable"));
            const { plan, summary, registry, refusal } = await scheduler
              .tick(config, false)
              .catch(cliFailure("board_unavailable"));
            const mode = (await settings.get()).paused ? "paused" : config.mode;
            if (registry === null) {
              return {
                exitCode: 1,
                stdout: input.options.json
                  ? JSON.stringify({ mode, refusal })
                  : `Mode: ${mode}. The registry was refused, so nothing is planned or started: ${refusal}`,
              };
            }
            const loops = registry.loops.map((loop) => ({
              name: loop.name,
              workflow: loop.workflow,
              kind: loop.trigger.kind,
              enabled: loop.enabled,
              machines: loop.machines,
              maxLive: loop.maxLive,
            }));
            return {
              exitCode: 0,
              stdout: input.options.json
                ? JSON.stringify({
                    mode,
                    loops,
                    summary,
                    ...plan,
                    start: plan.start.map(({ issue, ...rest }) => ({
                      ...rest,
                      identifier: issue.identifier,
                    })),
                    decisions: dispatches.decisions(20),
                  })
                : describePlan(plan, summary, mode, loops),
            };
          },
        }),
        "focus set": cliCommand({
          summary: "Take a milestone's issues first; other issues fill the capacity that is left",
          positionals: [
            { name: "milestone", description: "Milestone name as Linear shows it", required: true },
          ],
          options: {
            force: { type: "boolean", description: "Accept a name no open issue carries" },
          },
          async run(input) {
            const name = input.positionals.milestone.trim();
            if (!input.options.force) {
              const config = await requireScheduler().catch(cliFailure("board_unavailable"));
              const board = await fetchBoard(await linearApiKey(), config.teamKey).catch(
                cliFailure("board_unavailable"),
              );
              const known = [...new Set(board.issues.flatMap((issue) => issue.milestone ?? []))];
              if (!known.some((milestone) => milestone.toLowerCase() === name.toLowerCase())) {
                throw new PluginCliError(`no open issue is in a milestone named "${name}"`, {
                  code: "milestone_not_found",
                  hint: `Milestones with open issues: ${known.join(", ") || "none"}. Add --force to set it anyway.`,
                });
              }
            }
            await bb.storage.kv.set("focus", name);
            changed();
            return { exitCode: 0, stdout: `Focus: ${name}` };
          },
        }),
        "focus clear": cliCommand({
          summary: "Go back to plain priority order",
          async run() {
            await bb.storage.kv.delete("focus");
            changed();
            return { exitCode: 0, stdout: "Focus: none" };
          },
        }),
        resume: cliCommand({
          summary: "Start a stalled issue's workflow again with resume, within the attempt cap",
          positionals: [{ name: "issue", description: "Issue key, e.g. ENG-12", required: true }],
          options: {
            machine: {
              type: "string",
              description: "Machine id; defaults to the machine of the stalled run",
            },
          },
          async run(input) {
            const config = await requireScheduler().catch(cliFailure("board_unavailable"));
            if (config.mode !== "live") {
              throw new PluginCliError(`the board is in ${config.mode} mode and starts nothing`);
            }
            schedulerConfig = config;
            const dispatch = await scheduler
              .resume(config, input.positionals.issue, input.options.machine)
              .catch(cliFailure("resume_refused"));
            changed();
            return {
              exitCode: 0,
              stdout: `Resumed ${dispatch.issue} on ${dispatch.machineId} in ${dispatch.threadId}`,
            };
          },
        }),
        promote: cliCommand({
          summary:
            "Move a backlog issue to the dispatch state with the ready label, so the board starts it",
          description:
            "Refused when the issue is not in the backlog, is blocked, carries a skip label, or the ready queue is already as long as the machines' capacity.",
          positionals: [{ name: "issue", description: "Issue key, e.g. ENG-12", required: true }],
          options: {
            reason: {
              type: "string",
              required: true,
              description:
                "Why this issue is the right next step; written as a comment on the issue",
            },
          },
          async run(input) {
            const config = await requireScheduler().catch(cliFailure("board_unavailable"));
            if (config.mode !== "live") {
              throw new PluginCliError(
                `the board is in ${config.mode} mode: nothing would start it`,
                {
                  code: "not_live",
                },
              );
            }
            schedulerConfig = config;
            const { issue, state } = await scheduler
              .promote(config, input.positionals.issue, input.options.reason)
              .catch(cliFailure("promote_refused"));
            changed();
            return {
              exitCode: 0,
              stdout: `Promoted ${issue.identifier} to ${state}: ${issue.title}`,
            };
          },
        }),
        "hand-over": cliCommand({
          summary:
            "Set the states an ended run's issue moves between on the recorded review gate, or switch the hand-over off",
          description:
            "With the hand-over on, the board moves an ended run's issue from the review state to the approval state only when the review gate is recorded green on the pull request's current head. Without --review and --approval it shows the current setting.",
          options: {
            review: { type: "string", description: "Where a ready run leaves its issue" },
            approval: { type: "string", description: "Where a green review gate sends it" },
            off: { type: "boolean", description: "Switch the hand-over off" },
          },
          async run(input) {
            const config = await requireScheduler().catch(cliFailure("board_unavailable"));
            const { review, approval, off } = input.options;
            if (off === true) {
              const { handOver: _off, ...rest } = config;
              await saveScheduler(rest).catch(cliFailure("invalid_config"));
              return { exitCode: 0, stdout: "Hand-over is off" };
            }
            if (review === undefined && approval === undefined) {
              return {
                exitCode: 0,
                stdout:
                  config.handOver === undefined
                    ? "Hand-over is off"
                    : `Hand-over: ${config.handOver.reviewState} -> ${config.handOver.approvalState} on a green review gate`,
              };
            }
            if (review === undefined || approval === undefined) {
              throw new PluginCliError("give both --review and --approval", {
                code: "missing_option",
              });
            }
            await saveScheduler({
              ...config,
              handOver: { reviewState: review, approvalState: approval },
            }).catch(cliFailure("invalid_config"));
            return {
              exitCode: 0,
              stdout: `Hand-over: ${review} -> ${approval} on a green review gate`,
            };
          },
        }),
        release: cliCommand({
          summary:
            "Clear an issue's stall, so it is planned again once it is back in the dispatch state",
          positionals: [{ name: "issue", description: "Issue key, e.g. ENG-12", required: true }],
          run(input) {
            if (!dispatches.release(input.positionals.issue)) {
              throw new PluginCliError(`${input.positionals.issue} is not stalled`, {
                code: "not_stalled",
              });
            }
            changed();
            return { exitCode: 0, stdout: `Released ${input.positionals.issue}` };
          },
        }),
        dispatches: cliCommand({
          summary: "Show the workflow runs the board started, newest first",
          options: {
            limit: {
              type: "integer",
              min: 1,
              max: 200,
              default: 20,
              description: "How many to show (1-200, default 20)",
            },
            json,
          },
          run(input) {
            const rows = dispatches.list(input.options.limit);
            if (input.options.json) return { exitCode: 0, stdout: JSON.stringify(rows) };
            return {
              exitCode: 0,
              stdout:
                rows.length === 0
                  ? "No dispatches."
                  : rows
                      .map((row) =>
                        [
                          new Date(row.startedAt).toISOString(),
                          row.issue,
                          row.machineId,
                          row.status,
                          row.threadId ?? "-",
                          row.outcome ?? "",
                        ]
                          .join("  ")
                          .trimEnd(),
                      )
                      .join("\n"),
            };
          },
        }),
        gates: cliCommand({
          summary: "Show the gate runs the gate tool recorded, newest first",
          options: {
            limit: {
              type: "integer",
              min: 1,
              max: 200,
              default: 20,
              description: "How many to show (1-200, default 20)",
            },
            json,
          },
          run(input) {
            const rows = gateRuns.list(input.options.limit);
            if (input.options.json) return { exitCode: 0, stdout: JSON.stringify(rows) };
            return {
              exitCode: 0,
              stdout:
                rows.length === 0
                  ? "No gate runs."
                  : rows
                      .map((row) =>
                        [
                          new Date(row.at).toISOString(),
                          row.threadId,
                          row.gate,
                          row.pr ?? "-",
                          row.issue ?? "-",
                          row.outcome,
                          row.exitCode ?? "-",
                          row.sha?.slice(0, 8) ?? "-",
                          row.verdictLine ?? row.reason ?? "",
                        ].join("  "),
                      )
                      .join("\n"),
            };
          },
        }),
        "host-probe": cliCommand({
          summary:
            "Spike: run the fixed probe script in a thread's worktree through the host bundle",
          positionals: [{ name: "thread", description: "Thread id", required: true }],
          options: { json },
          async run(input) {
            try {
              const record = await probeThread(probeDeps, input.positionals.thread);
              return {
                exitCode: record.exitCode,
                stdout: input.options.json ? JSON.stringify(record) : renderProbe(record),
              };
            } catch (error) {
              throw new PluginCliError(error instanceof Error ? error.message : String(error), {
                code: "host_probe_failed",
              });
            }
          },
        }),
        urls: cliCommand({
          summary: "Print the routes other systems call",
          run() {
            const base = `${bb.server.experimental_appUrl ?? bb.server.loopbackBaseUrl}/api/v1/plugins/${bb.pluginId}/http`;
            return {
              exitCode: 0,
              stdout: [
                `Trigger an agent: POST ${base}/trigger  (header x-bb-plugin-token: bb plugin token ${bb.pluginId})`,
                `Linear webhook:   POST ${base}/linear   (verified by Linear-Signature; only makes the board plan now)`,
                "Linear needs a public HTTPS address that forwards to the second route only; getbb.app URLs require the owner session.",
              ].join("\n"),
            };
          },
        }),
      },
    }),
  );
}
