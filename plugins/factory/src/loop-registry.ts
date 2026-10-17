// The Loop registry: the `loops` block of the project's `factory.config.json`.
// A Loop says what starts a workflow, which workflow, where it may run and how
// many runs it may have live. The Board reads it from the project checkout on
// every tick and refuses one that does not parse.
import { z } from "zod";
import { REPO_SLUG } from "./host-contract.js";

const machineId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,31}$/);

const issueTriggerSchema = z
  .object({
    kind: z.literal("issue"),
    /** The state a ready issue waits in; the Board starts issues from here. */
    state: z.string().min(1),
    /** The label that marks an issue in that state as ready to start. */
    label: z.string().min(1),
    /** Issues with an unresolved blocker wait. */
    unblocked: z.boolean(),
    skipLabels: z.array(z.string().min(1)).default([]),
    /** Linear priorities, first started first. */
    priorityOrder: z.array(z.number().int().min(0).max(4)).default([1, 2, 3, 4, 0]),
  })
  .strict();

const milestoneDoneTriggerSchema = z
  .object({
    kind: z.literal("milestone-done"),
    /** Every issue of the milestone is in one of these states. */
    states: z.array(z.string().min(1)).min(1),
  })
  .strict();

const loopSchema = z
  .object({
    name: z.string().trim().min(1).max(64),
    enabled: z.boolean(),
    workflow: z
      .string()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      .max(64),
    trigger: z.discriminatedUnion("kind", [issueTriggerSchema, milestoneDoneTriggerSchema]),
    /** Ids of the machines the Loop may use. An id the board does not know makes the issue wait. */
    machines: z.array(machineId).min(1),
    /** How many runs of this Loop may be live at once. */
    maxLive: z.number().int().min(0).max(16),
  })
  .strict();

const registrySchema = z
  .object({
    loops: z.array(loopSchema).min(1),
    flow: z
      .object({ maxRunsPerDay: z.number().int().min(1).optional() })
      .passthrough()
      .optional(),
    github: z
      .object({ ownerRepo: z.string().regex(REPO_SLUG).optional() })
      .passthrough()
      .optional(),
    agent: z
      .object({ workpadHeading: z.string().min(1).optional() })
      .passthrough()
      .optional(),
    linear: z
      .object({
        teamKey: z
          .string()
          .regex(/^[A-Z][A-Z0-9]*$/)
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()
  .superRefine((registry, ctx) => {
    const seen = new Set<string>();
    registry.loops.forEach((loop, index) => {
      const key = loop.name.toLowerCase();
      if (seen.has(key)) {
        ctx.addIssue({
          code: "custom",
          path: ["loops", index, "name"],
          message: `Loop name "${loop.name}" is used twice`,
        });
      }
      seen.add(key);
      if (new Set(loop.machines).size !== loop.machines.length) {
        ctx.addIssue({
          code: "custom",
          path: ["loops", index, "machines"],
          message: "a machine is named twice",
        });
      }
      if (loop.enabled && loop.trigger.kind === "milestone-done") {
        ctx.addIssue({
          code: "custom",
          path: ["loops", index, "enabled"],
          message: "the milestone-done trigger is not supported yet: it ships disabled",
        });
      }
    });
  });

export type Loop = z.infer<typeof loopSchema>;
export type IssueTrigger = z.infer<typeof issueTriggerSchema>;
/** A Loop whose trigger is an issue in a state with a label. */
export type IssueLoop = Loop & { trigger: IssueTrigger };

export interface Registry {
  loops: Loop[];
  /** `agent.workpadHeading`: what the single workpad comment starts with, or null. */
  workpadHeading: string | null;
  /** `flow.maxRunsPerDay`: starts of one issue in 24 h, or null when the config sets none. */
  maxRunsPerDay: number | null;
  /** `github.ownerRepo` (`owner/name`), which a run's PR number links into; null when unset. */
  repo: string | null;
  /** `linear.teamKey`: the prefix of the team's issues, or null when unset. */
  teamKey: string | null;
}

export type ParsedRegistry = { ok: true; registry: Registry } | { ok: false; error: string };

/** Validates the text of `factory.config.json`. Never throws; the error names the path. */
export function parseRegistry(text: string): ParsedRegistry {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      error: `factory.config.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  const result = registrySchema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path.join(".") ?? "";
    return {
      ok: false,
      error: `factory.config.json${path === "" ? "" : `.${path}`}: ${issue?.message ?? "invalid"}`,
    };
  }
  return {
    ok: true,
    registry: {
      loops: result.data.loops,
      maxRunsPerDay: result.data.flow?.maxRunsPerDay ?? null,
      repo: result.data.github?.ownerRepo ?? null,
      workpadHeading: result.data.agent?.workpadHeading ?? null,
      teamKey: result.data.linear?.teamKey ?? null,
    },
  };
}

export const isIssueLoop = (loop: Loop): loop is IssueLoop => loop.trigger.kind === "issue";

/** The enabled Loops that start from an issue, in registry order. */
export const issueLoops = (registry: Registry): IssueLoop[] =>
  registry.loops.filter(isIssueLoop).filter((loop) => loop.enabled);
