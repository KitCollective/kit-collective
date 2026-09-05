import {
  normalizeTransfermarktClubId,
  resolveNationalTeam,
  resolveSeasonRef,
} from "@kit/seed-shared";
import { Pool } from "pg";
import type {
  FkFetchAdapter,
  FkFetchScope,
  FkRawKit,
  ObjectStoreAdapter,
  SeedRunResult,
} from "./types.js";
import {
  EXTERNAL_SYSTEM_FKAPI,
  EXTERNAL_SYSTEM_TRANSFERMARKT,
  isClubKit,
  isNationalTeamKit,
} from "./types.js";

export type MapperOptions = {
  databaseUrl: string;
  fetchAdapter: FkFetchAdapter;
  objectStore: ObjectStoreAdapter;
  scope: FkFetchScope;
};

export async function runFkSeed(options: MapperOptions): Promise<SeedRunResult> {
  const pool = new Pool({ connectionString: options.databaseUrl });

  try {
    let fetchScope = options.scope;
    if (options.scope.kind === "national_team") {
      const fkApiId = await resolveOrLinkNationalTeamFkApiId(
        pool,
        options.scope.nationalTeamRef,
        options.scope.season,
      );
      fetchScope = {
        kind: "national_team",
        nationalTeamRef: fkApiId,
        season: options.scope.season,
      };
    }

    const rawKits = await options.fetchAdapter.fetchKits(fetchScope);
    if (rawKits.length === 0) {
      return { kitsUpserted: 0, photosWritten: 0 };
    }

    if (options.scope.kind !== "national_team") {
      await assertScopePrerequisites(pool, options.scope, rawKits);
    }

    let kitsUpserted = 0;
    let photosWritten = 0;

    for (const rawKit of rawKits) {
      assertKitHasArchiveBytes(rawKit);

      let clubId: string | null = null;
      let nationalTeamId: string | null = null;
      let seasonId: string;

      if (isNationalTeamKit(rawKit)) {
        const nationalTeamRow = await findNationalTeamByFkApiId(pool, rawKit.nationalTeamFkApiId);
        const seasonRow = nationalTeamRow
          ? await findSeasonForNationalTeam(pool, nationalTeamRow.entityId, rawKit.seasonLabel)
          : undefined;

        if (!nationalTeamRow || !seasonRow) {
          throw new Error(
            `Missing national team or season for scope: fkaTeam=${rawKit.nationalTeamFkApiId} season=${rawKit.seasonLabel}`,
          );
        }

        nationalTeamId = nationalTeamRow.entityId;
        seasonId = seasonRow.id;
      } else if (isClubKit(rawKit)) {
        const clubRow = await findClubByTransfermarktId(pool, rawKit.clubTransfermarktId);
        const seasonRow = clubRow
          ? await findSeasonForClub(pool, clubRow.entityId, rawKit.seasonLabel)
          : undefined;

        if (!clubRow || !seasonRow) {
          throw new Error(
            `Missing club or season for scope: club=${rawKit.clubTransfermarktId} season=${rawKit.seasonLabel}`,
          );
        }

        clubId = clubRow.entityId;
        seasonId = seasonRow.id;
      } else {
        throw new Error(`Kit ${rawKit.id} is neither a club kit nor a NationalTeam kit`);
      }

      const manufacturerId = rawKit.manufacturerName
        ? await upsertManufacturer(pool, rawKit.manufacturerName)
        : null;

      const kitId = await upsertKit(pool, {
        fkId: rawKit.id,
        clubId,
        nationalTeamId,
        seasonId,
        type: rawKit.type,
        manufacturerId,
        sponsorName: rawKit.sponsorName ?? null,
        primaryColorHex: rawKit.primaryColorHex ?? null,
        secondaryColorHex: rawKit.secondaryColorHex ?? null,
      });
      kitsUpserted += 1;

      photosWritten += await writeArchivePhoto(options.objectStore, pool, kitId, rawKit);
    }

    return { kitsUpserted, photosWritten };
  } finally {
    await pool.end();
  }
}

async function writeArchivePhoto(
  objectStore: ObjectStoreAdapter,
  pool: Pool,
  kitId: string,
  rawKit: FkRawKit,
): Promise<number> {
  if (!rawKit.imageBytes || rawKit.imageBytes.length === 0) {
    return 0;
  }

  const objectKey = `kit/${kitId}/archive.jpg`;
  await objectStore.putObject(objectKey, rawKit.imageBytes);
  const exists = await objectStore.objectExists(objectKey);
  if (!exists) {
    throw new Error(
      `Lane R2 object missing after putObject: ${objectKey}. Refusing accept without archive bytes in object store.`,
    );
  }
  const wrote = await upsertKitPhoto(pool, kitId, objectKey);
  return wrote ? 1 : 0;
}

function assertKitHasArchiveBytes(rawKit: FkRawKit): void {
  if (!rawKit.imageBytes || rawKit.imageBytes.length === 0) {
    throw new Error(
      `Kit ${rawKit.id} has no archive image bytes. Refusing accept without lane R2 object for this kit.`,
    );
  }
}

function transfermarktIdForNationalTeamRef(ref: string): string {
  return resolveNationalTeam(ref)?.transfermarktId ?? ref.trim();
}

async function resolveOrLinkNationalTeamFkApiId(
  pool: Pool,
  nationalTeamRef: string,
  seasonLabel: string,
): Promise<string> {
  const tmId = transfermarktIdForNationalTeamRef(nationalTeamRef);
  await assertNationalTeamSeasonPrerequisite(pool, tmId, seasonLabel);

  const linked = await findFkApiExternalIdForNationalTeam(pool, tmId);
  if (linked) {
    return linked;
  }

  const catalog = resolveNationalTeam(nationalTeamRef);
  if (!catalog?.fkApiTeamId) {
    throw new Error(
      `No FKA team id in catalog for NationalTeam ${nationalTeamRef}. Cannot fetch FK kits.`,
    );
  }

  const ntRow = await findNationalTeamByTransfermarktId(pool, tmId);
  if (!ntRow) {
    throw new Error(
      `Missing NationalTeam row for Transfermarkt id ${tmId}. Run Apify national-team grain for this scope first.`,
    );
  }

  await pool.query(
    `INSERT INTO external_id (entity_type, entity_id, system, value)
     VALUES ('national_team', $1, $2, $3)`,
    [ntRow.entityId, EXTERNAL_SYSTEM_FKAPI, catalog.fkApiTeamId],
  );

  return catalog.fkApiTeamId;
}

async function assertScopePrerequisites(
  pool: Pool,
  scope: FkFetchScope,
  rawKits: FkRawKit[],
): Promise<void> {
  if (scope.kind === "club") {
    const clubTmId = normalizeTransfermarktClubId(scope.clubExternalId);
    const seasonLabel = resolveSeasonRef(scope.competition, scope.season);
    await assertClubSeasonPrerequisite(pool, clubTmId, seasonLabel);
    return;
  }

  const pairs = new Map<string, { clubTmId: string; seasonLabel: string }>();
  for (const kit of rawKits) {
    if (!isClubKit(kit) || !kit.clubTransfermarktId) {
      continue;
    }
    const key = `${kit.clubTransfermarktId}:${kit.seasonLabel}`;
    pairs.set(key, {
      clubTmId: kit.clubTransfermarktId,
      seasonLabel: kit.seasonLabel,
    });
  }

  for (const { clubTmId, seasonLabel } of pairs.values()) {
    await assertClubSeasonPrerequisite(pool, clubTmId, seasonLabel);
  }
}

async function assertClubSeasonPrerequisite(
  pool: Pool,
  clubTmId: string,
  seasonLabel: string,
): Promise<void> {
  const clubRow = await findClubByTransfermarktId(pool, clubTmId);
  if (!clubRow) {
    throw new Error(
      `Missing Club row for Transfermarkt id ${clubTmId}. Run Apify seed for this scope first.`,
    );
  }

  const seasonRow = await findSeasonForClub(pool, clubRow.entityId, seasonLabel);
  if (!seasonRow) {
    throw new Error(
      `Missing Season row for label ${seasonLabel} and club ${clubTmId}. Run Apify seed for this scope first.`,
    );
  }
}

async function assertNationalTeamSeasonPrerequisite(
  pool: Pool,
  nationalTeamTmId: string,
  seasonLabel: string,
): Promise<void> {
  const ntRow = await findNationalTeamByTransfermarktId(pool, nationalTeamTmId);
  if (!ntRow) {
    throw new Error(
      `Missing NationalTeam row for Transfermarkt id ${nationalTeamTmId}. Run Apify national-team grain for this scope first.`,
    );
  }

  const seasonRow = await findSeasonForNationalTeam(pool, ntRow.entityId, seasonLabel);
  if (!seasonRow) {
    throw new Error(
      `Missing Season row for label ${seasonLabel} and NationalTeam ${nationalTeamTmId}. Run Apify national-team-season grain for this scope first.`,
    );
  }
}

async function findClubByTransfermarktId(
  pool: Pool,
  transfermarktId: string,
): Promise<{ entityId: string } | undefined> {
  const normalized = normalizeTransfermarktClubId(transfermarktId);
  const result = await pool.query<{ entity_id: string }>(
    `SELECT entity_id FROM external_id
     WHERE entity_type = 'club' AND system = $1 AND value = $2
     LIMIT 1`,
    [EXTERNAL_SYSTEM_TRANSFERMARKT, normalized],
  );
  return result.rows[0] ? { entityId: result.rows[0].entity_id } : undefined;
}

async function findNationalTeamByTransfermarktId(
  pool: Pool,
  transfermarktId: string,
): Promise<{ entityId: string } | undefined> {
  const result = await pool.query<{ entity_id: string }>(
    `SELECT entity_id FROM external_id
     WHERE entity_type = 'national_team' AND system = $1 AND value = $2
     LIMIT 1`,
    [EXTERNAL_SYSTEM_TRANSFERMARKT, transfermarktId],
  );
  return result.rows[0] ? { entityId: result.rows[0].entity_id } : undefined;
}

async function findFkApiExternalIdForNationalTeam(
  pool: Pool,
  transfermarktId: string,
): Promise<string | undefined> {
  const result = await pool.query<{ value: string }>(
    `SELECT ei_fk.value FROM external_id ei_tm
     INNER JOIN external_id ei_fk ON ei_fk.entity_id = ei_tm.entity_id
       AND ei_fk.entity_type = 'national_team' AND ei_fk.system = $1
     WHERE ei_tm.entity_type = 'national_team' AND ei_tm.system = $2 AND ei_tm.value = $3
     LIMIT 1`,
    [EXTERNAL_SYSTEM_FKAPI, EXTERNAL_SYSTEM_TRANSFERMARKT, transfermarktId],
  );
  return result.rows[0]?.value;
}

async function findNationalTeamByFkApiId(
  pool: Pool,
  fkApiId: string,
): Promise<{ entityId: string } | undefined> {
  const result = await pool.query<{ entity_id: string }>(
    `SELECT entity_id FROM external_id
     WHERE entity_type = 'national_team' AND system = $1 AND value = $2
     LIMIT 1`,
    [EXTERNAL_SYSTEM_FKAPI, fkApiId],
  );
  return result.rows[0] ? { entityId: result.rows[0].entity_id } : undefined;
}

async function findSeasonForClub(
  pool: Pool,
  clubId: string,
  seasonLabel: string,
): Promise<{ id: string } | undefined> {
  const result = await pool.query<{ id: string }>(
    `SELECT s.id FROM season s
     INNER JOIN team_season ts ON ts.season_id = s.id
     WHERE ts.club_id = $1 AND s.label = $2
     LIMIT 1`,
    [clubId, seasonLabel],
  );
  return result.rows[0];
}

async function findSeasonForNationalTeam(
  pool: Pool,
  nationalTeamId: string,
  seasonLabel: string,
): Promise<{ id: string } | undefined> {
  const result = await pool.query<{ id: string }>(
    `SELECT s.id FROM season s
     INNER JOIN national_team_season nts ON nts.season_id = s.id
     WHERE nts.national_team_id = $1 AND s.label = $2
     LIMIT 1`,
    [nationalTeamId, seasonLabel],
  );
  return result.rows[0];
}

async function findKitByFkId(pool: Pool, fkId: string): Promise<{ entityId: string } | undefined> {
  const result = await pool.query<{ entity_id: string }>(
    `SELECT entity_id FROM external_id
     WHERE entity_type = 'kit' AND system = $1 AND value = $2
     LIMIT 1`,
    [EXTERNAL_SYSTEM_FKAPI, fkId],
  );
  return result.rows[0] ? { entityId: result.rows[0].entity_id } : undefined;
}

async function upsertManufacturer(pool: Pool, name: string): Promise<string> {
  const existing = await pool.query<{ id: string }>(
    `SELECT m.id FROM manufacturer m
     INNER JOIN catalog_label cl ON cl.entity_type = 'manufacturer'
       AND cl.entity_id = m.id
       AND cl.locale = 'mul'
       AND cl.kind = 'label'
       AND cl.text = $1
     LIMIT 1`,
    [name],
  );

  if (existing.rows[0]) {
    return existing.rows[0].id;
  }

  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO manufacturer DEFAULT VALUES RETURNING id`,
  );
  const manufacturerId = inserted.rows[0]!.id;

  await pool.query(
    `INSERT INTO catalog_label (entity_type, entity_id, locale, kind, text, source)
     VALUES ('manufacturer', $1, 'mul', 'label', $2, 'seed')`,
    [manufacturerId, name],
  );

  return manufacturerId;
}

type UpsertKitInput = {
  fkId: string;
  clubId: string | null;
  nationalTeamId: string | null;
  seasonId: string;
  type: FkRawKit["type"];
  manufacturerId: string | null;
  sponsorName: string | null;
  primaryColorHex: string | null;
  secondaryColorHex: string | null;
};

async function upsertKit(pool: Pool, input: UpsertKitInput): Promise<string> {
  const existing = await findKitByFkId(pool, input.fkId);

  if (existing) {
    await pool.query(
      `UPDATE kit SET club_id = $1, national_team_id = $2, season_id = $3, type = $4,
       manufacturer_id = $5, sponsor_name = $6, primary_color_hex = $7, secondary_color_hex = $8
       WHERE id = $9`,
      [
        input.clubId,
        input.nationalTeamId,
        input.seasonId,
        input.type,
        input.manufacturerId,
        input.sponsorName,
        input.primaryColorHex,
        input.secondaryColorHex,
        existing.entityId,
      ],
    );
    return existing.entityId;
  }

  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO kit (club_id, national_team_id, season_id, type, manufacturer_id, sponsor_name, primary_color_hex, secondary_color_hex)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [
      input.clubId,
      input.nationalTeamId,
      input.seasonId,
      input.type,
      input.manufacturerId,
      input.sponsorName,
      input.primaryColorHex,
      input.secondaryColorHex,
    ],
  );
  const kitId = inserted.rows[0]!.id;

  await pool.query(
    `INSERT INTO external_id (entity_type, entity_id, system, value)
     VALUES ('kit', $1, $2, $3)`,
    [kitId, EXTERNAL_SYSTEM_FKAPI, input.fkId],
  );

  return kitId;
}

async function upsertKitPhoto(pool: Pool, kitId: string, objectKey: string): Promise<boolean> {
  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM kit_photo WHERE kit_id = $1 AND object_key = $2 LIMIT 1`,
    [kitId, objectKey],
  );

  if (existing.rows[0]) {
    return false;
  }

  await pool.query(
    `INSERT INTO kit_photo (kit_id, object_key, rights, visibility)
     VALUES ($1, $2, 'unresolved', 'admin_only')`,
    [kitId, objectKey],
  );

  return true;
}
