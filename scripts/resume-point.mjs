#!/usr/bin/env node
/**
 * Gate: may a resumed run go straight to the Reviewer (ADR-0058)? A resume used to spend a full
 * Engineer round on a PR that was already built. This reads the run log's last Engineer result and
 * the same head facts as head-changed.mjs.
 *
 * Usage: node scripts/resume-point.mjs <KIT-n> --pr <number>
 * Prints one line. Exit: 0 review the head as it is (OPEN), 1 the Engineer has work or a source
 * could not be read (CLOSED, fails towards building), 2 usage.
 */
import { events, linearIssue, prView, workpadOf } from "./lib/gate-io.mjs";
import { resumePoint } from "./lib/gates.mjs";

const args = process.argv.slice(2);
const issue = args[0];
const prAt = args.indexOf("--pr");
if (
  !issue ||
  !/^[A-Z][A-Z0-9]*-\d+$/.test(issue) ||
  prAt === -1 ||
  !/^\d+$/.test(args[prAt + 1] ?? "")
) {
  process.stderr.write("usage: resume-point.mjs <KIT-n> --pr <number>\n");
  process.exit(2);
}
let result;
try {
  const head = (await prView(args[prAt + 1])).headRefOid;
  const workpad = workpadOf(await linearIssue(issue));
  result = resumePoint({ head, issue, events: events(), workpad });
} catch (error) {
  result = { code: 1, line: `CLOSED: ${String(error.message).split("\n")[0]}` };
}
process.stdout.write(`${result.line}\n`);
process.exit(result.code);
