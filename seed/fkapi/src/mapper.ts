import { Pool } from "pg";
import type {
  FkFetchAdapter,
  FkFetchScope,
  FkRawKit,
  ObjectStoreAdapter,
  SeedRunResult,
} from "./types.js";
import { EXTERNAL_SYSTEM_FKAPI, EXTERNAL_SYSTEM_TRANSFERMARKT } from "./types.js";

export type MapperOptions = {
  databaseUrl: string;
  fetchAdapter: FkFetchAdapter;
  objectStore: ObjectStoreAdapter;
  scope: FkFetchScope;
};

export async function runFkSeed(options: MapperOptions): Promise<SeedRunResult> {
  const rawKits = await options.fetchAdapter.fetchKits(options.scope);
  if (rawKits.length === 0) {
    return { kitsUpserted: 0, photosWritten: 0 };
  }

  const pool = new Pool({ connectionString: options.databaseUrl });

  try {
    await assertScopePrerequisites(pool, rawKits);

    let kitsUpserted = 0;
    let photosWritten = 0;

    for (const rawKit of rawKits) {
      const clubRow = await findClubByTransfermarktId(pool, rawKit.clubTransfermarktId);
      const seasonRow = await findSeasonForClub(pool, clubRow!.entityId, rawKit.seasonLabel);

      if (!clubRow || !seasonRow) {
        throw new Error(
          `Missing club or season for scope: club=${rawKit.clubTransfermarktId} season=${rawKit.seasonLabel}`,
        );
      }

      const manufacturerId = rawKit.manufacturerName
        ? await upsertManufacturer(pool, rawKit.manufacturerName)
        : null;

      const kitId = await upsertKit(pool, {
        fkId: rawKit.id,
        clubId: clubRow.entityId,
        seasonId: seasonRow.id,
        type: rawKit.type,
        manufacturerId,
      });
      kitsUpserted += 1;

      if (rawKit.imageBytes && rawKit.imageBytes.length > 0) {
        const objectKey = `kit/${kitId}/archive.jpg`;
        await options.objectStore.putObject(objectKey, rawKit.imageBytes);
        const wrote = await upsertKitPhoto(pool, kitId, objectKey);
        if (wrote) {
          photosWritten += 1;
        }
      }
    }

    return { kitsUpserted, photosWritten };
  } finally {
    await pool.end();
  }
}

async function assertScopePrerequisites(pool: Pool, rawKits: FkRawKit[]): Promise<void> {
  const pairs = new Map<string, { clubTmId: string; seasonLabel: string }>();
  for (const kit of rawKits) {
    const key = `${kit.clubTransfermarktId}:${kit.seasonLabel}`;
    pairs.set(key, {
      clubTmId: kit.clubTransfermarktId,
      seasonLabel: kit.seasonLabel,
    });
  }

  for (const { clubTmId, seasonLabel } of pairs.values()) {
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
}

async function findClubByTransfermarktId(
  pool: Pool,
  transfermarktId: string,
): Promise<{ entityId: string } | undefined> {
  const result = await pool.query<{ entity_id: string }>(
    `SELECT entity_id FROM external_id
     WHERE entity_type = 'club' AND system = $1 AND value = $2
     LIMIT 1`,
    [EXTERNAL_SYSTEM_TRANSFERMARKT, transfermarktId],
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
  clubId: string;
  seasonId: string;
  type: FkRawKit["type"];
  manufacturerId: string | null;
};

async function upsertKit(pool: Pool, input: UpsertKitInput): Promise<string> {
  const existing = await findKitByFkId(pool, input.fkId);

  if (existing) {
    await pool.query(
      `UPDATE kit SET club_id = $1, season_id = $2, type = $3, manufacturer_id = $4
       WHERE id = $5`,
      [input.clubId, input.seasonId, input.type, input.manufacturerId, existing.entityId],
    );
    return existing.entityId;
  }

  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO kit (club_id, season_id, type, manufacturer_id)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [input.clubId, input.seasonId, input.type, input.manufacturerId],
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
