import {
  type CompetitionIdentity,
  catalogCompetitionIdentity,
  catalogNationalTeamIdentity,
  type NationalTeamIdentity,
  resolveSeasonRef,
} from "@kit/seed-shared";
import type {
  TransfermarktRawClub,
  TransfermarktRawHonour,
  TransfermarktRawNationalTeam,
  TransfermarktRawPayload,
  TransfermarktRawPlayer,
} from "../types.js";
import type {
  ActorNationality,
  ActorPlayerProfile,
  ActorSeasonClubRow,
  ActorSquadRow,
  ClubFactsParse,
} from "./actor-types.js";
import {
  calendarYearBounds,
  labelToStartYear,
  seasonCalendarBounds,
  startYearToLabel,
} from "./season-label.js";

export interface MapClubSeasonParams {
  competitionSlug: string;
  clubExternalId: string;
  seasonLabel: string;
  clubName: string;
  squadRows: ActorSquadRow[];
  profileByPlayerId: Map<string, ActorPlayerProfile>;
  portraits?: Map<string, Uint8Array>;
  facts?: ClubFactsParse;
  honours?: TransfermarktRawHonour[];
  identity?: CompetitionIdentity;
}

function resolveCompetitionOrThrow(
  slug: string,
  identity?: CompetitionIdentity,
): CompetitionIdentity {
  if (identity) {
    return identity;
  }
  const catalog = catalogCompetitionIdentity(slug);
  if (!catalog) {
    throw new Error(`Unknown competition: ${slug}`);
  }
  return catalog;
}

function competitionPayload(identity: CompetitionIdentity): TransfermarktRawPayload["competition"] {
  const tmCode = identity.leagueTransfermarktId;
  return {
    id: tmCode.toLowerCase(),
    name: identity.name,
    country: {
      id: `country-${identity.iso3166.toLowerCase()}`,
      name: identity.countryName,
      iso3166: identity.iso3166,
    },
  };
}

export function mapLeagueToPayload(
  competitionSlug: string,
  identity?: CompetitionIdentity,
): TransfermarktRawPayload {
  const resolved = resolveCompetitionOrThrow(competitionSlug, identity);
  return {
    competition: competitionPayload(resolved),
    seasons: [],
  };
}

export function mapLeagueSeasonToPayload(params: {
  competitionSlug: string;
  seasonLabel: string;
  clubs: ActorSeasonClubRow[];
  identity?: CompetitionIdentity;
}): TransfermarktRawPayload {
  const identity = resolveCompetitionOrThrow(params.competitionSlug, params.identity);
  const startYear = labelToStartYear(params.seasonLabel);
  const { startDate, endDate } = seasonCalendarBounds(startYear);

  return {
    competition: competitionPayload(identity),
    seasons: [
      {
        id: String(startYear),
        label: params.seasonLabel,
        startDate,
        endDate,
        calendarKind: "split_year",
        clubs: params.clubs.map((club) => ({
          id: club.clubId,
          name: club.clubName,
          country: { iso3166: identity.iso3166 },
          players: [],
        })),
      },
    ],
  };
}

type ResolvedPlayer = {
  id: string;
  name: string;
  fullName?: string;
  jerseyNumber?: number;
  position?: string;
  dateOfBirth?: string;
  placeOfBirth?: string;
  nationalityIso?: string;
  nationalityName?: string;
  nationalities?: ActorNationality[];
  heightCm?: number;
  preferredFoot?: ActorSquadRow["preferredFoot"];
  portraitBytes?: Uint8Array;
  callUpClubExternalId?: string;
  callUpClubName?: string;
};

/**
 * Merge a squad row with its profile page, if one was fetched.
 *
 * The squad row is season-accurate and wins for every fact it carries; the profile only
 * fills holes and contributes the fields the squad table has no column for (place of
 * birth, full name).
 */
function resolvePlayer(
  row: ActorSquadRow,
  profileByPlayerId: Map<string, ActorPlayerProfile>,
  portraits: Map<string, Uint8Array>,
): ResolvedPlayer | null {
  if (!row.playerId) {
    return null;
  }

  const profile = profileByPlayerId.get(row.playerId);
  const jerseyNumber = row.shirtNumber ?? profile?.shirtNumber ?? undefined;

  const resolved: ResolvedPlayer = {
    id: row.playerId,
    name: profile?.playerName ?? row.playerName,
    jerseyNumber: jerseyNumber ?? undefined,
    position: row.position ?? profile?.position,
    dateOfBirth: row.dateOfBirth ?? profile?.dateOfBirth,
    nationalityIso: row.nationalityIso ?? profile?.nationalityIso,
    nationalityName: row.nationalityName ?? profile?.nationalityName,
    nationalities: row.nationalities ?? profile?.nationalities,
    heightCm: row.heightCm ?? profile?.heightCm,
    preferredFoot: row.preferredFoot ?? profile?.preferredFoot,
    portraitBytes: portraits.get(row.playerId),
    callUpClubExternalId: row.callUpClubExternalId,
    callUpClubName: row.callUpClubName,
  };

  if (profile?.fullName) {
    resolved.fullName = profile.fullName;
  }
  if (profile?.placeOfBirth) {
    resolved.placeOfBirth = profile.placeOfBirth;
  }

  return resolved;
}

export function applyClubFacts(
  club: TransfermarktRawClub,
  facts?: ClubFactsParse,
  honours?: TransfermarktRawHonour[],
): TransfermarktRawClub {
  return {
    ...club,
    // The Club grain has no short name of its own and falls back to the official name.
    // Flagging that keeps `Football Club København` from clobbering the `FC Copenhagen`
    // display label a Club-season run already stored.
    nameIsOfficialFallback: Boolean(facts?.officialName && facts.officialName === club.name),
    officialName: facts?.officialName,
    foundedOn: facts?.foundedOn,
    stadiumName: facts?.stadiumName,
    stadiumCapacity: facts?.stadiumCapacity,
    primaryColorHex: facts?.primaryColorHex,
    secondaryColorHex: facts?.secondaryColorHex,
    websiteUrl: facts?.websiteUrl,
    honours,
  };
}

export function mapClubToPayload(params: {
  competitionSlug: string;
  clubExternalId: string;
  clubName: string;
  facts?: ClubFactsParse;
  honours?: TransfermarktRawHonour[];
  identity?: CompetitionIdentity;
}): TransfermarktRawPayload {
  const identity = resolveCompetitionOrThrow(params.competitionSlug, params.identity);
  return {
    competition: competitionPayload(identity),
    seasons: [],
    clubs: [
      applyClubFacts(
        {
          id: params.clubExternalId,
          name: params.clubName,
          country: { iso3166: identity.iso3166, name: identity.countryName },
          players: [],
        },
        params.facts,
        params.honours,
      ),
    ],
  };
}

export function mapClubSeasonToPayload(params: MapClubSeasonParams): TransfermarktRawPayload {
  const identity = resolveCompetitionOrThrow(params.competitionSlug, params.identity);
  const startYear = labelToStartYear(params.seasonLabel);
  const { startDate, endDate } = seasonCalendarBounds(startYear);

  const players = params.squadRows
    .map((row) => resolvePlayer(row, params.profileByPlayerId, params.portraits ?? new Map()))
    .filter((player): player is ResolvedPlayer => player !== null)
    .map(squadRowToPlayer);

  return {
    competition: competitionPayload(identity),
    seasons: [
      {
        id: String(startYear),
        label: params.seasonLabel,
        startDate,
        endDate,
        calendarKind: "split_year",
        clubs: [
          applyClubFacts(
            {
              id: params.clubExternalId,
              name: params.clubName,
              country: { iso3166: identity.iso3166, name: identity.countryName },
              players,
            },
            params.facts,
            params.honours,
          ),
        ],
      },
    ],
  };
}

export function seasonClubRowsToPairs(
  clubs: ActorSeasonClubRow[],
  seasonLabel: string,
): Array<{ clubExternalId: string; seasonLabel: string }> {
  return clubs.map((club) => ({
    clubExternalId: club.clubId,
    seasonLabel,
  }));
}

export function expandSeasonStartYears(
  competition: string,
  fromSeason: string,
  toSeason: string,
  availableStartYears: number[],
): number[] {
  const fromLabel = resolveSeasonRef(competition, fromSeason);
  const toLabel = toSeason === "today" ? "today" : resolveSeasonRef(competition, toSeason);

  const sorted = [...availableStartYears].sort((a, b) => a - b);
  if (sorted.length === 0) {
    return [];
  }

  const fromYear = fromLabel === "today" ? sorted[sorted.length - 1]! : labelToStartYear(fromLabel);
  const toYear = toLabel === "today" ? sorted[sorted.length - 1]! : labelToStartYear(toLabel);

  if (fromYear > toYear) {
    throw new Error(`from-season ${fromSeason} is after to-season ${toSeason}`);
  }

  return sorted.filter((year) => year >= fromYear && year <= toYear);
}

export { startYearToLabel };

function resolveNationalTeamOrThrow(
  ref: string,
  identity?: NationalTeamIdentity,
): NationalTeamIdentity {
  if (identity) {
    return identity;
  }
  const catalog = catalogNationalTeamIdentity(ref);
  if (!catalog) {
    throw new Error(`Unknown national team: ${ref}`);
  }
  return catalog;
}

export function nationalTeamCompetitionPayload(
  identity: NationalTeamIdentity,
): TransfermarktRawPayload["competition"] {
  const countryExternalId = `country-${identity.iso3166.toLowerCase()}`;
  return {
    id: countryExternalId,
    name: identity.countryName,
    country: {
      id: countryExternalId,
      name: identity.countryName,
      iso3166: identity.iso3166,
    },
  };
}

function applyNationalTeamFacts(
  team: TransfermarktRawNationalTeam,
  facts?: ClubFactsParse,
  honours?: TransfermarktRawHonour[],
): TransfermarktRawNationalTeam {
  return {
    ...team,
    officialName: facts?.officialName,
    foundedOn: facts?.foundedOn,
    confederation: facts?.confederation,
    honours,
  };
}

function squadRowToPlayer(row: ResolvedPlayer): TransfermarktRawPlayer {
  const player: TransfermarktRawPlayer = {
    id: row.id,
    name: row.name,
    jerseyNumber: row.jerseyNumber,
  };
  if (row.fullName) player.fullName = row.fullName;
  if (row.position) player.position = row.position;
  if (row.dateOfBirth) player.dateOfBirth = row.dateOfBirth;
  if (row.placeOfBirth) player.placeOfBirth = row.placeOfBirth;
  if (row.nationalityIso) player.nationalityIso = row.nationalityIso;
  if (row.nationalityName) player.nationalityName = row.nationalityName;
  if (row.nationalities?.length) player.nationalities = row.nationalities.map((it) => ({ ...it }));
  if (row.heightCm !== undefined) player.heightCm = row.heightCm;
  if (row.preferredFoot) player.preferredFoot = row.preferredFoot;
  if (row.portraitBytes) player.portraitBytes = row.portraitBytes;
  if (row.callUpClubExternalId) player.callUpClubExternalId = row.callUpClubExternalId;
  if (row.callUpClubName) player.callUpClubName = row.callUpClubName;
  return player;
}

export function mapNationalTeamToPayload(params: {
  nationalTeamRef: string;
  teamName: string;
  facts?: ClubFactsParse;
  honours?: TransfermarktRawHonour[];
  identity?: NationalTeamIdentity;
}): TransfermarktRawPayload {
  const identity = resolveNationalTeamOrThrow(params.nationalTeamRef, params.identity);
  return {
    competition: nationalTeamCompetitionPayload(identity),
    seasons: [],
    nationalTeams: [
      applyNationalTeamFacts(
        {
          id: identity.transfermarktId,
          name: params.teamName,
          country: { iso3166: identity.iso3166, name: identity.countryName },
          gender: identity.gender,
          players: [],
        },
        params.facts,
        params.honours,
      ),
    ],
  };
}

export function mapNationalTeamSeasonToPayload(params: {
  nationalTeamRef: string;
  seasonLabel: string;
  teamName: string;
  squadRows: ActorSquadRow[];
  profileByPlayerId: Map<string, ActorPlayerProfile>;
  portraits?: Map<string, Uint8Array>;
  identity?: NationalTeamIdentity;
}): TransfermarktRawPayload {
  const identity = resolveNationalTeamOrThrow(params.nationalTeamRef, params.identity);
  const startYear = labelToStartYear(params.seasonLabel);
  const bareCalendarYear = /^\d{4}$/.test(params.seasonLabel);
  const { startDate, endDate } = bareCalendarYear
    ? calendarYearBounds(startYear)
    : seasonCalendarBounds(startYear);

  const players = params.squadRows
    .map((row) => resolvePlayer(row, params.profileByPlayerId, params.portraits ?? new Map()))
    .filter((player): player is ResolvedPlayer => player !== null)
    .map(squadRowToPlayer);

  return {
    competition: nationalTeamCompetitionPayload(identity),
    seasons: [
      {
        id: String(startYear),
        label: params.seasonLabel,
        startDate,
        endDate,
        calendarKind: bareCalendarYear ? "calendar" : "split_year",
        clubs: [],
        nationalTeams: [
          {
            id: identity.transfermarktId,
            name: params.teamName,
            country: { iso3166: identity.iso3166, name: identity.countryName },
            gender: identity.gender,
            players,
          },
        ],
      },
    ],
  };
}
