import { appendFile, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  club,
  country,
  createDb,
  externalId,
  league,
  nationalTeam,
  player,
  playerJerseyNumber,
  resetDatabase,
  season,
  teamSeason,
} from "@kit/db";
import { and, eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { JerseyNumbersFetcher } from "../src/fetch/adapter.js";
import { parseJerseyNumbersHtml } from "../src/fetch/jersey-numbers-parser.js";
import {
  createInMemoryJerseyCheckpoint,
  createJsonlJerseyCheckpoint,
  jerseyCheckpointPath,
  listLanePlayerExternalIds,
  resolveJerseyConcurrency,
  runJerseyNumbers,
} from "../src/jersey-numbers.js";
import { mapPlayerJerseyNumbers } from "../src/map/index.js";
import { normalizePlayerJerseyNumbers } from "../src/normalize/index.js";
import { TM_SYSTEM } from "../src/types.js";
import { resolveSeedApifyTestDatabaseUrl } from "./test-database-url.js";

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../packages/db/migrations",
);

const fixturesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/kader-html/jersey-numbers",
);

const TEST_DATABASE_URL = resolveSeedApifyTestDatabaseUrl();

/** Reads the trimmed live fixtures, so the runner is exercised on real vendor markup. */
function createFixtureJerseyFetcher(): JerseyNumbersFetcher & { requests: string[] } {
  const requests: string[] = [];
  return {
    requests,
    async fetchPlayerJerseyNumbers(playerExternalId: string) {
      requests.push(playerExternalId);
      const html = await readFile(
        path.join(fixturesDir, `player-${playerExternalId}.html`),
        "utf8",
      );
      const parsed = parseJerseyNumbersHtml(html, playerExternalId);
      return {
        playerExternalId,
        rows: parsed.rows.map((row) => ({
          seasonLabel: row.seasonLabel,
          sideExternalId: row.sideExternalId,
          sideName: row.sideName,
          side: row.side,
          jerseyNumber: row.squadNumber,
        })),
      };
    },
  };
}

function requiredId(row: { id: string } | undefined, label: string): string {
  if (!row?.id) {
    throw new Error(`expected ${label} insert to return an id`);
  }
  return row.id;
}

/**
 * The slice of lane shape the mapper reads: a player, a club and a national side it can
 * resolve, plus one season each side has membership in. Everything else on the career page
 * is deliberately left unseeded so the unresolved path is covered too.
 */
async function seedLaneShape(db: ReturnType<typeof createDb>["db"]) {
  const [countryRow] = await db
    .insert(country)
    .values({ iso3166: "GB" })
    .returning({ id: country.id });
  const countryId = requiredId(countryRow, "country");

  const [leagueRow] = await db.insert(league).values({ countryId }).returning({ id: league.id });
  const leagueId = requiredId(leagueRow, "league");

  const [seasonRow] = await db
    .insert(season)
    .values({
      leagueId,
      label: "2025/26",
      startsOn: "2025-07-01",
      endsOn: "2026-06-30",
      calendarKind: "split_year",
    })
    .returning({ id: season.id });
  const seasonId = requiredId(seasonRow, "season");

  const [clubRow] = await db.insert(club).values({ countryId }).returning({ id: club.id });
  const clubId = requiredId(clubRow, "club");
  await db.insert(teamSeason).values({ clubId, seasonId });

  const [nationalTeamRow] = await db
    .insert(nationalTeam)
    .values({ countryId, gender: "men" })
    .returning({ id: nationalTeam.id });
  const nationalTeamId = requiredId(nationalTeamRow, "national team");

  const [playerRow] = await db.insert(player).values({}).returning({ id: player.id });
  const playerId = requiredId(playerRow, "player");

  await db.insert(externalId).values([
    { entityType: "player", entityId: playerId, system: TM_SYSTEM, value: "3333" },
    { entityType: "club", entityId: clubId, system: TM_SYSTEM, value: "1237" },
    {
      entityType: "national_team",
      entityId: nationalTeamId,
      system: TM_SYSTEM,
      value: "3299",
    },
  ]);

  return { clubId, nationalTeamId, playerId, seasonId };
}

describe("Jersey number history — persistence", () => {
  let ids: Awaited<ReturnType<typeof seedLaneShape>>;

  beforeAll(async () => {
    await resetDatabase(TEST_DATABASE_URL, migrationsFolder);
    const { db, pool } = createDb(TEST_DATABASE_URL);
    try {
      ids = await seedLaneShape(db);
    } finally {
      await pool.end();
    }
  }, 120_000);

  it("writes one row per season, side, and number, resolving the sides the lane holds", async () => {
    const fetcher = createFixtureJerseyFetcher();
    const { db, pool } = createDb(TEST_DATABASE_URL);
    try {
      const raw = await fetcher.fetchPlayerJerseyNumbers("3333");
      const summary = await mapPlayerJerseyNumbers(db, normalizePlayerJerseyNumbers(raw));

      expect(summary.playerFound).toBe(true);
      expect(summary.parsedRows).toBe(16);
      expect(summary.created).toBe(16);
      expect(summary.existing).toBe(0);
      expect(summary.clubLinked).toBe(3);
      expect(summary.nationalTeamLinked).toBe(8);
      // Liverpool FC (5 rows) is not seeded, so those rows land on vendor identity only.
      expect(summary.sideUnresolved).toBe(5);
      expect(summary.sideKindMismatch).toBe(0);
      expect(summary.missingNumber).toBe(0);

      const rows = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(playerJerseyNumber)
        .where(eq(playerJerseyNumber.playerId, ids.playerId));
      expect(rows[0]?.n).toBe(16);
    } finally {
      await pool.end();
    }
  });

  it("keeps the vendor side id on rows whose club is not seeded", async () => {
    const { db, pool } = createDb(TEST_DATABASE_URL);
    try {
      const unresolved = await db
        .select({
          sideExternalId: playerJerseyNumber.sideExternalId,
          sideName: playerJerseyNumber.sideName,
          clubId: playerJerseyNumber.clubId,
          nationalTeamId: playerJerseyNumber.nationalTeamId,
          squadNumber: playerJerseyNumber.squadNumber,
        })
        .from(playerJerseyNumber)
        .where(
          and(
            eq(playerJerseyNumber.playerId, ids.playerId),
            eq(playerJerseyNumber.sideExternalId, "31"),
            eq(playerJerseyNumber.seasonLabel, "2022/23"),
          ),
        );

      expect(unresolved).toHaveLength(1);
      expect(unresolved[0]).toMatchObject({
        sideExternalId: "31",
        sideName: "Liverpool FC",
        clubId: null,
        nationalTeamId: null,
        squadNumber: 7,
      });
    } finally {
      await pool.end();
    }
  });

  it("links season_id only where the side has membership in that season", async () => {
    const { db, pool } = createDb(TEST_DATABASE_URL);
    try {
      const linked = await db
        .select({
          seasonId: playerJerseyNumber.seasonId,
          seasonLabel: playerJerseyNumber.seasonLabel,
          clubId: playerJerseyNumber.clubId,
        })
        .from(playerJerseyNumber)
        .where(
          and(
            eq(playerJerseyNumber.playerId, ids.playerId),
            eq(playerJerseyNumber.seasonLabel, "2025/26"),
          ),
        );

      expect(linked).toHaveLength(1);
      expect(linked[0]?.clubId).toBe(ids.clubId);
      expect(linked[0]?.seasonId).toBe(ids.seasonId);

      // 2024/25 has no `season` row at all, so the label carries the season alone.
      const unlinked = await db
        .select({ seasonId: playerJerseyNumber.seasonId })
        .from(playerJerseyNumber)
        .where(
          and(
            eq(playerJerseyNumber.playerId, ids.playerId),
            eq(playerJerseyNumber.seasonLabel, "2024/25"),
          ),
        );
      expect(unlinked).toHaveLength(1);
      expect(unlinked[0]?.seasonId).toBeNull();
    } finally {
      await pool.end();
    }
  });

  it("holds several numbers for one national side in one season", async () => {
    const { db, pool } = createDb(TEST_DATABASE_URL);
    try {
      const rows = await db
        .select({ squadNumber: playerJerseyNumber.squadNumber })
        .from(playerJerseyNumber)
        .where(
          and(
            eq(playerJerseyNumber.playerId, ids.playerId),
            eq(playerJerseyNumber.nationalTeamId, ids.nationalTeamId),
            eq(playerJerseyNumber.seasonLabel, "2014/15"),
          ),
        )
        .orderBy(playerJerseyNumber.squadNumber);

      expect(rows.map((row) => row.squadNumber)).toEqual([4, 7, 16]);
    } finally {
      await pool.end();
    }
  });

  it("creates nothing on a second run over the same player", async () => {
    const fetcher = createFixtureJerseyFetcher();
    const { db, pool } = createDb(TEST_DATABASE_URL);
    try {
      const before = await db.select({ n: sql<number>`count(*)::int` }).from(playerJerseyNumber);

      const raw = await fetcher.fetchPlayerJerseyNumbers("3333");
      const summary = await mapPlayerJerseyNumbers(db, normalizePlayerJerseyNumbers(raw));

      expect(summary.created).toBe(0);
      expect(summary.existing).toBe(16);

      const after = await db.select({ n: sql<number>`count(*)::int` }).from(playerJerseyNumber);
      expect(after[0]?.n).toBe(before[0]?.n);
    } finally {
      await pool.end();
    }
  });

  it("records a player the lane has no player row for without writing", async () => {
    const fetcher = createFixtureJerseyFetcher();
    const { db, pool } = createDb(TEST_DATABASE_URL);
    try {
      const before = await db.select({ n: sql<number>`count(*)::int` }).from(playerJerseyNumber);

      const summary = await runJerseyNumbers({
        playerExternalIds: ["53622"],
        fetcher,
        db,
      });

      expect(summary.playersMissing).toBe(1);
      expect(summary.playersWithHistory).toBe(0);
      expect(summary.created).toBe(0);

      const after = await db.select({ n: sql<number>`count(*)::int` }).from(playerJerseyNumber);
      expect(after[0]?.n).toBe(before[0]?.n);
    } finally {
      await pool.end();
    }
  });

  it("counts an empty career page as an empty history, not a failure", async () => {
    const fetcher = createFixtureJerseyFetcher();
    const { db, pool } = createDb(TEST_DATABASE_URL);
    try {
      const [emptyPlayer] = await db.insert(player).values({}).returning({ id: player.id });
      await db.insert(externalId).values({
        entityType: "player",
        entityId: requiredId(emptyPlayer, "empty player"),
        system: TM_SYSTEM,
        value: "nohistory",
      });

      const summary = await runJerseyNumbers({
        playerExternalIds: ["nohistory"],
        fetcher,
        db,
      });

      expect(summary.playersEmpty).toBe(1);
      expect(summary.playersWithHistory).toBe(0);
      expect(summary.failures).toEqual([]);
      expect(summary.parsedRows).toBe(0);
    } finally {
      await pool.end();
    }
  });

  it("records a fetch failure and keeps walking the rest of the list", async () => {
    const fetcher = createFixtureJerseyFetcher();
    const { db, pool } = createDb(TEST_DATABASE_URL);
    try {
      const summary = await runJerseyNumbers({
        playerExternalIds: ["does-not-exist", "3333"],
        fetcher,
        db,
        progress: () => {},
      });

      expect(summary.failures).toHaveLength(1);
      expect(summary.failures[0]?.playerExternalId).toBe("does-not-exist");
      expect(summary.players).toBe(2);
      expect(summary.existing).toBe(16);
    } finally {
      await pool.end();
    }
  });

  it("skips players a checkpoint already recorded as done", async () => {
    const fetcher = createFixtureJerseyFetcher();
    const { db, pool } = createDb(TEST_DATABASE_URL);
    try {
      const checkpoint = createInMemoryJerseyCheckpoint([
        { playerExternalId: "3333", status: "done", at: "2026-01-01T00:00:00.000Z", rows: 16 },
      ]);

      const summary = await runJerseyNumbers({
        playerExternalIds: ["3333", "nohistory"],
        fetcher,
        db,
        checkpoint,
        progress: () => {},
      });

      expect(summary.resumed).toBe(1);
      expect(summary.players).toBe(1);
      expect(fetcher.requests).toEqual(["nohistory"]);
      expect(checkpoint.records.at(-1)).toMatchObject({
        playerExternalId: "nohistory",
        status: "done",
      });
    } finally {
      await pool.end();
    }
  });

  it("covers every player when several are fetched at once", async () => {
    const fetcher = createFixtureJerseyFetcher();
    const { db, pool } = createDb(TEST_DATABASE_URL);
    try {
      const summary = await runJerseyNumbers({
        playerExternalIds: ["3333", "nohistory", "does-not-exist", "3333"],
        fetcher,
        db,
        concurrency: 4,
        progress: () => {},
      });

      expect(summary.players).toBe(4);
      expect(summary.failures).toHaveLength(1);
      expect(summary.created).toBe(0);
      expect(fetcher.requests).toHaveLength(4);
    } finally {
      await pool.end();
    }
  });

  it("lists the lane's Transfermarkt player ids for the backfill", async () => {
    const { db, pool } = createDb(TEST_DATABASE_URL);
    try {
      const ids = await listLanePlayerExternalIds(db);
      expect(ids).toContain("3333");
      expect(ids).toContain("nohistory");
    } finally {
      await pool.end();
    }
  });

  it("survives a torn last checkpoint line and resumes from the rest", async () => {
    const stateDir = await mkdtemp(path.join(tmpdir(), "kc-jersey-checkpoint-"));
    const file = jerseyCheckpointPath("resume-test", stateDir);
    const checkpoint = createJsonlJerseyCheckpoint(file);

    await checkpoint.append({
      playerExternalId: "3333",
      status: "done",
      at: "2026-01-01T00:00:00.000Z",
      rows: 16,
    });
    // A kill mid-write leaves a half-line; it is not a state transition.
    await appendFile(file, '{"playerExternalId":"nohis', "utf8");

    expect(await checkpoint.read()).toEqual([
      { playerExternalId: "3333", status: "done", at: "2026-01-01T00:00:00.000Z", rows: 16 },
    ]);

    const fetcher = createFixtureJerseyFetcher();
    const { db, pool } = createDb(TEST_DATABASE_URL);
    try {
      const summary = await runJerseyNumbers({
        playerExternalIds: ["3333", "nohistory"],
        fetcher,
        db,
        checkpoint,
        progress: () => {},
      });

      expect(summary.resumed).toBe(1);
      expect(fetcher.requests).toEqual(["nohistory"]);
    } finally {
      await pool.end();
    }
  });
});

describe("resolveJerseyConcurrency", () => {
  it("stays serial when the env says nothing", () => {
    expect(resolveJerseyConcurrency({})).toBe(1);
  });

  it("reads the env knob", () => {
    expect(resolveJerseyConcurrency({ SEED_JERSEY_CONCURRENCY: "4" })).toBe(4);
  });

  it("clamps a typo instead of opening an unbounded fan-out", () => {
    expect(resolveJerseyConcurrency({ SEED_JERSEY_CONCURRENCY: "400" })).toBe(8);
    expect(resolveJerseyConcurrency({ SEED_JERSEY_CONCURRENCY: "0" })).toBe(1);
    expect(resolveJerseyConcurrency({ SEED_JERSEY_CONCURRENCY: "yes" })).toBe(1);
  });
});
