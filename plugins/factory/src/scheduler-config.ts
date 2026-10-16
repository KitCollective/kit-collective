// The `scheduler` setting: how the orchestrator reads a Linear team's board
// and where it may start work.
import { z } from "zod";

const machineSchema = z
  .object({
    /** Short name used in the board, the ledger and the workflow's `machine` arg. */
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,31}$/),
    /** How many dispatched runs may be active on this machine at once. */
    cap: z.number().int().min(0).max(16),
    /** What this machine has: "postgres", "simulator", ... */
    capabilities: z.array(z.string().min(1)).default([]),
    /** The enrolled bb machine runs start on. */
    hostId: z.string().min(1),
    /** The branch a run's worktree starts from, e.g. `origin/development`. */
    branch: z.string().min(1),
  })
  .strict();
export type Machine = z.infer<typeof machineSchema>;

/** A fresh git worktree on the machine: the `threads.spawn` environment of one run. */
export function machineEnvironment(machine: Machine): Record<string, unknown> {
  return {
    type: "provider",
    environmentProviderId: "git-worktree",
    machine: { type: "existing", hostId: machine.hostId },
    inputs: { branch: { kind: "named", name: machine.branch } },
  };
}

/** An issue carrying one of the labels, or a write-scope under one of the paths, needs the capability. */
const requirementSchema = z
  .object({
    capability: z.string().min(1),
    labels: z.array(z.string().min(1)).default([]),
    scope: z.array(z.string().min(1)).default([]),
  })
  .strict();

const schedulerSchema = z
  .object({
    /** `dry-run` computes the board and starts nothing. */
    mode: z.enum(["off", "dry-run", "live"]).default("dry-run"),
    projectId: z.string().min(1),
    teamKey: z.string().regex(/^[A-Z][A-Z0-9]*$/),
    /** The named workflow one issue runs through; it gets `{ issue, resume?, machine }`. */
    workflow: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(64),
    dispatchState: z.string().min(1).default("To-do"),
    readyLabel: z.string().min(1).default("ready-for-agent"),
    /** Where unstarted work waits before the orchestrator promotes it. */
    backlogState: z.string().min(1).default("Backlog"),
    /** Ask the orchestrator to promote from the backlog when the ready queue has room. */
    autoPromote: z.boolean().default(false),
    /** The least time between two such requests. */
    refillMinutes: z.number().int().min(5).max(1440).default(30),
    skipLabels: z.array(z.string().min(1)).default([]),
    /** States in which an issue is being worked on and holds its write scope. */
    activeStates: z.array(z.string().min(1)).default(["In Progress", "In Review"]),
    /** Issues here go back to `dispatchState` once every blocker is completed or canceled. */
    blockedState: z.string().min(1).nullable().default("Blocked"),
    priorityOrder: z.array(z.number().int().min(0).max(4)).default([1, 2, 3, 4, 0]),
    /** Consecutive runs that may end without a hand-over before only a person can restart the issue. */
    maxAttempts: z.number().int().min(1).max(5).default(2),
    /** How long a started run may take to show its workflow before it counts as ended. */
    startGraceSeconds: z.number().int().min(30).max(3600).default(300),
    machines: z.array(machineSchema).default([]),
    requirements: z.array(requirementSchema).default([]),
    /** The agent that gets every stall; its chat thread is the orchestrator thread. */
    orchestratorAgent: z.string().min(1).default("orchestrator"),
    /** Kept so an older stored config still parses; the agent's instructions replaced it. */
    prompt: z.string().optional(),
  })
  .strict()
  .superRefine((config, ctx) => {
    const ids = config.machines.map((machine) => machine.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: "custom", path: ["machines"], message: "machine ids must be unique" });
    }
  });
export type SchedulerConfig = z.infer<typeof schedulerSchema>;

export type ParsedScheduler =
  | { ok: true; config: SchedulerConfig | null }
  | { ok: false; error: string };

/** Validates a stored scheduler config. Null or empty means no scheduler. Never throws. */
export function parseScheduler(raw: unknown): ParsedScheduler {
  let value = raw;
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) {
    return { ok: true, config: null };
  }
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch (error) {
      return { ok: false, error: `scheduler is not valid JSON: ${(error as Error).message}` };
    }
  }
  const result = schedulerSchema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path.join(".") ?? "";
    return {
      ok: false,
      error: `scheduler${path === "" ? "" : `.${path}`}: ${issue?.message ?? "invalid"}`,
    };
  }
  return { ok: true, config: result.data };
}
