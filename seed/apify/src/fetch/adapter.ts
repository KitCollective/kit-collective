import type { HonourParseRow } from "./actor-types.js";
import type { TransfermarktRawPayload, TransfermarktRawPlayerJerseyNumbers } from "../types.js";

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

/**
 * Career squad-number history for one player.
 *
 * Kept off `FetchAdapter` on purpose: `/rueckennummern/spieler/{id}` is addressed by
 * player id alone and belongs to no competition walk, and the Apify and fixture-payload
 * adapters have no source for it. Transports that can serve it widen their return type.
 */
export interface JerseyNumbersFetcher {
  fetchPlayerJerseyNumbers(playerExternalId: string): Promise<TransfermarktRawPlayerJerseyNumbers>;
}

/**
 * CDN bytes and club honours HTML for catalog marks (crests, badges, trophies).
 *
 * Kept off `FetchAdapter` the same way jersey numbers are: Apify JSON payloads have no
 * image bytes, and a walk can succeed without marks.
 */
export interface CatalogMarksFetcher {
  fetchCdnBytes(src: string): Promise<Uint8Array | undefined>;
  fetchClubHonours(clubId: string): Promise<HonourParseRow[]>;
}

/** @deprecated Use FetchClubSeasonParams */
export type FetchParams = FetchClubSeasonParams;
