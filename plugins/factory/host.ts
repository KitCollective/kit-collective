// The Factory's host bundle: runs on every enrolled machine, next to the threads'
// worktrees. The server entry reaches it through bb.hosts.experimental_client.
import { experimental_defineHostEntry } from "@get-bb/plugin-sdk";
import { hostContract, PROBE_SCRIPT } from "./src/host-contract.js";
import { runNodeScript } from "./src/host-run.js";

const PROBE_TIMEOUT_MS = 60_000;

/** Runs the fixed probe script in the given worktree. Exported so a test can call it without a daemon. */
export const runProbe = ({ cwd }: { cwd: string }, context: { signal: AbortSignal }) =>
  runNodeScript({ cwd, script: PROBE_SCRIPT, timeoutMs: PROBE_TIMEOUT_MS, signal: context.signal });

export default experimental_defineHostEntry({
  contract: hostContract,
  handlers: { run_probe: runProbe },
});
