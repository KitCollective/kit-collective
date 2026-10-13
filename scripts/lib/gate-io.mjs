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

/** The Linear issue (state, labels, comments) through scripts/linear.mjs. */
export async function linearIssue(issue) {
  return JSON.parse(await sh("node", [join(ROOT, "scripts", "linear.mjs"), "issue", issue]));
}

/** Body of the single workpad comment, or "". */
export function workpadOf(linear, heading = config().agent.workpadHeading) {
  return linear.comments?.findLast((c) => c.body.trimStart().startsWith(heading))?.body ?? "";
}

export const events = () => readEvents(logPath());

/** Logging must never stop a gate: a failed write is reported on stderr only. */
export function logGate(issue, gate, outcome, sha) {
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

/**
 * Whether the PR head holds the issue's slice flow. Asked of GitHub, never of the checkout, so
 * the answer is the same on every machine.
 * @param {string} path repo-relative path @param {string} head full sha
 */
export async function existsAtHead(path, head) {
  try {
    await gh([
      "api",
      `repos/${config().github.ownerRepo}/contents/${path}?ref=${head}`,
      "--jq",
      ".sha",
    ]);
    return true;
  } catch (error) {
    if (/404|Not Found/i.test(`${error.stderr ?? ""}${error.message ?? ""}`)) {
      return false;
    }
    throw error;
  }
}

/** The commit statuses of a head, newest first. */
export async function commitStatuses(head) {
  return JSON.parse(
    await gh(["api", `repos/${config().github.ownerRepo}/commits/${head}/statuses`]),
  );
}
