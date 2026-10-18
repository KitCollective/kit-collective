// The runs area's part of the RPC contract: the Runs page.
import { z } from "zod";

const runState = z.enum(["running", "stopped", "handed-over"]);

/** One run of a Loop, from start to hand-over, as the runs page shows it. */
const loopRun = z.object({
  id: z.string(),
  loop: z.string().nullable(),
  issue: z.string(),
  machineId: z.string(),
  state: runState,
  resume: z.boolean(),
  /** The workflow's current phase, or the last one it reached. */
  step: z.string().nullable(),
  /** Why a stopped run stopped; null while it runs or after a hand-over. */
  stopReason: z.string().nullable(),
  /** Where a handed-over run left the issue, e.g. its status. */
  handedOverTo: z.string().nullable(),
  /** The gates Optio ran for the run; empty until a gate has been recorded. */
  gates: z.array(
    z.object({
      at: z.number(),
      gate: z.string(),
      exitCode: z.number(),
      verdict: z.string(),
      commit: z.string().nullable(),
    }),
  ),
  startedAt: z.number(),
  endedAt: z.number().nullable(),
  /** The run's launcher thread, its workflow run and its pull request: null while not known. */
  threadId: z.string().nullable(),
  workflowRunId: z.string().nullable(),
  prNumber: z.number().nullable(),
  /** Null when the registry names no repository. */
  prUrl: z.string().nullable(),
});

export const runsContract = {
  runs_list: {
    input: z
      .object({
        /** A Loop's name; null lists every Loop. */
        loop: z.string().min(1).nullable(),
        state: runState.nullable(),
      })
      .strict(),
    output: z.object({
      /** The Loops to filter by: the registry's, plus any Loop that has runs and has left it. */
      loops: z.array(z.string()),
      runs: z.array(loopRun),
      /** True when more runs matched than the page lists. */
      truncated: z.boolean(),
    }),
  },
};

export type LoopRunDto = z.infer<typeof loopRun>;
export type RunStateDto = z.infer<typeof runState>;
