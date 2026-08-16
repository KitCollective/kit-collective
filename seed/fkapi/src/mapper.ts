import {
  catalogLabel,
  externalId,
  kit,
  kitPhoto,
  manufacturer,
  season,
  teamSeason,
} from "@kit/db";
import { createDb } from "@kit/db";
import { and, eq } from "drizzle-orm";
import type { FkFetchScope, FkRawKit, ObjectStoreAdapter, SeedRunResult } from "./types.js";
import {
  EXTERNAL_SYSTEM_FKAPI,
  EXTERNAL_SYSTEM_TRANSFERMARKT,
} from "./types.js";
import type { FkFetchAdapter } from "./types.js";

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

  const { db, pool } = createDb(options.databaseUrl);

  try {
    await assertScopePrerequisites(db, rawKits);

    let kitsUpserted = 0;
    let photosWritten = 0;

    for (const rawKit of rawKits) {
      const clubRow = await findClubByTransfermarktId(db, rawKit.clubTransfermarktId);
      const seasonRow = await findSeasonForClub(db, clubRow!.entityId, rawKit.seasonLabel);

      if (!clubRow || !seasonRow) {
        throw new Error(
          `Missing club or season for scope: club=${rawKit.clubTransfermarktId} season=${rawKit.seasonLabel}`,
        );
      }

      const manufacturerId = rawKit.manufacturerName
        ? await upsertManufacturer(db, rawKit.manufacturerName)
        : null;

      const kitId = await upsertKit(db, {
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
        const wrote = await upsertKitPhoto(db, kitId, objectKey);
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

async function assertScopePrerequisites(
  db: ReturnType<typeof createDb>["db"],
  rawKits: FkRawKit[],
): Promise<void> {
  const pairs = new Map<string, { clubTmId: string; seasonLabel: string }>();
  for (const kit of rawKits) {
    const key = `${kit.clubTransfermarktId}:${kit.seasonLabel}`;
    pairs.set(key, {
      clubTmId: kit.clubTransfermarktId,
      seasonLabel: kit.seasonLabel,
    });
  }

  for (const { clubTmId, seasonLabel } of pairs.values()) {
    const clubRow = await findClubByTransfermarktId(db, clubTmId);
    if (!clubRow) {
      throw new Error(
        `Missing Club row for Transfermarkt id ${clubTmId}. Run Apify seed for this scope first.`,
      );
    }

    const seasonRow = await findSeasonForClub(db, clubRow.entityId, seasonLabel);
    if (!seasonRow) {
      throw new Error(
        `Missing Season row for label ${seasonLabel} and club ${clubTmId}. Run Apify seed for this scope first.`,
      );
    }
  }
}

async function findClubByTransfermarktId(
  db: ReturnType<typeof createDb>["db"],
  transfermarktId: string,
): Promise<{ entityId: string } | undefined> {
  const rows = await db
    .select({ entityId: externalId.entityId })
    .from(externalId)
    .where(
      and(
        eq(externalId.entityType, "club"),
        eq(externalId.system, EXTERNAL_SYSTEM_TRANSFERMARKT),
        eq(externalId.value, transfermarktId),
      ),
    )
    .limit(1);
  return rows[0];
}

async function findSeasonForClub(
  db: ReturnType<typeof createDb>["db"],
  clubId: string,
  seasonLabel: string,
): Promise<{ id: string } | undefined> {
  const rows = await db
    .select({ id: season.id })
    .from(season)
    .innerJoin(teamSeason, eq(teamSeason.seasonId, season.id))
    .where(and(eq(teamSeason.clubId, clubId), eq(season.label, seasonLabel)))
    .limit(1);
  return rows[0];
}

async function findKitByFkId(
  db: ReturnType<typeof createDb>["db"],
  fkId: string,
): Promise<{ entityId: string } | undefined> {
  const rows = await db
    .select({ entityId: externalId.entityId })
    .from(externalId)
    .where(
      and(
        eq(externalId.entityType, "kit"),
        eq(externalId.system, EXTERNAL_SYSTEM_FKAPI),
        eq(externalId.value, fkId),
      ),
    )
    .limit(1);
  return rows[0];
}

async function upsertManufacturer(
  db: ReturnType<typeof createDb>["db"],
  name: string,
): Promise<string> {
  const existing = await db
    .select({ id: manufacturer.id })
    .from(manufacturer)
    .innerJoin(
      catalogLabel,
      and(
        eq(catalogLabel.entityType, "manufacturer"),
        eq(catalogLabel.entityId, manufacturer.id),
        eq(catalogLabel.locale, "mul"),
        eq(catalogLabel.kind, "label"),
        eq(catalogLabel.text, name),
      ),
    )
    .limit(1);

  if (existing[0]) {
    return existing[0].id;
  }

  const inserted = await db.insert(manufacturer).values({}).returning({ id: manufacturer.id });
  const manufacturerId = inserted[0]!.id;

  await db.insert(catalogLabel).values({
    entityType: "manufacturer",
    entityId: manufacturerId,
    locale: "mul",
    kind: "label",
    text: name,
    source: "seed",
  });

  return manufacturerId;
}

type UpsertKitInput = {
  fkId: string;
  clubId: string;
  seasonId: string;
  type: FkRawKit["type"];
  manufacturerId: string | null;
};

async function upsertKit(
  db: ReturnType<typeof createDb>["db"],
  input: UpsertKitInput,
): Promise<string> {
  const existing = await findKitByFkId(db, input.fkId);

  if (existing) {
    await db
      .update(kit)
      .set({
        clubId: input.clubId,
        seasonId: input.seasonId,
        type: input.type,
        manufacturerId: input.manufacturerId,
      })
      .where(eq(kit.id, existing.entityId));
    return existing.entityId;
  }

  const inserted = await db
    .insert(kit)
    .values({
      clubId: input.clubId,
      seasonId: input.seasonId,
      type: input.type,
      manufacturerId: input.manufacturerId,
    })
    .returning({ id: kit.id });

  const kitId = inserted[0]!.id;

  await db.insert(externalId).values({
    entityType: "kit",
    entityId: kitId,
    system: EXTERNAL_SYSTEM_FKAPI,
    value: input.fkId,
  });

  return kitId;
}

async function upsertKitPhoto(
  db: ReturnType<typeof createDb>["db"],
  kitId: string,
  objectKey: string,
): Promise<boolean> {
  const existing = await db
    .select({ id: kitPhoto.id })
    .from(kitPhoto)
    .where(and(eq(kitPhoto.kitId, kitId), eq(kitPhoto.objectKey, objectKey)))
    .limit(1);

  if (existing[0]) {
    return false;
  }

  await db.insert(kitPhoto).values({
    kitId,
    objectKey,
    rights: "unresolved",
    visibility: "admin_only",
  });

  return true;
}
