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

export interface FetchAdapter {
  /** League Hierarchy grain — competition identity only (no seasons/clubs). */
  fetchLeague(params: FetchLeagueParams): Promise<TransfermarktRawPayload>;
  /**
   * League season Hierarchy grain — competition season page club/side list.
   * Clubs carry empty player arrays (kader is Club season grain).
   */
  fetchLeagueSeason(params: FetchLeagueSeasonParams): Promise<TransfermarktRawPayload>;
  fetchClubSeason(params: FetchClubSeasonParams): Promise<TransfermarktRawPayload>;
  listClubSeasonPairs(params: ListClubSeasonPairsParams): Promise<ClubSeasonPair[]>;
}

/** @deprecated Use FetchClubSeasonParams */
export type FetchParams = FetchClubSeasonParams;
