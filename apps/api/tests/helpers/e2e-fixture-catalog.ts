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
import { TEST_DATA_CATALOG } from "../../dist/e2e/test-data.fixture.js";

/** Every catalog side the fixture names, each linked to two seasons. */
export async function insertFixtureCatalog(db: Db): Promise<void> {
  const [dk] = await db.select({ id: country.id }).from(country).where(eq(country.iso3166, "DK"));
  const [insertedLeague] = await db
    .insert(league)
    .values({ countryId: dk!.id })
    .returning({ id: league.id });
  const seasonIds: string[] = [];
  for (const label of ["2022/23", "2023/24"]) {
    const [row] = await db
      .insert(season)
      .values({
        leagueId: insertedLeague!.id,
        label,
        startsOn: `${label.slice(0, 4)}-07-01`,
        endsOn: `${Number(label.slice(0, 4)) + 1}-06-30`,
        calendarKind: "split_year",
      })
      .returning({ id: season.id });
    seasonIds.push(row!.id);
  }
  for (const label of TEST_DATA_CATALOG.clubs) {
    const [row] = await db
      .insert(club)
      .values({ countryId: dk!.id, kind: "club" })
      .returning({ id: club.id });
    await db.insert(catalogLabel).values({
      entityType: "club",
      entityId: row!.id,
      locale: "da",
      kind: "label",
      text: label,
      source: "seed",
    });
    for (const seasonId of seasonIds) {
      await db.insert(teamSeason).values({ clubId: row!.id, seasonId });
    }
  }
  for (const label of TEST_DATA_CATALOG.nationalTeams) {
    const [row] = await db
      .insert(nationalTeam)
      .values({ countryId: dk!.id, gender: "men" })
      .returning({ id: nationalTeam.id });
    await db.insert(catalogLabel).values({
      entityType: "national_team",
      entityId: row!.id,
      locale: "da",
      kind: "label",
      text: label,
      source: "seed",
    });
    for (const seasonId of seasonIds) {
      await db.insert(nationalTeamSeason).values({ nationalTeamId: row!.id, seasonId });
    }
  }
}
