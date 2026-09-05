import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";
import { normalizeRawKit } from "../src/normalize.js";
import type { FkFetchAdapter, FkRawKit } from "../src/types.js";
import { EXTERNAL_SYSTEM_TRANSFERMARKT } from "../src/types.js";

const FIXTURE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/superliga-kits.json",
);

export type TestFixtureScope = {
  clubTransfermarktId: string;
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

export { FIXTURE_PATH };
