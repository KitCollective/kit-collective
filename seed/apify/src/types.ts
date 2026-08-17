import type { CalendarKind, ClubKind, LabelLocale } from "@kit/domain";

export const TM_SYSTEM = "transfermarkt";

export type Lane = "development" | "staging";

export interface SeedCliArgs {
  competition: string;
  fromSeason: string;
  toSeason: string;
  lane: Lane;
}

/** Raw Transfermarkt-shaped payload from fetch adapter (may include forbidden fields). */
export interface TransfermarktRawPayload {
  competition: {
    id: string;
    name: string;
    country: {
      id: string;
      name: string;
      iso3166: string;
    };
  };
  seasons: TransfermarktRawSeason[];
}

export interface TransfermarktRawSeason {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  calendarKind?: CalendarKind;
  clubs: TransfermarktRawClub[];
}

export interface TransfermarktRawClub {
  id: string;
  name: string;
  country?: { iso3166: string };
  kind?: ClubKind;
  marketValue?: number;
  agent?: { name?: string; phone?: string; email?: string };
  tmLogoUrl?: string;
  transfermarktUrl?: string;
  players: TransfermarktRawPlayer[];
}

export interface TransfermarktRawPlayer {
  id: string;
  name: string;
  jerseyNumber?: number;
  marketValue?: number;
  agent?: { name?: string; phone?: string; email?: string };
}

/** Normalized facts after forbidden fields are stripped. */
export interface NormalizedFacts {
  league: {
    externalId: string;
    name: string;
    countryIso: string;
    countryExternalId: string;
    countryName: string;
  };
  seasons: NormalizedSeason[];
}

export interface NormalizedSeason {
  externalId: string;
  label: string;
  startsOn: string;
  endsOn: string;
  calendarKind: CalendarKind;
  clubs: NormalizedClub[];
}

export interface NormalizedClub {
  externalId: string;
  name: string;
  nameLocale: LabelLocale;
  countryIso: string;
  kind: ClubKind;
  players: NormalizedPlayer[];
}

export interface NormalizedPlayer {
  externalId: string;
  name: string;
  nameLocale: LabelLocale;
  squadNumber?: number;
}

export interface MapResult {
  countries: number;
  leagues: number;
  seasons: number;
  clubs: number;
  teamSeasons: number;
  players: number;
  playerClubSeasons: number;
  catalogLabels: number;
  externalIds: number;
}
