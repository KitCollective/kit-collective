// The RPC contract between the server entry and the host bundle (host.ts), which
// runs on each enrolled machine. The host bundle may not import the server's code,
// so the contract and the runner live in files of their own.
import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

/** The one script the spike runs, relative to a worktree's root. It is fixed here, never sent by a caller. */
export const PROBE_SCRIPT = "plugins/factory/scripts/host-probe.mjs";

/** The one gate script the gate tool runs, relative to a worktree's root. Fixed here, never sent by a caller. */
export const GATE_SCRIPT = "scripts/gate.mjs";

/** The gates the tool will run: the flow gates of `gate.mjs`. Its `result` subcommand reads a file and is not a gate. */
export const GATE_NAMES = ["pre-review", "review", "land"] as const;
export type GateName = (typeof GATE_NAMES)[number];

/** An issue key as a tracker writes it: a team key, a dash and a number. No flag can match. */
export const ISSUE_KEY = /^[A-Z][A-Z0-9]*-[1-9][0-9]*$/;

/**
 * How long one `optio_gate` call lets the gate run. A worker's tool call is not held for the
 * host's full 20 minutes, so the gate waits as long as one slice of a workflow's gate loop (about
 * 8 minutes of waiting for checks) and answers `waiting` (exit 3) beyond it; the caller asks again.
 */
export const GATE_CALL_TIMEOUT_MS = 9 * 60_000;

/** The SDK caps one host call at 30 minutes. */
export const GATE_TIMEOUT_MAX_MS = 25 * 60_000;

/** A GitHub repository as `owner/name`. No flag can match. */
export const REPO_SLUG = /^[\w.-]+\/[\w.-]+$/;

export const gateName = z.enum(GATE_NAMES);
export const gatePr = z.number().int().positive();
export const gateIssue = z.string().regex(ISSUE_KEY);

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
  run_gate: {
    input: z
      .object({
        cwd: z.string().min(1),
        gate: gateName,
        pr: gatePr,
        issue: gateIssue,
        /** Below the client's own timeout, so a slow gate comes back as exit 143 instead of a thrown call. */
        timeoutMs: z.number().int().positive().max(GATE_TIMEOUT_MAX_MS).optional(),
      })
      .strict(),
    output: scriptResult.extend({ sha: z.string() }),
  },
  /** The head commit of a pull request right now, read with a fixed `gh pr view`. */
  pr_head: {
    input: z.object({ repo: z.string().regex(REPO_SLUG), pr: gatePr }).strict(),
    output: z.object({ sha: z.string().regex(/^[0-9a-f]{7,64}$/) }),
  },
});
