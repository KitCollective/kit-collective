import type { CatalogEntityType } from "@kit/domain";
import { and, eq } from "drizzle-orm";
import type { Db } from "../migrate.js";
import {
  catalogLabel,
  club,
  country,
  league,
  player,
  playerClubSeason,
  season,
  teamSeason,
} from "../schema/index.js";
import { seedEuropeanCountries } from "./european-countries.js";

/**
 * Confirm/Data picker fixture. IDs must stay in lockstep with
 * `apps/mobile/src/catalog/dummyCatalog.ts`. Not Transfermarkt catalog truth.
 */
const SUPERLIGA_ID = "77777771-7771-4771-8771-777777777771";
const PREMIER_LEAGUE_ID = "77777772-7772-4772-8772-777777777772";
const LA_LIGA_ID = "77777773-7773-4773-8773-777777777773";
const EREDIVISIE_ID = "77777774-7774-4774-8774-777777777774";

type CountryIso = "DK" | "GB" | "ES" | "NL";

type SeedLabel = {
  locale: "da" | "en";
  kind: "label" | "alias";
  text: string;
};

type SeasonFixture = {
  id: string;
  label: string;
};

type PlayerFixture = {
  id: string;
  label: string;
  number: string;
  seasonIds: string[];
};

type ClubFixture = {
  id: string;
  iso: CountryIso;
  leagueId: string;
  labelDa: string;
  labelEn: string;
  aliases: string[];
  seasons: SeasonFixture[];
  players: PlayerFixture[];
};

const LEAGUES: ReadonlyArray<{
  id: string;
  iso: CountryIso;
  labelDa: string;
  labelEn: string;
}> = [
  { id: SUPERLIGA_ID, iso: "DK", labelDa: "Superligaen", labelEn: "Superliga" },
  { id: PREMIER_LEAGUE_ID, iso: "GB", labelDa: "Premier League", labelEn: "Premier League" },
  { id: LA_LIGA_ID, iso: "ES", labelDa: "La Liga", labelEn: "La Liga" },
  { id: EREDIVISIE_ID, iso: "NL", labelDa: "Eredivisie", labelEn: "Eredivisie" },
];

const CLUBS: readonly ClubFixture[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    iso: "DK",
    leagueId: SUPERLIGA_ID,
    labelDa: "F.C. København",
    labelEn: "F.C. Copenhagen",
    aliases: ["FCK", "København", "Danmark"],
    seasons: [
      { id: "aaaaaaa1-aaa1-4aa1-8aa1-111111111111", label: "2024/25" },
      { id: "aaaaaaa2-aaa2-4aa2-8aa2-111111111111", label: "2023/24" },
      { id: "aaaaaaa3-aaa3-4aa3-8aa3-111111111111", label: "2022/23" },
    ],
    players: [
      {
        id: "b1111111-b111-4111-8111-111111111111",
        label: "Rasmus Falk",
        number: "33",
        seasonIds: [
          "aaaaaaa1-aaa1-4aa1-8aa1-111111111111",
          "aaaaaaa2-aaa2-4aa2-8aa2-111111111111",
          "aaaaaaa3-aaa3-4aa3-8aa3-111111111111",
        ],
      },
      {
        id: "b1111112-b112-4112-8112-111111111111",
        label: "Elias Achouri",
        number: "30",
        seasonIds: ["aaaaaaa1-aaa1-4aa1-8aa1-111111111111", "aaaaaaa2-aaa2-4aa2-8aa2-111111111111"],
      },
      {
        id: "b1111113-b113-4113-8113-111111111111",
        label: "Mohamed Elyounoussi",
        number: "10",
        seasonIds: ["aaaaaaa1-aaa1-4aa1-8aa1-111111111111"],
      },
    ],
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    iso: "DK",
    leagueId: SUPERLIGA_ID,
    labelDa: "Brøndby IF",
    labelEn: "Brondby IF",
    aliases: ["BIF", "Brøndby", "Danmark"],
    seasons: [
      { id: "aaaaaaa1-aaa1-4aa1-8aa1-222222222222", label: "2024/25" },
      { id: "aaaaaaa2-aaa2-4aa2-8aa2-222222222222", label: "2023/24" },
    ],
    players: [
      {
        id: "b2222221-b221-4221-8221-222222222222",
        label: "Daniel Wass",
        number: "10",
        seasonIds: ["aaaaaaa1-aaa1-4aa1-8aa1-222222222222", "aaaaaaa2-aaa2-4aa2-8aa2-222222222222"],
      },
      {
        id: "b2222222-b222-4222-8222-222222222222",
        label: "Nicolai Vallys",
        number: "7",
        seasonIds: ["aaaaaaa1-aaa1-4aa1-8aa1-222222222222"],
      },
    ],
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    iso: "DK",
    leagueId: SUPERLIGA_ID,
    labelDa: "Aarhus GF",
    labelEn: "Aarhus GF",
    aliases: ["AGF", "Danmark"],
    seasons: [{ id: "aaaaaaa1-aaa1-4aa1-8aa1-333333333333", label: "2024/25" }],
    players: [
      {
        id: "b3333331-b331-4331-8331-333333333333",
        label: "Patrick Mortensen",
        number: "9",
        seasonIds: ["aaaaaaa1-aaa1-4aa1-8aa1-333333333333"],
      },
    ],
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    iso: "GB",
    leagueId: PREMIER_LEAGUE_ID,
    labelDa: "Manchester United",
    labelEn: "Manchester United",
    aliases: ["Man Utd", "United", "England"],
    seasons: [
      { id: "aaaaaaa1-aaa1-4aa1-8aa1-444444444444", label: "2024/25" },
      { id: "aaaaaaa2-aaa2-4aa2-8aa2-444444444444", label: "2023/24" },
    ],
    players: [
      {
        id: "b4444441-b441-4441-8441-444444444444",
        label: "Bruno Fernandes",
        number: "8",
        seasonIds: ["aaaaaaa1-aaa1-4aa1-8aa1-444444444444", "aaaaaaa2-aaa2-4aa2-8aa2-444444444444"],
      },
      {
        id: "b4444442-b442-4442-8442-444444444444",
        label: "Kobbie Mainoo",
        number: "37",
        seasonIds: ["aaaaaaa1-aaa1-4aa1-8aa1-444444444444"],
      },
    ],
  },
  {
    id: "55555555-5555-4555-8555-555555555555",
    iso: "ES",
    leagueId: LA_LIGA_ID,
    labelDa: "FC Barcelona",
    labelEn: "FC Barcelona",
    aliases: ["Barca", "Barcelona", "Spanien"],
    seasons: [
      { id: "aaaaaaa1-aaa1-4aa1-8aa1-555555555555", label: "2024/25" },
      { id: "aaaaaaa2-aaa2-4aa2-8aa2-555555555555", label: "2023/24" },
    ],
    players: [
      {
        id: "b5555551-b551-4551-8551-555555555555",
        label: "Robert Lewandowski",
        number: "9",
        seasonIds: ["aaaaaaa1-aaa1-4aa1-8aa1-555555555555", "aaaaaaa2-aaa2-4aa2-8aa2-555555555555"],
      },
      {
        id: "b5555552-b552-4552-8552-555555555555",
        label: "Lamine Yamal",
        number: "19",
        seasonIds: ["aaaaaaa1-aaa1-4aa1-8aa1-555555555555"],
      },
    ],
  },
  {
    id: "66666666-6666-4666-8666-666666666666",
    iso: "NL",
    leagueId: EREDIVISIE_ID,
    labelDa: "AFC Ajax",
    labelEn: "AFC Ajax",
    aliases: ["Ajax", "Nederlandene"],
    seasons: [{ id: "aaaaaaa1-aaa1-4aa1-8aa1-666666666666", label: "2024/25" }],
    players: [
      {
        id: "b6666661-b661-4661-8661-666666666666",
        label: "Kenneth Taylor",
        number: "8",
        seasonIds: ["aaaaaaa1-aaa1-4aa1-8aa1-666666666666"],
      },
    ],
  },
];

export type SeedDevCatalogResult = {
  clubs: number;
  leagues: number;
  seasons: number;
  teamSeasons: number;
  players: number;
  playerClubSeasons: number;
};

function splitYearDates(label: string): { startsOn: string; endsOn: string } {
  const match = /^(\d{4})\/(\d{2})$/.exec(label);
  if (!match) {
    throw new Error(`dev-catalog: unsupported season label ${label}`);
  }
  const startYear = Number(match[1]);
  return {
    startsOn: `${startYear}-07-01`,
    endsOn: `${startYear + 1}-06-30`,
  };
}

async function countryIdByIso(db: Db, iso: CountryIso): Promise<string> {
  const [row] = await db
    .select({ id: country.id })
    .from(country)
    .where(eq(country.iso3166, iso))
    .limit(1);
  if (!row) {
    throw new Error(`dev-catalog: country ${iso} missing after seedEuropeanCountries`);
  }
  return row.id;
}

async function upsertLabel(
  db: Db,
  entityType: CatalogEntityType,
  entityId: string,
  entry: SeedLabel,
): Promise<void> {
  const filters = [
    eq(catalogLabel.entityType, entityType),
    eq(catalogLabel.entityId, entityId),
    eq(catalogLabel.locale, entry.locale),
    eq(catalogLabel.kind, entry.kind),
  ];
  if (entry.kind === "alias") {
    filters.push(eq(catalogLabel.text, entry.text));
  }

  const [existing] = await db
    .select({ id: catalogLabel.id, text: catalogLabel.text, source: catalogLabel.source })
    .from(catalogLabel)
    .where(and(...filters))
    .limit(1);

  if (entry.kind === "alias") {
    if (existing) {
      return;
    }
    await db.insert(catalogLabel).values({
      entityType,
      entityId,
      locale: entry.locale,
      kind: "alias",
      text: entry.text,
      source: "seed",
    });
    return;
  }

  if (existing) {
    if (existing.source === "admin" || existing.text === entry.text) {
      return;
    }
    await db.update(catalogLabel).set({ text: entry.text }).where(eq(catalogLabel.id, existing.id));
    return;
  }

  await db.insert(catalogLabel).values({
    entityType,
    entityId,
    locale: entry.locale,
    kind: "label",
    text: entry.text,
    source: "seed",
  });
}

async function upsertLeague(
  db: Db,
  entry: (typeof LEAGUES)[number],
  countryId: string,
): Promise<void> {
  const [existing] = await db
    .select({ id: league.id })
    .from(league)
    .where(eq(league.id, entry.id))
    .limit(1);
  if (existing) {
    await db.update(league).set({ countryId }).where(eq(league.id, entry.id));
  } else {
    await db.insert(league).values({ id: entry.id, countryId });
  }
  await upsertLabel(db, "league", entry.id, {
    locale: "da",
    kind: "label",
    text: entry.labelDa,
  });
  await upsertLabel(db, "league", entry.id, {
    locale: "en",
    kind: "label",
    text: entry.labelEn,
  });
}

async function upsertClub(db: Db, entry: ClubFixture, countryId: string): Promise<void> {
  const [existing] = await db
    .select({ id: club.id })
    .from(club)
    .where(eq(club.id, entry.id))
    .limit(1);
  if (existing) {
    await db.update(club).set({ countryId, kind: "club" }).where(eq(club.id, entry.id));
  } else {
    await db.insert(club).values({ id: entry.id, countryId, kind: "club" });
  }

  await upsertLabel(db, "club", entry.id, { locale: "da", kind: "label", text: entry.labelDa });
  await upsertLabel(db, "club", entry.id, { locale: "en", kind: "label", text: entry.labelEn });
  for (const alias of entry.aliases) {
    await upsertLabel(db, "club", entry.id, { locale: "da", kind: "alias", text: alias });
  }
}

async function upsertSeason(db: Db, entry: SeasonFixture, leagueId: string): Promise<void> {
  const dates = splitYearDates(entry.label);
  const [existing] = await db
    .select({ id: season.id })
    .from(season)
    .where(eq(season.id, entry.id))
    .limit(1);
  if (existing) {
    await db
      .update(season)
      .set({
        leagueId,
        label: entry.label,
        startsOn: dates.startsOn,
        endsOn: dates.endsOn,
        calendarKind: "split_year",
      })
      .where(eq(season.id, entry.id));
    return;
  }
  await db.insert(season).values({
    id: entry.id,
    leagueId,
    label: entry.label,
    startsOn: dates.startsOn,
    endsOn: dates.endsOn,
    calendarKind: "split_year",
  });
}

async function upsertTeamSeason(db: Db, clubId: string, seasonId: string): Promise<void> {
  const [existing] = await db
    .select({ id: teamSeason.id })
    .from(teamSeason)
    .where(and(eq(teamSeason.clubId, clubId), eq(teamSeason.seasonId, seasonId)))
    .limit(1);
  if (existing) {
    return;
  }
  await db.insert(teamSeason).values({ clubId, seasonId });
}

async function upsertPlayer(db: Db, entry: PlayerFixture, primaryCountryId: string): Promise<void> {
  const [existing] = await db
    .select({ id: player.id })
    .from(player)
    .where(eq(player.id, entry.id))
    .limit(1);
  if (existing) {
    await db.update(player).set({ primaryCountryId }).where(eq(player.id, entry.id));
  } else {
    await db.insert(player).values({ id: entry.id, primaryCountryId });
  }
  await upsertLabel(db, "player", entry.id, { locale: "da", kind: "label", text: entry.label });
  await upsertLabel(db, "player", entry.id, { locale: "en", kind: "label", text: entry.label });
}

async function upsertPlayerClubSeason(
  db: Db,
  playerId: string,
  clubId: string,
  seasonId: string,
  squadNumber: number,
): Promise<void> {
  const [existing] = await db
    .select({ id: playerClubSeason.id })
    .from(playerClubSeason)
    .where(
      and(
        eq(playerClubSeason.playerId, playerId),
        eq(playerClubSeason.clubId, clubId),
        eq(playerClubSeason.seasonId, seasonId),
      ),
    )
    .limit(1);
  if (existing) {
    await db
      .update(playerClubSeason)
      .set({ squadNumber })
      .where(eq(playerClubSeason.id, existing.id));
    return;
  }
  await db.insert(playerClubSeason).values({ playerId, clubId, seasonId, squadNumber });
}

export async function seedDevCatalog(db: Db): Promise<SeedDevCatalogResult> {
  await seedEuropeanCountries(db);

  const countryIds: Record<CountryIso, string> = {
    DK: await countryIdByIso(db, "DK"),
    GB: await countryIdByIso(db, "GB"),
    ES: await countryIdByIso(db, "ES"),
    NL: await countryIdByIso(db, "NL"),
  };

  for (const entry of LEAGUES) {
    await upsertLeague(db, entry, countryIds[entry.iso]);
  }

  let teamSeasons = 0;
  let playerClubSeasons = 0;
  let seasons = 0;
  let players = 0;

  for (const entry of CLUBS) {
    await upsertClub(db, entry, countryIds[entry.iso]);
    for (const seasonEntry of entry.seasons) {
      await upsertSeason(db, seasonEntry, entry.leagueId);
      await upsertTeamSeason(db, entry.id, seasonEntry.id);
      seasons += 1;
      teamSeasons += 1;
    }
    for (const playerEntry of entry.players) {
      await upsertPlayer(db, playerEntry, countryIds[entry.iso]);
      players += 1;
      const squadNumber = Number.parseInt(playerEntry.number, 10);
      for (const seasonId of playerEntry.seasonIds) {
        await upsertPlayerClubSeason(db, playerEntry.id, entry.id, seasonId, squadNumber);
        playerClubSeasons += 1;
      }
    }
  }

  return {
    clubs: CLUBS.length,
    leagues: LEAGUES.length,
    seasons,
    teamSeasons,
    players,
    playerClubSeasons,
  };
}
