// The Loops area's part of the RPC contract.
import { z } from "zod";
import { scheduleSchema, settingSchemas } from "../loop-registry.js";
import { ok } from "../shared/contract.js";

const by = z.string().trim().min(1).max(80);

/** One setting: what is in force, what the file says, and who overrode it and when (ISO). */
const setting = <T extends z.ZodType>(value: T) =>
  z.object({
    value,
    file: value,
    override: z.object({ by: z.string(), at: z.string() }).nullable(),
  });

const loopDto = z.object({
  name: z.string(),
  workflow: z.string(),
  trigger: z.object({ kind: z.enum(["issue", "milestone-done"]), summary: z.string() }),
  settings: z.object({
    enabled: setting(settingSchemas.enabled),
    maxLive: setting(settingSchemas.maxLive),
    /** Starts of one issue in 24 h; null is no cap. */
    startsPerDay: setting(settingSchemas.startsPerDay),
    /** The daily window, in UTC, in which the Loop may start runs; null is any time. */
    schedule: setting(scheduleSchema.nullable()),
  }),
});

const changeDto = z.object({
  loop: z.string(),
  key: z.string(),
  /** The override before; null when the file's value was in force. */
  from: z.object({ value: z.unknown() }).nullable(),
  /** The override after; null when it was cleared. */
  to: z.object({ value: z.unknown() }).nullable(),
  by: z.string(),
  at: z.string(),
});

export const loopsContract = {
  loops_list: {
    input: z.null(),
    output: z.object({
      /** Why the Loops could not be read, when they could not. */
      error: z.string().nullable(),
      loops: z.array(loopDto),
      /** Every change to a Loop's settings, newest first. */
      log: z.array(changeDto),
    }),
  },
  loops_set: {
    input: z
      .object({ loop: z.string().min(1), key: z.string().min(1), value: z.unknown(), by })
      .strict(),
    output: ok,
  },
  loops_clear: {
    input: z.object({ loop: z.string().min(1), key: z.string().min(1), by }).strict(),
    output: ok,
  },
};

export type LoopDto = z.infer<typeof loopDto>;
export type LoopChangeDto = z.infer<typeof changeDto>;
export type LoopsDto = z.infer<typeof loopsContract.loops_list.output>;
