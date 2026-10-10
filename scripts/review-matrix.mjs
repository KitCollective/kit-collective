#!/usr/bin/env node
/**
 * Usage:
 *   node scripts/review-matrix.mjs rows
 *       print the lock-set rows (the matrix template)
 *   node scripts/review-matrix.mjs validate <workpad.md>
 *       exit 1 when the workpad's `### Review matrix` is incomplete
 *   node scripts/review-matrix.mjs plan <workpad.md> <lastReviewSha>
 *       print JSON { recheck, inherit } for the diff `<lastReviewSha>...HEAD`
 * The workpad is a file path or `-` for stdin.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { LOCK_ROWS, parseMatrix, planRecheck, validateMatrix } from "./lib/review-matrix.mjs";

const [command, source, lastReviewSha] = process.argv.slice(2);

if (command === "rows") {
  process.stdout.write("| row | status | evidence | at |\n| --- | --- | --- | --- |\n");
  for (const lock of LOCK_ROWS) {
    process.stdout.write(`| ${lock.id} | | | |  <!-- ${lock.label} -->\n`);
  }
  process.exit(0);
}

if ((command === "validate" || command === "plan") && source) {
  const rows = parseMatrix(readFileSync(source === "-" ? 0 : source, "utf8"));
  if (command === "validate") {
    const problems = validateMatrix(rows);
    for (const problem of problems) {
      process.stderr.write(`${problem}\n`);
    }
    process.exit(problems.length === 0 ? 0 : 1);
  }
  if (!lastReviewSha) {
    process.stderr.write("plan needs <lastReviewSha>\n");
    process.exit(2);
  }
  const changed = execFileSync("git", ["diff", "--name-only", `${lastReviewSha}...HEAD`], {
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);
  process.stdout.write(`${JSON.stringify(planRecheck(rows, changed), null, 2)}\n`);
  process.exit(0);
}

process.stderr.write("usage: review-matrix.mjs rows | validate <workpad> | plan <workpad> <sha>\n");
process.exit(2);
