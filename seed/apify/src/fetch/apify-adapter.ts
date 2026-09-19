import { resolveCompetition, resolveSeasonRef } from "@kit/seed-shared";
import { ApifyClient } from "apify-client";
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
  mapClubToPayload,
  mapLeagueSeasonToPayload,
  mapLeagueToPayload,
  seasonClubRowsToPairs,
  startYearToLabel,
} from "./actor-mapper.js";
import { type ActorRecordingsStore, createActorRecordingsStore } from "./actor-recordings.js";
import type { ActorPlayerProfile, ActorProfileRecording, ActorSquadRow } from "./actor-types.js";
import type {
  ClubSeasonPair,
  FetchAdapter,
  FetchClubSeasonParams,
  ListClubSeasonPairsParams,
} from "./adapter.js";
import { labelToStartYear } from "./season-label.js";
import { resolveProfiles } from "./squad-profile-hop.js";

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

interface ApifyActorRun {
  defaultDatasetId: string;
  storageIds?: {
    datasets?: Record<string, string>;
  };
}

interface ApifyClientLike {
  actor(actorId: string): {
    call(input: Record<string, unknown>, options?: { waitSecs?: number }): Promise<ApifyActorRun>;
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

function toPlayerProfile(recording: ActorProfileRecording): ActorPlayerProfile {
  return {
    playerId: recording.playerId,
    playerName: recording.playerName,
    shirtNumber: recording.shirtNumber,
  };
}

function resolveNamedDatasetId(run: ApifyActorRun, datasetName: string): string {
  const datasets = run.storageIds?.datasets ?? {};
  const namedId = datasets[datasetName];
  if (namedId) {
    return namedId;
  }
  // Players mode stores profile rows on the default dataset, not a "players" named store.
  if (datasetName === PLAYERS_DATASET && datasets.default) {
    return datasets.default;
  }
  throw new Error(
    `Named dataset "${datasetName}" not found on actor run (available: ${Object.keys(datasets).join(", ") || "none"})`,
  );
}

async function fetchDatasetItems(
  client: ApifyClientLike,
  run: ApifyActorRun,
  datasetName: string,
): Promise<unknown[]> {
  const datasetId = resolveNamedDatasetId(run, datasetName);
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
    // SAFETY: every field is optional here, and the guard below rejects the row
    // before any caller sees it.
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
    // SAFETY: every field read below is either optional or defaulted, so a missing
    // one yields an empty name or the requested club/season rather than undefined.
    const row = item as ActorSquadRow & { name?: string };
    return {
      playerId: row.playerId,
      playerName: row.playerName ?? row.name ?? "",
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
  // SAFETY: every field is optional here, and the guard below rejects the profile
  // before any caller sees it.
  const first = items[0] as {
    playerId?: string;
    playerName?: string;
    name?: string;
    shirtNumber?: number | null;
  };
  const playerName = first?.playerName ?? first?.name;
  if (!first?.playerId || !playerName) {
    throw new Error(`Invalid player profile for ${playerId}`);
  }
  return {
    playerId: first.playerId,
    playerName,
    shirtNumber: first.shirtNumber,
  };
}

function createRecordingsAdapter(
  store: ActorRecordingsStore,
  onProfileFetch?: (playerId: string) => void,
): FetchAdapter {
  return {
    async fetchLeague(params) {
      return mapLeagueToPayload(params.competition);
    },

    async fetchLeagueSeason(params) {
      const seasonLabel = resolveSeasonRef(params.competition, params.season);
      const startYear = labelToStartYear(seasonLabel);
      const recording = await store.loadCompetitionSeason(params.competition, startYear);
      return mapLeagueSeasonToPayload({
        competitionSlug: params.competition,
        seasonLabel,
        clubs: recording.clubs,
      });
    },

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

    async fetchClub(params) {
      return mapClubToPayload({
        competitionSlug: params.competition,
        clubExternalId: params.clubExternalId,
        clubName: params.clubExternalId,
      });
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

    async fetchNationalTeam(_params) {
      throw new Error("Apify recordings adapter does not implement fetchNationalTeam");
    },

    async fetchNationalTeamSeason(_params) {
      throw new Error("Apify recordings adapter does not implement fetchNationalTeamSeason");
    },
  };
}

function createLiveAdapter(
  client: ApifyClientLike,
  actorId: string,
  onProfileFetch?: (playerId: string) => void,
): FetchAdapter {
  return {
    async fetchLeague(params) {
      return mapLeagueToPayload(params.competition);
    },

    async fetchLeagueSeason(params) {
      const seasonLabel = resolveSeasonRef(params.competition, params.season);
      const tmCode = competitionCode(params.competition);
      const startYear = labelToStartYear(seasonLabel);
      const clubs = await runCompetitionSeason(client, actorId, tmCode, startYear);
      return mapLeagueSeasonToPayload({
        competitionSlug: params.competition,
        seasonLabel,
        clubs,
      });
    },

    async listClubSeasonPairs(params: ListClubSeasonPairsParams): Promise<ClubSeasonPair[]> {
      const tmCode = competitionCode(params.competition);
      const fromLabel = params.fromSeason === "today" ? "today" : params.fromSeason;
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

    async fetchClub(params) {
      return mapClubToPayload({
        competitionSlug: params.competition,
        clubExternalId: params.clubExternalId,
        clubName: params.clubExternalId,
      });
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

    async fetchNationalTeam(_params) {
      throw new Error("Apify live adapter does not implement fetchNationalTeam");
    },

    async fetchNationalTeamSeason(_params) {
      throw new Error("Apify live adapter does not implement fetchNationalTeamSeason");
    },
  };
}

export function createApifyFetchAdapter(options: ApifyFetchAdapterOptions): FetchAdapter {
  if (options.recordingsDir) {
    const store = createActorRecordingsStore(options.recordingsDir);
    return createRecordingsAdapter(store, options.onProfileFetch);
  }

  if (options.token) {
    return createLiveApifyFetchAdapter({ ...options, token: options.token });
  }

  throw new Error("Apify fetch adapter requires recordingsDir or token");
}

export function createLiveApifyFetchAdapter(
  options: ApifyFetchAdapterOptions & { token: string },
): FetchAdapter {
  const actorId = options.actorId ?? PINNED_ACTOR_ID;
  // SAFETY: ApifyClientLike names the two SDK methods this adapter calls; the SDK's own
  // types are wider, so the narrowing is checked by the calls in createLiveAdapter.
  const client: ApifyClientLike = new ApifyClient({ token: options.token });
  return createLiveAdapter(client, actorId, options.onProfileFetch);
}

export {
  CLUBS_DATASET,
  PINNED_ACTOR_ID,
  PLAYERS_DATASET,
  SEASON_STATISTICS_DATASET,
  SQUADS_DATASET,
};
