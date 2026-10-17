// Optio's host bundle: runs on every enrolled machine, next to the threads'
// worktrees. The server entry reaches it through bb.hosts.experimental_client.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { experimental_defineHostEntry } from "@get-bb/plugin-sdk";
import { GATE_SCRIPT, hostContract, PROBE_SCRIPT } from "./src/host-contract.js";
import { runNodeScript } from "./src/host-run.js";

const execFileAsync = promisify(execFile);

const PROBE_TIMEOUT_MS = 60_000;
/** A gate waits for CI, so it gets longer than the probe; the client's call outlives this. */
const GATE_TIMEOUT_MS = 20 * 60_000;

/** Runs the fixed probe script in the given worktree. Exported so a test can call it without a daemon. */
export const runProbe = ({ cwd }: { cwd: string }, context: { signal: AbortSignal }) =>
  runNodeScript({ cwd, script: PROBE_SCRIPT, timeoutMs: PROBE_TIMEOUT_MS, signal: context.signal });

type GateInput = (typeof hostContract.run_gate.input)["_output"];

/**
 * Runs the fixed gate script in the given worktree. The commit SHA is read here, from the
 * worktree's own HEAD, so the record does not depend on what the script prints.
 */
export const runGate = async (input: GateInput, context: { signal: AbortSignal }) => {
  const { cwd, gate, pr, issue, timeoutMs } = input;
  const result = await runNodeScript({
    cwd,
    script: GATE_SCRIPT,
    args: [gate, String(pr), "--issue", issue],
    timeoutMs: timeoutMs ?? GATE_TIMEOUT_MS,
    signal: context.signal,
  });
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd });
  return { ...result, sha: stdout.trim() };
};

export default experimental_defineHostEntry({
  contract: hostContract,
  handlers: { run_probe: runProbe, run_gate: runGate },
});
