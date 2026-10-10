#!/usr/bin/env node
/**
 * Gate: a head already audited red is never audited again (ADR-0053). Run before every reviewer spawn.
 *
 * Usage: node scripts/head-changed.mjs <KIT-n> [--head <sha>]
 * Reads the run log's last audit for the issue and the workpad's `lastReviewSha` with open
 * `### Review feedback`. HEAD is the current checkout's unless --head is given.
 * Prints one line. Exit: 0 head is new (OPEN), 1 already audited red or unreadable (CLOSED, fails
 * closed), 2 usage.
 */
import { events, git, linearIssue, logGate, workpadOf } from "./lib/gate-io.mjs";
import { headChanged } from "./lib/gates.mjs";

const args = process.argv.slice(2);
const issue = args[0];
if (!issue || !/^[A-Z][A-Z0-9]*-\d+$/.test(issue)) {
  process.stderr.write("usage: head-changed.mjs <KIT-n> [--head <sha>]\n");
  process.exit(2);
}
const at = args.indexOf("--head");
let result;
try {
  const head = at === -1 ? await git(["rev-parse", "HEAD"]) : args[at + 1];
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
