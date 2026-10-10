#!/usr/bin/env node
/**
 * Usage: node scripts/classify-fix-diff.mjs <lastReviewSha> [head]
 * Prints `light <reason>` or `full <reason>` for the diff `<lastReviewSha>..<head>` (default HEAD).
 * Exit 0 for light, 1 for full. A review whose findings are all tagged [text] or [name] is
 * verified against that diff when it is light; a full diff gets the normal fresh review.
 */
import { execFileSync } from "node:child_process";
import { classifyFixDiff } from "./lib/fix-diff.mjs";

const [from, head = "HEAD"] = process.argv.slice(2);
if (!from) {
  process.stderr.write("usage: classify-fix-diff.mjs <lastReviewSha> [head]\n");
  process.exit(2);
}
const diff = execFileSync("git", ["diff", "-U0", `${from}..${head}`], {
  encoding: "utf8",
  maxBuffer: 256 * 1024 * 1024,
});
/** A rename is complete only when the old name is gone from every non-doc file at head. */
const isStillUsed = (name) => {
  try {
    execFileSync("git", ["grep", "-q", "-w", "-e", name, head, "--", ".", ":!*.md"], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
};
const verdict = classifyFixDiff(diff, { isStillUsed });
process.stdout.write(`${verdict.kind} ${verdict.reason}\n`);
process.exit(verdict.kind === "light" ? 0 : 1);
