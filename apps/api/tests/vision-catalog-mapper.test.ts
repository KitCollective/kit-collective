import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  catalogLabel,
  club,
  country,
  createDb,
  isResetDatabaseAllowed,
  kit,
  league,
  manufacturer,
  patch,
  player,
  playerClubSeason,
  resetDatabase,
  season,
  teamSeason,
} from "@kit/db";
import { beforeEach, describe, expect, it } from "vitest";
import { VisionCatalogMapper } from "../src/vision/vision-catalog-mapper.js";

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../packages/db/migrations",
);

/** Local disposable Postgres only. Never DATABASE_URL / Coolify development. */
function resolveLocalApiTestDatabaseUrl(): string {
  const fallback = "postgresql://kit:kit@localhost:5432/kit_api_test";
  const candidate = process.env.API_TEST_DATABASE_URL ?? fallback;
  let parsed: URL;
  try {
    parsed = new URL(candidate.replace(/^postgres:/, "postgresql:"));
  } catch {
    throw new Error(
      "API_TEST_DATABASE_URL is not a valid Postgres URL. Vision mapper tests never fall back to DATABASE_URL.",
    );
  }
  const host = parsed.hostname.toLowerCase();
  if (host !== "localhost" && host !== "127.0.0.1") {
    throw new Error(
      "Vision catalog mapper tests refuse a non-localhost Postgres URL. Never reset Coolify development.",
    );
  }
  if (!isResetDatabaseAllowed(candidate)) {
    throw new Error(
      "Vision catalog mapper tests refuse a non-test database name. Never reset Coolify development.",
    );
  }
  return candidate;
}

const DATABASE_URL = resolveLocalApiTestDatabaseUrl();

describe("VisionCatalogMapper", () => {
  beforeEach(async () => {
    await resetDatabase(DATABASE_URL, migrationsFolder);
  });

  it("locks season and type from a unique manufacturer+sponsor kit, ignoring a wrong season hint", async () => {
    const fixture = await insertClubWithKits([
      { label: "2019/20", type: "home", manufacturer: "Hummel", sponsor: "32Red" },
      { label: "2020/21", type: "away", manufacturer: "Castore", sponsor: "32Red" },
    ]);

    const { db, pool } = createDb(DATABASE_URL);
    const mapped = await new VisionCatalogMapper(db).mapHints({
      clubHint: "Rangers FC",
      seasonHint: "2020/21",
      kitType: "away",
      manufacturerHint: "Hummel",
      sponsorHint: "32Red",
      fieldConfidence: { club: 0.9, season: 0.7, kitType: 0.7 },
    });
    await pool.end();

    expect(mapped?.clubId).toBe(fixture.clubId);
    expect(mapped?.seasonId).toBe(fixture.kits[0]!.seasonId);
    expect(mapped?.catalogKitId).toBe(fixture.kits[0]!.kitId);
    expect(mapped?.type).toBe("home");
    expect(mapped?.confidences?.season).toBe(95);
    expect(mapped?.confidences?.kitType).toBe(95);
  });

  it("omits season and type when manufacturer+sponsor hits more than one kit of the same type", async () => {
    const fixture = await insertClubWithKits([
      { label: "2019/20", type: "home", manufacturer: "Hummel", sponsor: "32Red" },
      { label: "2020/21", type: "home", manufacturer: "Hummel", sponsor: "32Red" },
    ]);

    const { db, pool } = createDb(DATABASE_URL);
    const mapper = new VisionCatalogMapper(db);
    const mapped = await mapper.mapHints({
      clubHint: "Rangers FC",
      seasonHint: "2020/21",
      kitType: "home",
      manufacturerHint: "Hummel",
      sponsorHint: "32Red",
      fieldConfidence: { club: 0.9, season: 0.85, kitType: 0.8 },
    });
    expect(mapped?.clubId).toBe(fixture.clubId);
    expect(mapped?.seasonId).toBeUndefined();
    expect(mapped?.type).toBeUndefined();
    expect(mapped?.catalogKitId).toBeUndefined();

    const hits = await mapper.listObservableKitHits({
      clubHint: "Rangers FC",
      manufacturerHint: "Hummel",
      sponsorHint: "32Red",
    });
    await pool.end();

    expect(hits).toHaveLength(2);
  });

  it("omits season even when the label matches, if manufacturer and sponsor are missing", async () => {
    await insertClubWithKits([
      { label: "2023/24", type: "home", manufacturer: "Adidas", sponsor: "Carlsberg" },
    ]);

    const { db, pool } = createDb(DATABASE_URL);
    const mapped = await new VisionCatalogMapper(db).mapHints({
      clubHint: "Rangers FC",
      seasonHint: "2023/24",
      kitType: "home",
      fieldConfidence: { club: 0.9, season: 0.9, kitType: 0.9 },
    });
    await pool.end();

    expect(mapped?.clubId).toBeDefined();
    expect(mapped?.seasonId).toBeUndefined();
    expect(mapped?.type).toBeUndefined();
    expect(mapped?.catalogKitId).toBeUndefined();
  });

  it("picks the unique candidate after a refinement season and type among ambiguous kits", async () => {
    const fixture = await insertClubWithKits([
      { label: "2019/20", type: "home", manufacturer: "Hummel", sponsor: "32Red" },
      { label: "2020/21", type: "away", manufacturer: "Hummel", sponsor: "32Red" },
    ]);

    const { db, pool } = createDb(DATABASE_URL);
    const mapped = await new VisionCatalogMapper(db).mapHints(
      {
        clubHint: "Rangers FC",
        seasonHint: "2019/20",
        kitType: "home",
        manufacturerHint: "Hummel",
        sponsorHint: "32Red",
      },
      { amongKitIds: fixture.kits.map((row) => row.kitId) },
    );
    await pool.end();

    expect(mapped?.catalogKitId).toBe(fixture.kits[0]!.kitId);
    expect(mapped?.seasonId).toBe(fixture.kits[0]!.seasonId);
    expect(mapped?.type).toBe("home");
  });

  it("maps player number and patch hints on the catalog-locked season", async () => {
    const fixture = await insertClubWithKits([
      { label: "2023/24", type: "home", manufacturer: "Hummel", sponsor: "Carlsberg" },
    ]);

    const { db, pool } = createDb(DATABASE_URL);
    const [insertedPlayer] = await db.insert(player).values({}).returning({ id: player.id });
    await db.insert(playerClubSeason).values({
      playerId: insertedPlayer!.id,
      clubId: fixture.clubId,
      seasonId: fixture.kits[0]!.seasonId,
      squadNumber: 10,
    });
    await db.insert(catalogLabel).values({
      entityType: "player",
      entityId: insertedPlayer!.id,
      locale: "da",
      kind: "label",
      text: "Jonas Wind",
      source: "seed",
    });
    const [insertedPatch] = await db
      .insert(patch)
      .values({ seasonId: fixture.kits[0]!.seasonId, leagueId: fixture.leagueId })
      .returning({ id: patch.id });
    await db.insert(catalogLabel).values({
      entityType: "patch",
      entityId: insertedPatch!.id,
      locale: "da",
      kind: "label",
      text: "Superligaen",
      source: "seed",
    });
    await pool.end();

    const { db: mapperDb, pool: mapperPool } = createDb(DATABASE_URL);
    const mapped = await new VisionCatalogMapper(mapperDb).mapHints({
      clubHint: "Rangers FC",
      manufacturerHint: "Hummel",
      sponsorHint: "Carlsberg",
      playerNumberHint: "10",
      patchHint: "Superliga",
      confidence: 0.8,
    });
    await mapperPool.end();

    expect(mapped?.playerId).toBe(insertedPlayer!.id);
    expect(mapped?.playerNumber).toBe("10");
    expect(mapped?.patchId).toBe(insertedPatch!.id);
    expect(mapped?.catalogKitId).toBe(fixture.kits[0]!.kitId);
  });

  it("locks the unique colour among kits that share manufacturer and sponsor", async () => {
    const fixture = await insertClubWithKits([
      {
        label: "2019/20",
        type: "home",
        manufacturer: "Puma",
        sponsor: "Emirates",
        colorNames: "white, red",
      },
      {
        label: "2020/21",
        type: "home",
        manufacturer: "Puma",
        sponsor: "Emirates",
        colorNames: "navy",
      },
    ]);

    const { db, pool } = createDb(DATABASE_URL);
    const mapped = await new VisionCatalogMapper(db).mapHints({
      clubHint: "Rangers FC",
      manufacturerHint: "Puma",
      sponsorHint: "Emirates",
      kitType: "home",
      colorHint: "white with red trim",
      fieldConfidence: { club: 0.9, season: 0.4, kitType: 0.8 },
    });
    await pool.end();

    expect(mapped?.catalogKitId).toBe(fixture.kits[0]!.kitId);
    expect(mapped?.confidences?.season).toBe(95);
  });

  it("locks a unique manufacturer kit on the club when sponsor is missing", async () => {
    const fixture = await insertClubWithKits([
      { label: "2023/24", type: "home", manufacturer: "Castore" },
    ]);

    const { db, pool } = createDb(DATABASE_URL);
    const mapped = await new VisionCatalogMapper(db).mapHints({
      clubHint: "Rangers FC",
      manufacturerHint: "Castore",
      kitType: "home",
      fieldConfidence: { club: 0.9, kitType: 0.8 },
    });
    await pool.end();

    expect(mapped?.catalogKitId).toBe(fixture.kits[0]!.kitId);
    expect(mapped?.seasonId).toBe(fixture.kits[0]!.seasonId);
  });
});

type KitSpec = {
  label: string;
  type: "home" | "away";
  manufacturer: string;
  sponsor?: string;
  colorNames?: string;
};

async function insertClubWithKits(specs: KitSpec[]) {
  const { db, pool } = createDb(DATABASE_URL);
  const [insertedCountry] = await db
    .insert(country)
    .values({ iso3166: "GB" })
    .returning({ id: country.id });
  const [insertedLeague] = await db
    .insert(league)
    .values({ countryId: insertedCountry!.id })
    .returning({ id: league.id });
  const [insertedClub] = await db
    .insert(club)
    .values({ countryId: insertedCountry!.id, kind: "club" })
    .returning({ id: club.id });
  await db.insert(catalogLabel).values({
    entityType: "club",
    entityId: insertedClub!.id,
    locale: "en",
    kind: "label",
    text: "Rangers FC",
    source: "seed",
  });

  const kits: Array<{ kitId: string; seasonId: string }> = [];
  for (const spec of specs) {
    const [insertedSeason] = await db
      .insert(season)
      .values({
        leagueId: insertedLeague!.id,
        label: spec.label,
        startsOn: `${spec.label.slice(0, 4)}-07-01`,
        endsOn: `${String(Number.parseInt(spec.label.slice(0, 4), 10) + 1)}-06-30`,
        calendarKind: "split_year",
      })
      .returning({ id: season.id });
    await db.insert(teamSeason).values({
      clubId: insertedClub!.id,
      seasonId: insertedSeason!.id,
    });
    const [insertedManufacturer] = await db
      .insert(manufacturer)
      .values({})
      .returning({ id: manufacturer.id });
    await db.insert(catalogLabel).values({
      entityType: "manufacturer",
      entityId: insertedManufacturer!.id,
      locale: "en",
      kind: "label",
      text: spec.manufacturer,
      source: "seed",
    });
    const [insertedKit] = await db
      .insert(kit)
      .values({
        clubId: insertedClub!.id,
        seasonId: insertedSeason!.id,
        type: spec.type,
        manufacturerId: insertedManufacturer!.id,
        sponsorName: spec.sponsor ?? null,
        colorNames: spec.colorNames ?? null,
      })
      .returning({ id: kit.id });
    kits.push({ kitId: insertedKit!.id, seasonId: insertedSeason!.id });
  }

  await pool.end();
  return { clubId: insertedClub!.id, leagueId: insertedLeague!.id, kits };
}
