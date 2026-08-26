import type {
  NormalizedClub,
  NormalizedFacts,
  NormalizedPlayer,
  NormalizedSeason,
  TransfermarktRawClub,
  TransfermarktRawPayload,
  TransfermarktRawPlayer,
} from "../types.js";
import { seedLabelLocale } from "./seed-label-locale.js";

const FORBIDDEN_CLUB_KEYS = new Set(["marketValue", "agent", "tmLogoUrl", "transfermarktUrl"]);

const FORBIDDEN_PLAYER_KEYS = new Set(["marketValue", "agent"]);

function assertNoForbiddenKeys(
  value: TransfermarktRawClub | TransfermarktRawPlayer,
  forbidden: Set<string>,
  path: string,
) {
  for (const key of Object.keys(value)) {
    if (forbidden.has(key)) {
      throw new Error(`Forbidden field ${path}.${key} must be dropped before mapping`);
    }
  }
}

function normalizePlayer(raw: TransfermarktRawPlayer): NormalizedPlayer {
  assertNoForbiddenKeys(raw, FORBIDDEN_PLAYER_KEYS, "player");
  return {
    externalId: raw.id,
    name: raw.name,
    nameLocale: seedLabelLocale(raw.name),
    squadNumber: raw.jerseyNumber,
  };
}

function normalizeClub(raw: TransfermarktRawClub): NormalizedClub {
  assertNoForbiddenKeys(raw, FORBIDDEN_CLUB_KEYS, "club");
  return {
    externalId: raw.id,
    name: raw.name,
    nameLocale: seedLabelLocale(raw.name),
    countryIso: raw.country?.iso3166 ?? "XX",
    kind: raw.kind ?? "club",
    players: raw.players.map(normalizePlayer),
  };
}

function normalizeSeason(season: TransfermarktRawPayload["seasons"][number]): NormalizedSeason {
  return {
    externalId: season.id,
    label: season.label,
    startsOn: season.startDate,
    endsOn: season.endDate,
    calendarKind: season.calendarKind ?? "split_year",
    clubs: season.clubs.map(normalizeClub),
  };
}

export function normalizeTransfermarktPayload(raw: TransfermarktRawPayload): NormalizedFacts {
  return {
    league: {
      externalId: raw.competition.id,
      name: raw.competition.name,
      countryIso: raw.competition.country.iso3166,
      countryExternalId: raw.competition.country.id,
      countryName: raw.competition.country.name,
    },
    seasons: raw.seasons.map(normalizeSeason),
  };
}

/** Strip forbidden Transfermarkt fields from a raw payload object (mutates a copy). */
export function stripForbiddenFields(raw: TransfermarktRawPayload): TransfermarktRawPayload {
  return {
    competition: { ...raw.competition, country: { ...raw.competition.country } },
    seasons: raw.seasons.map((season) => ({
      id: season.id,
      label: season.label,
      startDate: season.startDate,
      endDate: season.endDate,
      calendarKind: season.calendarKind,
      clubs: season.clubs.map((club) => {
        const cleaned: TransfermarktRawClub = {
          id: club.id,
          name: club.name,
          country: club.country ? { iso3166: club.country.iso3166 } : undefined,
          kind: club.kind,
          players: club.players.map((player) => ({
            id: player.id,
            name: player.name,
            jerseyNumber: player.jerseyNumber,
          })),
        };
        return cleaned;
      }),
    })),
  };
}

export function normalize(raw: TransfermarktRawPayload): NormalizedFacts {
  const stripped = stripForbiddenFields(raw);
  return normalizeTransfermarktPayload(stripped);
}
