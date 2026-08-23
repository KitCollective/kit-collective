#!/usr/bin/env node
/**
 * CI ratchet: scoped seed runs must keep a cross-season isolation test.
 * Prevents repeating KIT-34 checker fail (out-of-scope season mutation).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const testPath = join(root, "seed/apify/tests/scope-isolation.test.ts");
const source = readFileSync(testPath, "utf8");

const required = [
  "runSeed scope isolation",
  "does not mutate PlayerClubSeason rows for seasons outside the requested scope",
  "leaves out-of-scope seasons unchanged on a second all-skipped competition run",
  "SeedScopeIsolationError",
];

const missing = required.filter((needle) => !source.includes(needle));
if (missing.length > 0) {
  console.error(
    "check-seed-scope-isolation-test: missing required coverage in scope-isolation.test.ts:",
  );
  for (const item of missing) {
    console.error(`  - ${item}`);
  }
  process.exit(1);
}

console.log("check-seed-scope-isolation-test: ok");
