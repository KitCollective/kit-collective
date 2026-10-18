// The board area's part of the RPC contract: setup, machines, requirements and the plan.
import { z } from "zod";
import { ok } from "../shared/contract.js";

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

export const boardContract = {
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
};

export type BoardDto = z.infer<typeof board>;
export type MachineDto = z.infer<typeof machine>;
export type RequirementDto = z.infer<typeof requirement>;
