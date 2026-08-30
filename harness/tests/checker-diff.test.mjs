/**
 * Checker review snapshot — capped diff + issue Spec body for token save.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  captureCheckerReviewDiff,
  formatCheckerReviewBundle,
  MAX_CHECKER_DIFF_CHARS,
  truncateForChecker,
} from "../checker-diff.mjs";
import { FACTORY_CHECKER_ALLOWED_TOOLS, factoryCheckerPiArgs } from "../checker-spawn.mjs";
import { buildCheckerAppendPath } from "../implement-context.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("truncateForChecker marks overflow", () => {
  const { text, truncated } = truncateForChecker("abcdefghij", 8);
  assert.equal(truncated, true);
  assert.match(text, /truncated for checker/);
  assert.equal(truncateForChecker("short", 80).truncated, false);
});

test("captureCheckerReviewDiff uses three-dot range and caps", async () => {
  const calls = [];
  const review = await captureCheckerReviewDiff({
    cwd: "/tmp/worktree",
    lane: "development",
    async runGit(args, cwd) {
      calls.push({ args, cwd });
      if (args[0] === "merge-base") {
        return "abc123\n";
      }
      if (args[0] === "diff" && args[1] === "--stat") {
        return " harness/foo.mjs | 2 +-\n";
      }
      if (args[0] === "diff") {
        return `${"x".repeat(MAX_CHECKER_DIFF_CHARS + 50)}\n`;
      }
      if (args[0] === "log") {
        return "abc Implement KIT-1\n";
      }
      throw new Error(`unexpected git ${args.join(" ")}`);
    },
  });
  assert.equal(review.mergeBase, "abc123");
  assert.equal(review.range, "abc123...HEAD");
  assert.equal(review.truncated, true);
  assert.match(review.diff, /truncated for checker/);
  assert.match(review.stat, /harness\/foo/);
  assert.match(review.log, /Implement KIT-1/);
  assert.equal(calls[0].args[0], "merge-base");
});

test("formatCheckerReviewBundle includes Spec source and forbids CONTEXT dump", () => {
  const markdown = formatCheckerReviewBundle({
    identifier: "KIT-136",
    issueDescription: "## What to build\n\n- ship checker diff injection\n",
    review: {
      lane: "development",
      mergeBase: "abc",
      range: "abc...HEAD",
      diff: "+ hello\n",
      stat: " 1 file\n",
      log: "abc tip\n",
      truncated: false,
      empty: false,
    },
  });
  assert.match(markdown, /KIT-136/);
  assert.match(markdown, /ship checker diff injection/);
  assert.match(markdown, /Do \*\*not\*\* read full `CONTEXT\.md`/);
  assert.match(markdown, /Do \*\*not\*\* poll `gh pr checks`/);
  assert.match(markdown, /\+ hello/);
});

test("buildCheckerAppendPath embeds review bundle", () => {
  const path = buildCheckerAppendPath(ROOT, ".pi/roles/factory-checker.md", "(empty registry)\n", {
    reviewBundle: formatCheckerReviewBundle({
      identifier: "KIT-1",
      issueDescription: "AC one",
      review: null,
    }),
  });
  const body = readFileSync(path, "utf8");
  assert.match(body, /Injected review snapshot/);
  assert.match(body, /AC one/);
  assert.match(body, /Factory checker/);
});

test("factoryCheckerPiArgs allowlists readonly bash and embeds snapshot", () => {
  assert.equal(FACTORY_CHECKER_ALLOWED_TOOLS.includes("bash"), true);
  const bundle = formatCheckerReviewBundle({
    identifier: "KIT-56",
    issueDescription: "Spec body",
    review: {
      lane: "development",
      mergeBase: "m",
      range: "m...HEAD",
      diff: "+x\n",
      stat: "1 file\n",
      log: "m tip\n",
      truncated: false,
      empty: false,
    },
  });
  const args = factoryCheckerPiArgs({
    workspace: ROOT,
    roleFile: ".pi/roles/factory-checker.md",
    model: "cursor/grok-4.6",
    prompt: "Factory role factory-checker for KIT-56.",
    reviewBundle: bundle,
  });
  const toolsIdx = args.indexOf("--tools");
  assert.match(args[toolsIdx + 1], /\bbash\b/);
  const append = args[args.indexOf("--append-system-prompt") + 1];
  assert.match(readFileSync(append, "utf8"), /Spec body/);
});
