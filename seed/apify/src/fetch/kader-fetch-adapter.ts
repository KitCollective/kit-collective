import { resolveCompetition } from "@kit/seed-shared";
import type { ActorPlayerProfile, ActorSeasonClubRow } from "./actor-types.js";
import {
  expandSeasonStartYears,
  mapClubSeasonToPayload,
  seasonClubRowsToPairs,
  startYearToLabel,
} from "./actor-mapper.js";
import {
  parseCompetitionSeasonHtml,
  parseKaderHtml,
  parsePlayerProfileHtml,
  type KaderParseWarning,
} from "./kader-html-parser.js";
import { createKaderHtmlStore, type KaderHtmlStore } from "./kader-html-store.js";
import { labelToStartYear } from "./season-label.js";
import { resolveProfiles } from "./squad-profile-hop.js";
import type {
  ClubSeasonPair,
  FetchAdapter,
  FetchClubSeasonParams,
  ListClubSeasonPairsParams,
} from "./adapter.js";

export interface KaderFetchAdapterOptions {
  /** Directory of recorded Transfermarkt HTML fixtures (hermetic / CI mode). */
  fixturesDir?: string;
  /** Optional HTTP client for live fetch. Defaults to global fetch. */
  fetchHtml?: (url: string) => Promise<string>;
  /** Test hook: called when a player profile fetch is triggered. */
  onProfileFetch?: (playerId: string) => void;
  /** Test hook: called when a squad row lacks a jersey number after parsing. */
  onMissingJerseyNumber?: (warning: KaderParseWarning) => void;
}

function competitionCode(slug: string): string {
  const def = resolveCompetition(slug);
  if (!def) {
    throw new Error(`Unknown competition: ${slug}`);
  }
  return def.leagueTransfermarktId;
}

export function competitionSeasonUrl(tmCode: string, season: number): string {
  const slug = tmCode === "DK1" ? "superligaen" : tmCode.toLowerCase();
  return `https://www.transfermarkt.com/${slug}/startseite/wettbewerb/${tmCode}/saison_id/${season}`;
}

export function kaderUrl(clubId: string, season: number): string {
  return `https://www.transfermarkt.com/-/kader/verein/${clubId}/saison_id/${season}/plus/1`;
}

export function playerProfileUrl(playerId: string): string {
  return `https://www.transfermarkt.com/-/profil/spieler/${playerId}`;
}

export class TransfermarktHttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
  ) {
    super(`Transfermarkt HTTP ${status} for ${url}`);
    this.name = "TransfermarktHttpError";
  }
}

async function defaultFetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "KitCollective-Seed/1.0 (+https://github.com/KitCollective/kit-collective)",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  if (!response.ok) {
    throw new TransfermarktHttpError(response.status, url);
  }

  return response.text();
}

interface KaderHtmlClient {
  fetchCompetitionSeason(competition: string, season: number): Promise<ActorSeasonClubRow[]>;
  fetchKader(
    clubId: string,
    season: number,
    clubName?: string,
  ): Promise<{ squadRows: ReturnType<typeof parseKaderHtml>["squadRows"]; warnings: KaderParseWarning[] }>;
  fetchPlayerProfile(playerId: string): Promise<ActorPlayerProfile>;
}

function createKaderHtmlClient(
  loadCompetitionHtml: (competition: string, season: number) => Promise<string>,
  loadKaderHtml: (clubId: string, season: number) => Promise<string>,
  loadProfileHtml: (playerId: string) => Promise<string>,
  onMissingJerseyNumber?: (warning: KaderParseWarning) => void,
): KaderHtmlClient {
  const competitionCache = new Map<string, ActorSeasonClubRow[]>();

  async function getCompetitionClubs(
    competition: string,
    season: number,
  ): Promise<ActorSeasonClubRow[]> {
    const cacheKey = `${competitionCode(competition)}:${season}`;
    const cached = competitionCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const html = await loadCompetitionHtml(competition, season);
    const clubs = parseCompetitionSeasonHtml(html);
    competitionCache.set(cacheKey, clubs);
    return clubs;
  }

  return {
    fetchCompetitionSeason: getCompetitionClubs,

    async fetchKader(clubId, season, clubName) {
      const html = await loadKaderHtml(clubId, season);
      const parsed = parseKaderHtml(html, clubId, clubName, season);
      for (const warning of parsed.warnings) {
        onMissingJerseyNumber?.(warning);
      }
      return parsed;
    },

    async fetchPlayerProfile(playerId) {
      const html = await loadProfileHtml(playerId);
      return parsePlayerProfileHtml(html, playerId);
    },
  };
}

function resolveSeasonYearRange(
  fromSeason: string,
  toSeason: string,
): { fromYear: number; toYear: number } {
  const fromLabel = fromSeason === "today" ? "today" : fromSeason;
  const toLabel = toSeason === "today" ? "today" : toSeason;

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
    throw new Error(`from-season ${fromSeason} is after to-season ${toSeason}`);
  }

  return { fromYear, toYear };
}

async function fetchClubSeasonWithClient(
  client: KaderHtmlClient,
  params: FetchClubSeasonParams,
  onProfileFetch?: (playerId: string) => void,
) {
  const startYear = labelToStartYear(params.season);
  const clubs = await client.fetchCompetitionSeason(params.competition, startYear);
  const clubName =
    clubs.find((club) => club.clubId === params.clubExternalId)?.clubName ??
    params.clubExternalId;

  const { squadRows } = await client.fetchKader(
    params.clubExternalId,
    startYear,
    clubName,
  );

  if (squadRows.length === 0) {
    throw new Error(
      `Missing kader for club ${params.clubExternalId} season ${params.season}`,
    );
  }

  const profileByPlayerId = await resolveProfiles(
    squadRows,
    (playerId) => client.fetchPlayerProfile(playerId),
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
}

function createAdapterFromClient(
  client: KaderHtmlClient,
  listSeasons: (competition: string) => Promise<number[]>,
  onProfileFetch?: (playerId: string) => void,
): FetchAdapter {
  return {
    async listClubSeasonPairs(params: ListClubSeasonPairsParams): Promise<ClubSeasonPair[]> {
      const available = await listSeasons(params.competition);
      const seasons = expandSeasonStartYears(
        params.competition,
        params.fromSeason,
        params.toSeason,
        available,
      );

      const pairs: ClubSeasonPair[] = [];
      for (const startYear of seasons) {
        const clubs = await client.fetchCompetitionSeason(params.competition, startYear);
        const seasonLabel = startYearToLabel(startYear);
        pairs.push(...seasonClubRowsToPairs(clubs, seasonLabel));
      }
      return pairs;
    },

    async fetchClubSeason(params) {
      return fetchClubSeasonWithClient(client, params, onProfileFetch);
    },
  };
}

function createFixturesAdapter(
  store: KaderHtmlStore,
  onProfileFetch?: (playerId: string) => void,
  onMissingJerseyNumber?: (warning: KaderParseWarning) => void,
): FetchAdapter {
  const client = createKaderHtmlClient(
    (competition, season) => store.loadCompetitionSeason(competition, season),
    (clubId, season) => store.loadKader(clubId, season),
    (playerId) => store.loadProfile(playerId),
    onMissingJerseyNumber,
  );

  return createAdapterFromClient(
    client,
    (competition) => store.listAvailableSeasons(competition),
    onProfileFetch,
  );
}

function createLiveAdapter(
  fetchHtml: (url: string) => Promise<string>,
  onProfileFetch?: (playerId: string) => void,
  onMissingJerseyNumber?: (warning: KaderParseWarning) => void,
): FetchAdapter {
  const client = createKaderHtmlClient(
    async (competition, season) => {
      const tmCode = competitionCode(competition);
      const url = competitionSeasonUrl(tmCode, season);
      return fetchHtml(url);
    },
    async (clubId, season) => fetchHtml(kaderUrl(clubId, season)),
    async (playerId) => fetchHtml(playerProfileUrl(playerId)),
    onMissingJerseyNumber,
  );

  return {
    async listClubSeasonPairs(params: ListClubSeasonPairsParams): Promise<ClubSeasonPair[]> {
      const { fromYear, toYear } = resolveSeasonYearRange(params.fromSeason, params.toSeason);
      const available = Array.from({ length: toYear - fromYear + 1 }, (_, index) => fromYear + index);
      const seasons = expandSeasonStartYears(
        params.competition,
        params.fromSeason,
        params.toSeason,
        available,
      );

      const pairs: ClubSeasonPair[] = [];
      for (const startYear of seasons) {
        const clubs = await client.fetchCompetitionSeason(params.competition, startYear);
        const seasonLabel = startYearToLabel(startYear);
        pairs.push(...seasonClubRowsToPairs(clubs, seasonLabel));
      }
      return pairs;
    },

    async fetchClubSeason(params) {
      return fetchClubSeasonWithClient(client, params, onProfileFetch);
    },
  };
}

export function createKaderFetchAdapter(options: KaderFetchAdapterOptions = {}): FetchAdapter {
  if (options.fixturesDir) {
    const store = createKaderHtmlStore(options.fixturesDir);
    return createFixturesAdapter(store, options.onProfileFetch, options.onMissingJerseyNumber);
  }

  const fetchHtml = options.fetchHtml ?? defaultFetchHtml;
  return createLiveAdapter(fetchHtml, options.onProfileFetch, options.onMissingJerseyNumber);
}
