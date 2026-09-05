import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  catalogLabel,
  club,
  createDb,
  externalId,
  honour,
  league,
  nationalTeam,
  nationalTeamSeason,
  player,
  playerClubSeason,
  playerNationalTeamSeason,
  playerPhoto,
  resetDatabase,
  season,
  teamSeason,
} from "@kit/db";
import { and, eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createFixtureFetchAdapter } from "../src/fetch/fixture-adapter.js";
import { createKaderFetchAdapter } from "../src/fetch/kader-fetch-adapter.js";
import { normalize } from "../src/normalize/index.js";
import { parseCliArgs, runHierarchyGrain } from "../src/run.js";
import { TM_SYSTEM } from "../src/types.js";
import { resolveSeedApifyTestDatabaseUrl } from "./test-database-url.js";

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../packages/db/migrations",
);

const fixturePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/superliga-mini.json",
);

const kaderFixturesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/kader-html",
);

const TEST_DATABASE_URL = resolveSeedApifyTestDatabaseUrl();

async function prepareDatabase() {
  await resetDatabase(TEST_DATABASE_URL, migrationsFolder);
}

describe("Hierarchy grain — League", () => {
  beforeAll(async () => {
    await prepareDatabase();
  });

  it("writes League, CatalogLabel, and ExternalId without seasons or clubs", async () => {
    const adapter = createFixtureFetchAdapter(fixturePath);
    const { summary } = await runHierarchyGrain({
      kind: "league",
      competition: "dk1",
      lane: "development",
      fetchAdapter: adapter,
      databaseUrl: TEST_DATABASE_URL,
    });

    expect(summary.leagues).toBe(1);
    expect(summary.catalogLabels).toBeGreaterThanOrEqual(1);
    expect(summary.externalIds).toBeGreaterThanOrEqual(1);
    expect(summary.seasons).toBe(0);
    expect(summary.clubs).toBe(0);
    expect(summary.teamSeasons).toBe(0);
    expect(summary.players).toBe(0);

    const { db, pool } = createDb(TEST_DATABASE_URL);
    try {
      const leagues = await db.select({ id: league.id }).from(league);
      expect(leagues).toHaveLength(1);

      const labels = await db
        .select({ text: catalogLabel.text })
        .from(catalogLabel)
        .where(and(eq(catalogLabel.entityType, "league"), eq(catalogLabel.kind, "label")));
      expect(labels.map((row) => row.text)).toContain("Superligaen");

      const ids = await db
        .select({ value: externalId.value })
        .from(externalId)
        .where(and(eq(externalId.system, TM_SYSTEM), eq(externalId.entityType, "league")));
      expect(ids.map((row) => row.value)).toContain("dk1");

      const seasonCount = await db.select({ n: sql<number>`count(*)::int` }).from(season);
      expect(seasonCount[0]?.n).toBe(0);
      const clubCount = await db.select({ n: sql<number>`count(*)::int` }).from(club);
      expect(clubCount[0]?.n).toBe(0);
    } finally {
      await pool.end();
    }
  });

  it("second League grain run is idempotent on ExternalId", async () => {
    await prepareDatabase();
    const adapter = createFixtureFetchAdapter(fixturePath);
    const first = await runHierarchyGrain({
      kind: "league",
      competition: "dk1",
      lane: "development",
      fetchAdapter: adapter,
      databaseUrl: TEST_DATABASE_URL,
    });
    const second = await runHierarchyGrain({
      kind: "league",
      competition: "dk1",
      lane: "development",
      fetchAdapter: adapter,
      databaseUrl: TEST_DATABASE_URL,
    });

    expect(first.summary.leagues).toBe(1);
    expect(second.summary.leagues).toBe(0);

    const { db, pool } = createDb(TEST_DATABASE_URL);
    try {
      const leagues = await db.select({ id: league.id }).from(league);
      expect(leagues).toHaveLength(1);
    } finally {
      await pool.end();
    }
  });
});

describe("Hierarchy grain — League season", () => {
  beforeAll(async () => {
    await prepareDatabase();
  });

  it("writes Season and source-driven club list without player/PCS rows", async () => {
    const adapter = createFixtureFetchAdapter(fixturePath);
    const { summary } = await runHierarchyGrain({
      kind: "league_season",
      competition: "dk1",
      season: "23/24",
      lane: "development",
      fetchAdapter: adapter,
      databaseUrl: TEST_DATABASE_URL,
    });

    expect(summary.leagues).toBe(1);
    expect(summary.seasons).toBe(1);
    expect(summary.clubs).toBe(2);
    expect(summary.teamSeasons).toBe(2);
    expect(summary.players).toBe(0);
    expect(summary.playerClubSeasons).toBe(0);

    const { db, pool } = createDb(TEST_DATABASE_URL);
    try {
      const seasons = await db
        .select({ label: season.label })
        .from(season)
        .where(eq(season.label, "23/24"));
      expect(seasons).toHaveLength(1);

      const clubIds = await db
        .select({ value: externalId.value })
        .from(externalId)
        .where(and(eq(externalId.system, TM_SYSTEM), eq(externalId.entityType, "club")));
      expect(clubIds.map((row) => row.value).sort()).toEqual(["club-190", "club-191"]);

      const tsCount = await db.select({ n: sql<number>`count(*)::int` }).from(teamSeason);
      expect(tsCount[0]?.n).toBe(2);

      const playerCount = await db.select({ n: sql<number>`count(*)::int` }).from(player);
      expect(playerCount[0]?.n).toBe(0);
      const pcsCount = await db.select({ n: sql<number>`count(*)::int` }).from(playerClubSeason);
      expect(pcsCount[0]?.n).toBe(0);
    } finally {
      await pool.end();
    }
  });

  it("uses competition season page club list (kader HTML fixture)", async () => {
    await prepareDatabase();
    const adapter = createKaderFetchAdapter({ fixturesDir: kaderFixturesDir });
    const { summary } = await runHierarchyGrain({
      kind: "league_season",
      competition: "dk1",
      season: "2015/16",
      lane: "development",
      fetchAdapter: adapter,
      databaseUrl: TEST_DATABASE_URL,
    });

    expect(summary.clubs).toBe(2);
    expect(summary.teamSeasons).toBe(2);
    expect(summary.players).toBe(0);

    const { db, pool } = createDb(TEST_DATABASE_URL);
    try {
      const clubIds = await db
        .select({ value: externalId.value })
        .from(externalId)
        .where(and(eq(externalId.system, TM_SYSTEM), eq(externalId.entityType, "club")));
      expect(clubIds.map((row) => row.value).sort()).toEqual(["190", "191"]);
    } finally {
      await pool.end();
    }
  });
});

describe("Hierarchy grain — League season normalize", () => {
  it("strips market value and branding before League season map", async () => {
    const adapter = createFixtureFetchAdapter(fixturePath);
    const raw = await adapter.fetchLeagueSeason({ competition: "dk1", season: "23/24" });
    expect(raw.seasons[0]?.clubs[0]?.marketValue).toBeDefined();
    expect(raw.seasons[0]?.clubs[0]?.players).toEqual([]);

    const facts = normalize(raw);
    expect(facts.seasons[0]?.clubs[0]).not.toHaveProperty("marketValue");
    expect(facts.seasons[0]?.clubs[0]?.players).toEqual([]);
    expect(facts.seasons[0]?.clubs).toHaveLength(2);
  });
});

describe("Hierarchy grain — Club Rich", () => {
  beforeAll(async () => {
    await prepareDatabase();
  });

  it("persists Club facts and honours, not only name and country", async () => {
    const adapter = createKaderFetchAdapter({ fixturesDir: kaderFixturesDir });
    const { summary } = await runHierarchyGrain({
      kind: "club",
      competition: "dk1",
      clubExternalId: "190",
      lane: "development",
      fetchAdapter: adapter,
      databaseUrl: TEST_DATABASE_URL,
    });

    expect(summary.clubs).toBe(1);
    expect(summary.honours).toBe(2);
    expect(summary.players).toBe(0);

    const { db, pool } = createDb(TEST_DATABASE_URL);
    try {
      const rows = await db
        .select({
          foundedOn: club.foundedOn,
          stadiumName: club.stadiumName,
          stadiumCapacity: club.stadiumCapacity,
          primaryColorHex: club.primaryColorHex,
          websiteUrl: club.websiteUrl,
        })
        .from(club);
      expect(rows[0]).toMatchObject({
        foundedOn: "1992-07-01",
        stadiumName: "Parken",
        stadiumCapacity: 38065,
        primaryColorHex: "#0053A0",
        websiteUrl: "https://www.fck.dk",
      });
      const titles = await db
        .select({ title: honour.title, seasonLabel: honour.seasonLabel })
        .from(honour);
      expect(titles).toEqual(
        expect.arrayContaining([
          { title: "Danish champion", seasonLabel: "10/11" },
          { title: "Danish champion", seasonLabel: "09/10" },
        ]),
      );
    } finally {
      await pool.end();
    }
  });

  it("second Club grain is idempotent on ExternalId", async () => {
    await prepareDatabase();
    const adapter = createKaderFetchAdapter({ fixturesDir: kaderFixturesDir });
    const first = await runHierarchyGrain({
      kind: "club",
      competition: "dk1",
      clubExternalId: "190",
      lane: "development",
      fetchAdapter: adapter,
      databaseUrl: TEST_DATABASE_URL,
    });
    const second = await runHierarchyGrain({
      kind: "club",
      competition: "dk1",
      clubExternalId: "190",
      lane: "development",
      fetchAdapter: adapter,
      databaseUrl: TEST_DATABASE_URL,
    });
    expect(first.summary.clubs).toBe(1);
    expect(second.summary.clubs).toBe(0);
    expect(second.summary.honours).toBe(0);
  });

  it("keeps Club facts after a Club season map of the same vendor id", async () => {
    await prepareDatabase();
    const adapter = createKaderFetchAdapter({ fixturesDir: kaderFixturesDir });
    await runHierarchyGrain({
      kind: "club",
      competition: "dk1",
      clubExternalId: "190",
      lane: "development",
      fetchAdapter: adapter,
      databaseUrl: TEST_DATABASE_URL,
    });
    await runHierarchyGrain({
      kind: "club_season",
      competition: "dk1",
      clubExternalId: "190",
      season: "2010/11",
      lane: "development",
      fetchAdapter: adapter,
      databaseUrl: TEST_DATABASE_URL,
    });

    const { db, pool } = createDb(TEST_DATABASE_URL);
    try {
      const rows = await db
        .select({ foundedOn: club.foundedOn, stadiumName: club.stadiumName })
        .from(club);
      expect(rows[0]).toMatchObject({
        foundedOn: "1992-07-01",
        stadiumName: "Parken",
      });
    } finally {
      await pool.end();
    }
  });

  it("writes kader body facts, position, and portrait without a profile hop", async () => {
    await prepareDatabase();
    const portraits = new Map<string, Uint8Array>();
    let profileFetches = 0;
    const adapter = createKaderFetchAdapter({
      fixturesDir: kaderFixturesDir,
      onProfileFetch: () => {
        profileFetches += 1;
      },
    });
    const { summary } = await runHierarchyGrain({
      kind: "club_season",
      competition: "dk1",
      clubExternalId: "190",
      season: "2010/11",
      lane: "development",
      fetchAdapter: adapter,
      databaseUrl: TEST_DATABASE_URL,
      portraitStore: {
        async putObject(key, bytes) {
          portraits.set(key, bytes);
        },
      },
    });

    expect(profileFetches).toBe(0);
    expect(summary.players).toBe(2);
    expect(summary.playerPhotos).toBe(1);

    const { db, pool } = createDb(TEST_DATABASE_URL);
    try {
      const players = await db
        .select({
          heightCm: player.heightCm,
          preferredFoot: player.preferredFoot,
          dateOfBirth: player.dateOfBirth,
        })
        .from(player);
      expect(players).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            heightCm: 174,
            preferredFoot: "right",
            dateOfBirth: "1981-02-24",
          }),
        ]),
      );
      const pcs = await db
        .select({ position: playerClubSeason.position, squadNumber: playerClubSeason.squadNumber })
        .from(playerClubSeason);
      expect(pcs).toEqual(
        expect.arrayContaining([
          { position: "Centre-Forward", squadNumber: 10 },
          { position: "Defensive Midfield", squadNumber: 8 },
        ]),
      );
      const photos = await db
        .select({
          objectKey: playerPhoto.objectKey,
          rights: playerPhoto.rights,
          visibility: playerPhoto.visibility,
        })
        .from(playerPhoto);
      expect(photos[0]).toMatchObject({
        objectKey: "player/11110/portrait",
        rights: "unresolved",
        visibility: "admin_only",
      });
      expect(portraits.get("player/11110/portrait")?.length).toBeGreaterThan(0);
    } finally {
      await pool.end();
    }
  });

  it("writes portrait bytes through SEED_OBJECT_DIR without an injected store", async () => {
    await prepareDatabase();
    const objectDir = await mkdtemp(path.join(tmpdir(), "kit-portraits-"));
    const previous = process.env.SEED_OBJECT_DIR;
    process.env.SEED_OBJECT_DIR = objectDir;
    try {
      const adapter = createKaderFetchAdapter({ fixturesDir: kaderFixturesDir });
      const { summary } = await runHierarchyGrain({
        kind: "club_season",
        competition: "dk1",
        clubExternalId: "190",
        season: "2010/11",
        lane: "development",
        fetchAdapter: adapter,
        databaseUrl: TEST_DATABASE_URL,
      });
      expect(summary.playerPhotos).toBe(1);
      const bytes = await readFile(path.join(objectDir, "player/11110/portrait"));
      expect(bytes.length).toBeGreaterThan(0);

      const { db, pool } = createDb(TEST_DATABASE_URL);
      try {
        const photos = await db.select({ objectKey: playerPhoto.objectKey }).from(playerPhoto);
        expect(photos[0]?.objectKey).toBe("player/11110/portrait");
      } finally {
        await pool.end();
      }
    } finally {
      if (previous === undefined) {
        delete process.env.SEED_OBJECT_DIR;
      } else {
        process.env.SEED_OBJECT_DIR = previous;
      }
    }
  });

  it("writes every Club grain on the Superliga 2010/11 competition page", async () => {
    await prepareDatabase();
    const adapter = createKaderFetchAdapter({ fixturesDir: kaderFixturesDir });
    const { summary } = await runHierarchyGrain({
      kind: "club_proof",
      competition: "dk1",
      season: "2010/11",
      lane: "development",
      fetchAdapter: adapter,
      databaseUrl: TEST_DATABASE_URL,
    });

    expect(summary.clubs).toBe(2);
    const { db, pool } = createDb(TEST_DATABASE_URL);
    try {
      const ids = await db
        .select({ value: externalId.value })
        .from(externalId)
        .where(and(eq(externalId.system, TM_SYSTEM), eq(externalId.entityType, "club")));
      expect(ids.map((row) => row.value).sort()).toEqual(["190", "191"]);
      const stadiums = await db.select({ stadiumName: club.stadiumName }).from(club);
      expect(stadiums.map((row) => row.stadiumName).sort()).toEqual(["Brøndby Stadium", "Parken"]);
    } finally {
      await pool.end();
    }
  });
});

describe("Hierarchy grain — NationalTeam Rich", () => {
  beforeAll(async () => {
    await prepareDatabase();
  });

  it("persists NationalTeam facts and honours to national_team, not club", async () => {
    const adapter = createKaderFetchAdapter({ fixturesDir: kaderFixturesDir });
    const { summary } = await runHierarchyGrain({
      kind: "national_team",
      nationalTeamRef: "3436",
      lane: "development",
      fetchAdapter: adapter,
      databaseUrl: TEST_DATABASE_URL,
    });

    expect(summary.nationalTeams).toBe(1);
    expect(summary.clubs).toBe(0);
    expect(summary.honours).toBe(1);

    const { db, pool } = createDb(TEST_DATABASE_URL);
    try {
      const clubCount = await db.select({ n: sql<number>`count(*)::int` }).from(club);
      expect(clubCount[0]?.n).toBe(0);

      const rows = await db
        .select({
          foundedOn: nationalTeam.foundedOn,
          confederation: nationalTeam.confederation,
        })
        .from(nationalTeam);
      expect(rows[0]).toMatchObject({
        foundedOn: "1889-05-18",
        confederation: "UEFA",
      });

      const ntExternal = await db
        .select({ value: externalId.value, entityType: externalId.entityType })
        .from(externalId)
        .where(and(eq(externalId.system, TM_SYSTEM), eq(externalId.value, "3436")));
      expect(ntExternal[0]?.entityType).toBe("national_team");

      const titles = await db
        .select({ title: honour.title, seasonLabel: honour.seasonLabel })
        .from(honour);
      expect(titles).toEqual(
        expect.arrayContaining([{ title: "World Cup participant", seasonLabel: "2010" }]),
      );
    } finally {
      await pool.end();
    }
  });

  it("second NationalTeam grain is idempotent on ExternalId", async () => {
    await prepareDatabase();
    const adapter = createKaderFetchAdapter({ fixturesDir: kaderFixturesDir });
    const first = await runHierarchyGrain({
      kind: "national_team",
      nationalTeamRef: "3436",
      lane: "development",
      fetchAdapter: adapter,
      databaseUrl: TEST_DATABASE_URL,
    });
    const second = await runHierarchyGrain({
      kind: "national_team",
      nationalTeamRef: "3436",
      lane: "development",
      fetchAdapter: adapter,
      databaseUrl: TEST_DATABASE_URL,
    });

    expect(first.summary.nationalTeams).toBe(1);
    expect(second.summary.nationalTeams).toBe(0);

    const { db, pool } = createDb(TEST_DATABASE_URL);
    try {
      const teams = await db.select({ id: nationalTeam.id }).from(nationalTeam);
      expect(teams).toHaveLength(1);
    } finally {
      await pool.end();
    }
  });

  it("strips forbidden fields before NationalTeam map", async () => {
    const adapter = createKaderFetchAdapter({ fixturesDir: kaderFixturesDir });
    const raw = await adapter.fetchNationalTeamSeason({
      nationalTeamRef: "3436",
      season: "2010",
    });
    const withForbidden = {
      ...raw,
      seasons: raw.seasons.map((seasonRow) => ({
        ...seasonRow,
        nationalTeams: seasonRow.nationalTeams?.map((team) => ({
          ...team,
          marketValue: 1_000_000,
          agent: { name: "blocked" },
          players: team.players.map((player) => ({ ...player, marketValue: 1 })),
        })),
      })),
    };

    const facts = normalize(withForbidden);
    expect(facts.seasons[0]?.nationalTeams?.[0]).not.toHaveProperty("marketValue");
    expect(facts.seasons[0]?.nationalTeams?.[0]?.players[0]).not.toHaveProperty("marketValue");
  });

  it("writes national_team_season, player_national_team_season, and player body fields", async () => {
    await prepareDatabase();
    const adapter = createKaderFetchAdapter({ fixturesDir: kaderFixturesDir });
    await runHierarchyGrain({
      kind: "club",
      competition: "dk1",
      clubExternalId: "190",
      lane: "development",
      fetchAdapter: adapter,
      databaseUrl: TEST_DATABASE_URL,
    });

    const { summary } = await runHierarchyGrain({
      kind: "national_team_season",
      nationalTeamRef: "3436",
      season: "2010",
      lane: "development",
      fetchAdapter: adapter,
      databaseUrl: TEST_DATABASE_URL,
      portraitStore: {
        async putObject() {},
      },
    });

    expect(summary.nationalTeamSeasons).toBe(1);
    expect(summary.playerNationalTeamSeasons).toBe(2);
    expect(summary.players).toBe(2);

    const { db, pool } = createDb(TEST_DATABASE_URL);
    try {
      const seasons = await db
        .select({
          label: season.label,
          leagueId: season.leagueId,
          calendarKind: season.calendarKind,
        })
        .from(season)
        .where(eq(season.label, "2010"));
      expect(seasons[0]).toMatchObject({ label: "2010", leagueId: null, calendarKind: "calendar" });

      const ntsCount = await db.select({ n: sql<number>`count(*)::int` }).from(nationalTeamSeason);
      expect(ntsCount[0]?.n).toBe(1);

      const pnts = await db
        .select({
          squadNumber: playerNationalTeamSeason.squadNumber,
          position: playerNationalTeamSeason.position,
          callUpClubId: playerNationalTeamSeason.callUpClubId,
        })
        .from(playerNationalTeamSeason);
      expect(pnts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ squadNumber: 10, position: "Centre-Forward" }),
          expect.objectContaining({ squadNumber: 8, position: "Defensive Midfield" }),
        ]),
      );
      expect(pnts.every((row) => row.callUpClubId !== null)).toBe(true);

      const players = await db
        .select({
          heightCm: player.heightCm,
          preferredFoot: player.preferredFoot,
          dateOfBirth: player.dateOfBirth,
        })
        .from(player);
      expect(players).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            heightCm: 174,
            preferredFoot: "right",
            dateOfBirth: "1981-02-24",
          }),
        ]),
      );
    } finally {
      await pool.end();
    }
  });

  it("does not profile-hop when player id and jersey number are present", async () => {
    await prepareDatabase();
    let profileFetches = 0;
    const adapter = createKaderFetchAdapter({
      fixturesDir: kaderFixturesDir,
      onProfileFetch: () => {
        profileFetches += 1;
      },
    });
    await runHierarchyGrain({
      kind: "national_team_season",
      nationalTeamRef: "3436",
      season: "2010",
      lane: "development",
      fetchAdapter: adapter,
      databaseUrl: TEST_DATABASE_URL,
    });
    expect(profileFetches).toBe(0);
  });

  it("profile-hops when jersey number is missing on the kader row", async () => {
    await prepareDatabase();
    let profileFetches = 0;
    const adapter = createKaderFetchAdapter({
      fixturesDir: kaderFixturesDir,
      onProfileFetch: () => {
        profileFetches += 1;
      },
    });

    await runHierarchyGrain({
      kind: "national_team_season",
      nationalTeamRef: "3436",
      season: "2011",
      lane: "development",
      fetchAdapter: adapter,
      databaseUrl: TEST_DATABASE_URL,
    });

    expect(profileFetches).toBe(1);
  });

  it("national-team-proof for Denmark 3436/2010", async () => {
    await prepareDatabase();
    const adapter = createKaderFetchAdapter({ fixturesDir: kaderFixturesDir });
    await runHierarchyGrain({
      kind: "club",
      competition: "dk1",
      clubExternalId: "190",
      lane: "development",
      fetchAdapter: adapter,
      databaseUrl: TEST_DATABASE_URL,
    });
    const { summary } = await runHierarchyGrain({
      kind: "national_team_proof",
      nationalTeamRef: "3436",
      season: "2010",
      lane: "development",
      fetchAdapter: adapter,
      databaseUrl: TEST_DATABASE_URL,
      portraitStore: {
        async putObject() {},
      },
    });

    expect(summary.nationalTeams).toBe(1);
    expect(summary.nationalTeamSeasons).toBe(1);
    expect(summary.playerNationalTeamSeasons).toBe(2);
    expect(summary.honours).toBe(1);

    const { db, pool } = createDb(TEST_DATABASE_URL);
    try {
      const ntIds = await db
        .select({ value: externalId.value })
        .from(externalId)
        .where(and(eq(externalId.system, TM_SYSTEM), eq(externalId.entityType, "national_team")));
      expect(ntIds.map((row) => row.value)).toEqual(["3436"]);
    } finally {
      await pool.end();
    }
  });
});

describe("Hierarchy grain CLI", () => {
  it("parses grain league and defaults lane to development", () => {
    const parsed = parseCliArgs(["node", "seed-apify", "grain", "league", "dk1"]);
    expect(parsed).toEqual({
      mode: "grain",
      grain: { kind: "league", competition: "dk1" },
      lane: "development",
    });
  });

  it("parses grain league-season with season and staging", () => {
    const parsed = parseCliArgs([
      "node",
      "seed-apify",
      "grain",
      "league-season",
      "dk1",
      "2010/11",
      "staging",
    ]);
    expect(parsed).toEqual({
      mode: "grain",
      grain: { kind: "league_season", competition: "dk1", season: "2010/11" },
      lane: "staging",
    });
  });

  it("rejects production on grain CLI", () => {
    expect(() =>
      parseCliArgs(["node", "seed-apify", "grain", "league", "dk1", "production"]),
    ).toThrow(/production/i);
  });

  it("parses grain club, club-season, and club-proof", () => {
    expect(parseCliArgs(["node", "seed-apify", "grain", "club", "dk1", "190"])).toEqual({
      mode: "grain",
      grain: { kind: "club", competition: "dk1", clubExternalId: "190" },
      lane: "development",
    });
    expect(
      parseCliArgs(["node", "seed-apify", "grain", "club-season", "dk1", "190", "2010/11"]),
    ).toEqual({
      mode: "grain",
      grain: { kind: "club_season", competition: "dk1", clubExternalId: "190", season: "2010/11" },
      lane: "development",
    });
    expect(parseCliArgs(["node", "seed-apify", "grain", "club-proof", "dk1", "2010/11"])).toEqual({
      mode: "grain",
      grain: { kind: "club_proof", competition: "dk1", season: "2010/11" },
      lane: "development",
    });
  });

  it("parses grain national-team, national-team-season, and national-team-proof", () => {
    expect(parseCliArgs(["node", "seed-apify", "grain", "national-team", "3436"])).toEqual({
      mode: "grain",
      grain: { kind: "national_team", nationalTeamRef: "3436" },
      lane: "development",
    });
    expect(
      parseCliArgs(["node", "seed-apify", "grain", "national-team-season", "3436", "2010"]),
    ).toEqual({
      mode: "grain",
      grain: { kind: "national_team_season", nationalTeamRef: "3436", season: "2010" },
      lane: "development",
    });
    expect(
      parseCliArgs(["node", "seed-apify", "grain", "national-team-proof", "dk-men", "2010"]),
    ).toEqual({
      mode: "grain",
      grain: { kind: "national_team_proof", nationalTeamRef: "dk-men", season: "2010" },
      lane: "development",
    });
  });
});
