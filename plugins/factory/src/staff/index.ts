// The staff area: the Agents page's server side. Its RPC handlers and `bb optio` commands for
// agents, their memory, automations, follow-ups, Linear triggers and sessions.

import type { PluginRpcHandlers } from "@get-bb/plugin-sdk";
import { cliCommand, PluginCliError } from "@get-bb/plugin-sdk";
import type { Agent } from "../agent-store.js";
import type { Core } from "../core.js";
import { fetchLinearOptions } from "../linear-api.js";
import { createProposals } from "../loops/proposal.js";
import { assertCron, renderBrief } from "../sessions.js";
import { json } from "../shared/cli.js";
import type { Run } from "../store.js";
import { createStaffChats } from "./chats.js";
import type { staffContract } from "./contract.js";

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

export function createStaff(core: Core) {
  const { bb, agents, runs, sessions, changed, linearApiKey } = core;

  const proposals = createProposals(core);

  /** `staff/<first name, lower case>.md`: the Charter file of a Staff member, named after them. */
  const charterPath = (agent: Agent) =>
    `staff/${
      agent.name
        .trim()
        .split(/\s+/)[0]
        ?.toLowerCase()
        .replace(/[^a-z0-9-]/g, "") ?? ""
    }.md`;

  /** The Charter's text, or null when the member has no Charter file in their project. */
  async function readCharter(agent: Agent): Promise<string | null> {
    try {
      const file = await bb.sdk.projects.fileContent({
        projectId: agent.projectId,
        path: charterPath(agent),
      });
      return file.contentEncoding === "base64"
        ? Buffer.from(file.content, "base64").toString("utf8")
        : file.content;
    } catch {
      return null;
    }
  }

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

  const chats = createStaffChats(core);

  const rpc: PluginRpcHandlers<typeof staffContract> = {
    staff_list: () => chats.list(),
    async staff_chat_open({ agentId }) {
      return { threadId: await chats.open(agentId) };
    },
    staff_chat_header: ({ threadId }) => chats.header(threadId),
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
    async agent_charter({ id }) {
      const agent = need(id);
      const content = await readCharter(agent);
      return {
        file: content === null ? null : charterPath(agent),
        content,
        proposals: await proposals.list("staff", agent.id),
      };
    },
    async agent_propose({ id, text, by }) {
      const agent = need(id);
      if ((await readCharter(agent)) === null) {
        throw new Error(
          `${agent.name} has no Charter file (${charterPath(agent)}) in their project`,
        );
      }
      return proposals.propose({
        kind: "staff",
        subject: agent.id,
        heading: `the Charter of ${agent.name}`,
        title: `Charter ${agent.name}: change proposed in Optio`,
        file: charterPath(agent),
        text,
        by,
        projectId: agent.projectId,
      });
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

  const cli = {
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
    chat: cliCommand({
      summary:
        "Print the thread id of a Staff member's standing Staff chat; Optio makes the chat the first time",
      positionals: [agentPositional],
      options: { json },
      async run(input) {
        const agent = cliAgent(input.positionals.agent);
        let threadId: string;
        try {
          threadId = await chats.open(agent.id);
        } catch (error) {
          throw new PluginCliError(error instanceof Error ? error.message : String(error), {
            code: "not_staff",
          });
        }
        return {
          exitCode: 0,
          stdout: input.options.json ? JSON.stringify({ threadId }) : threadId,
        };
      },
    }),
    ask: cliCommand({
      summary:
        "Ask the person something that is theirs to decide: it shows in their Inbox as a card linking to your Staff chat, and leaves it when they answer there",
      positionals: [
        agentPositional,
        {
          name: "question",
          description: "The question, with what you recommend",
          required: true,
          variadic: true,
        },
      ],
      async run(input, ctx) {
        const agent = cliAgent(input.positionals.agent);
        const question = input.positionals.question.join(" ").trim();
        if (question === "" || question.length > 4000) {
          throw new PluginCliError("a question is 1 to 4000 characters", { code: "invalid_value" });
        }
        let threadId: string;
        try {
          ({ threadId } = await chats.ask(agent.id, question, ctx.threadId));
        } catch (error) {
          throw new PluginCliError(error instanceof Error ? error.message : String(error), {
            code: "ask_failed",
          });
        }
        return { exitCode: 0, stdout: `Asked in the Staff chat ${threadId}` };
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
      summary: "Schedule a new thread of an agent that does a task and reports back to this thread",
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
      positionals: [{ name: "id", description: "Follow-up id, e.g. fup_1a2b3c4d", required: true }],
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
  };

  return { rpc, cli, openQuestions: chats.openQuestions };
}
