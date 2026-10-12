#!/usr/bin/env node
/**
 * The sanctioned wait for required GitHub checks (ADR-0050). One blocking command replaces
 * the watch flag of `gh pr checks`, sleep loops and "is CI green?" questions to the human.
 *
 * Usage: node scripts/wait-for-checks.mjs <pr> [--timeout 1800] [--interval 30] [--fail-fast]
 *          [--also "Device flows"]
 *
 * Polls inside the process (the cursor-ratchet hook sees one command, not a loop), prints one
 * line per change, then the final verdict. Exit: 0 green and MERGEABLE, 1 red, 2 still pending
 * at the timeout, 3 green but not mergeable (behind, conflicting), 4 unknown (retried until the
 * timeout), 5 gh itself is unusable: too old for `--json` on `pr checks`, a usage or auth error,
 * a PR that does not exist, output that is not JSON. Exit 5 is immediate and the verdict line
 * names the cause (`UNKNOWN: gh ...`); only genuine transient states (pending checks, network
 * blips, rate limits) are retried. A startup probe of `gh pr checks --help` catches a gh without
 * `--json` before any waiting.
 * Run it in the background when a session wants to keep working: the harness re-invokes on exit.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  EXIT,
  GH_REQUIREMENT,
  ghErrorLine,
  isPermanentGhError,
  prArgument,
  verdict,
} from "./lib/pr-checks.mjs";

const run = promisify(execFile);
const args = process.argv.slice(2);
const pr = prArgument(args);

/** @param {string} flag @param {string} fallback */
function option(flag, fallback) {
  const at = args.indexOf(flag);
  return at === -1 ? fallback : (args[at + 1] ?? fallback);
}

if (!pr) {
  process.stderr.write(
    "usage: wait-for-checks.mjs <pr number|url> [--timeout s] [--interval s] [--fail-fast]\n",
  );
  process.exit(EXIT.unknown);
}

const timeoutMs = Number(option("--timeout", "1800")) * 1000;
const intervalMs = Number(option("--interval", "30")) * 1000;
const failFast = args.includes("--fail-fast");
const also = args.flatMap((arg, i) => (arg === "--also" ? [args[i + 1]] : []));

/** `gh` exits non-zero while checks are pending but still prints the JSON. */
async function gh(ghArgs) {
  try {
    return (await run("gh", ghArgs, { maxBuffer: 16 * 1024 * 1024 })).stdout;
  } catch (error) {
    if (error.stdout) {
      return error.stdout;
    }
    throw error;
  }
}

/** Exits 5 at once when gh cannot do the one thing this script needs. */
async function probeGh() {
  try {
    const help = (await run("gh", ["pr", "checks", "--help"])).stdout;
    if (!/--json/.test(help)) {
      process.stdout.write(`UNKNOWN: gh too old, needs ${GH_REQUIREMENT}\n`);
      process.exit(EXIT.ghBroken);
    }
  } catch (error) {
    const cause = error.code === "ENOENT" ? "gh is not installed" : ghErrorLine(error);
    process.stdout.write(`UNKNOWN: gh cannot run its pr checks help: ${cause}\n`);
    process.exit(EXIT.ghBroken);
  }
}

async function snapshot() {
  const [required, view, all] = await Promise.all([
    gh(["pr", "checks", pr, "--required", "--json", "name,bucket,state"]),
    gh(["pr", "view", pr, "--json", "mergeable,mergeStateStatus"]),
    also.length > 0 ? gh(["pr", "checks", pr, "--json", "name,bucket,state"]) : "[]",
  ]);
  const checks = JSON.parse(required || "[]");
  for (const name of also) {
    const extra = JSON.parse(all || "[]").find((check) => check.name === name);
    checks.push(extra ?? { name, bucket: "pending" });
  }
  return { checks, view: JSON.parse(view || "{}") };
}

await probeGh();
const started = Date.now();
let last = "";
for (;;) {
  let result;
  try {
    const { checks, view } = await snapshot();
    result = verdict(checks, view, { failFast });
  } catch (error) {
    if (isPermanentGhError(error)) {
      process.stdout.write(`UNKNOWN: gh failed, retrying cannot help: ${ghErrorLine(error)}\n`);
      process.exit(EXIT.ghBroken);
    }
    result = {
      done: false,
      code: EXIT.unknown,
      line: `gh failed: ${String(error.message).split("\n")[0]}`,
    };
  }
  if (result.line !== last) {
    process.stdout.write(`${new Date().toISOString().slice(11, 19)} ${result.line}\n`);
    last = result.line;
  }
  if (result.done) {
    process.exit(result.code);
  }
  if (Date.now() - started + intervalMs > timeoutMs) {
    const seconds = Math.round((Date.now() - started) / 1000);
    process.stdout.write(`TIMEOUT after ${seconds}s: ${result.line}\n`);
    process.exit(result.code === EXIT.unknown ? EXIT.unknown : EXIT.pending);
  }
  await new Promise((resolve) => setTimeout(resolve, intervalMs));
}
