// The staff area's part of the RPC contract: the Agents page, its chat, memory, automations,
// follow-ups and Linear triggers.
import { z } from "zod";
import { scheduleSchema } from "../loop-registry.js";
import { proposalDto } from "../loops/contract.js";
import { ok } from "../shared/contract.js";

const agent = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  projectId: z.string(),
  instructions: z.string(),
  enabled: z.boolean(),
  httpTrigger: z.boolean(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
const agentInput = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(500),
    projectId: z.string().min(1),
    instructions: z.string().max(60_000),
    enabled: z.boolean(),
    httpTrigger: z.boolean(),
  })
  .strict();

const memory = z.object({
  id: z.string(),
  agentId: z.string(),
  text: z.string(),
  threadId: z.string().nullable(),
  createdAt: z.number(),
});

const automation = z.object({
  id: z.string(),
  agentId: z.string(),
  name: z.string(),
  cron: z.string(),
  prompt: z.string(),
  workflow: z.string().nullable(),
  workflowArgs: z.record(z.string(), z.string()),
  enabled: z.boolean(),
  lastRunAt: z.number().nullable(),
  createdAt: z.number(),
});

const session = z.object({
  id: z.string(),
  source: z.string(),
  status: z.string(),
  reason: z.string().nullable(),
  threadId: z.string().nullable(),
  createdAt: z.number(),
});

const followUp = z.object({
  id: z.string(),
  agentId: z.string(),
  task: z.string(),
  dueAt: z.number(),
  reportThreadId: z.string().nullable(),
  status: z.string(),
  threadId: z.string().nullable(),
  createdAt: z.number(),
});

const linearEvent = z.enum(["created", "state", "label"]);
const linearTrigger = z.object({
  id: z.string(),
  agentId: z.string(),
  teamKey: z.string(),
  project: z.string().nullable(),
  event: linearEvent,
  value: z.string().nullable(),
  task: z.string(),
  enabled: z.boolean(),
  createdAt: z.number(),
});

const started = z.object({ threadId: z.string() });

/** What a Staff chat's header shows about its Staff member. */
const staffHeader = z.object({
  agentId: z.string(),
  name: z.string(),
  title: z.string(),
  status: z.enum(["on", "off", "paused"]),
  /** When the newest daily activity thread was last active (ms); null when there is none yet. */
  lastHeartbeat: z.number().nullable(),
  /** The Charter's budget as written; `used` is null while nothing measures it. */
  budget: z.object({ limit: z.string().nullable(), used: z.string().nullable() }),
});

const by = z.string().trim().min(1).max(80);

/** One setting: what is in force, what the Charter says, and who overrode it and when (ISO). */
const setting = <T extends z.ZodType>(value: T) =>
  z.object({
    value,
    file: value,
    override: z.object({ by: z.string(), at: z.string() }).nullable(),
  });

/** A Staff member's Operating settings, as the page and `bb optio settings --json` read them. */
const staffSettingsDto = z.object({
  /** What the chat header shows; `off` also when the agent itself is disabled, `paused` also under the plugin-wide pause. */
  status: z.enum(["on", "off", "paused"]),
  settings: z.object({
    enabled: setting(z.boolean()),
    paused: setting(z.boolean()),
    /** The model the member's threads use; the file value is null when the Charter names none. */
    model: setting(z.string().nullable()),
    /** The budget as written; null states none. */
    budget: setting(z.string().nullable()),
    /** The daily window, in UTC, in which Max's tick may wake the member; null is "as the Charter says". */
    heartbeat: setting(scheduleSchema.nullable()),
  }),
  /** The Charter's Heartbeat as written (prose), shown beside the window; null when it states none. */
  charter: z.object({ heartbeat: z.string().nullable() }),
  /** Every change to the member's settings, newest first. */
  log: z.array(
    z.object({
      key: z.string(),
      /** The override before; null when the Charter's value was in force. */
      from: z.object({ value: z.unknown() }).nullable(),
      /** The override after; null when it was cleared. */
      to: z.object({ value: z.unknown() }).nullable(),
      by: z.string(),
      at: z.string(),
    }),
  ),
});

export const staffContract = {
  staff_settings: {
    input: z.object({ agentId: z.string().min(1) }).strict(),
    output: staffSettingsDto,
  },
  staff_settings_set: {
    input: z
      .object({ agentId: z.string().min(1), key: z.string().min(1), value: z.unknown(), by })
      .strict(),
    output: ok,
  },
  staff_settings_clear: {
    input: z.object({ agentId: z.string().min(1), key: z.string().min(1), by }).strict(),
    output: ok,
  },
  staff_list: {
    input: z.null(),
    output: z.object({
      /** The agents that have a Charter, each with their standing chat once it exists. */
      staff: z.array(
        z.object({
          agentId: z.string(),
          name: z.string(),
          title: z.string(),
          chatThreadId: z.string().nullable(),
        }),
      ),
      /** The agents without a Charter, so their pages stay reachable. */
      others: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          description: z.string(),
          enabled: z.boolean(),
        }),
      ),
    }),
  },
  staff_chat_open: { input: z.object({ agentId: z.string() }).strict(), output: started },
  staff_chat_header: {
    input: z.object({ threadId: z.string() }).strict(),
    /** Null when the thread is not a Staff chat. */
    output: staffHeader.nullable(),
  },
  agents_list: {
    input: z.null(),
    output: z.object({
      agents: z.array(agent.extend({ memories: z.number(), automations: z.number() })),
      projects: z.array(z.object({ id: z.string(), name: z.string() })),
    }),
  },
  agent_get: {
    input: z.object({ id: z.string() }).strict(),
    output: z.object({
      agent,
      memories: z.array(memory),
      automations: z.array(automation),
      followUps: z.array(followUp),
      linearTriggers: z.array(linearTrigger),
      sessions: z.array(session),
    }),
  },
  /** A Staff member's Charter as the project checkout holds it, with the changes proposed to it. */
  agent_charter: {
    input: z.object({ id: z.string() }).strict(),
    output: z.object({
      /** The Charter's path in the checkout; null when the member has none. */
      file: z.string().nullable(),
      content: z.string().nullable(),
      proposals: z.array(proposalDto),
    }),
  },
  /** Opens a pull request that edits the Charter; nothing about the member changes until it is merged. */
  agent_propose: {
    input: z
      .object({
        id: z.string(),
        text: z.string().max(20_000),
        by: z.string().trim().min(1).max(80),
      })
      .strict(),
    output: proposalDto,
  },
  followup_cancel: { input: z.object({ id: z.string() }).strict(), output: ok },
  linear_options: {
    input: z.null(),
    output: z.object({
      /** Why Linear could not be read, when it could not. */
      error: z.string().nullable(),
      teams: z.array(
        z.object({
          key: z.string(),
          name: z.string(),
          states: z.array(z.string()),
          projects: z.array(z.string()),
        }),
      ),
    }),
  },
  linear_trigger_add: {
    input: z
      .object({
        agentId: z.string(),
        teamKey: z.string().regex(/^[A-Z][A-Z0-9]*$/),
        project: z.string().trim().min(1).nullable(),
        event: linearEvent,
        value: z.string().trim().min(1).nullable(),
        task: z.string().trim().min(1).max(20_000),
      })
      .strict(),
    output: linearTrigger,
  },
  linear_trigger_toggle: {
    input: z.object({ id: z.string(), enabled: z.boolean() }).strict(),
    output: ok,
  },
  linear_trigger_delete: { input: z.object({ id: z.string() }).strict(), output: ok },
  agent_create: { input: agentInput, output: agent },
  agent_update: { input: agentInput.extend({ id: z.string() }).strict(), output: agent },
  agent_delete: { input: z.object({ id: z.string() }).strict(), output: ok },
  agent_chat: {
    input: z.object({ id: z.string(), message: z.string().trim().min(1).max(20_000) }).strict(),
    output: started,
  },
  memory_add: {
    input: z.object({ agentId: z.string(), text: z.string().trim().min(1).max(2000) }).strict(),
    output: memory,
  },
  memory_delete: { input: z.object({ id: z.string() }).strict(), output: ok },
  automation_save: {
    input: z
      .object({
        id: z.string().optional(),
        agentId: z.string(),
        name: z.string().trim().min(1).max(80),
        cron: z.string().trim().min(1).max(100),
        prompt: z.string().max(20_000),
        workflow: z
          .string()
          .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
          .max(64)
          .nullable(),
        workflowArgs: z.record(
          z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,40}$/),
          z.string().max(500),
        ),
        enabled: z.boolean(),
      })
      .strict(),
    output: automation,
  },
  automation_delete: { input: z.object({ id: z.string() }).strict(), output: ok },
  automation_run: { input: z.object({ id: z.string() }).strict(), output: started },
};

export type AgentDto = z.infer<typeof agent>;
export type MemoryDto = z.infer<typeof memory>;
export type AutomationDto = z.infer<typeof automation>;
export type SessionDto = z.infer<typeof session>;
export type FollowUpDto = z.infer<typeof followUp>;
export type LinearTriggerDto = z.infer<typeof linearTrigger>;
export type StaffHeaderDto = z.infer<typeof staffHeader>;
export type StaffSettingsDto = z.infer<typeof staffSettingsDto>;
