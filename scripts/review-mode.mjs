#!/usr/bin/env node
/**
 * Full or delta review for the AFK developer Reviewer (scripts/lib/review-mode.mjs says when delta).
 *
 * Usage: node scripts/review-mode.mjs <KIT-n> [--green <sha>]
 *   --green  the last green head of this run, when the workflow has one
 * Run in the PR head checkout. The detail lines (merges, files both sides changed) come first; the
 * last line is the answer the workflow reads:
 *   REVIEW-MODE delta <since sha>     HEAD is <since> plus merges of origin/development only
 *   REVIEW-MODE full <why>            anything else: the Reviewer reviews the merge-base diff
 * Exit: 0 either answer, 2 usage, 4 the workpad could not be read.
 */
import { execFileSync } from "node:child_process";
import { linearIssue, workpadOf } from "./lib/gate-io.mjs";
import { parseMatrix } from "./lib/review-matrix.mjs";
import { reviewMode } from "./lib/review-mode.mjs";

const argv = process.argv.slice(2);
const issue = argv.find((a) => /^[A-Z][A-Z0-9]*-\d+$/.test(a));
const greenAt = argv.indexOf("--green");
const green = greenAt === -1 ? "" : String(argv[greenAt + 1] ?? "");
if (!issue || (greenAt !== -1 && !/^[0-9a-f]{40}$/i.test(green))) {
  process.stderr.write("usage: review-mode.mjs <KIT-n> [--green <40-hex sha>]\n");
  process.exit(2);
}

const git = (args) => {
  try {
    return execFileSync("git", args, {
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 64 * 1024 * 1024,
    })
      .toString()
      .trim();
  } catch {
    return null;
  }
};

let rows;
try {
  rows = parseMatrix(workpadOf(await linearIssue(issue)));
} catch (error) {
  process.stdout.write(`UNKNOWN: ${String(error.message).split("\n")[0]}\n`);
  process.exit(4);
}
// A stale lane reads a fresh development merge as a commit of the branch: a full review, never a wrong delta.
git(["fetch", "--quiet", "origin", "development"]);
const mode = reviewMode({ rows, green, git });
if (mode.mode === "delta") {
  for (const merge of mode.merges) {
    process.stdout.write(`merge ${merge}: review its resolution with git show --cc ${merge}\n`);
  }
  for (const file of mode.overlap) {
    process.stdout.write(`both sides changed ${file}: read the result against both parents\n`);
  }
  process.stdout.write(`REVIEW-MODE delta ${mode.since}\n`);
} else {
  process.stdout.write(`REVIEW-MODE full ${mode.why}\n`);
}
process.exit(0);
