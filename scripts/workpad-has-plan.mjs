#!/usr/bin/env node
/**
 * Does the issue's workpad already hold a `### Plan` section? The AFK developer workflow asks before a
 * resume spawns the Lead, so a plan the Engineer built against is never overwritten.
 *
 * Usage: node scripts/workpad-has-plan.mjs <KIT-n>
 * Prints one line. Exit: 0 plan present, 1 no plan, 2 usage, 4 the workpad could not be read.
 */
import { linearIssue, workpadOf } from "./lib/gate-io.mjs";
import { workpadHasPlan } from "./lib/gates.mjs";

const issue = process.argv.slice(2).find((a) => /^[A-Z][A-Z0-9]*-\d+$/.test(a));
if (!issue) {
  process.stderr.write("usage: workpad-has-plan.mjs <KIT-n>\n");
  process.exit(2);
}
try {
  const present = workpadHasPlan(workpadOf(await linearIssue(issue)));
  process.stdout.write(present ? `PLAN-PRESENT ${issue}\n` : `PLAN-ABSENT ${issue}\n`);
  process.exit(present ? 0 : 1);
} catch (error) {
  process.stdout.write(`UNKNOWN: ${String(error.message).split("\n")[0]}\n`);
  process.exit(4);
}
