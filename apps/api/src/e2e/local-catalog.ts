import {
  catalogLabel,
  club,
  country,
  type Db,
  league,
  nationalTeam,
  nationalTeamSeason,
  patch,
  player,
  playerClubSeason,
  season,
  teamSeason,
} from "@kit/db";
import { eq } from "drizzle-orm";
import { TEST_DATA_CATALOG, TEST_PLAYER_SQUAD_NUMBER } from "./test-data.fixture.js";

const SEASON_LABELS = ["2022/23", "2023/24"];

function one<T>(rows: T[]): T {
  const [row] = rows;
  if (!row) {
    throw new Error("Expected one row");
  }
  return row;
}

/** The club whose latest season holds the fixture player and badge (the peer's OB jersey). */
const FIXTURE_PLAYER_CLUB = "OB";

async function insertPlayerAndBadge(db: Db, clubId: string, seasonId: string): Promise<void> {
  const fixturePlayer = one(await db.insert(player).values({}).returning({ id: player.id }));
  await db.insert(catalogLabel).values({
    entityType: "player",
    entityId: fixturePlayer.id,
    locale: "da",
    kind: "label",
    text: TEST_DATA_CATALOG.players[0],
    source: "seed",
  });
  await db.insert(playerClubSeason).values({
    playerId: fixturePlayer.id,
    clubId,
    seasonId,
    squadNumber: TEST_PLAYER_SQUAD_NUMBER,
  });
  const fixtureBadge = one(await db.insert(patch).values({ seasonId }).returning({ id: patch.id }));
  await db.insert(catalogLabel).values({
    entityType: "patch",
    entityId: fixtureBadge.id,
    locale: "da",
    kind: "label",
    text: TEST_DATA_CATALOG.badges[0],
    source: "seed",
  });
}

/**
 * The catalog sides the device-flow fixture names, each linked to two seasons.
 * For a disposable local or test database only: a lane already has its catalog.
 */
export async function insertLocalFixtureCatalog(db: Db): Promise<void> {
  const denmark = one(
    await db.select({ id: country.id }).from(country).where(eq(country.iso3166, "DK")),
  );
  const fixtureLeague = one(
    await db.insert(league).values({ countryId: denmark.id }).returning({ id: league.id }),
  );
  await db.insert(catalogLabel).values({
    entityType: "league",
    entityId: fixtureLeague.id,
    locale: "da",
    kind: "label",
    text: "Superligaen",
    source: "seed",
  });
  const seasonIds: string[] = [];
  for (const label of SEASON_LABELS) {
    const startYear = Number(label.slice(0, 4));
    const row = one(
      await db
        .insert(season)
        .values({
          leagueId: fixtureLeague.id,
          label,
          startsOn: `${startYear}-07-01`,
          endsOn: `${startYear + 1}-06-30`,
          calendarKind: "split_year",
        })
        .returning({ id: season.id }),
    );
    seasonIds.push(row.id);
  }
  for (const label of TEST_DATA_CATALOG.clubs) {
    const row = one(
      await db
        .insert(club)
        .values({ countryId: denmark.id, kind: "club" })
        .returning({ id: club.id }),
    );
    await db.insert(catalogLabel).values({
      entityType: "club",
      entityId: row.id,
      locale: "da",
      kind: "label",
      text: label,
      source: "seed",
    });
    await db.insert(teamSeason).values(seasonIds.map((seasonId) => ({ clubId: row.id, seasonId })));
    if (label === FIXTURE_PLAYER_CLUB) {
      await insertPlayerAndBadge(db, row.id, seasonIds[seasonIds.length - 1]!);
    }
  }
  for (const label of TEST_DATA_CATALOG.nationalTeams) {
    const row = one(
      await db
        .insert(nationalTeam)
        .values({ countryId: denmark.id, gender: "men" })
        .returning({ id: nationalTeam.id }),
    );
    await db.insert(catalogLabel).values({
      entityType: "national_team",
      entityId: row.id,
      locale: "da",
      kind: "label",
      text: label,
      source: "seed",
    });
    await db
      .insert(nationalTeamSeason)
      .values(seasonIds.map((seasonId) => ({ nationalTeamId: row.id, seasonId })));
  }
}
