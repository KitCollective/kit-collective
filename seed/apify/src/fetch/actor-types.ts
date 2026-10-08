/** Row from the actor `season_statistics` dataset (competition season page). */
export interface ActorSeasonClubRow {
  clubId: string;
  clubName: string;
  clubUrl?: string;
}

/** One citizenship read off a Transfermarkt flag image. */
export interface ActorNationality {
  name: string;
  iso?: string;
}

/** Row from the actor `squads` dataset. */
export interface ActorSquadRow {
  playerId?: string;
  playerName: string;
  shirtNumber?: number | null;
  clubId: string;
  clubName?: string;
  season?: number;
  position?: string;
  dateOfBirth?: string;
  nationalityIso?: string;
  nationalityName?: string;
  /** Every citizenship on the row, in page order. The first is the primary one. */
  nationalities?: ActorNationality[];
  heightCm?: number;
  preferredFoot?: "left" | "right" | "both";
  portraitSrc?: string;
  callUpClubExternalId?: string;
  callUpClubName?: string;
}

export interface ClubFactsParse {
  officialName?: string;
  foundedOn?: string;
  stadiumName?: string;
  stadiumCapacity?: number;
  primaryColorHex?: string;
  secondaryColorHex?: string;
  websiteUrl?: string;
  confederation?: string;
}

export interface HonourParseRow {
  seasonLabel: string | null;
  title: string;
  /** Transfermarkt image CDN src when the titles table rendered a trophy or competition mark. */
  imageSrc?: string;
}

/**
 * Row from the actor `players` dataset (profile fetch).
 *
 * Every field beyond the identity triple is optional: the profile page renders a
 * label/value table whose rows vary per player, and older recorded fixtures only
 * carry the triple.
 */
export interface ActorPlayerProfile {
  playerId: string;
  playerName: string;
  shirtNumber?: number | null;
  /** "Full name" row, e.g. `Mustafa Abdellaoue`. */
  fullName?: string;
  /** "Name in home country" row — may be non-Latin script. */
  nameInHomeCountry?: string;
  dateOfBirth?: string;
  placeOfBirth?: string;
  heightCm?: number;
  preferredFoot?: "left" | "right" | "both";
  /** Detailed position, e.g. `Right Winger` (the group prefix is dropped). */
  position?: string;
  nationalityIso?: string;
  nationalityName?: string;
  nationalities?: ActorNationality[];
  currentClubName?: string;
  currentClubExternalId?: string;
}

/** Recorded competition season page fixture. */
export interface ActorCompetitionRecording {
  competitionCode: string;
  season: number;
  clubs: ActorSeasonClubRow[];
}

/** Recorded club-season squad fixture. */
export interface ActorSquadRecording {
  clubId: string;
  season: number;
  squads: ActorSquadRow[];
}

/** Recorded player profile fixture. */
export interface ActorProfileRecording {
  playerId: string;
  playerName: string;
  shirtNumber?: number | null;
}
