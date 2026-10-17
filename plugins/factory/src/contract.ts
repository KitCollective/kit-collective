// The RPC contract between server.ts and app.tsx. Both schemas of a method run
// at the wire boundary.
import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

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

const machine = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,31}$/),
    hostId: z.string().min(1),
    /** Branch a run's worktree starts from, e.g. `origin/main`. */
    branch: z.string().min(1),
    cap: z.number().int().min(0).max(16),
    capabilities: z.array(z.string().min(1)),
  })
  .strict();
const requirement = z
  .object({
    capability: z.string().min(1),
    labels: z.array(z.string().min(1)),
    scope: z.array(z.string().min(1)),
  })
  .strict();

const handOver = z
  .object({ reviewState: z.string().trim().min(1), approvalState: z.string().trim().min(1) })
  .strict();

const board = z.object({
  configured: z.boolean(),
  /** Why the plan could not be computed, when it could not. */
  error: z.string().nullable(),
  mode: z.enum(["off", "dry-run", "live"]),
  paused: z.boolean(),
  focus: z.string().nullable(),
  projectId: z.string(),
  teamKey: z.string(),
  /** Why the registry in the project checkout was refused: nothing is planned or started. */
  registryError: z.string().nullable(),
  /** The Loops of the registry, in its order. */
  loops: z.array(
    z.object({
      name: z.string(),
      workflow: z.string(),
      kind: z.enum(["issue", "milestone-done"]),
      enabled: z.boolean(),
      machines: z.array(z.string()),
      maxLive: z.number(),
      running: z.number(),
    }),
  ),
  /** The newest entries of the record of runs: every start, skip and refusal, with its reason. */
  decisions: z.array(
    z.object({
      at: z.number(),
      mode: z.string(),
      loop: z.string().nullable(),
      issue: z.string().nullable(),
      kind: z.enum(["start", "skip", "refusal"]),
      reason: z.string(),
    }),
  ),
  maxAttempts: z.number(),
  autoPromote: z.boolean(),
  /** The states of the hand-over on the recorded review gate, or null when it is off. */
  handOver: handOver.nullable(),
  /** How many more issues the ready queue may hold. */
  room: z.number(),
  /** Backlog issues that may be promoted. */
  promotable: z.number(),
  machines: z.array(machine),
  requirements: z.array(requirement),
  states: z.array(z.object({ name: z.string(), count: z.number() })),
  milestones: z.array(z.object({ name: z.string(), open: z.number(), ready: z.number() })),
  running: z.array(
    z.object({ identifier: z.string(), machineId: z.string(), loop: z.string().nullable() }),
  ),
  start: z.array(
    z.object({
      identifier: z.string(),
      loop: z.string(),
      title: z.string(),
      machineId: z.string(),
      resume: z.boolean(),
      priority: z.number(),
      milestone: z.string().nullable(),
    }),
  ),
  waiting: z.array(z.object({ identifier: z.string(), loop: z.string(), reason: z.string() })),
  stalled: z.array(
    z.object({ issue: z.string(), machineId: z.string(), outcome: z.string().nullable() }),
  ),
});

const ok = z.object({ ok: z.literal(true) });
const started = z.object({ threadId: z.string() });

export const rpcContract = defineRpcContract({
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
  hosts_list: {
    input: z.null(),
    output: z.object({ hosts: z.array(z.object({ id: z.string(), name: z.string() })) }),
  },
  board_get: { input: z.null(), output: board },
  board_setup: {
    input: z
      .object({
        projectId: z.string().min(1),
        teamKey: z.string().regex(/^[A-Z][A-Z0-9]*$/),
        backlogState: z.string().trim().min(1),
        activeStates: z.array(z.string().trim().min(1)).min(1),
        /** Null when the team has no blocked state. */
        blockedState: z.string().trim().min(1).nullable(),
      })
      .strict(),
    output: ok,
  },
  board_update: {
    input: z
      .object({
        mode: z.enum(["off", "dry-run", "live"]).optional(),
        /** A milestone name; null clears the focus. */
        focus: z.string().trim().min(1).nullable().optional(),
        maxAttempts: z.number().int().min(1).max(5).optional(),
        autoPromote: z.boolean().optional(),
        /** Where a ready run's issue goes on the recorded review gate; null switches the hand-over off. */
        handOver: handOver.nullable().optional(),
        machines: z.array(machine).optional(),
        requirements: z.array(requirement).optional(),
      })
      .strict(),
    output: ok,
  },
});

export type AgentDto = z.infer<typeof agent>;
export type MemoryDto = z.infer<typeof memory>;
export type AutomationDto = z.infer<typeof automation>;
export type SessionDto = z.infer<typeof session>;
export type FollowUpDto = z.infer<typeof followUp>;
export type LinearTriggerDto = z.infer<typeof linearTrigger>;
export type BoardDto = z.infer<typeof board>;
export type MachineDto = z.infer<typeof machine>;
export type RequirementDto = z.infer<typeof requirement>;

/** Realtime channel: any agent, memory, automation or board change. */
export const CHANGED = "changed";
