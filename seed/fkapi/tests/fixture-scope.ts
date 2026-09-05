import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";
import { normalizeRawKit } from "../src/normalize.js";
import type { FkFetchAdapter, FkRawKit } from "../src/types.js";
import { EXTERNAL_SYSTEM_FKAPI, EXTERNAL_SYSTEM_TRANSFERMARKT } from "../src/types.js";

const FIXTURE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/superliga-kits.json",
);

const NT_FIXTURE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/denmark-national-kits.json",
);

export type TestFixtureScope = {
  clubTransfermarktId: string;
  seasonLabel: string;
};

export type NationalTeamTestFixtureScope = {
  nationalTeamTransfermarktId: string;
  nationalTeamFkApiId: string;
  seasonLabel: string;
};

let scopeCounter = 0;

/** Allocates a unique club TM id + season label so FK seed tests cannot collide on external_id. */
export function allocateTestFixtureScope(): TestFixtureScope {
  scopeCounter += 1;
  const suffix = `${Date.now()}-${scopeCounter}`;
  return {
    clubTransfermarktId: `tm-test-${suffix}`,
    seasonLabel: `1998/99-test-${suffix}`,
  };
}

/** Allocates a unique NationalTeam TM + FKA team id + season label for NT kit grain tests. */
export function allocateNationalTeamTestFixtureScope(): NationalTeamTestFixtureScope {
  scopeCounter += 1;
  const suffix = `${Date.now()}-${scopeCounter}`;
  return {
    nationalTeamTransfermarktId: `nt-tm-${suffix}`,
    nationalTeamFkApiId: `fka-nt-${suffix}`,
    seasonLabel: `2010-test-${suffix}`,
  };
}

export async function seedApifyPrerequisites(
  pool: Pool,
  scope: TestFixtureScope,
): Promise<{ clubId: string; seasonId: string }> {
  const countryRow = await pool.query<{ id: string }>(
    `INSERT INTO country (iso3166) VALUES ('DK') RETURNING id`,
  );
  const countryId = countryRow.rows[0]!.id;

  const clubRow = await pool.query<{ id: string }>(
    `INSERT INTO club (country_id, kind) VALUES ($1, 'club') RETURNING id`,
    [countryId],
  );
  const clubId = clubRow.rows[0]!.id;

  await pool.query(
    `INSERT INTO external_id (entity_type, entity_id, system, value)
     VALUES ('club', $1, $2, $3)`,
    [clubId, EXTERNAL_SYSTEM_TRANSFERMARKT, scope.clubTransfermarktId],
  );

  const seasonRow = await pool.query<{ id: string }>(
    `INSERT INTO season (label, starts_on, ends_on, calendar_kind)
     VALUES ($1, '1998-07-01', '1999-06-30', 'split_year') RETURNING id`,
    [scope.seasonLabel],
  );
  const seasonId = seasonRow.rows[0]!.id;

  await pool.query(`INSERT INTO team_season (club_id, season_id) VALUES ($1, $2)`, [
    clubId,
    seasonId,
  ]);

  return { clubId, seasonId };
}

/**
 * Seeds NationalTeam + Season (national_team_season) and links both TM and FKA team ExternalIds.
 * FK NT kits join via fkapi national_team ExternalId — never a Club row.
 */
export async function seedNationalTeamPrerequisites(
  pool: Pool,
  scope: NationalTeamTestFixtureScope,
): Promise<{ nationalTeamId: string; seasonId: string }> {
  const countryRow = await pool.query<{ id: string }>(
    `INSERT INTO country (iso3166) VALUES ('DK') RETURNING id`,
  );
  const countryId = countryRow.rows[0]!.id;

  const ntRow = await pool.query<{ id: string }>(
    `INSERT INTO national_team (country_id, gender) VALUES ($1, 'men') RETURNING id`,
    [countryId],
  );
  const nationalTeamId = ntRow.rows[0]!.id;

  await pool.query(
    `INSERT INTO external_id (entity_type, entity_id, system, value)
     VALUES ('national_team', $1, $2, $3)`,
    [nationalTeamId, EXTERNAL_SYSTEM_TRANSFERMARKT, scope.nationalTeamTransfermarktId],
  );
  await pool.query(
    `INSERT INTO external_id (entity_type, entity_id, system, value)
     VALUES ('national_team', $1, $2, $3)`,
    [nationalTeamId, EXTERNAL_SYSTEM_FKAPI, scope.nationalTeamFkApiId],
  );

  const seasonRow = await pool.query<{ id: string }>(
    `INSERT INTO season (label, starts_on, ends_on, calendar_kind)
     VALUES ($1, '2010-01-01', '2010-12-31', 'calendar') RETURNING id`,
    [scope.seasonLabel],
  );
  const seasonId = seasonRow.rows[0]!.id;

  await pool.query(
    `INSERT INTO national_team_season (national_team_id, season_id) VALUES ($1, $2)`,
    [nationalTeamId, seasonId],
  );

  return { nationalTeamId, seasonId };
}

/** TM + Season only — no fkapi external_id. For catalog link tests (Denmark 3436). */
export async function seedNationalTeamTransfermarktSeasonOnly(
  pool: Pool,
  input: { transfermarktId: string; seasonLabel: string },
): Promise<{ nationalTeamId: string; seasonId: string }> {
  const countryRow = await pool.query<{ id: string }>(
    `INSERT INTO country (iso3166) VALUES ('DK') RETURNING id`,
  );
  const countryId = countryRow.rows[0]?.id;
  if (!countryId) {
    throw new Error("Failed to insert country for national team prerequisite");
  }

  const ntRow = await pool.query<{ id: string }>(
    `INSERT INTO national_team (country_id, gender) VALUES ($1, 'men') RETURNING id`,
    [countryId],
  );
  const nationalTeamId = ntRow.rows[0]?.id;
  if (!nationalTeamId) {
    throw new Error("Failed to insert national team prerequisite");
  }

  await pool.query(
    `INSERT INTO external_id (entity_type, entity_id, system, value)
     VALUES ('national_team', $1, $2, $3)`,
    [nationalTeamId, EXTERNAL_SYSTEM_TRANSFERMARKT, input.transfermarktId],
  );

  const seasonRow = await pool.query<{ id: string }>(
    `INSERT INTO season (label, starts_on, ends_on, calendar_kind)
     VALUES ($1, '2010-01-01', '2010-12-31', 'calendar') RETURNING id`,
    [input.seasonLabel],
  );
  const seasonId = seasonRow.rows[0]?.id;
  if (!seasonId) {
    throw new Error("Failed to insert season for national team prerequisite");
  }

  await pool.query(
    `INSERT INTO national_team_season (national_team_id, season_id) VALUES ($1, $2)`,
    [nationalTeamId, seasonId],
  );

  return { nationalTeamId, seasonId };
}

type FixtureFile = {
  kits: Record<string, unknown>[];
};

/** Fixture kits remapped to the allocated scope — avoids hardcoded Transfermarkt ids in tests. */
export function createScopedFixtureFetchAdapter(scope: TestFixtureScope): FkFetchAdapter {
  return {
    async fetchKits(): Promise<FkRawKit[]> {
      const raw = await readFile(FIXTURE_PATH, "utf8");
      // SAFETY: the fixture is committed in this repository and normalizeRawKit rejects
      // any record that does not parse into an FkRawKit.
      const parsed = JSON.parse(raw) as FixtureFile;
      const kits: FkRawKit[] = [];

      for (const item of parsed.kits) {
        const remapped = {
          ...item,
          clubTransfermarktId: scope.clubTransfermarktId,
          seasonLabel: scope.seasonLabel,
        };
        const normalized = normalizeRawKit(remapped);
        if (normalized) {
          kits.push(normalized);
        }
      }

      return kits;
    },
  };
}

/** NationalTeam fixture kits remapped to the allocated FKA team id + season. */
export function createScopedNationalTeamFixtureFetchAdapter(
  scope: NationalTeamTestFixtureScope,
): FkFetchAdapter {
  return {
    async fetchKits(): Promise<FkRawKit[]> {
      const raw = await readFile(NT_FIXTURE_PATH, "utf8");
      // SAFETY: the fixture is committed in this repository and normalizeRawKit rejects
      // any record that does not parse into an FkRawKit.
      const parsed = JSON.parse(raw) as FixtureFile;
      const kits: FkRawKit[] = [];

      for (const item of parsed.kits) {
        const remapped = {
          ...item,
          nationalTeamFkApiId: scope.nationalTeamFkApiId,
          seasonLabel: scope.seasonLabel,
        };
        const normalized = normalizeRawKit(remapped);
        if (normalized) {
          kits.push(normalized);
        }
      }

      return kits;
    },
  };
}

export { FIXTURE_PATH, NT_FIXTURE_PATH };
