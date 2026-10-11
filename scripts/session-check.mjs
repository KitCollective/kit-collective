#!/usr/bin/env node
/**
 * Gate: refuse a second run on one issue (ADR-0053). Machine-agnostic: it reads Linear (state,
 * labels), GitHub (remote branches and open PRs named for the issue) and the central run log,
 * never local worktrees, because workers run on several machines.
 *
 * Usage: node scripts/session-check.mjs <KIT-n> [--resume] [--live-minutes 30]
 * --resume is the deliberate resume: it skips the PR, branch, state and run-log checks (an issue
 * that is Done, Canceled or carries a stop label still refuses).
 * Prints one line. Exit: 0 free (OPEN), 1 refuse (CLOSED), 2 usage, 4 a source could not be read.
 */
import { config, events, gh, linearIssue, logGate, sh } from "./lib/gate-io.mjs";
import { matchesIssueKey, sessionCheck } from "./lib/gates.mjs";

const args = process.argv.slice(2);
const issue = args.find((a) => /^[A-Z][A-Z0-9]*-\d+$/.test(a));
if (!issue) {
  process.stderr.write("usage: session-check.mjs <KIT-n> [--resume] [--live-minutes n]\n");
  process.exit(2);
}
const minutes = args.indexOf("--live-minutes");
let result;
try {
  const repo = config().github.ownerRepo;
  const key = issue.toLowerCase();
  const linear = await linearIssue(issue);
  const refs = await sh("git", ["ls-remote", "--heads", "origin", `*${key}*`]);
  const branches = refs
    .split("\n")
    .filter(Boolean)
    .map((l) => l.split("refs/heads/")[1])
    .filter((name) => matchesIssueKey(name, issue));
  const prs = JSON.parse(
    await gh([
      "pr",
      "list",
      "--repo",
      repo,
      "--state",
      "open",
      "--search",
      `${issue} in:title`,
      "--json",
      "number,title,headRefName",
    ]),
  );
  const openPrs = prs
    .filter((p) => p.title.startsWith(`${issue}:`) || matchesIssueKey(p.headRefName, issue))
    .map((p) => p.number);
  result = sessionCheck({
    issue,
    resume: args.includes("--resume"),
    liveMinutes: minutes === -1 ? 30 : Number(args[minutes + 1]),
    linear: { state: linear.state, labels: linear.labels, blockedBy: linear.blockedBy },
    branches,
    openPrs,
    events: events(),
  });
  logGate(issue, "session", result.code === 0 ? "open" : "closed");
} catch (error) {
  result = { code: 4, line: `UNKNOWN: ${String(error.message).split("\n")[0]}` };
}
process.stdout.write(`${result.line}\n`);
process.exit(result.code);
