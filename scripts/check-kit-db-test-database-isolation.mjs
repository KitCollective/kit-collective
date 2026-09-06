#!/usr/bin/env node
/**
 * CI ratchet (KIT-211): @kit/db tests must not fall back to DATABASE_URL for
 * resetDatabase / createDb. Cloud Agents inject the shared development lane there.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const testsDir = join(root, "packages/db/tests");

function collectTestFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTestFiles(full));
    } else if (/\.test\.ts$/.test(entry.name) || entry.name.endsWith(".ts")) {
      files.push(full);
    }
  }
  return files;
}

let failed = false;

for (const file of collectTestFiles(testsDir)) {
  const rel = file.slice(root.length + 1);
  const source = readFileSync(file, "utf8");
  if (source.includes("process.env.DATABASE_URL")) {
    console.error(
      `check-kit-db-test-database-isolation: ${rel} must not read process.env.DATABASE_URL`,
    );
    failed = true;
  }

  const usesResetEnvUrl =
    source.includes("resetDatabase(DATABASE_URL") || source.includes("createDb(DATABASE_URL");
  if (usesResetEnvUrl && !source.includes("resolveKitDbTestDatabaseUrl")) {
    console.error(
      `check-kit-db-test-database-isolation: ${rel} uses DATABASE_URL with reset/createDb but is missing resolveKitDbTestDatabaseUrl`,
    );
    failed = true;
  }
}

const helperPath = join(testsDir, "test-database-url.ts");
const helper = readFileSync(helperPath, "utf8");
if (!helper.includes("isRecognizablyTestDatabase")) {
  console.error(
    "check-kit-db-test-database-isolation: test-database-url.ts missing isRecognizablyTestDatabase",
  );
  failed = true;
}
if (helper.includes("process.env.DATABASE_URL")) {
  console.error(
    "check-kit-db-test-database-isolation: test-database-url.ts must not read DATABASE_URL",
  );
  failed = true;
}

if (failed) {
  process.exit(1);
}

console.log("check-kit-db-test-database-isolation: ok");
