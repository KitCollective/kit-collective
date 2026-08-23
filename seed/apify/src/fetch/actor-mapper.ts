import {
  type CompetitionIdentity,
  catalogCompetitionIdentity,
  resolveSeasonRef,
} from "@kit/seed-shared";
import type { TransfermarktRawPayload } from "../types.js";
import type { ActorPlayerProfile, ActorSeasonClubRow, ActorSquadRow } from "./actor-types.js";
import { labelToStartYear, seasonCalendarBounds, startYearToLabel } from "./season-label.js";

export interface MapClubSeasonParams {
  competitionSlug: string;
  clubExternalId: string;
  seasonLabel: string;
  clubName: string;
  squadRows: ActorSquadRow[];
  profileByPlayerId: Map<string, ActorPlayerProfile>;
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

type ResolvedPlayer = { id: string; name: string; jerseyNumber?: number };

function resolvePlayer(
  row: ActorSquadRow,
  profileByPlayerId: Map<string, ActorPlayerProfile>,
): ResolvedPlayer | null {
  const needsProfile = !row.playerId || row.shirtNumber === undefined || row.shirtNumber === null;

  if (!needsProfile) {
    return {
      id: row.playerId!,
      name: row.playerName,
      jerseyNumber: row.shirtNumber ?? undefined,
    };
  }

  if (!row.playerId) {
    return null;
  }

  const profile = profileByPlayerId.get(row.playerId);
  if (!profile) {
    return {
      id: row.playerId,
      name: row.playerName,
      jerseyNumber: undefined,
    };
  }

  return {
    id: profile.playerId,
    name: profile.playerName,
    jerseyNumber:
      profile.shirtNumber === null || profile.shirtNumber === undefined
        ? undefined
        : profile.shirtNumber,
  };
}

export function mapClubSeasonToPayload(params: MapClubSeasonParams): TransfermarktRawPayload {
  const identity = resolveCompetitionOrThrow(params.competitionSlug, params.identity);
  const tmCode = identity.leagueTransfermarktId;
  const startYear = labelToStartYear(params.seasonLabel);
  const { startDate, endDate } = seasonCalendarBounds(startYear);

  const players = params.squadRows
    .map((row) => resolvePlayer(row, params.profileByPlayerId))
    .filter((player): player is ResolvedPlayer => player !== null);

  return {
    competition: {
      id: tmCode.toLowerCase(),
      name: identity.name,
      country: {
        id: `country-${identity.iso3166.toLowerCase()}`,
        name: identity.countryName,
        iso3166: identity.iso3166,
      },
    },
    seasons: [
      {
        id: String(startYear),
        label: params.seasonLabel,
        startDate,
        endDate,
        calendarKind: "split_year",
        clubs: [
          {
            id: params.clubExternalId,
            name: params.clubName,
            country: { iso3166: identity.iso3166 },
            players,
          },
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
