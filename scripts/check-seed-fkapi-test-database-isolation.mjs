#!/usr/bin/env node
/**
 * CI ratchet (KIT-211): seed/fkapi tests must not use DATABASE_URL for DROP SCHEMA.
 * Prevents repeating the KIT-34 class (shared development Postgres wiped by tests).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const testsDir = join(root, "seed/fkapi/tests");

function collectTestFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTestFiles(full));
    } else if (/\.test\.ts$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

const forbidden = ["process.env.DATABASE_URL", "resetTestDatabase(DATABASE_URL"];
const requiredInResetTests = ["resolveSeedFkapiTestDatabaseUrl", "TEST_DATABASE_URL"];

let failed = false;

for (const file of collectTestFiles(testsDir)) {
  const rel = file.slice(root.length + 1);
  const source = readFileSync(file, "utf8");
  if (source.includes("process.env.DATABASE_URL")) {
    console.error(
      `check-seed-fkapi-test-database-isolation: ${rel} must not contain process.env.DATABASE_URL`,
    );
    failed = true;
  }
  if (!source.includes("resetTestDatabase(TEST_DATABASE_URL")) {
    continue;
  }

  for (const needle of forbidden) {
    if (source.includes(needle)) {
      console.error(`check-seed-fkapi-test-database-isolation: ${rel} must not contain ${needle}`);
      failed = true;
    }
  }
  for (const needle of requiredInResetTests) {
    if (!source.includes(needle)) {
      console.error(`check-seed-fkapi-test-database-isolation: ${rel} missing ${needle}`);
      failed = true;
    }
  }
}

const helperPath = join(testsDir, "test-database-url.ts");
const helper = readFileSync(helperPath, "utf8");
if (!helper.includes("isRecognizablyTestDatabase")) {
  console.error(
    "check-seed-fkapi-test-database-isolation: test-database-url.ts missing isRecognizablyTestDatabase",
  );
  failed = true;
}
if (helper.includes("process.env.DATABASE_URL")) {
  console.error(
    "check-seed-fkapi-test-database-isolation: test-database-url.ts must not read DATABASE_URL",
  );
  failed = true;
}

const resetHelper = readFileSync(join(testsDir, "test-db.ts"), "utf8");
if (!resetHelper.includes("isRecognizablyTestDatabase")) {
  console.error(
    "check-seed-fkapi-test-database-isolation: test-db.ts must refuse non-test URLs before DROP SCHEMA",
  );
  failed = true;
}

if (failed) {
  process.exit(1);
}

console.log("check-seed-fkapi-test-database-isolation: ok");
