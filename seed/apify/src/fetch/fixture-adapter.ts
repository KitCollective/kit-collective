import { readFile } from "node:fs/promises";
import { normalize } from "../normalize/index.js";
import { filterSeasons } from "../season-range.js";
import type { TransfermarktRawPayload } from "../types.js";
import type {
  ClubSeasonPair,
  FetchAdapter,
  FetchClubSeasonParams,
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

export function createFixtureFetchAdapter(fixturePath: string): FetchAdapter {
  let cached: TransfermarktRawPayload | undefined;

  async function loadFixture(): Promise<TransfermarktRawPayload> {
    if (!cached) {
      const raw = await readFile(fixturePath, "utf8");
      cached = JSON.parse(raw) as TransfermarktRawPayload;
    }
    return cached;
  }

  return {
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
        throw new Error(
          `Missing kader for club ${params.clubExternalId} season ${params.season}`,
        );
      }
      return scoped;
    },
  };
}
