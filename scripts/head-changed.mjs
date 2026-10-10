#!/usr/bin/env node
/**
 * Gate: a head already audited red is never audited again (ADR-0053). Run before every reviewer spawn.
 *
 * Usage: node scripts/head-changed.mjs <KIT-n> --pr <number> | --head <sha>
 * Reads the run log's last audit for the issue and the workpad's `lastReviewSha` with open
 * `### Review feedback`. The head is the PR's `headRefOid` from GitHub, or an explicit --head; it is
 * never the cwd checkout's HEAD, which on an orchestrator is another branch.
 * Prints one line. Exit: 0 head is new (OPEN), 1 already audited red or unreadable (CLOSED, fails
 * closed), 2 usage.
 */
import { events, linearIssue, logGate, prView, workpadOf } from "./lib/gate-io.mjs";
import { headChanged, resolveHead } from "./lib/gates.mjs";

const args = process.argv.slice(2);
const issue = args[0];
const prAt = args.indexOf("--pr");
const headAt = args.indexOf("--head");
if (!issue || !/^[A-Z][A-Z0-9]*-\d+$/.test(issue) || (prAt === -1 && headAt === -1)) {
  process.stderr.write("usage: head-changed.mjs <KIT-n> --pr <number> | --head <sha>\n");
  process.exit(2);
}
let result;
try {
  const head = resolveHead({
    explicit: headAt === -1 ? undefined : args[headAt + 1],
    prHead: prAt === -1 ? undefined : (await prView(args[prAt + 1])).headRefOid,
  });
  const workpad = workpadOf(await linearIssue(issue).catch(() => ({})));
  result = headChanged({ head, issue, events: events(), workpad });
  logGate(
    issue,
    "head",
    result.code === 0 ? "open" : "closed",
    /^[0-9a-f]{40}$/i.test(head) ? head : undefined,
  );
} catch (error) {
  result = { code: 1, line: `CLOSED: ${String(error.message).split("\n")[0]}` };
}
process.stdout.write(`${result.line}\n`);
process.exit(result.code);
