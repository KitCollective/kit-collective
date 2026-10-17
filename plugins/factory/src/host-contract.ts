// The RPC contract between the server entry and the host bundle (host.ts), which
// runs on each enrolled machine. The host bundle may not import the server's code,
// so the contract and the runner live in files of their own.
import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

/** The one script the spike runs, relative to a worktree's root. It is fixed here, never sent by a caller. */
export const PROBE_SCRIPT = "plugins/factory/scripts/host-probe.mjs";

export const scriptResult = z.object({
  exitCode: z.number().int(),
  /** The last non-empty line of stdout, or of stderr when stdout was empty. */
  lastLine: z.string(),
  /** The machine's own hostname, so the record shows where it ran. */
  hostname: z.string(),
  /** The directory the script ran in, as the host saw it. */
  cwd: z.string(),
  durationMs: z.number().int(),
});
export type ScriptResult = z.output<typeof scriptResult>;

export const hostContract = defineRpcContract({
  run_probe: {
    input: z.object({ cwd: z.string().min(1) }).strict(),
    output: scriptResult,
  },
});
