// Optio's host bundle: runs on every enrolled machine, next to the threads'
// worktrees. The server entry reaches it through bb.hosts.experimental_client.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { experimental_defineHostEntry } from "@get-bb/plugin-sdk";
import { GATE_SCRIPT, hostContract, LAND_SCRIPT, PROBE_SCRIPT } from "./src/host-contract.js";
import { runNodeScript } from "./src/host-run.js";

const execFileAsync = promisify(execFile);

const PROBE_TIMEOUT_MS = 60_000;
/** A gate waits for CI, so it gets longer than the probe; the client's call outlives this. */
const GATE_TIMEOUT_MS = 20 * 60_000;

/** Runs the fixed probe script in the given worktree. Exported so a test can call it without a daemon. */
export const runProbe = ({ cwd }: { cwd: string }, context: { signal: AbortSignal }) =>
  runNodeScript({ cwd, script: PROBE_SCRIPT, timeoutMs: PROBE_TIMEOUT_MS, signal: context.signal });

/** The gate's own wait ends this long before the host would kill it, so it answers with its waiting verdict. */
const GATE_WAIT_MARGIN_MS = 60_000;

type GateInput = (typeof hostContract.run_gate.input)["_output"];

/**
 * The `--timeout` (seconds) handed to `gate.mjs` for a host timeout. The gate treats it as the
 * total budget of its call and prints a waiting verdict (exit 3) when CI is still pending, so a
 * slow CI run is a verdict and not a kill. Only the gates that wait for checks take it.
 */
export const gateWaitSeconds = (hostTimeoutMs: number) =>
  Math.max(1, Math.floor((hostTimeoutMs - GATE_WAIT_MARGIN_MS) / 1000));

/**
 * Runs the fixed gate script in the given worktree. The commit SHA is read here, from the
 * worktree's own HEAD, so the record does not depend on what the script prints.
 */
export const runGate = async (input: GateInput, context: { signal: AbortSignal }) => {
  const { cwd, gate, pr, issue, timeoutMs } = input;
  const hostTimeoutMs = timeoutMs ?? GATE_TIMEOUT_MS;
  const result = await runNodeScript({
    cwd,
    script: GATE_SCRIPT,
    args: [
      gate,
      String(pr),
      "--issue",
      issue,
      ...(gate === "land" ? [] : ["--timeout", String(gateWaitSeconds(hostTimeoutMs))]),
    ],
    timeoutMs: hostTimeoutMs,
    signal: context.signal,
  });
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd });
  return { ...result, sha: stdout.trim() };
};

type LandInput = (typeof hostContract.run_land.input)["_output"];

/**
 * Runs one slice of the fixed landing script in the given checkout. The script's own wait ends
 * before the host would kill it, so a slow merge queue answers with its waiting verdict (exit 3).
 */
export const runLand = async (input: LandInput, context: { signal: AbortSignal }) => {
  const { cwd, step, pr, issue, timeoutMs } = input;
  const hostTimeoutMs = timeoutMs ?? GATE_TIMEOUT_MS;
  return runNodeScript({
    cwd,
    script: LAND_SCRIPT,
    args: [step, String(pr), "--issue", issue, "--timeout", String(gateWaitSeconds(hostTimeoutMs))],
    timeoutMs: hostTimeoutMs,
    signal: context.signal,
  });
};

const PR_HEAD_TIMEOUT_MS = 60_000;

type PrHeadInput = (typeof hostContract.pr_head.input)["_output"];

/** Reads a pull request's head commit with a fixed `gh pr view`; the caller supplies no flag. */
export const prHead = async ({ repo, pr }: PrHeadInput, context: { signal: AbortSignal }) => {
  const { stdout } = await execFileAsync(
    "gh",
    ["pr", "view", String(pr), "--repo", repo, "--json", "headRefOid", "--jq", ".headRefOid"],
    { timeout: PR_HEAD_TIMEOUT_MS, signal: context.signal },
  );
  return { sha: stdout.trim() };
};

export default experimental_defineHostEntry({
  contract: hostContract,
  handlers: { run_probe: runProbe, run_gate: runGate, run_land: runLand, pr_head: prHead },
});
