export type DummySeason = {
  id: string;
  label: string;
};

export type DummyPlayer = {
  id: string;
  label: string;
  number: string;
  seasonIds: string[];
};

export type DummyClub = {
  id: string;
  label: string;
  country: string;
  seasons: DummySeason[];
  players: DummyPlayer[];
};

export type CatalogPickerRow = {
  id: string;
  label: string;
  meta?: string;
};

const FCK_ID = "11111111-1111-4111-8111-111111111111";
const BRONDBY_ID = "22222222-2222-4222-8222-222222222222";
const AGF_ID = "33333333-3333-4333-8333-333333333333";
const UNITED_ID = "44444444-4444-4444-8444-444444444444";
const BARCA_ID = "55555555-5555-4555-8555-555555555555";
const AJAX_ID = "66666666-6666-4666-8666-666666666666";

/**
 * Confirm/Data picker fixture until live stamdata search is populated. Not catalog truth.
 * IDs must stay in lockstep with the development catalog seed fixture.
 */
export const DUMMY_CLUBS: readonly DummyClub[] = [
  {
    id: FCK_ID,
    label: "F.C. København",
    country: "Danmark",
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
    id: BRONDBY_ID,
    label: "Brøndby IF",
    country: "Danmark",
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
    id: AGF_ID,
    label: "Aarhus GF",
    country: "Danmark",
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
    id: UNITED_ID,
    label: "Manchester United",
    country: "England",
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
    id: BARCA_ID,
    label: "FC Barcelona",
    country: "Spanien",
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
    id: AJAX_ID,
    label: "AFC Ajax",
    country: "Nederlandene",
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

function matchesQuery(value: string, query: string): boolean {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return true;
  }
  return value.toLowerCase().includes(trimmed);
}

export function searchDummyClubs(query: string): CatalogPickerRow[] {
  return DUMMY_CLUBS.filter(
    (club) => matchesQuery(club.label, query) || matchesQuery(club.country, query),
  ).map((club) => ({
    id: club.id,
    label: club.label,
    meta: club.country,
  }));
}

export function dummyClubById(clubId: string): DummyClub | null {
  return DUMMY_CLUBS.find((club) => club.id === clubId) ?? null;
}

const CHAMPIONS_LEAGUE_BADGE: CatalogPickerRow = {
  id: "c9999999-c999-4999-8999-999999999999",
  label: "Champions League",
};

const DOMESTIC_BADGE_BY_COUNTRY: Record<string, CatalogPickerRow> = {
  Danmark: { id: "c1111111-c111-4111-8111-111111111111", label: "Superligaen" },
  England: { id: "c2222222-c222-4222-8222-222222222222", label: "Premier League" },
  Spanien: { id: "c3333333-c333-4333-8333-333333333333", label: "La Liga" },
  Nederlandene: { id: "c4444444-c444-4444-8444-444444444444", label: "Eredivisie" },
};

export function dummySeasonsForClub(clubId: string): CatalogPickerRow[] {
  return (
    dummyClubById(clubId)?.seasons.map((entry) => ({ id: entry.id, label: entry.label })) ?? []
  );
}

/** Sleeve patches for the club's season: domestic league plus Champions League. */
export function dummyBadgesForSeason(clubId: string, seasonId: string | null): CatalogPickerRow[] {
  const club = dummyClubById(clubId);
  if (!club || !seasonId || !club.seasons.some((season) => season.id === seasonId)) {
    return [];
  }

  const domestic = DOMESTIC_BADGE_BY_COUNTRY[club.country];
  return domestic ? [domestic, CHAMPIONS_LEAGUE_BADGE] : [CHAMPIONS_LEAGUE_BADGE];
}

export function dummyPlayersForClub(
  clubId: string,
  seasonId: string | null,
  query = "",
): CatalogPickerRow[] {
  const club = dummyClubById(clubId);
  if (!club) {
    return [];
  }

  return club.players
    .filter((player) => {
      if (seasonId && !player.seasonIds.includes(seasonId)) {
        return false;
      }
      return matchesQuery(player.label, query) || matchesQuery(player.number, query);
    })
    .map((player) => ({
      id: player.id,
      label: player.label,
      meta: `Nr. ${player.number}`,
    }));
}

export function dummyPlayerById(clubId: string, playerId: string): DummyPlayer | null {
  return dummyClubById(clubId)?.players.find((player) => player.id === playerId) ?? null;
}
