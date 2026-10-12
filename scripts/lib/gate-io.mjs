/** Shared I/O for the gate CLIs: gh, git, Linear (through scripts/linear.mjs), the run log. */
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { append, logPath, readEvents } from "./run-log.mjs";

const run = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const config = () => JSON.parse(readFileSync(join(ROOT, "factory.config.json"), "utf8"));

export async function sh(cmd, args, options = {}) {
  const { stdout } = await run(cmd, args, { maxBuffer: 16 * 1024 * 1024, ...options });
  return stdout;
}

export const gh = async (args) => sh("gh", args);
export const git = async (args) => (await sh("git", args)).trim();

/** The Linear CLI: scripts/linear.mjs, or the script `KC_LINEAR_CLI` names (tests put a fake there). */
export const linearCli = () => process.env.KC_LINEAR_CLI || join(ROOT, "scripts", "linear.mjs");

/** The Linear issue (state, labels, comments) through scripts/linear.mjs. */
export async function linearIssue(issue) {
  return JSON.parse(await sh("node", [linearCli(), "issue", issue]));
}

/** Body of the single workpad comment, or "". */
export function workpadOf(linear, heading = config().agent.workpadHeading) {
  return linear.comments?.findLast((c) => c.body.trimStart().startsWith(heading))?.body ?? "";
}

export const events = () => readEvents(logPath());

/**
 * Logging must never stop a gate: a failed write is reported on stderr only. `KC_DRY_RUN=1`
 * (set by `auto-land.mjs --dry-run` for the gates it runs) writes nothing.
 */
export function logGate(issue, gate, outcome, sha) {
  if (process.env.KC_DRY_RUN === "1") {
    return;
  }
  try {
    append({ event: "gate", issue, gate, outcome, ...(sha ? { sha } : {}) }, { path: logPath() });
  } catch (error) {
    process.stderr.write(`run-log: ${error.message}\n`);
  }
}

/** The PR facts a gate needs, from GitHub (never inferred from the checkout's branch). */
export async function prView(pr) {
  return JSON.parse(
    await gh([
      "pr",
      "view",
      pr,
      "--repo",
      config().github.ownerRepo,
      "--json",
      "headRefOid,title,body,headRefName",
    ]),
  );
}
