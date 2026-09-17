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
  nationalTeam,
  patch,
  player,
  playerClubSeason,
  resetDatabase,
  season,
  teamSeason,
} from "@kit/db";
import { Logger } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveIdentityJob } from "../dist/vision/vision-confidence.js";
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
  afterEach(() => {
    vi.restoreAllMocks();
  });

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
    expect(mapped?.kitHitCount).toBe(1);
    expect(mapped?.confidences?.season).toBe(95);
    expect(mapped?.confidences?.kitType).toBe(95);
  });

  it("persists kitHitCount 0 on catalog-miss visionRaw", async () => {
    const { db, pool } = createDb(DATABASE_URL);
    const mapped = await new VisionCatalogMapper(db).mapHints({
      clubHint: "Zyx Unknown",
      kitType: "home",
      seasonHint: "2023/24",
    });
    await pool.end();

    expect(mapped?.clubId).toBeUndefined();
    expect(mapped?.kitHitCount).toBe(0);
    expect(JSON.parse(mapped?.visionRaw ?? "{}")).toMatchObject({
      clubHint: "Zyx Unknown",
      kitHitCount: 0,
    });
  });

  it("omits catalogKitId but still maps season and type from hints when manufacturer+sponsor hits more than one kit of the same type", async () => {
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
    expect(mapped?.seasonId).toBe(fixture.kits[1]!.seasonId);
    expect(mapped?.type).toBe("home");
    expect(mapped?.catalogKitId).toBeUndefined();

    const hits = await mapper.listObservableKitHits({
      clubHint: "Rangers FC",
      manufacturerHint: "Hummel",
      sponsorHint: "32Red",
    });
    await pool.end();

    expect(hits).toHaveLength(2);
  });

  it("maps season and kit type from VLM hints when club matches but kit is not locked", async () => {
    const fixture = await insertClubWithKits([
      { label: "2023/24", type: "home", manufacturer: "Adidas", sponsor: "Carlsberg" },
    ]);

    const { db, pool } = createDb(DATABASE_URL);
    const mapped = await new VisionCatalogMapper(db).mapHints({
      clubHint: "Rangers FC",
      seasonHint: "2023/24",
      kitType: "home",
      fieldConfidence: { club: 0.9, season: 0.65, kitType: 0.8 },
    });
    await pool.end();

    expect(mapped?.clubId).toBe(fixture.clubId);
    expect(mapped?.seasonId).toBe(fixture.kits[0]!.seasonId);
    expect(mapped?.type).toBe("home");
    expect(mapped?.catalogKitId).toBeUndefined();
    expect(mapped?.confidences?.season).toBe(95);
    expect(mapped?.confidences?.kitType).toBe(80);
  });

  it("maps player from squad when season is hint-mapped without a kit lock", async () => {
    const fixture = await insertClubWithKits([
      { label: "2023/24", type: "home", manufacturer: "Adidas", sponsor: "Carlsberg" },
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
    await pool.end();

    const { db: mapperDb, pool: mapperPool } = createDb(DATABASE_URL);
    const mapped = await new VisionCatalogMapper(mapperDb).mapHints({
      clubHint: "Rangers FC",
      seasonHint: "2023/24",
      kitType: "home",
      playerNumberHint: "10",
      fieldConfidence: { club: 0.9, season: 0.65, kitType: 0.8, player: 0.75 },
    });
    await mapperPool.end();

    expect(mapped?.clubId).toBe(fixture.clubId);
    expect(mapped?.seasonId).toBe(fixture.kits[0]!.seasonId);
    expect(mapped?.type).toBe("home");
    expect(mapped?.playerId).toBe(insertedPlayer!.id);
    expect(mapped?.playerNumber).toBe("10");
    expect(mapped?.catalogKitId).toBeUndefined();
  });

  it("omits season when the hint does not match a teamSeason row for the club", async () => {
    await insertClubWithKits([
      { label: "2023/24", type: "home", manufacturer: "Adidas", sponsor: "Carlsberg" },
    ]);

    const { db, pool } = createDb(DATABASE_URL);
    const mapped = await new VisionCatalogMapper(db).mapHints({
      clubHint: "Rangers FC",
      seasonHint: "2099/00",
      kitType: "home",
      fieldConfidence: { club: 0.9, season: 0.9, kitType: 0.9 },
    });
    await pool.end();

    expect(mapped?.clubId).toBeDefined();
    expect(mapped?.seasonId).toBeUndefined();
    expect(mapped?.type).toBe("home");
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

  it("maps a club from a CatalogLabel alias and from clubHintAlts", async () => {
    const fixture = await insertClubWithKits(
      [{ label: "2024/25", type: "home", manufacturer: "Adidas", sponsor: "Carlsberg" }],
      {
        clubLabel: "F.C. København",
        aliases: ["FCK", "FC Copenhagen"],
      },
    );

    const { db, pool } = createDb(DATABASE_URL);
    const mapper = new VisionCatalogMapper(db);
    const viaAlias = await mapper.mapHints({
      clubHint: "FCK",
      manufacturerHint: "Adidas",
      sponsorHint: "Carlsberg",
    });
    const viaAlt = await mapper.mapHints({
      clubHint: "Copenhagen Football Club",
      clubHintAlts: ["FCK"],
      manufacturerHint: "Adidas",
      sponsorHint: "Carlsberg",
    });
    const viaFoldedOfficial = await mapper.mapHints({
      clubHint: "FC Kobenhavn",
      manufacturerHint: "Adidas",
      sponsorHint: "Carlsberg",
    });
    await pool.end();

    expect(viaAlias?.clubId).toBe(fixture.clubId);
    expect(viaAlias?.catalogKitId).toBe(fixture.kits[0]!.kitId);
    expect(viaAlt?.clubId).toBe(fixture.clubId);
    expect(viaAlt?.catalogKitId).toBe(fixture.kits[0]!.kitId);
    expect(viaFoldedOfficial?.clubId).toBe(fixture.clubId);
    expect(viaFoldedOfficial?.catalogKitId).toBe(fixture.kits[0]!.kitId);
  });

  it("locks a kit when the sponsor spelling differs only by spacing", async () => {
    const fixture = await insertClubWithKits([
      { label: "2019/20", type: "home", manufacturer: "Hummel", sponsor: "32Red" },
    ]);

    const { db, pool } = createDb(DATABASE_URL);
    const mapped = await new VisionCatalogMapper(db).mapHints({
      clubHint: "Rangers FC",
      manufacturerHint: "Hummel",
      sponsorHint: "32 Red",
    });
    await pool.end();

    expect(mapped?.catalogKitId).toBe(fixture.kits[0]!.kitId);
  });

  it("locks a unique NationalTeam kit without treating the side as a Club UUID", async () => {
    const fixture = await insertNationalTeamWithKit({
      teamLabel: "Denmark",
      aliases: ["Danmark"],
      manufacturer: "Adidas",
      seasonLabel: "2010",
    });

    const { db, pool } = createDb(DATABASE_URL);
    const mapped = await new VisionCatalogMapper(db).mapHints({
      clubHint: "Denmark",
      manufacturerHint: "Adidas",
      kitType: "home",
      fieldConfidence: { club: 0.9, kitType: 0.8 },
    });
    await pool.end();

    expect(mapped?.clubId).toBeUndefined();
    expect(mapped?.nationalTeamId).toBe(fixture.nationalTeamId);
    expect(mapped?.catalogKitId).toBe(fixture.kitId);
    expect(mapped?.seasonId).toBe(fixture.seasonId);
    expect(mapped?.type).toBe("home");
  });

  it("returns nationalTeamLabel path when Argentina is missing from catalog", async () => {
    const { db, pool } = createDb(DATABASE_URL);
    const mapped = await new VisionCatalogMapper(db).mapHints({
      clubHint: "Argentina",
      manufacturerHint: "Adidas",
      kitType: "home",
      seasonHint: "2006",
      fieldConfidence: { club: 0.85, kitType: 0.7, season: 0.6 },
    });
    await pool.end();

    expect(mapped?.nationalTeamId).toBeUndefined();
    expect(mapped?.clubId).toBeUndefined();
    expect(mapped?.clubHint).toBe("Argentina");
    expect(mapped?.kitHitCount).toBe(0);

    expect(mapped).toBeDefined();
    // SAFETY: expect(mapped).toBeDefined() above narrows mapped to non-null in this test branch.
    const resolved = resolveIdentityJob(mapped as NonNullable<typeof mapped>);
    expect(resolved.catalogMiss).toBe(true);
    expect(resolved.catalogLikely).toBe(false);
    expect(resolved.suggestions?.nationalTeamLabel).toBe("Argentina");
  });

  it("does not fill a Club UUID when a NationalTeam kit locks beside a Club side match", async () => {
    const fixture = await insertNationalTeamWithKit({
      teamLabel: "Danmark",
      manufacturer: "Adidas",
      sponsor: "VisitDenmark",
      seasonLabel: "2010",
    });
    await insertClubWithKits(
      [{ label: "2024/25", type: "home", manufacturer: "Hummel", sponsor: "Carlsberg" }],
      { clubLabel: "Denmark" },
    );

    const { db, pool } = createDb(DATABASE_URL);
    const mapped = await new VisionCatalogMapper(db).mapHints({
      clubHint: "Denmark",
      manufacturerHint: "Adidas",
      sponsorHint: "VisitDenmark",
      kitType: "home",
      fieldConfidence: { club: 0.9, kitType: 0.8 },
    });
    await pool.end();

    expect(mapped?.clubId).toBeUndefined();
    expect(mapped?.nationalTeamId).toBe(fixture.nationalTeamId);
    expect(mapped?.catalogKitId).toBe(fixture.kitId);
  });

  it("maps a surname hint when the player is on the same club in a different season than the locked kit", async () => {
    const fixture = await insertClubWithKits(
      [
        { label: "2012/13", type: "away", manufacturer: "Nike", sponsor: "Jeep" },
        { label: "2015/16", type: "home", manufacturer: "Adidas", sponsor: "Jeep" },
      ],
      { clubLabel: "Juventus" },
    );

    const { db, pool } = createDb(DATABASE_URL);
    const dybalaId = await insertPlayerWithLabel(db, "Paulo Dybala");
    await db.insert(playerClubSeason).values({
      playerId: dybalaId,
      clubId: fixture.clubId,
      seasonId: fixture.kits[1]!.seasonId,
      squadNumber: 21,
    });
    await pool.end();

    const { db: mapperDb, pool: mapperPool } = createDb(DATABASE_URL);
    const mapped = await new VisionCatalogMapper(mapperDb).mapHints({
      clubHint: "Juventus",
      manufacturerHint: "Nike",
      sponsorHint: "Jeep",
      playerHint: "Dybala",
      playerNumberHint: "21",
      fieldConfidence: { club: 0.9, player: 1 },
    });
    await mapperPool.end();

    expect(mapped?.catalogKitId).toBe(fixture.kits[0]!.kitId);
    expect(mapped?.seasonId).toBe(fixture.kits[0]!.seasonId);
    expect(mapped?.playerId).toBe(dybalaId);
    expect(mapped?.playerNumber).toBe("21");

    const resolved = resolveIdentityJob(mapped as NonNullable<typeof mapped>);
    expect(resolved.suggestions?.playerId).toBe(dybalaId);
    expect(resolved.suggestions?.playerNumber).toBe("21");
  });

  it("maps a unique global CatalogLabel name when the player has no squad row on the suggested club", async () => {
    const fixture = await insertClubWithKits(
      [{ label: "2012/13", type: "away", manufacturer: "Nike", sponsor: "Jeep" }],
      { clubLabel: "Juventus" },
    );

    const { db, pool } = createDb(DATABASE_URL);
    const dybalaId = await insertPlayerWithLabel(db, "Paulo Dybala");
    await pool.end();

    const { db: mapperDb, pool: mapperPool } = createDb(DATABASE_URL);
    const mapped = await new VisionCatalogMapper(mapperDb).mapHints({
      clubHint: "Juventus",
      manufacturerHint: "Nike",
      sponsorHint: "Jeep",
      playerHint: "Dybala",
      fieldConfidence: { club: 0.9, player: 1 },
    });
    await mapperPool.end();

    expect(mapped?.clubId).toBe(fixture.clubId);
    expect(mapped?.playerId).toBe(dybalaId);
    expect(mapped?.playerNumber).toBeUndefined();
  });

  it("omits player and warns when the name matches two catalog players", async () => {
    const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    const fixture = await insertClubWithKits(
      [{ label: "2012/13", type: "away", manufacturer: "Nike", sponsor: "Jeep" }],
      { clubLabel: "Juventus" },
    );

    const { db, pool } = createDb(DATABASE_URL);
    await insertPlayerWithLabel(db, "Paulo Dybala");
    await insertPlayerWithLabel(db, "Mario Dybala");
    await pool.end();

    const { db: mapperDb, pool: mapperPool } = createDb(DATABASE_URL);
    const mapped = await new VisionCatalogMapper(mapperDb).mapHints({
      clubHint: "Juventus",
      manufacturerHint: "Nike",
      sponsorHint: "Jeep",
      playerHint: "Dybala",
      fieldConfidence: { club: 0.9, player: 1 },
    });
    await mapperPool.end();

    expect(mapped?.playerId).toBeUndefined();
    expect(mapped?.playerNumber).toBeUndefined();
    expect(warn).toHaveBeenCalled();
    const message = String(warn.mock.calls[0]?.[0] ?? "");
    expect(message).toContain("Dybala");
    expect(message).toContain("club");
    expect(message).toContain(fixture.kits[0]!.seasonId);
  });

  it("omits player when only a number hint exists and that number is not on the scoped season", async () => {
    const fixture = await insertClubWithKits(
      [
        { label: "2012/13", type: "away", manufacturer: "Nike", sponsor: "Jeep" },
        { label: "2015/16", type: "home", manufacturer: "Adidas", sponsor: "Jeep" },
      ],
      { clubLabel: "Juventus" },
    );

    const { db, pool } = createDb(DATABASE_URL);
    const dybalaId = await insertPlayerWithLabel(db, "Paulo Dybala");
    await db.insert(playerClubSeason).values({
      playerId: dybalaId,
      clubId: fixture.clubId,
      seasonId: fixture.kits[1]!.seasonId,
      squadNumber: 21,
    });
    await pool.end();

    const { db: mapperDb, pool: mapperPool } = createDb(DATABASE_URL);
    const mapped = await new VisionCatalogMapper(mapperDb).mapHints({
      clubHint: "Juventus",
      manufacturerHint: "Nike",
      sponsorHint: "Jeep",
      playerNumberHint: "21",
      fieldConfidence: { club: 0.9, player: 1 },
    });
    await mapperPool.end();

    expect(mapped?.catalogKitId).toBe(fixture.kits[0]!.kitId);
    expect(mapped?.playerId).toBeUndefined();
    expect(mapped?.playerNumber).toBeUndefined();
  });

  it("does not map a season-squad number when playerHint names a different player", async () => {
    const fixture = await insertClubWithKits(
      [
        { label: "2012/13", type: "away", manufacturer: "Nike", sponsor: "Jeep" },
        { label: "2015/16", type: "home", manufacturer: "Adidas", sponsor: "Jeep" },
      ],
      { clubLabel: "Juventus" },
    );

    const { db, pool } = createDb(DATABASE_URL);
    const buffonId = await insertPlayerWithLabel(db, "Gianluigi Buffon");
    const dybalaId = await insertPlayerWithLabel(db, "Paulo Dybala");
    await db.insert(playerClubSeason).values({
      playerId: buffonId,
      clubId: fixture.clubId,
      seasonId: fixture.kits[0]!.seasonId,
      squadNumber: 21,
    });
    await db.insert(playerClubSeason).values({
      playerId: dybalaId,
      clubId: fixture.clubId,
      seasonId: fixture.kits[1]!.seasonId,
      squadNumber: 21,
    });
    await pool.end();

    const { db: mapperDb, pool: mapperPool } = createDb(DATABASE_URL);
    const mapped = await new VisionCatalogMapper(mapperDb).mapHints({
      clubHint: "Juventus",
      manufacturerHint: "Nike",
      sponsorHint: "Jeep",
      playerHint: "Dybala",
      playerNumberHint: "21",
      fieldConfidence: { club: 0.9, player: 1 },
    });
    await mapperPool.end();

    expect(mapped?.playerId).toBe(dybalaId);
    expect(mapped?.playerId).not.toBe(buffonId);
    expect(mapped?.playerNumber).toBe("21");
  });

  it("maps a unique club player by name when season is not resolved", async () => {
    const fixture = await insertClubWithKits([
      { label: "2023/24", type: "home", manufacturer: "Adidas", sponsor: "Carlsberg" },
    ]);

    const { db, pool } = createDb(DATABASE_URL);
    const dybalaId = await insertPlayerWithLabel(db, "Paulo Dybala");
    await db.insert(playerClubSeason).values({
      playerId: dybalaId,
      clubId: fixture.clubId,
      seasonId: fixture.kits[0]!.seasonId,
      squadNumber: 21,
    });
    await pool.end();

    const { db: mapperDb, pool: mapperPool } = createDb(DATABASE_URL);
    const mapped = await new VisionCatalogMapper(mapperDb).mapHints({
      clubHint: "Rangers FC",
      seasonHint: "2099/00",
      kitType: "home",
      playerHint: "Dybala",
      playerNumberHint: "21",
      fieldConfidence: { club: 0.9, season: 0.9, kitType: 0.9, player: 1 },
    });
    await mapperPool.end();

    expect(mapped?.clubId).toBe(fixture.clubId);
    expect(mapped?.seasonId).toBeUndefined();
    expect(mapped?.playerId).toBe(dybalaId);
    expect(mapped?.playerNumber).toBe("21");
  });

  it("omits player when playerHint is blank", async () => {
    const fixture = await insertClubWithKits(
      [{ label: "2012/13", type: "away", manufacturer: "Nike", sponsor: "Jeep" }],
      { clubLabel: "Juventus" },
    );

    const { db, pool } = createDb(DATABASE_URL);
    await insertPlayerWithLabel(db, "Paulo Dybala");
    await pool.end();

    const { db: mapperDb, pool: mapperPool } = createDb(DATABASE_URL);
    const mapped = await new VisionCatalogMapper(mapperDb).mapHints({
      clubHint: "Juventus",
      manufacturerHint: "Nike",
      sponsorHint: "Jeep",
      playerHint: "   ",
      fieldConfidence: { club: 0.9, player: 1 },
    });
    await mapperPool.end();

    expect(mapped?.clubId).toBe(fixture.clubId);
    expect(mapped?.playerId).toBeUndefined();
  });
});

type KitSpec = {
  label: string;
  type: "home" | "away";
  manufacturer: string;
  sponsor?: string;
  colorNames?: string;
};

type ClubLabelOptions = {
  clubLabel?: string;
  aliases?: string[];
};

async function insertPlayerWithLabel(
  db: ReturnType<typeof createDb>["db"],
  text: string,
): Promise<string> {
  const [insertedPlayer] = await db.insert(player).values({}).returning({ id: player.id });
  await db.insert(catalogLabel).values({
    entityType: "player",
    entityId: insertedPlayer!.id,
    locale: "en",
    kind: "label",
    text,
    source: "seed",
  });
  return insertedPlayer!.id;
}

async function insertClubWithKits(specs: KitSpec[], options: ClubLabelOptions = {}) {
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
  const clubLabel = options.clubLabel ?? "Rangers FC";
  await db.insert(catalogLabel).values({
    entityType: "club",
    entityId: insertedClub!.id,
    locale: "en",
    kind: "label",
    text: clubLabel,
    source: "seed",
  });
  for (const alias of options.aliases ?? []) {
    await db.insert(catalogLabel).values({
      entityType: "club",
      entityId: insertedClub!.id,
      locale: "en",
      kind: "alias",
      text: alias,
      source: "seed",
    });
  }

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

async function insertNationalTeamWithKit(spec: {
  teamLabel: string;
  aliases?: string[];
  manufacturer: string;
  sponsor?: string;
  seasonLabel: string;
}) {
  const { db, pool } = createDb(DATABASE_URL);
  const [insertedCountry] = await db
    .insert(country)
    .values({ iso3166: "DK" })
    .returning({ id: country.id });
  const [insertedTeam] = await db
    .insert(nationalTeam)
    .values({ countryId: insertedCountry!.id, gender: "men" })
    .returning({ id: nationalTeam.id });
  await db.insert(catalogLabel).values({
    entityType: "national_team",
    entityId: insertedTeam!.id,
    locale: "en",
    kind: "label",
    text: spec.teamLabel,
    source: "seed",
  });
  for (const alias of spec.aliases ?? []) {
    await db.insert(catalogLabel).values({
      entityType: "national_team",
      entityId: insertedTeam!.id,
      locale: "da",
      kind: "alias",
      text: alias,
      source: "seed",
    });
  }
  const year = spec.seasonLabel.slice(0, 4);
  const [insertedSeason] = await db
    .insert(season)
    .values({
      label: spec.seasonLabel,
      startsOn: `${year}-01-01`,
      endsOn: `${year}-12-31`,
      calendarKind: "calendar",
    })
    .returning({ id: season.id });
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
      nationalTeamId: insertedTeam!.id,
      seasonId: insertedSeason!.id,
      type: "home",
      manufacturerId: insertedManufacturer!.id,
      sponsorName: spec.sponsor ?? null,
    })
    .returning({ id: kit.id });
  await pool.end();
  return {
    nationalTeamId: insertedTeam!.id,
    kitId: insertedKit!.id,
    seasonId: insertedSeason!.id,
  };
}
