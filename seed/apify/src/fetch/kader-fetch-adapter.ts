import {
  type CompetitionIdentity,
  catalogCompetitionIdentity,
  pickCompetitionHit,
  resolveSeasonRef,
  searchQueryForCompetition,
} from "@kit/seed-shared";
import {
  expandSeasonStartYears,
  mapClubSeasonToPayload,
  mapClubToPayload,
  mapLeagueSeasonToPayload,
  mapLeagueToPayload,
  seasonClubRowsToPairs,
  startYearToLabel,
} from "./actor-mapper.js";
import type { ActorPlayerProfile, ActorSeasonClubRow } from "./actor-types.js";
import type {
  ClubSeasonPair,
  FetchAdapter,
  FetchClubSeasonParams,
  ListClubSeasonPairsParams,
} from "./adapter.js";
import { competitionSearchUrl, parseCompetitionSearchHtml } from "./competition-search.js";
import { createKaderHtmlLiveCache, wrapFetchHtmlWithKaderCache } from "./kader-html-live-cache.js";
import {
  type KaderParseWarning,
  parseClubFactsHtml,
  parseCompetitionSeasonHtml,
  parseHonoursHtml,
  parseKaderHtml,
  parsePlayerProfileHtml,
} from "./kader-html-parser.js";
import { createKaderHtmlStore, type KaderHtmlStore } from "./kader-html-store.js";
import { labelToStartYear } from "./season-label.js";
import { resolveProfiles } from "./squad-profile-hop.js";
import {
  createTransfermarktRequestDelay,
  createTransfermarktRetryFetch,
  DEFAULT_TRANSFERMARKT_REQUEST_DELAY_MS,
  DEFAULT_TRANSFERMARKT_RETRY_BASE_DELAY_MS,
  DEFAULT_TRANSFERMARKT_RETRY_MAX_ATTEMPTS,
  type TransfermarktClock,
  type TransfermarktSleep,
} from "./transfermarkt-fetch-policy.js";
import { createTransfermarktRateLimitGuard } from "./transfermarkt-rate-limit.js";

export interface KaderFetchAdapterOptions {
  /** Directory of recorded Transfermarkt HTML fixtures (hermetic / CI mode). */
  fixturesDir?: string;
  /** Directory for caching live Transfermarkt HTML between retries. */
  cacheDir?: string;
  /** Optional HTTP client for live fetch. Defaults to global fetch. */
  fetchHtml?: (url: string) => Promise<string>;
  /** Milliseconds to wait between live Transfermarkt GETs. Set 0 to disable. */
  requestDelayMs?: number;
  /** Retry attempts per URL for HTTP 403/429 before counting a circuit failure. */
  retryMaxAttempts?: number;
  /** Base delay in ms for exponential backoff between 403/429 retries. */
  retryBaseDelayMs?: number;
  /** Injectable sleep for tests (delay + retry backoff). */
  sleep?: TransfermarktSleep;
  /** Injectable clock for tests (request delay). */
  clock?: TransfermarktClock;
  /** Stop live Transfermarkt GETs after this many consecutive HTTP 403/429 responses. */
  rateLimitStopAfter?: number;
  /** Test hook: called when a player profile fetch is triggered. */
  onProfileFetch?: (playerId: string) => void;
  /** Test hook: called when a player profile fetch fails (hole on that player). */
  onProfileHole?: (playerId: string, error: unknown) => void;
  /** Test hook: called when a squad row lacks a jersey number after parsing. */
  onMissingJerseyNumber?: (warning: KaderParseWarning) => void;
}

export function competitionSeasonUrl(tmCode: string, season: number, slug?: string): string {
  const pathSlug = slug ?? (tmCode === "DK1" ? "superligaen" : tmCode.toLowerCase());
  return `https://www.transfermarkt.com/${pathSlug}/startseite/wettbewerb/${tmCode}/saison_id/${season}`;
}

export function kaderUrl(clubId: string, season: number): string {
  return `https://www.transfermarkt.com/-/kader/verein/${clubId}/saison_id/${season}/plus/1`;
}

export function playerProfileUrl(playerId: string): string {
  return `https://www.transfermarkt.com/-/profil/spieler/${playerId}`;
}

export function clubFactsUrl(clubId: string): string {
  return `https://www.transfermarkt.com/-/datenfakten/verein/${clubId}`;
}

export function clubHonoursUrl(clubId: string): string {
  return `https://www.transfermarkt.com/-/erfolge/verein/${clubId}`;
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
      "User-Agent": "KitCollective-Seed/1.0 (+https://github.com/KitCollective/kit-collective)",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  if (!response.ok) {
    throw new TransfermarktHttpError(response.status, url);
  }

  return response.text();
}

async function fetchOptionalHtml(
  fetchHtml: (url: string) => Promise<string>,
  url: string,
): Promise<string | undefined> {
  try {
    return await fetchHtml(url);
  } catch (error) {
    if (error instanceof TransfermarktHttpError && error.status === 404) {
      return undefined;
    }
    throw error;
  }
}

interface KaderHtmlClient {
  fetchCompetitionSeason(competition: string, season: number): Promise<ActorSeasonClubRow[]>;
  fetchKader(
    clubId: string,
    season: number,
    clubName?: string,
  ): Promise<{
    squadRows: ReturnType<typeof parseKaderHtml>["squadRows"];
    warnings: KaderParseWarning[];
  }>;
  fetchPlayerProfile(playerId: string): Promise<ActorPlayerProfile>;
  fetchClubFacts(clubId: string): Promise<ReturnType<typeof parseClubFactsHtml> | undefined>;
  fetchClubHonours(clubId: string): Promise<ReturnType<typeof parseHonoursHtml>>;
  fetchPortrait(playerId: string, src?: string): Promise<Uint8Array | undefined>;
}

function createKaderHtmlClient(
  loadCompetitionHtml: (competition: string, season: number) => Promise<string>,
  loadKaderHtml: (clubId: string, season: number) => Promise<string>,
  loadProfileHtml: (playerId: string) => Promise<string>,
  loadFactsHtml: (clubId: string) => Promise<string | undefined>,
  loadHonoursHtml: (clubId: string) => Promise<string | undefined>,
  loadPortrait: (playerId: string, src?: string) => Promise<Uint8Array | undefined>,
  onMissingJerseyNumber?: (warning: KaderParseWarning) => void,
): KaderHtmlClient {
  const competitionCache = new Map<string, ActorSeasonClubRow[]>();

  async function getCompetitionClubs(
    competition: string,
    season: number,
  ): Promise<ActorSeasonClubRow[]> {
    const cacheKey = `${competition.trim().toLowerCase()}:${season}`;
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

    async fetchClubFacts(clubId) {
      const html = await loadFactsHtml(clubId);
      return html ? parseClubFactsHtml(html) : undefined;
    },

    async fetchClubHonours(clubId) {
      const html = await loadHonoursHtml(clubId);
      return html ? parseHonoursHtml(html) : [];
    },

    async fetchPortrait(playerId, src) {
      return loadPortrait(playerId, src);
    },
  };
}

function resolveSeasonYearRange(
  competition: string,
  fromSeason: string,
  toSeason: string,
): { fromYear: number; toYear: number } {
  const fromLabel = fromSeason === "today" ? "today" : resolveSeasonRef(competition, fromSeason);
  const toLabel = toSeason === "today" ? "today" : resolveSeasonRef(competition, toSeason);

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

async function fetchClubWithClient(
  client: KaderHtmlClient,
  params: { competition: string; clubExternalId: string },
  identity?: CompetitionIdentity,
) {
  const facts = await client.fetchClubFacts(params.clubExternalId);
  const honours = await client.fetchClubHonours(params.clubExternalId);
  return mapClubToPayload({
    competitionSlug: params.competition,
    clubExternalId: params.clubExternalId,
    clubName: facts?.officialName ?? params.clubExternalId,
    facts,
    honours,
    identity,
  });
}

async function fetchClubSeasonWithClient(
  client: KaderHtmlClient,
  params: FetchClubSeasonParams,
  onProfileFetch?: (playerId: string) => void,
  onProfileHole?: (playerId: string, error: unknown) => void,
  identity?: CompetitionIdentity,
) {
  const startYear = labelToStartYear(params.season);
  const clubs = await client.fetchCompetitionSeason(params.competition, startYear);
  const clubName =
    clubs.find((club) => club.clubId === params.clubExternalId)?.clubName ?? params.clubExternalId;

  const { squadRows } = await client.fetchKader(params.clubExternalId, startYear, clubName);

  if (squadRows.length === 0) {
    throw new Error(`Missing kader for club ${params.clubExternalId} season ${params.season}`);
  }

  const profileByPlayerId = await resolveProfiles(
    squadRows,
    (playerId) => client.fetchPlayerProfile(playerId),
    onProfileFetch,
    onProfileHole,
  );

  const portraits = new Map<string, Uint8Array>();
  for (const row of squadRows) {
    if (!row.playerId || !row.portraitSrc) {
      continue;
    }
    const bytes = await client.fetchPortrait(row.playerId, row.portraitSrc);
    if (bytes) {
      portraits.set(row.playerId, bytes);
    }
  }

  return mapClubSeasonToPayload({
    competitionSlug: params.competition,
    clubExternalId: params.clubExternalId,
    seasonLabel: params.season,
    clubName,
    squadRows,
    profileByPlayerId,
    portraits,
    identity,
  });
}

function createAdapterFromClient(
  client: KaderHtmlClient,
  listSeasons: (competition: string) => Promise<number[]>,
  onProfileFetch?: (playerId: string) => void,
  onProfileHole?: (playerId: string, error: unknown) => void,
): FetchAdapter {
  return {
    async fetchLeague(params) {
      return mapLeagueToPayload(params.competition);
    },

    async fetchLeagueSeason(params) {
      const seasonLabel = resolveSeasonRef(params.competition, params.season);
      const startYear = labelToStartYear(seasonLabel);
      const clubs = await client.fetchCompetitionSeason(params.competition, startYear);
      return mapLeagueSeasonToPayload({
        competitionSlug: params.competition,
        seasonLabel,
        clubs,
      });
    },

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
      return fetchClubSeasonWithClient(client, params, onProfileFetch, onProfileHole);
    },

    async fetchClub(params) {
      return fetchClubWithClient(client, params);
    },
  };
}

function createFixturesAdapter(
  store: KaderHtmlStore,
  onProfileFetch?: (playerId: string) => void,
  onProfileHole?: (playerId: string, error: unknown) => void,
  onMissingJerseyNumber?: (warning: KaderParseWarning) => void,
): FetchAdapter {
  const client = createKaderHtmlClient(
    (competition, season) => store.loadCompetitionSeason(competition, season),
    (clubId, season) => store.loadKader(clubId, season),
    (playerId) => store.loadProfile(playerId),
    (clubId) => store.loadClubFacts(clubId),
    (clubId) => store.loadClubHonours(clubId),
    (playerId) => store.loadPortrait(playerId),
    onMissingJerseyNumber,
  );

  return createAdapterFromClient(
    client,
    (competition) => store.listAvailableSeasons(competition),
    onProfileFetch,
    onProfileHole,
  );
}

function createIdentityResolver(
  fetchHtml: (url: string) => Promise<string>,
): (query: string) => Promise<CompetitionIdentity> {
  const cache = new Map<string, CompetitionIdentity>();

  function remember(query: string, identity: CompetitionIdentity): CompetitionIdentity {
    cache.set(query.trim().toLowerCase(), identity);
    cache.set(identity.leagueTransfermarktId.toLowerCase(), identity);
    cache.set(identity.slug.toLowerCase(), identity);
    return identity;
  }

  return async (query: string) => {
    const key = query.trim().toLowerCase();
    const cached = cache.get(key);
    if (cached) {
      return cached;
    }

    const catalog = catalogCompetitionIdentity(query);
    if (catalog) {
      return remember(query, catalog);
    }

    const html = await fetchHtml(competitionSearchUrl(searchQueryForCompetition(query)));
    const hits = parseCompetitionSearchHtml(html);
    return remember(query, pickCompetitionHit(query, hits));
  };
}

function createLiveAdapter(
  fetchHtml: (url: string) => Promise<string>,
  onProfileFetch?: (playerId: string) => void,
  onProfileHole?: (playerId: string, error: unknown) => void,
  onMissingJerseyNumber?: (warning: KaderParseWarning) => void,
): FetchAdapter {
  const identityFor = createIdentityResolver(fetchHtml);
  const client = createKaderHtmlClient(
    async (competition, season) => {
      const identity = await identityFor(competition);
      const url = competitionSeasonUrl(identity.leagueTransfermarktId, season, identity.slug);
      return fetchHtml(url);
    },
    async (clubId, season) => fetchHtml(kaderUrl(clubId, season)),
    async (playerId) => fetchHtml(playerProfileUrl(playerId)),
    async (clubId) => fetchOptionalHtml(fetchHtml, clubFactsUrl(clubId)),
    async (clubId) => fetchOptionalHtml(fetchHtml, clubHonoursUrl(clubId)),
    async (_playerId, src) => {
      if (!src || !/^https?:\/\//i.test(src)) {
        return undefined;
      }
      const response = await fetch(src);
      if (!response.ok) {
        return undefined;
      }
      return new Uint8Array(await response.arrayBuffer());
    },
    onMissingJerseyNumber,
  );

  return {
    async fetchLeague(params) {
      const identity = await identityFor(params.competition);
      return mapLeagueToPayload(params.competition, identity);
    },

    async fetchLeagueSeason(params) {
      const identity = await identityFor(params.competition);
      const seasonLabel = resolveSeasonRef(params.competition, params.season);
      const startYear = labelToStartYear(seasonLabel);
      const clubs = await client.fetchCompetitionSeason(params.competition, startYear);
      return mapLeagueSeasonToPayload({
        competitionSlug: params.competition,
        seasonLabel,
        clubs,
        identity,
      });
    },

    async listClubSeasonPairs(params: ListClubSeasonPairsParams): Promise<ClubSeasonPair[]> {
      await identityFor(params.competition);
      const { fromYear, toYear } = resolveSeasonYearRange(
        params.competition,
        params.fromSeason,
        params.toSeason,
      );
      const available = Array.from(
        { length: toYear - fromYear + 1 },
        (_, index) => fromYear + index,
      );
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
      const identity = await identityFor(params.competition);
      return fetchClubSeasonWithClient(client, params, onProfileFetch, onProfileHole, identity);
    },

    async fetchClub(params) {
      const identity = await identityFor(params.competition);
      return fetchClubWithClient(client, params, identity);
    },
  };
}

function buildLiveFetchHtml(options: KaderFetchAdapterOptions): (url: string) => Promise<string> {
  const baseFetch = options.fetchHtml ?? defaultFetchHtml;
  const cachedFetch = options.cacheDir
    ? wrapFetchHtmlWithKaderCache(baseFetch, createKaderHtmlLiveCache(options.cacheDir))
    : baseFetch;

  const retriedFetch = createTransfermarktRetryFetch(cachedFetch, {
    maxAttempts: options.retryMaxAttempts ?? DEFAULT_TRANSFERMARKT_RETRY_MAX_ATTEMPTS,
    baseDelayMs: options.retryBaseDelayMs ?? DEFAULT_TRANSFERMARKT_RETRY_BASE_DELAY_MS,
    sleep: options.sleep,
  });

  const delayedFetch = createTransfermarktRequestDelay(retriedFetch, {
    delayMs: options.requestDelayMs ?? DEFAULT_TRANSFERMARKT_REQUEST_DELAY_MS,
    sleep: options.sleep,
    clock: options.clock,
  });

  return createTransfermarktRateLimitGuard(delayedFetch, {
    stopAfter: options.rateLimitStopAfter,
  }).fetchHtml;
}

export function createKaderFetchAdapter(options: KaderFetchAdapterOptions = {}): FetchAdapter {
  if (options.fixturesDir) {
    const store = createKaderHtmlStore(options.fixturesDir);
    return createFixturesAdapter(
      store,
      options.onProfileFetch,
      options.onProfileHole,
      options.onMissingJerseyNumber,
    );
  }

  const fetchHtml = buildLiveFetchHtml(options);
  return createLiveAdapter(
    fetchHtml,
    options.onProfileFetch,
    options.onProfileHole,
    options.onMissingJerseyNumber,
  );
}
