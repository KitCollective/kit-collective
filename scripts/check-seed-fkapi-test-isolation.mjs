#!/usr/bin/env node
/**
 * FK seed test isolation ratchet (KIT-22).
 * Prevents hardcoded Transfermarkt external_id values in seed/fkapi/tests that
 * collide on external_id_system_value_unique when tests share one DB pool.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const TESTS_DIR = path.join(ROOT, "seed/fkapi/tests");
const FIXTURE_SCOPE_FILE = "fixture-scope.ts";

function collectTestFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTestFiles(full));
    } else if (/\.test\.ts$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

const violations = [];

for (const file of collectTestFiles(TESTS_DIR)) {
  const rel = path.relative(ROOT, file);
  const content = readFileSync(file, "utf8");

  if (/VALUES\s*\(\s*'club'\s*,\s*\$1\s*,\s*\$2\s*,\s*'[^']+'\s*\)/.test(content)) {
    violations.push(
      `${rel}: hardcoded Transfermarkt external_id in INSERT — use seedApifyPrerequisites from fixture-scope.ts`,
    );
  }

  if (/async function seedApifyPrerequisites/.test(content)) {
    violations.push(
      `${rel}: local seedApifyPrerequisites — move to fixture-scope.ts and allocate per test`,
    );
  }

  if (/seedApifyPrerequisites\s*\(\s*\w+\s*\)(?!\s*,)/.test(content)) {
    violations.push(
      `${rel}: seedApifyPrerequisites must receive an allocated TestFixtureScope as the second argument`,
    );
  }
}

try {
  const fixtureScopePath = path.join(TESTS_DIR, FIXTURE_SCOPE_FILE);
  statSync(fixtureScopePath);
  const fixtureScopeContent = readFileSync(fixtureScopePath, "utf8");
  if (!/allocateTestFixtureScope/.test(fixtureScopeContent)) {
    violations.push(`${FIXTURE_SCOPE_FILE}: must export allocateTestFixtureScope`);
  }
  if (!/seedApifyPrerequisites/.test(fixtureScopeContent)) {
    violations.push(`${FIXTURE_SCOPE_FILE}: must export seedApifyPrerequisites`);
  }
} catch {
  violations.push(
    `seed/fkapi/tests/${FIXTURE_SCOPE_FILE}: required fixture-scope module is missing`,
  );
}

if (violations.length > 0) {
  console.error("FK seed test isolation violations:");
  for (const violation of violations) {
    console.error(violation);
  }
  process.exit(1);
}

console.log("FK seed test isolation OK");
