import {
  catalogLabel,
  club,
  country,
  type Db,
  league,
  nationalTeam,
  nationalTeamSeason,
  season,
  teamSeason,
} from "@kit/db";
import { eq } from "drizzle-orm";
import { TEST_DATA_CATALOG } from "./test-data.fixture.js";

const SEASON_LABELS = ["2022/23", "2023/24"];

function one<T>(rows: T[]): T {
  const [row] = rows;
  if (!row) {
    throw new Error("Expected one row");
  }
  return row;
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
