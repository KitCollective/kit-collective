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

const clock = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "a time of day as HH:MM, 00:00 to 23:59");

/**
 * A daily window, in UTC, in which a Loop may start runs: from `from` up to, not including, `to`.
 * A window whose `to` is before its `from` runs past midnight.
 */
export const scheduleSchema = z
  .object({ from: clock, to: clock })
  .strict()
  .refine((window) => window.from !== window.to, "from and to must differ");
export type Schedule = z.infer<typeof scheduleSchema>;

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
    /** When the Loop may start runs; null or absent means at any time. */
    schedule: scheduleSchema.nullable().optional(),
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

export type Loop = z.infer<typeof loopSchema> & {
  /** Starts of one issue in 24 h for this Loop; set only by an Operating setting override. */
  startsPerDay?: number | null;
};
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

// ---- Operating settings: the file's value, or an override stored in Optio -------------------

export const SETTING_KEYS = ["enabled", "maxLive", "startsPerDay", "schedule"] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

/** What each setting accepts. `startsPerDay` null lifts the cap; `schedule` null means any time. */
export const settingSchemas = {
  enabled: z.boolean(),
  maxLive: z.number().int().min(0).max(16),
  startsPerDay: z.number().int().min(1).max(1000).nullable(),
  schedule: scheduleSchema.nullable(),
} as const;

export interface SettingValues {
  enabled: boolean;
  maxLive: number;
  startsPerDay: number | null;
  schedule: Schedule | null;
}

/** The overrides to apply, by Loop name. */
export type LoopOverrides = Record<string, Partial<SettingValues>>;

/** The file's value of each setting for a Loop. `startsPerDay` is `flow.maxRunsPerDay`. */
export const fileSettings = (registry: Registry, loop: Loop): SettingValues => ({
  enabled: loop.enabled,
  maxLive: loop.maxLive,
  startsPerDay: registry.maxRunsPerDay,
  schedule: loop.schedule ?? null,
});

/** The registry with each Loop's override-or-file settings in place, so everything reading it sees them. */
export function applyOverrides(registry: Registry, overrides: LoopOverrides): Registry {
  return {
    ...registry,
    loops: registry.loops.map((loop) => {
      const own = overrides[loop.name];
      return own === undefined ? loop : { ...loop, ...own };
    }),
  };
}

const minutes = (clockTime: string) => {
  const [hours = "0", mins = "0"] = clockTime.split(":");
  return Number(hours) * 60 + Number(mins);
};

/** Whether `nowMs` falls inside the window (UTC); no window means any time. */
export function inSchedule(schedule: Schedule | null | undefined, nowMs: number): boolean {
  if (schedule === null || schedule === undefined) return true;
  const date = new Date(nowMs);
  const now = date.getUTCHours() * 60 + date.getUTCMinutes();
  const [from, to] = [minutes(schedule.from), minutes(schedule.to)];
  return from < to ? now >= from && now < to : now >= from || now < to;
}
