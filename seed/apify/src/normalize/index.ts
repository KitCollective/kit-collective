import type {
  NormalizedClub,
  NormalizedFacts,
  NormalizedNationalTeam,
  NormalizedPlayer,
  NormalizedSeason,
  TransfermarktRawClub,
  TransfermarktRawNationalTeam,
  TransfermarktRawPayload,
  TransfermarktRawPlayer,
} from "../types.js";
import { seedLabelLocale } from "./seed-label-locale.js";

const FORBIDDEN_CLUB_KEYS = new Set(["marketValue", "agent", "tmLogoUrl", "transfermarktUrl"]);

const FORBIDDEN_NATIONAL_TEAM_KEYS = new Set([
  "marketValue",
  "agent",
  "tmLogoUrl",
  "transfermarktUrl",
]);

const FORBIDDEN_PLAYER_KEYS = new Set(["marketValue", "agent"]);

function assertNoForbiddenKeys(
  value: TransfermarktRawClub | TransfermarktRawNationalTeam | TransfermarktRawPlayer,
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
  const player: NormalizedPlayer = {
    externalId: raw.id,
    name: raw.name,
    nameLocale: seedLabelLocale(raw.name),
    squadNumber: raw.jerseyNumber,
  };
  if (raw.position) player.position = raw.position;
  if (raw.dateOfBirth) player.dateOfBirth = raw.dateOfBirth;
  if (raw.nationalityIso) player.nationalityIso = raw.nationalityIso;
  if (raw.nationalityName) player.nationalityName = raw.nationalityName;
  if (raw.heightCm !== undefined) player.heightCm = raw.heightCm;
  if (raw.preferredFoot) player.preferredFoot = raw.preferredFoot;
  if (raw.portraitBytes) player.portraitBytes = raw.portraitBytes;
  if (raw.callUpClubExternalId) player.callUpClubExternalId = raw.callUpClubExternalId;
  if (raw.callUpClubName) player.callUpClubName = raw.callUpClubName;
  return player;
}

function normalizeClub(raw: TransfermarktRawClub): NormalizedClub {
  assertNoForbiddenKeys(raw, FORBIDDEN_CLUB_KEYS, "club");
  const club: NormalizedClub = {
    externalId: raw.id,
    name: raw.name,
    nameLocale: seedLabelLocale(raw.name),
    countryIso: raw.country?.iso3166 ?? "XX",
    kind: raw.kind ?? "club",
    players: raw.players.map(normalizePlayer),
  };
  if (raw.country?.name) club.countryName = raw.country.name;
  if (raw.officialName) club.officialName = raw.officialName;
  if (raw.foundedOn) club.foundedOn = raw.foundedOn;
  if (raw.stadiumName) club.stadiumName = raw.stadiumName;
  if (raw.stadiumCapacity !== undefined) club.stadiumCapacity = raw.stadiumCapacity;
  if (raw.primaryColorHex) club.primaryColorHex = raw.primaryColorHex;
  if (raw.secondaryColorHex) club.secondaryColorHex = raw.secondaryColorHex;
  if (raw.websiteUrl) club.websiteUrl = raw.websiteUrl;
  if (raw.honours?.length) club.honours = raw.honours.map((row) => ({ ...row }));
  return club;
}

function normalizeNationalTeam(raw: TransfermarktRawNationalTeam): NormalizedNationalTeam {
  assertNoForbiddenKeys(raw, FORBIDDEN_NATIONAL_TEAM_KEYS, "nationalTeam");
  const team: NormalizedNationalTeam = {
    externalId: raw.id,
    name: raw.name,
    nameLocale: seedLabelLocale(raw.name),
    countryIso: raw.country?.iso3166 ?? "XX",
    gender: raw.gender,
    players: raw.players.map(normalizePlayer),
  };
  if (raw.country?.name) team.countryName = raw.country.name;
  if (raw.officialName) team.officialName = raw.officialName;
  if (raw.foundedOn) team.foundedOn = raw.foundedOn;
  if (raw.confederation) team.confederation = raw.confederation;
  if (raw.honours?.length) team.honours = raw.honours.map((row) => ({ ...row }));
  return team;
}

function normalizeSeason(season: TransfermarktRawPayload["seasons"][number]): NormalizedSeason {
  return {
    externalId: season.id,
    label: season.label,
    startsOn: season.startDate,
    endsOn: season.endDate,
    calendarKind: season.calendarKind ?? "split_year",
    clubs: season.clubs.map(normalizeClub),
    nationalTeams: (season.nationalTeams ?? []).map(normalizeNationalTeam),
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
    clubs: raw.clubs?.map(normalizeClub),
    nationalTeams: raw.nationalTeams?.map(normalizeNationalTeam),
  };
}

function cleanPlayer(player: TransfermarktRawPlayer): TransfermarktRawPlayer {
  return {
    id: player.id,
    name: player.name,
    jerseyNumber: player.jerseyNumber,
    position: player.position,
    dateOfBirth: player.dateOfBirth,
    nationalityIso: player.nationalityIso,
    nationalityName: player.nationalityName,
    heightCm: player.heightCm,
    preferredFoot: player.preferredFoot,
    portraitBytes: player.portraitBytes,
    callUpClubExternalId: player.callUpClubExternalId,
    callUpClubName: player.callUpClubName,
  };
}

function cleanClub(club: TransfermarktRawClub): TransfermarktRawClub {
  const cleaned: TransfermarktRawClub = {
    id: club.id,
    name: club.name,
    country: club.country ? { iso3166: club.country.iso3166, name: club.country.name } : undefined,
    kind: club.kind,
    officialName: club.officialName,
    foundedOn: club.foundedOn,
    stadiumName: club.stadiumName,
    stadiumCapacity: club.stadiumCapacity,
    primaryColorHex: club.primaryColorHex,
    secondaryColorHex: club.secondaryColorHex,
    websiteUrl: club.websiteUrl,
    honours: club.honours?.map((row) => ({ ...row })),
    players: club.players.map(cleanPlayer),
  };
  return cleaned;
}

function cleanNationalTeam(team: TransfermarktRawNationalTeam): TransfermarktRawNationalTeam {
  return {
    id: team.id,
    name: team.name,
    country: team.country ? { iso3166: team.country.iso3166, name: team.country.name } : undefined,
    gender: team.gender,
    officialName: team.officialName,
    foundedOn: team.foundedOn,
    confederation: team.confederation,
    honours: team.honours?.map((row) => ({ ...row })),
    players: team.players.map(cleanPlayer),
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
      clubs: season.clubs.map(cleanClub),
      nationalTeams: season.nationalTeams?.map(cleanNationalTeam),
    })),
    clubs: raw.clubs?.map(cleanClub),
    nationalTeams: raw.nationalTeams?.map(cleanNationalTeam),
  };
}

export function normalize(raw: TransfermarktRawPayload): NormalizedFacts {
  const stripped = stripForbiddenFields(raw);
  return normalizeTransfermarktPayload(stripped);
}
