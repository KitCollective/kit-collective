// The spike: given a thread id, find the thread's worktree and the machine it is on,
// and have that machine's host bundle run the fixed probe script in it.
import type { ScriptResult } from "./host-contract.js";

export interface ProbeDeps {
  /** The thread's environment id, or null when the thread has none. */
  threadEnvironment(threadId: string): Promise<string | null>;
  /** The environment's machine and directory. */
  environment(environmentId: string): Promise<{ hostId: string; path: string | null }>;
  /** The host bundle's run_probe on one machine. */
  runProbe(hostId: string, cwd: string): Promise<ScriptResult>;
}

export interface ProbeRecord extends ScriptResult {
  threadId: string;
  hostId: string;
}

export async function probeThread(deps: ProbeDeps, threadId: string): Promise<ProbeRecord> {
  const environmentId = await deps.threadEnvironment(threadId);
  if (environmentId === null) throw new Error(`thread ${threadId} has no environment yet`);
  const { hostId, path } = await deps.environment(environmentId);
  if (path === null) throw new Error(`the environment of thread ${threadId} has no directory`);
  const result = await deps.runProbe(hostId, path);
  return { threadId, hostId, ...result };
}

/** One line for a person or a model to read; the record itself is the structured form. */
export function renderProbe(record: ProbeRecord): string {
  return `exit ${record.exitCode} on ${record.hostname} (${record.hostId}), ${record.durationMs} ms in ${record.cwd}: ${record.lastLine}`;
}
