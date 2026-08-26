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

export interface FetchAdapter {
  fetchClubSeason(params: FetchClubSeasonParams): Promise<TransfermarktRawPayload>;
  listClubSeasonPairs(params: ListClubSeasonPairsParams): Promise<ClubSeasonPair[]>;
}

/** @deprecated Use FetchClubSeasonParams */
export type FetchParams = FetchClubSeasonParams;
