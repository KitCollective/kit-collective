// The wiring every area reads: settings, stores, sessions, the scheduler, the Linear key, the
// host bundle, the agent tools, the routes other systems call and the thread events. It registers
// no RPC method and no CLI command: each area owns those.
import { readFile } from "node:fs/promises";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { AGENT_MIGRATIONS, createAgentStore } from "./agent-store.js";
import { CHANGED } from "./contract.js";
import {
  createDispatchStore,
  DISPATCH_MIGRATIONS,
  LOOP_MIGRATIONS,
  RUN_MIGRATIONS,
} from "./dispatch-store.js";
import { createGateStore, GATE_MIGRATIONS } from "./gate-store.js";
import type { GateDeps } from "./gate-tool.js";
import { runGate } from "./gate-tool.js";
import { GATE_CALL_TIMEOUT_MS, hostContract } from "./host-contract.js";
import { type ProbeDeps, probeThread } from "./host-probe.js";
import { verifyLinearWebhook } from "./linear.js";
import {
  fetchBoard,
  fetchUpdatedIssues,
  moveIssue,
  promoteIssue,
  writeWorkpadNote,
} from "./linear-api.js";
import { createLinearPoller } from "./linear-triggers.js";
import { createScheduler } from "./scheduler.js";
import { parseScheduler, type SchedulerConfig } from "./scheduler-config.js";
import {
  createSessions,
  mentionContext,
  type SpawnRequest,
  sessionInstructions,
  taskWithPayload,
} from "./sessions.js";
import { createRunStore, MIGRATIONS } from "./store.js";

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

export function createCore(bb: BbPluginApi) {
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
  async function projectConfigText(projectId: string): Promise<string> {
    const file = await bb.sdk.projects.fileContent({ projectId, path: "factory.config.json" });
    return file.contentEncoding === "base64"
      ? Buffer.from(file.content, "base64").toString("utf8")
      : file.content;
  }
  const registryText = (config: SchedulerConfig) => projectConfigText(config.projectId);

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

  return {
    bb,
    settings,
    runs,
    dispatches,
    agents,
    gateRuns,
    changed,
    sessions,
    hostClient,
    probeDeps,
    linearApiKey,
    storedScheduler,
    requireScheduler,
    saveScheduler,
    projectConfigText,
    registryText,
    scheduler,
    /** The board config the scheduler's notifications and promotions read; set by what loads it. */
    setSchedulerConfig(config: SchedulerConfig) {
      schedulerConfig = config;
    },
  };
}

export type Core = ReturnType<typeof createCore>;
