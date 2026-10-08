import { readFile } from "node:fs/promises";
import { normalize } from "../normalize/index.js";
import { filterSeasons } from "../season-range.js";
import type { TransfermarktRawPayload } from "../types.js";
import type {
  ClubSeasonPair,
  FetchAdapter,
  FetchClubSeasonParams,
  FetchLeagueParams,
  FetchLeagueSeasonParams,
  ListClubSeasonPairsParams,
} from "./adapter.js";

function scopeClubSeason(
  payload: TransfermarktRawPayload,
  clubExternalId: string,
  seasonLabel: string,
): TransfermarktRawPayload {
  const seasons = payload.seasons
    .filter((season) => season.label === seasonLabel)
    .map((season) => ({
      ...season,
      clubs: season.clubs.filter((club) => club.id === clubExternalId),
    }))
    .filter((season) => season.clubs.length > 0);

  return {
    competition: payload.competition,
    seasons,
  };
}

function scopeLeagueSeason(
  payload: TransfermarktRawPayload,
  seasonLabel: string,
): TransfermarktRawPayload {
  const seasons = payload.seasons
    .filter((season) => season.label === seasonLabel)
    .map((season) => ({
      ...season,
      clubs: season.clubs.map((club) => ({
        ...club,
        players: [],
      })),
    }));

  return {
    competition: payload.competition,
    seasons,
  };
}

export function createFixtureFetchAdapter(fixturePath: string): FetchAdapter {
  let cached: TransfermarktRawPayload | undefined;

  async function loadFixture(): Promise<TransfermarktRawPayload> {
    if (!cached) {
      const raw = await readFile(fixturePath, "utf8");
      // SAFETY: fixtures are committed in this repository, so their shape is fixed at
      // review time rather than supplied by Transfermarkt at runtime.
      cached = JSON.parse(raw) as TransfermarktRawPayload;
    }
    return cached;
  }

  return {
    async fetchLeague(_params: FetchLeagueParams): Promise<TransfermarktRawPayload> {
      const payload = await loadFixture();
      return {
        competition: payload.competition,
        seasons: [],
      };
    },

    async fetchLeagueSeason(params: FetchLeagueSeasonParams): Promise<TransfermarktRawPayload> {
      const payload = await loadFixture();
      const scoped = scopeLeagueSeason(payload, params.season);
      if (scoped.seasons.length === 0) {
        throw new Error(`Missing competition season ${params.season} for ${params.competition}`);
      }
      return scoped;
    },

    async listClubSeasonPairs(params: ListClubSeasonPairsParams): Promise<ClubSeasonPair[]> {
      const payload = await loadFixture();
      const facts = normalize(payload);
      const seasons = filterSeasons(
        facts.seasons,
        params.competition,
        params.fromSeason,
        params.toSeason,
      );

      const pairs: ClubSeasonPair[] = [];
      for (const season of seasons) {
        for (const club of season.clubs) {
          pairs.push({ clubExternalId: club.externalId, seasonLabel: season.label });
        }
      }
      return pairs;
    },

    async fetchClubSeason(params: FetchClubSeasonParams): Promise<TransfermarktRawPayload> {
      const payload = await loadFixture();
      const scoped = scopeClubSeason(payload, params.clubExternalId, params.season);
      if (scoped.seasons.length === 0) {
        throw new Error(`Missing kader for club ${params.clubExternalId} season ${params.season}`);
      }
      return scoped;
    },

    async fetchClub(params) {
      const payload = await loadFixture();
      for (const season of payload.seasons) {
        const match = season.clubs.find((club) => club.id === params.clubExternalId);
        if (match) {
          return {
            competition: payload.competition,
            seasons: [],
            clubs: [{ ...match, players: [] }],
          };
        }
      }
      throw new Error(`Missing club ${params.clubExternalId} for ${params.competition}`);
    },

    async fetchNationalTeam(params) {
      const payload = await loadFixture();
      const match = payload.nationalTeams?.[0];
      if (match && match.id === params.nationalTeamRef) {
        return {
          competition: payload.competition,
          seasons: [],
          nationalTeams: [{ ...match, players: [] }],
        };
      }
      throw new Error(`Missing national team ${params.nationalTeamRef}`);
    },

    async fetchNationalTeamSeason(_params) {
      throw new Error("fixture adapter does not implement fetchNationalTeamSeason");
    },
  };
}
