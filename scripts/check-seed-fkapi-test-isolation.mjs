#!/usr/bin/env node
/**
 * FK seed test isolation ratchet (KIT-22 + KIT-144).
 * - Prevents hardcoded Transfermarkt / FKA external_id values in seed/fkapi/tests that
 *   collide on external_id_system_value_unique when tests share one DB pool.
 * - Keeps live FKApi + lane R2 out of CI: tests must inject fixture fetch + memory object store.
 * - Requires NationalTeam fixture helpers + denmark-national-kits.json for NT kit grain tests.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const TESTS_DIR = path.join(ROOT, "seed/fkapi/tests");
const FIXTURES_DIR = path.join(ROOT, "seed/fkapi/fixtures");
const FIXTURE_SCOPE_FILE = "fixture-scope.ts";
const NT_FIXTURE_FILE = "denmark-national-kits.json";

const NT_FIXTURE_SCOPE_EXPORTS = [
  "allocateNationalTeamTestFixtureScope",
  "seedNationalTeamPrerequisites",
  "createScopedNationalTeamFixtureFetchAdapter",
];

/**
 * @param {{
 *   testFileContents: Record<string, string>,
 *   fixtureScopeContent: string | null,
 *   fixtureFileNames: string[],
 * }} input
 * @returns {string[]}
 */
export function findFkSeedTestIsolationViolations(input) {
  const violations = [];

  for (const [rel, content] of Object.entries(input.testFileContents)) {
    if (/VALUES\s*\(\s*'club'\s*,\s*\$1\s*,\s*\$2\s*,\s*'[^']+'\s*\)/.test(content)) {
      violations.push(
        `${rel}: hardcoded Transfermarkt external_id in INSERT — use seedApifyPrerequisites from fixture-scope.ts`,
      );
    }

    if (/VALUES\s*\(\s*'national_team'\s*,\s*\$1\s*,\s*\$2\s*,\s*'[^']+'\s*\)/.test(content)) {
      violations.push(
        `${rel}: hardcoded national_team external_id in INSERT — use seedNationalTeamPrerequisites from fixture-scope.ts`,
      );
    }

    if (/async function seedApifyPrerequisites/.test(content)) {
      violations.push(
        `${rel}: local seedApifyPrerequisites — move to fixture-scope.ts and allocate per test`,
      );
    }

    if (/async function seedNationalTeamPrerequisites/.test(content)) {
      violations.push(
        `${rel}: local seedNationalTeamPrerequisites — move to fixture-scope.ts and allocate per test`,
      );
    }

    if (/seedApifyPrerequisites\s*\(\s*\w+\s*\)(?!\s*,)/.test(content)) {
      violations.push(
        `${rel}: seedApifyPrerequisites must receive an allocated TestFixtureScope as the second argument`,
      );
    }

    if (/seedNationalTeamPrerequisites\s*\(\s*\w+\s*\)(?!\s*,)/.test(content)) {
      violations.push(
        `${rel}: seedNationalTeamPrerequisites must receive an allocated NationalTeamTestFixtureScope as the second argument`,
      );
    }

    if (/createR2ObjectStore\s*\(/.test(content)) {
      violations.push(
        `${rel}: createR2ObjectStore is live lane R2 — inject a memory ObjectStoreAdapter in tests (fake R2)`,
      );
    }
  }

  if (input.fixtureScopeContent === null) {
    violations.push(
      `seed/fkapi/tests/${FIXTURE_SCOPE_FILE}: required fixture-scope module is missing`,
    );
  } else {
    const fixtureScopeContent = input.fixtureScopeContent;
    if (!/allocateTestFixtureScope/.test(fixtureScopeContent)) {
      violations.push(`${FIXTURE_SCOPE_FILE}: must export allocateTestFixtureScope`);
    }
    if (!/seedApifyPrerequisites/.test(fixtureScopeContent)) {
      violations.push(`${FIXTURE_SCOPE_FILE}: must export seedApifyPrerequisites`);
    }
    for (const exportName of NT_FIXTURE_SCOPE_EXPORTS) {
      if (!new RegExp(exportName).test(fixtureScopeContent)) {
        violations.push(
          `${FIXTURE_SCOPE_FILE}: must export ${exportName} for hermetic NationalTeam kit grain tests`,
        );
      }
    }
  }

  if (!input.fixtureFileNames.includes(NT_FIXTURE_FILE)) {
    violations.push(
      `seed/fkapi/fixtures/${NT_FIXTURE_FILE}: required NationalTeam fixture for hermetic CI (no live FKApi)`,
    );
  }

  return violations;
}

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

function readRepoSnapshot() {
  /** @type {Record<string, string>} */
  const testFileContents = {};
  if (existsSync(TESTS_DIR)) {
    for (const file of collectTestFiles(TESTS_DIR)) {
      const rel = path.relative(ROOT, file);
      testFileContents[rel] = readFileSync(file, "utf8");
    }
  }

  let fixtureScopeContent = null;
  const fixtureScopePath = path.join(TESTS_DIR, FIXTURE_SCOPE_FILE);
  try {
    statSync(fixtureScopePath);
    fixtureScopeContent = readFileSync(fixtureScopePath, "utf8");
  } catch {
    fixtureScopeContent = null;
  }

  const fixtureFileNames = existsSync(FIXTURES_DIR)
    ? readdirSync(FIXTURES_DIR).filter((name) => name.endsWith(".json"))
    : [];

  return { testFileContents, fixtureScopeContent, fixtureFileNames };
}

function main() {
  const violations = findFkSeedTestIsolationViolations(readRepoSnapshot());

  if (violations.length > 0) {
    console.error("FK seed test isolation violations:");
    for (const violation of violations) {
      console.error(violation);
    }
    process.exit(1);
  }

  console.log("FK seed test isolation OK");
}

const isDirectRun =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main();
}
