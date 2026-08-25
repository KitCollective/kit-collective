#!/usr/bin/env node
/**
 * CI ratchet: implement ADW exit must be proven on production createGhClient
 * (fake runCommand only), not only injected fakeGh. Prevents repeating the
 * KIT-54 checker fail #2 (fakes skipped git push, --head, and waiting for
 * required GitHub checks).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const IMPLEMENT_ADW_TEST = "harness/tests/implement-adw.test.mjs";

export const REQUIRED_NEEDLES = [
  'test("production createGhClient pushes the rebased head, waits through pending required checks, and ignores optional pending"',
  "createGhClient(",
  'call.args.includes("push")',
  'create.args.includes("--head")',
  "must poll viewPr until required checks are green",
  "setStatus",
];

/**
 * @param {string} source
 * @returns {string[]}
 */
export function missingImplementAdwProductionGhCoverage(source) {
  return REQUIRED_NEEDLES.filter((needle) => !source.includes(needle));
}

const root = join(import.meta.dirname, "..");
const source = readFileSync(join(root, IMPLEMENT_ADW_TEST), "utf8");
const missing = missingImplementAdwProductionGhCoverage(source);
if (missing.length > 0) {
  console.error(
    "check-implement-adw-production-gh: missing required coverage in implement-adw.test.mjs:",
  );
  for (const item of missing) {
    console.error(`  - ${item}`);
  }
  process.exit(1);
}

console.log("check-implement-adw-production-gh: ok");
