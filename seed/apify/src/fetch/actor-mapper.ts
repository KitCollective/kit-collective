import {
  type CompetitionIdentity,
  catalogCompetitionIdentity,
  resolveSeasonRef,
} from "@kit/seed-shared";
import type { TransfermarktRawClub, TransfermarktRawPayload } from "../types.js";
import type {
  ActorPlayerProfile,
  ActorSeasonClubRow,
  ActorSquadRow,
  ClubFactsParse,
  HonourParseRow,
} from "./actor-types.js";
import { labelToStartYear, seasonCalendarBounds, startYearToLabel } from "./season-label.js";

export interface MapClubSeasonParams {
  competitionSlug: string;
  clubExternalId: string;
  seasonLabel: string;
  clubName: string;
  squadRows: ActorSquadRow[];
  profileByPlayerId: Map<string, ActorPlayerProfile>;
  portraits?: Map<string, Uint8Array>;
  facts?: ClubFactsParse;
  honours?: HonourParseRow[];
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
  jerseyNumber?: number;
  position?: string;
  dateOfBirth?: string;
  nationalityIso?: string;
  nationalityName?: string;
  heightCm?: number;
  preferredFoot?: ActorSquadRow["preferredFoot"];
  portraitBytes?: Uint8Array;
};

function resolvePlayer(
  row: ActorSquadRow,
  profileByPlayerId: Map<string, ActorPlayerProfile>,
  portraits: Map<string, Uint8Array>,
): ResolvedPlayer | null {
  const needsProfile = !row.playerId || row.shirtNumber === undefined || row.shirtNumber === null;

  if (!row.playerId) {
    return null;
  }

  const profile = needsProfile ? profileByPlayerId.get(row.playerId) : undefined;
  const jerseyNumber = needsProfile
    ? profile?.shirtNumber === null || profile?.shirtNumber === undefined
      ? undefined
      : profile.shirtNumber
    : (row.shirtNumber ?? undefined);

  if (needsProfile && !profile) {
    return {
      id: row.playerId,
      name: row.playerName,
      jerseyNumber: undefined,
      position: row.position,
      dateOfBirth: row.dateOfBirth,
      nationalityIso: row.nationalityIso,
      nationalityName: row.nationalityName,
      heightCm: row.heightCm,
      preferredFoot: row.preferredFoot,
      portraitBytes: portraits.get(row.playerId),
    };
  }

  return {
    id: profile?.playerId ?? row.playerId,
    name: profile?.playerName ?? row.playerName,
    jerseyNumber,
    position: row.position,
    dateOfBirth: row.dateOfBirth,
    nationalityIso: row.nationalityIso,
    nationalityName: row.nationalityName,
    heightCm: row.heightCm,
    preferredFoot: row.preferredFoot,
    portraitBytes: portraits.get(row.playerId),
  };
}

export function applyClubFacts(
  club: TransfermarktRawClub,
  facts?: ClubFactsParse,
  honours?: HonourParseRow[],
): TransfermarktRawClub {
  return {
    ...club,
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
  honours?: HonourParseRow[];
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
    .filter((player): player is ResolvedPlayer => player !== null);

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
