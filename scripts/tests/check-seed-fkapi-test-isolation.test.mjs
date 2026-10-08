import assert from "node:assert/strict";
import { test } from "node:test";
import { findFkSeedTestIsolationViolations } from "../check-seed-fkapi-test-isolation.mjs";

const FIXTURE_SCOPE_WITH_CLUB_ONLY = `
export function allocateTestFixtureScope() {}
export async function seedApifyPrerequisites() {}
`;

const FIXTURE_SCOPE_WITH_NT = `
export function allocateTestFixtureScope() {}
export async function seedApifyPrerequisites() {}
export function allocateNationalTeamTestFixtureScope() {}
export async function seedNationalTeamPrerequisites() {}
export function createScopedNationalTeamFixtureFetchAdapter() {}
`;

test("passes when club + NationalTeam fixture helpers and NT fixture exist", () => {
  const violations = findFkSeedTestIsolationViolations({
    testFileContents: {
      "seed/fkapi/tests/seed.test.ts": `
        const store = createMemoryObjectStore();
        await seedNationalTeamPrerequisites(pool, allocateNationalTeamTestFixtureScope());
        createScopedNationalTeamFixtureFetchAdapter(scope);
      `,
    },
    fixtureScopeContent: FIXTURE_SCOPE_WITH_NT,
    fixtureFileNames: ["superliga-kits.json", "denmark-national-kits.json"],
  });
  assert.deepEqual(violations, []);
});

test("fails when denmark-national-kits fixture is missing", () => {
  const violations = findFkSeedTestIsolationViolations({
    testFileContents: {},
    fixtureScopeContent: FIXTURE_SCOPE_WITH_NT,
    fixtureFileNames: ["superliga-kits.json"],
  });
  assert.ok(violations.some((v) => v.includes("denmark-national-kits.json")));
});

test("fails when NationalTeam fixture-scope helpers are missing", () => {
  const violations = findFkSeedTestIsolationViolations({
    testFileContents: {},
    fixtureScopeContent: FIXTURE_SCOPE_WITH_CLUB_ONLY,
    fixtureFileNames: ["superliga-kits.json", "denmark-national-kits.json"],
  });
  assert.ok(violations.some((v) => v.includes("allocateNationalTeamTestFixtureScope")));
  assert.ok(violations.some((v) => v.includes("seedNationalTeamPrerequisites")));
  assert.ok(violations.some((v) => v.includes("createScopedNationalTeamFixtureFetchAdapter")));
});

test("fails when tests call createR2ObjectStore (live R2 must stay out of CI)", () => {
  const violations = findFkSeedTestIsolationViolations({
    testFileContents: {
      "seed/fkapi/tests/seed.test.ts": `await createR2ObjectStore().putObject("k", bytes);`,
    },
    fixtureScopeContent: FIXTURE_SCOPE_WITH_NT,
    fixtureFileNames: ["superliga-kits.json", "denmark-national-kits.json"],
  });
  assert.ok(violations.some((v) => v.includes("createR2ObjectStore")));
});

test("fails when NationalTeam external_id is hardcoded in a test INSERT", () => {
  const violations = findFkSeedTestIsolationViolations({
    testFileContents: {
      "seed/fkapi/tests/seed.test.ts": `
        await pool.query(
          \`INSERT INTO external_id (entity_type, entity_id, system, value)
           VALUES ('national_team', $1, $2, '3436')\`,
          [id, system],
        );
      `,
    },
    fixtureScopeContent: FIXTURE_SCOPE_WITH_NT,
    fixtureFileNames: ["superliga-kits.json", "denmark-national-kits.json"],
  });
  assert.ok(violations.some((v) => v.includes("national_team")));
});
