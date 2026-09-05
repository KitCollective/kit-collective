import type { CalendarKind, ClubKind, LabelLocale, PreferredFoot } from "@kit/domain";
import type { ResolvedSeedLane, SeedScope } from "@kit/seed-shared";

export const TM_SYSTEM = "transfermarkt";

export type Lane = "development" | "staging";

export interface RunSeedCliInput {
  scope: SeedScope;
  lane: ResolvedSeedLane;
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
  /** Club Hierarchy grain — identity + facts + honours, no seasons required. */
  clubs?: TransfermarktRawClub[];
}

export interface TransfermarktRawSeason {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  calendarKind?: CalendarKind;
  clubs: TransfermarktRawClub[];
}

export interface TransfermarktRawHonour {
  seasonLabel: string | null;
  title: string;
}

export interface TransfermarktRawClub {
  id: string;
  name: string;
  country?: { iso3166: string; name?: string };
  kind?: ClubKind;
  officialName?: string;
  foundedOn?: string;
  stadiumName?: string;
  stadiumCapacity?: number;
  primaryColorHex?: string;
  secondaryColorHex?: string;
  websiteUrl?: string;
  honours?: TransfermarktRawHonour[];
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
  position?: string;
  dateOfBirth?: string;
  nationalityIso?: string;
  nationalityName?: string;
  heightCm?: number;
  preferredFoot?: PreferredFoot;
  portraitBytes?: Uint8Array;
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
  clubs?: NormalizedClub[];
}

export interface NormalizedSeason {
  externalId: string;
  label: string;
  startsOn: string;
  endsOn: string;
  calendarKind: CalendarKind;
  clubs: NormalizedClub[];
}

export interface NormalizedHonour {
  seasonLabel: string | null;
  title: string;
}

export interface NormalizedClub {
  externalId: string;
  name: string;
  nameLocale: LabelLocale;
  countryIso: string;
  countryName?: string;
  kind: ClubKind;
  officialName?: string;
  foundedOn?: string;
  stadiumName?: string;
  stadiumCapacity?: number;
  primaryColorHex?: string;
  secondaryColorHex?: string;
  websiteUrl?: string;
  honours?: NormalizedHonour[];
  players: NormalizedPlayer[];
}

export interface NormalizedPlayer {
  externalId: string;
  name: string;
  nameLocale: LabelLocale;
  squadNumber?: number;
  position?: string;
  dateOfBirth?: string;
  nationalityIso?: string;
  nationalityName?: string;
  heightCm?: number;
  preferredFoot?: PreferredFoot;
  portraitBytes?: Uint8Array;
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
  honours: number;
  playerPhotos: number;
}
