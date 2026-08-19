/** Row from the actor `season_statistics` dataset (competition season page). */
export interface ActorSeasonClubRow {
  clubId: string;
  clubName: string;
  clubUrl?: string;
}

/** Row from the actor `squads` dataset. */
export interface ActorSquadRow {
  playerId?: string;
  playerName: string;
  shirtNumber?: number | null;
  clubId: string;
  clubName?: string;
  season?: number;
}

/** Row from the actor `players` dataset (profile fetch). */
export interface ActorPlayerProfile {
  playerId: string;
  playerName: string;
  shirtNumber?: number | null;
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
