import type { TransfermarktRawPayload } from "../types.js";

export interface ClubSeasonPair {
  clubExternalId: string;
  seasonLabel: string;
}

export interface FetchClubSeasonParams {
  competition: string;
  clubExternalId: string;
  season: string;
}

export interface ListClubSeasonPairsParams {
  competition: string;
  fromSeason: string;
  toSeason: string;
}

export interface FetchLeagueParams {
  competition: string;
}

export interface FetchLeagueSeasonParams {
  competition: string;
  season: string;
}

export interface FetchClubParams {
  competition: string;
  clubExternalId: string;
}

export interface FetchNationalTeamParams {
  nationalTeamRef: string;
}

export interface FetchNationalTeamSeasonParams {
  nationalTeamRef: string;
  season: string;
}

export interface FetchAdapter {
  /** League Hierarchy grain — competition identity only (no seasons/clubs). */
  fetchLeague(params: FetchLeagueParams): Promise<TransfermarktRawPayload>;
  /**
   * League season Hierarchy grain — competition season page club/side list.
   * Clubs carry empty player arrays (kader is Club season grain).
   */
  fetchLeagueSeason(params: FetchLeagueSeasonParams): Promise<TransfermarktRawPayload>;
  /** Club Hierarchy grain — identity + Club facts + Honours. */
  fetchClub(params: FetchClubParams): Promise<TransfermarktRawPayload>;
  /** NationalTeam Hierarchy grain — identity + facts + Honours. */
  fetchNationalTeam(params: FetchNationalTeamParams): Promise<TransfermarktRawPayload>;
  /** NationalTeam season Hierarchy grain — NT kader for a calendar or split season. */
  fetchNationalTeamSeason(params: FetchNationalTeamSeasonParams): Promise<TransfermarktRawPayload>;
  fetchClubSeason(params: FetchClubSeasonParams): Promise<TransfermarktRawPayload>;
  listClubSeasonPairs(params: ListClubSeasonPairsParams): Promise<ClubSeasonPair[]>;
}

/** @deprecated Use FetchClubSeasonParams */
export type FetchParams = FetchClubSeasonParams;
