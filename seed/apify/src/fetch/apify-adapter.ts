import { resolveCompetition } from "@kit/seed-shared";
import {
  CLUBS_DATASET,
  PINNED_ACTOR_ID,
  PLAYERS_DATASET,
  SEASON_STATISTICS_DATASET,
  SQUADS_DATASET,
} from "./actor-constants.js";
import {
  expandSeasonStartYears,
  mapClubSeasonToPayload,
  seasonClubRowsToPairs,
  startYearToLabel,
} from "./actor-mapper.js";
import {
  createActorRecordingsStore,
  type ActorRecordingsStore,
} from "./actor-recordings.js";
import type {
  ActorPlayerProfile,
  ActorProfileRecording,
  ActorSquadRow,
} from "./actor-types.js";
import { labelToStartYear } from "./season-label.js";
import type {
  ClubSeasonPair,
  FetchAdapter,
  FetchClubSeasonParams,
  ListClubSeasonPairsParams,
} from "./adapter.js";

export interface ApifyFetchAdapterOptions {
  /** Directory of recorded actor JSON fixtures (hermetic / CI mode). */
  recordingsDir?: string;
  /** Apify API token for live fetch. */
  token?: string;
  /** Override pinned actor id (defaults to automation-lab/transfermarkt-scraper). */
  actorId?: string;
  /** Test hook: called when a player profile fetch is triggered. */
  onProfileFetch?: (playerId: string) => void;
}

interface ApifyClientLike {
  actor(actorId: string): {
    call(
      input: Record<string, unknown>,
      options?: { waitSecs?: number },
    ): Promise<{ defaultDatasetId: string }>;
  };
  dataset(datasetId: string): {
    listItems(options?: { clean?: boolean; limit?: number }): Promise<{ items: unknown[] }>;
  };
}

function competitionCode(slug: string): string {
  const def = resolveCompetition(slug);
  if (!def) {
    throw new Error(`Unknown competition: ${slug}`);
  }
  return def.leagueTransfermarktId;
}

function competitionStartUrl(tmCode: string): string {
  const slug = tmCode === "DK1" ? "superligaen" : tmCode.toLowerCase();
  return `https://www.transfermarkt.com/${slug}/startseite/wettbewerb/${tmCode}`;
}

function clubStartUrl(clubId: string): string {
  return `https://www.transfermarkt.com/club/startseite/verein/${clubId}`;
}

function playerProfileUrl(playerId: string): string {
  return `https://www.transfermarkt.com/player/profil/spieler/${playerId}`;
}

function squadRowNeedsProfile(row: ActorSquadRow): boolean {
  return !row.playerId || row.shirtNumber === undefined || row.shirtNumber === null;
}

function toPlayerProfile(recording: ActorProfileRecording): ActorPlayerProfile {
  return {
    playerId: recording.playerId,
    playerName: recording.playerName,
    shirtNumber: recording.shirtNumber,
  };
}

async function fetchDatasetItems(
  client: ApifyClientLike,
  run: { defaultDatasetId: string },
  datasetName: string,
): Promise<unknown[]> {
  const datasetId = `${run.defaultDatasetId}/${datasetName}`;
  const { items } = await client.dataset(datasetId).listItems({ clean: true });
  return items;
}

async function runCompetitionSeason(
  client: ApifyClientLike,
  actorId: string,
  tmCode: string,
  season: number,
): Promise<{ clubId: string; clubName: string }[]> {
  const run = await client.actor(actorId).call({
    mode: "competitions",
    startUrls: [competitionStartUrl(tmCode)],
    season,
  });

  const items = await fetchDatasetItems(client, run, SEASON_STATISTICS_DATASET);
  return items.map((item) => {
    const row = item as { clubId?: string; clubName?: string };
    if (!row.clubId || !row.clubName) {
      throw new Error(`Invalid season_statistics row: ${JSON.stringify(item)}`);
    }
    return { clubId: row.clubId, clubName: row.clubName };
  });
}

async function runClubSquad(
  client: ApifyClientLike,
  actorId: string,
  clubId: string,
  season: number,
): Promise<ActorSquadRow[]> {
  const run = await client.actor(actorId).call({
    mode: "clubs",
    startUrls: [clubStartUrl(clubId)],
    season,
  });

  const items = await fetchDatasetItems(client, run, SQUADS_DATASET);
  return items.map((item) => {
    const row = item as ActorSquadRow;
    return {
      playerId: row.playerId,
      playerName: row.playerName,
      shirtNumber: row.shirtNumber,
      clubId: row.clubId ?? clubId,
      clubName: row.clubName,
      season: row.season ?? season,
    };
  });
}

async function runPlayerProfile(
  client: ApifyClientLike,
  actorId: string,
  playerId: string,
): Promise<ActorPlayerProfile> {
  const run = await client.actor(actorId).call({
    mode: "players",
    startUrls: [playerProfileUrl(playerId)],
  });

  const items = await fetchDatasetItems(client, run, PLAYERS_DATASET);
  const first = items[0] as { playerId?: string; playerName?: string; shirtNumber?: number | null };
  if (!first?.playerId || !first.playerName) {
    throw new Error(`Invalid player profile for ${playerId}`);
  }
  return {
    playerId: first.playerId,
    playerName: first.playerName,
    shirtNumber: first.shirtNumber,
  };
}

async function resolveProfiles(
  squadRows: ActorSquadRow[],
  fetchProfile: (playerId: string) => Promise<ActorPlayerProfile>,
  onProfileFetch?: (playerId: string) => void,
): Promise<Map<string, ActorPlayerProfile>> {
  const profiles = new Map<string, ActorPlayerProfile>();

  for (const row of squadRows) {
    if (!squadRowNeedsProfile(row) || !row.playerId) {
      continue;
    }
    if (profiles.has(row.playerId)) {
      continue;
    }
    onProfileFetch?.(row.playerId);
    profiles.set(row.playerId, await fetchProfile(row.playerId));
  }

  return profiles;
}

function createRecordingsAdapter(
  store: ActorRecordingsStore,
  onProfileFetch?: (playerId: string) => void,
): FetchAdapter {
  return {
    async listClubSeasonPairs(params: ListClubSeasonPairsParams): Promise<ClubSeasonPair[]> {
      const available = await store.listAvailableSeasons(params.competition);
      const seasons = expandSeasonStartYears(
        params.competition,
        params.fromSeason,
        params.toSeason,
        available,
      );

      const pairs: ClubSeasonPair[] = [];
      for (const startYear of seasons) {
        const recording = await store.loadCompetitionSeason(params.competition, startYear);
        const seasonLabel = startYearToLabel(startYear);
        pairs.push(...seasonClubRowsToPairs(recording.clubs, seasonLabel));
      }
      return pairs;
    },

    async fetchClubSeason(params: FetchClubSeasonParams) {
      const startYear = labelToStartYear(params.season);
      const squadRecording = await store.loadSquad(params.clubExternalId, startYear);
      const clubName =
        squadRecording.squads[0]?.clubName ??
        (await store.loadCompetitionSeason(params.competition, startYear)).clubs.find(
          (club) => club.clubId === params.clubExternalId,
        )?.clubName ??
        params.clubExternalId;

      const profileByPlayerId = await resolveProfiles(
        squadRecording.squads,
        async (playerId) => toPlayerProfile(await store.loadProfile(playerId)),
        onProfileFetch,
      );

      return mapClubSeasonToPayload({
        competitionSlug: params.competition,
        clubExternalId: params.clubExternalId,
        seasonLabel: params.season,
        clubName,
        squadRows: squadRecording.squads,
        profileByPlayerId,
      });
    },
  };
}

function createLiveAdapter(
  client: ApifyClientLike,
  actorId: string,
  onProfileFetch?: (playerId: string) => void,
): FetchAdapter {
  return {
    async listClubSeasonPairs(params: ListClubSeasonPairsParams): Promise<ClubSeasonPair[]> {
      const tmCode = competitionCode(params.competition);
      const fromLabel =
        params.fromSeason === "today"
          ? "today"
          : params.fromSeason;
      const toLabel = params.toSeason;

      const fromYear =
        fromLabel === "today"
          ? new Date().getFullYear()
          : /^\d{4}$/.test(fromLabel)
            ? Number.parseInt(fromLabel, 10)
            : labelToStartYear(fromLabel);
      const toYear =
        toLabel === "today"
          ? new Date().getFullYear()
          : /^\d{4}$/.test(toLabel)
            ? Number.parseInt(toLabel, 10)
            : labelToStartYear(toLabel);

      if (fromYear > toYear) {
        throw new Error(`from-season ${params.fromSeason} is after to-season ${params.toSeason}`);
      }

      const pairs: ClubSeasonPair[] = [];
      for (let year = fromYear; year <= toYear; year += 1) {
        const clubs = await runCompetitionSeason(client, actorId, tmCode, year);
        const seasonLabel = startYearToLabel(year);
        pairs.push(
          ...clubs.map((club) => ({
            clubExternalId: club.clubId,
            seasonLabel,
          })),
        );
      }
      return pairs;
    },

    async fetchClubSeason(params: FetchClubSeasonParams) {
      const tmCode = competitionCode(params.competition);
      const startYear = labelToStartYear(params.season);
      const squadRows = await runClubSquad(client, actorId, params.clubExternalId, startYear);

      const clubs = await runCompetitionSeason(client, actorId, tmCode, startYear);
      const clubName =
        clubs.find((club) => club.clubId === params.clubExternalId)?.clubName ??
        squadRows[0]?.clubName ??
        params.clubExternalId;

      const profileByPlayerId = await resolveProfiles(
        squadRows,
        (playerId) => runPlayerProfile(client, actorId, playerId),
        onProfileFetch,
      );

      return mapClubSeasonToPayload({
        competitionSlug: params.competition,
        clubExternalId: params.clubExternalId,
        seasonLabel: params.season,
        clubName,
        squadRows,
        profileByPlayerId,
      });
    },
  };
}

export function createApifyFetchAdapter(options: ApifyFetchAdapterOptions): FetchAdapter {
  const actorId = options.actorId ?? PINNED_ACTOR_ID;

  if (options.recordingsDir) {
    const store = createActorRecordingsStore(options.recordingsDir);
    return createRecordingsAdapter(store, options.onProfileFetch);
  }

  if (!options.token) {
    throw new Error("Apify fetch adapter requires recordingsDir or token");
  }

  throw new Error(
    "Live Apify client is not initialized in this build. Pass recordingsDir for hermetic mode.",
  );
}

export async function createLiveApifyFetchAdapter(
  options: ApifyFetchAdapterOptions & { token: string },
): Promise<FetchAdapter> {
  const actorId = options.actorId ?? PINNED_ACTOR_ID;
  const { ApifyClient } = await import("apify-client");
  const client = new ApifyClient({ token: options.token }) as unknown as ApifyClientLike;
  return createLiveAdapter(client, actorId, options.onProfileFetch);
}

export {
  CLUBS_DATASET,
  PINNED_ACTOR_ID,
  PLAYERS_DATASET,
  SEASON_STATISTICS_DATASET,
  SQUADS_DATASET,
};
