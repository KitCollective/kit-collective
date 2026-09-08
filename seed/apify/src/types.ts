import type {
  CalendarKind,
  ClubKind,
  LabelLocale,
  NationalTeamGender,
  PreferredFoot,
} from "@kit/domain";
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
  /** NationalTeam Hierarchy grain — identity + facts + honours, no seasons required. */
  nationalTeams?: TransfermarktRawNationalTeam[];
}

export interface TransfermarktRawSeason {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  calendarKind?: CalendarKind;
  clubs: TransfermarktRawClub[];
  nationalTeams?: TransfermarktRawNationalTeam[];
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
  /** True when `name` is only the official name standing in for a missing short name. */
  nameIsOfficialFallback?: boolean;
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

export interface TransfermarktRawNationalTeam {
  id: string;
  name: string;
  country?: { iso3166: string; name?: string };
  gender: NationalTeamGender;
  officialName?: string;
  foundedOn?: string;
  confederation?: string;
  honours?: TransfermarktRawHonour[];
  marketValue?: number;
  agent?: { name?: string; phone?: string; email?: string };
  tmLogoUrl?: string;
  transfermarktUrl?: string;
  players: TransfermarktRawPlayer[];
}

/** One citizenship as the source page lists it. */
export interface TransfermarktRawNationality {
  name: string;
  iso?: string;
}

export interface TransfermarktRawPlayer {
  id: string;
  name: string;
  /** Legal/full name from the profile page. Stored as an alias label, never the label. */
  fullName?: string;
  jerseyNumber?: number;
  position?: string;
  dateOfBirth?: string;
  placeOfBirth?: string;
  nationalityIso?: string;
  nationalityName?: string;
  /** Every citizenship, in source order. The first is the primary one. */
  nationalities?: TransfermarktRawNationality[];
  heightCm?: number;
  preferredFoot?: PreferredFoot;
  portraitBytes?: Uint8Array;
  callUpClubExternalId?: string;
  callUpClubName?: string;
  marketValue?: number;
  agent?: { name?: string; phone?: string; email?: string };
}

/** Which catalog side a career jersey row was worn for. */
export type JerseyNumberSide = "club" | "national_team";

/** One `/rueckennummern/spieler/{id}` row as Transfermarkt listed it. */
export interface TransfermarktRawJerseyNumber {
  seasonLabel: string;
  /** Transfermarkt `verein` id: a club, a reserve/youth side, or a national side. */
  sideExternalId: string;
  sideName?: string;
  side: JerseyNumberSide;
  jerseyNumber: number | null;
}

export interface TransfermarktRawPlayerJerseyNumbers {
  playerExternalId: string;
  rows: TransfermarktRawJerseyNumber[];
}

export interface NormalizedJerseyNumber {
  seasonLabel: string;
  sideExternalId: string;
  sideName?: string;
  side: JerseyNumberSide;
  squadNumber: number | null;
}

export interface NormalizedPlayerJerseyNumbers {
  playerExternalId: string;
  rows: NormalizedJerseyNumber[];
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
  nationalTeams?: NormalizedNationalTeam[];
}

export interface NormalizedSeason {
  externalId: string;
  label: string;
  startsOn: string;
  endsOn: string;
  calendarKind: CalendarKind;
  clubs: NormalizedClub[];
  nationalTeams: NormalizedNationalTeam[];
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
  nameIsOfficialFallback?: boolean;
  foundedOn?: string;
  stadiumName?: string;
  stadiumCapacity?: number;
  primaryColorHex?: string;
  secondaryColorHex?: string;
  websiteUrl?: string;
  honours?: NormalizedHonour[];
  players: NormalizedPlayer[];
}

export interface NormalizedNationalTeam {
  externalId: string;
  name: string;
  nameLocale: LabelLocale;
  countryIso: string;
  countryName?: string;
  gender: NationalTeamGender;
  officialName?: string;
  foundedOn?: string;
  confederation?: string;
  honours?: NormalizedHonour[];
  players: NormalizedPlayer[];
}

export interface NormalizedNationality {
  name: string;
  iso?: string;
}

export interface NormalizedPlayer {
  externalId: string;
  name: string;
  nameLocale: LabelLocale;
  fullName?: string;
  fullNameLocale?: LabelLocale;
  squadNumber?: number;
  position?: string;
  dateOfBirth?: string;
  placeOfBirth?: string;
  /** Primary citizenship — the one `player.primary_country_id` points at. */
  nationalityIso?: string;
  nationalityName?: string;
  /** Every citizenship, in source order. The first is the primary one. */
  nationalities?: NormalizedNationality[];
  heightCm?: number;
  preferredFoot?: PreferredFoot;
  portraitBytes?: Uint8Array;
  callUpClubExternalId?: string;
  callUpClubName?: string;
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
  nationalTeams: number;
  nationalTeamSeasons: number;
  playerNationalTeamSeasons: number;
}
