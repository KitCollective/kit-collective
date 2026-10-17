// The gate tool: validate a gate call, run the repo's gate script on the calling thread's
// machine through the host bundle, and record what came back. A call that fails validation is
// recorded and never reaches the host.

import type { GateRun, GateRunInput } from "./gate-store.js";
import { GATE_NAMES, type GateName, ISSUE_KEY, type ScriptResult } from "./host-contract.js";

export interface GateCall {
  gate: GateName;
  pr: number;
  issue: string;
}

export type GateValidation = { ok: true; call: GateCall } | { ok: false; reason: string };

const isGateName = (value: unknown): value is GateName =>
  typeof value === "string" && (GATE_NAMES as readonly string[]).includes(value);

/** A PR number as a number or as digits only; anything else could carry a flag or a shell word. */
function parsePr(value: unknown): number | null {
  const pr = typeof value === "string" && /^[0-9]+$/.test(value) ? Number(value) : value;
  return typeof pr === "number" && Number.isSafeInteger(pr) && pr > 0 ? pr : null;
}

export function validateGateCall(raw: {
  gate?: unknown;
  pr?: unknown;
  issue?: unknown;
}): GateValidation {
  if (raw.gate === undefined || raw.gate === "") return { ok: false, reason: "gate is required" };
  if (!isGateName(raw.gate)) {
    return {
      ok: false,
      reason: `unknown gate "${String(raw.gate)}" (known: ${GATE_NAMES.join(", ")})`,
    };
  }
  const pr = parsePr(raw.pr);
  if (pr === null) return { ok: false, reason: "pr must be a positive integer" };
  if (typeof raw.issue !== "string" || !ISSUE_KEY.test(raw.issue)) {
    return { ok: false, reason: "issue must be an issue key such as ABC-12" };
  }
  return { ok: true, call: { gate: raw.gate, pr, issue: raw.issue } };
}

export interface GateDeps {
  /** The thread's environment id, or null when the thread has none. */
  threadEnvironment(threadId: string): Promise<string | null>;
  /** The environment's machine and directory. */
  environment(environmentId: string): Promise<{ hostId: string; path: string | null }>;
  /** The host bundle's run_gate on one machine. */
  runGate(hostId: string, cwd: string, call: GateCall): Promise<ScriptResult & { sha: string }>;
  record(run: GateRunInput): GateRun;
  now(): number;
}

/**
 * Always returns the record it wrote: ran (the script exited, any code), refused (validation
 * failed, host untouched) or error (the script could not be run).
 */
export async function runGate(
  deps: GateDeps,
  raw: { gate?: unknown; pr?: unknown; issue?: unknown },
  threadId: string,
): Promise<GateRun> {
  const blank = {
    at: deps.now(),
    threadId,
    gate: raw.gate === undefined ? "" : String(raw.gate),
    pr: raw.pr === undefined ? null : (raw.pr as string | number),
    issue: raw.issue === undefined ? null : String(raw.issue),
    exitCode: null,
    verdictLine: null,
    sha: null,
    hostId: null,
  };
  const checked = validateGateCall(raw);
  if (!checked.ok) {
    return deps.record({ ...blank, outcome: "refused", reason: checked.reason });
  }
  const { call } = checked;
  const known = { ...blank, gate: call.gate, pr: call.pr, issue: call.issue };
  try {
    const environmentId = await deps.threadEnvironment(threadId);
    if (environmentId === null) throw new Error(`thread ${threadId} has no environment yet`);
    const { hostId, path } = await deps.environment(environmentId);
    if (path === null) throw new Error(`the environment of thread ${threadId} has no directory`);
    try {
      const result = await deps.runGate(hostId, path, call);
      return deps.record({
        ...known,
        hostId,
        outcome: "ran",
        exitCode: result.exitCode,
        verdictLine: result.lastLine,
        sha: result.sha,
        reason: null,
      });
    } catch (error) {
      return deps.record({
        ...known,
        hostId,
        outcome: "error",
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  } catch (error) {
    return deps.record({
      ...known,
      outcome: "error",
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}
