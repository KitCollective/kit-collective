import {
  catalogMark,
  createDb,
  type Db,
  externalId,
  honour,
  SEED_CREATE_DB_OPTIONS,
} from "@kit/db";
import type { CatalogMarkEntityType } from "@kit/domain";
import { and, asc, eq } from "drizzle-orm";
import {
  catalogMarkObjectKeyFromCdnUrl,
  clubCrestCdnUrl,
  clubCrestObjectKey,
  leagueBadgeCdnUrl,
  leagueBadgeObjectKey,
} from "./catalog-mark-cdn.js";
import type { CatalogMarksFetcher } from "./fetch/adapter.js";
import { TransfermarktCircuitOpenError } from "./fetch/transfermarkt-rate-limit.js";
import { parseLane, resolveDatabaseUrl } from "./lane.js";
import type { PortraitStore } from "./map/index.js";
import { resolvePortraitStoreFromEnv } from "./portrait-store.js";
import { describeSeedError, seedProgress } from "./progress.js";
import type { Lane } from "./types.js";
import { TM_SYSTEM } from "./types.js";

export interface CatalogMarksSummary {
  clubs: number;
  clubMarksCreated: number;
  clubMarksExisting: number;
  clubHoles: number;
  leagues: number;
  leagueMarksCreated: number;
  leagueMarksExisting: number;
  leagueHoles: number;
  honoursVisited: number;
  honourMarksCreated: number;
  honourMarksExisting: number;
  honourHoles: number;
  failures: Array<{ kind: "club" | "league" | "honour"; externalId: string; error: string }>;
  stopped?: "circuit_open";
}

function emptySummary(): CatalogMarksSummary {
  return {
    clubs: 0,
    clubMarksCreated: 0,
    clubMarksExisting: 0,
    clubHoles: 0,
    leagues: 0,
    leagueMarksCreated: 0,
    leagueMarksExisting: 0,
    leagueHoles: 0,
    honoursVisited: 0,
    honourMarksCreated: 0,
    honourMarksExisting: 0,
    honourHoles: 0,
    failures: [],
  };
}

async function hasMark(
  db: Db,
  entityType: CatalogMarkEntityType,
  entityId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: catalogMark.id })
    .from(catalogMark)
    .where(and(eq(catalogMark.entityType, entityType), eq(catalogMark.entityId, entityId)))
    .limit(1);
  return Boolean(row);
}

async function writeMark(
  db: Db,
  entityType: CatalogMarkEntityType,
  entityId: string,
  objectKey: string,
  bytes: Uint8Array,
  store: PortraitStore,
): Promise<"created" | "existing"> {
  await store.putObject(objectKey, bytes);
  const [existing] = await db
    .select({ id: catalogMark.id })
    .from(catalogMark)
    .where(and(eq(catalogMark.entityType, entityType), eq(catalogMark.entityId, entityId)))
    .limit(1);
  if (existing) {
    await db.update(catalogMark).set({ objectKey }).where(eq(catalogMark.id, existing.id));
    return "existing";
  }
  await db.insert(catalogMark).values({
    entityType,
    entityId,
    objectKey,
    rights: "unresolved",
    visibility: "admin_only",
  });
  return "created";
}

async function listLaneEntities(
  db: Db,
  entityType: "club" | "league",
): Promise<Array<{ entityId: string; value: string }>> {
  const rows = await db
    .select({ entityId: externalId.entityId, value: externalId.value })
    .from(externalId)
    .where(and(eq(externalId.entityType, entityType), eq(externalId.system, TM_SYSTEM)))
    .orderBy(asc(externalId.value));
  return rows;
}

export async function backfillCatalogMarks(options: {
  db: Db;
  fetcher: CatalogMarksFetcher;
  store: PortraitStore;
  progress?: (message: string) => void;
}): Promise<CatalogMarksSummary> {
  const summary = emptySummary();
  const progress = options.progress ?? seedProgress;

  /** Same trophy/logo URL is reused across clubs; cache holes so a 404 is not re-fetched. */
  const cdnCache = new Map<string, Uint8Array | null>();
  const fetchCachedCdn = async (src: string, objectKey: string): Promise<Uint8Array | undefined> => {
    if (cdnCache.has(objectKey)) {
      return cdnCache.get(objectKey) ?? undefined;
    }
    const bytes = await options.fetcher.fetchCdnBytes(src);
    cdnCache.set(objectKey, bytes ?? null);
    return bytes;
  };

  const clubs = await listLaneEntities(options.db, "club");
  summary.clubs = clubs.length;
  for (const clubRow of clubs) {
    if (summary.stopped) {
      break;
    }
    try {
      const crestKey = clubCrestObjectKey(clubRow.value);
      if (await hasMark(options.db, "club", clubRow.entityId)) {
        summary.clubMarksExisting += 1;
      } else {
        const bytes = await fetchCachedCdn(clubCrestCdnUrl(clubRow.value), crestKey);
        if (!bytes) {
          summary.clubHoles += 1;
        } else {
          const written = await writeMark(
            options.db,
            "club",
            clubRow.entityId,
            crestKey,
            bytes,
            options.store,
          );
          if (written === "created") {
            summary.clubMarksCreated += 1;
          } else {
            summary.clubMarksExisting += 1;
          }
        }
      }

      const honourRows = await options.db
        .select({
          id: honour.id,
          seasonLabel: honour.seasonLabel,
          title: honour.title,
        })
        .from(honour)
        .where(and(eq(honour.subjectType, "club"), eq(honour.subjectId, clubRow.entityId)));
      const unmarkedHonours = [];
      for (const row of honourRows) {
        if (await hasMark(options.db, "honour", row.id)) {
          summary.honourMarksExisting += 1;
        } else {
          unmarkedHonours.push(row);
        }
      }
      if (unmarkedHonours.length === 0) {
        continue;
      }
      const parsed = await options.fetcher.fetchClubHonours(clubRow.value);
      for (const parsedRow of parsed) {
        summary.honoursVisited += 1;
        const match = unmarkedHonours.find(
          (row) => row.title === parsedRow.title && (row.seasonLabel ?? null) === parsedRow.seasonLabel,
        );
        if (!match || !parsedRow.imageSrc) {
          continue;
        }
        const objectKey = catalogMarkObjectKeyFromCdnUrl(parsedRow.imageSrc);
        if (!objectKey) {
          continue;
        }
        if (await hasMark(options.db, "honour", match.id)) {
          summary.honourMarksExisting += 1;
          continue;
        }
        const bytes = await fetchCachedCdn(parsedRow.imageSrc, objectKey);
        if (!bytes) {
          summary.honourHoles += 1;
          continue;
        }
        const written = await writeMark(
          options.db,
          "honour",
          match.id,
          objectKey,
          bytes,
          options.store,
        );
        if (written === "created") {
          summary.honourMarksCreated += 1;
        } else {
          summary.honourMarksExisting += 1;
        }
      }
    } catch (error: unknown) {
      summary.failures.push({
        kind: "club",
        externalId: clubRow.value,
        error: describeSeedError(error),
      });
      if (error instanceof TransfermarktCircuitOpenError) {
        summary.stopped = "circuit_open";
        progress("catalog-marks stopped circuit_open");
      }
    }
  }

  const leagues = await listLaneEntities(options.db, "league");
  summary.leagues = leagues.length;
  for (const leagueRow of leagues) {
    if (summary.stopped) {
      break;
    }
    try {
      if (await hasMark(options.db, "league", leagueRow.entityId)) {
        summary.leagueMarksExisting += 1;
        continue;
      }
      const badgeKey = leagueBadgeObjectKey(leagueRow.value);
      const bytes = await fetchCachedCdn(leagueBadgeCdnUrl(leagueRow.value), badgeKey);
      if (!bytes) {
        summary.leagueHoles += 1;
        continue;
      }
      const written = await writeMark(
        options.db,
        "league",
        leagueRow.entityId,
        badgeKey,
        bytes,
        options.store,
      );
      if (written === "created") {
        summary.leagueMarksCreated += 1;
      } else {
        summary.leagueMarksExisting += 1;
      }
    } catch (error: unknown) {
      summary.failures.push({
        kind: "league",
        externalId: leagueRow.value,
        error: describeSeedError(error),
      });
      if (error instanceof TransfermarktCircuitOpenError) {
        summary.stopped = "circuit_open";
        progress("catalog-marks stopped circuit_open");
      }
    }
  }

  progress(
    `catalog-marks clubs=${summary.clubMarksCreated}/${summary.clubs} leagues=${summary.leagueMarksCreated}/${summary.leagues} honours=${summary.honourMarksCreated} holes=${summary.clubHoles + summary.leagueHoles + summary.honourHoles}`,
  );
  return summary;
}

export async function runCatalogMarksFromCli(options: {
  lane: Lane;
  fetcher: CatalogMarksFetcher;
  databaseUrl?: string;
  portraitStore?: PortraitStore;
}): Promise<CatalogMarksSummary> {
  const lane = parseLane(options.lane);
  const databaseUrl = options.databaseUrl ?? resolveDatabaseUrl(lane);
  const store = options.portraitStore ?? resolvePortraitStoreFromEnv();
  if (!store) {
    throw new Error("catalog-marks needs R2_* or SEED_OBJECT_DIR so mark bytes have a home");
  }
  const { db, pool } = createDb(databaseUrl, SEED_CREATE_DB_OPTIONS);
  try {
    return await backfillCatalogMarks({ db, fetcher: options.fetcher, store });
  } finally {
    await pool.end();
  }
}
