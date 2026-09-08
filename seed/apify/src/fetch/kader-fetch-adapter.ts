import {
  type CompetitionIdentity,
  catalogCompetitionIdentity,
  catalogNationalTeamIdentity,
  pickCompetitionHit,
  resolveSeasonRef,
  searchQueryForCompetition,
} from "@kit/seed-shared";
import { describeSeedError, safeSeedUrl, seedProgress } from "../progress.js";
import type { TransfermarktRawHonour, TransfermarktRawPlayerJerseyNumbers } from "../types.js";
import {
  catalogMarkObjectKeyFromCdnUrl,
  clubCrestCdnUrl,
  leagueBadgeCdnUrl,
} from "../catalog-mark-cdn.js";
import {
  expandSeasonStartYears,
  mapClubSeasonToPayload,
  mapClubToPayload,
  mapLeagueSeasonToPayload,
  mapLeagueToPayload,
  mapNationalTeamSeasonToPayload,
  mapNationalTeamToPayload,
  seasonClubRowsToPairs,
  startYearToLabel,
} from "./actor-mapper.js";
import type { ActorPlayerProfile, ActorSeasonClubRow } from "./actor-types.js";
import type {
  CatalogMarksFetcher,
  ClubSeasonPair,
  FetchAdapter,
  FetchClubSeasonParams,
  FetchNationalTeamParams,
  FetchNationalTeamSeasonParams,
  JerseyNumbersFetcher,
  ListClubSeasonPairsParams,
} from "./adapter.js";
import { competitionSearchUrl, parseCompetitionSearchHtml } from "./competition-search.js";
import { parseJerseyNumbersHtml } from "./jersey-numbers-parser.js";
import {
  createKaderBytesLiveCache,
  createKaderHtmlLiveCache,
  wrapFetchBytesWithKaderCache,
  wrapFetchHtmlWithKaderCache,
} from "./kader-html-live-cache.js";
import {
  type KaderParseWarning,
  parseClubFactsHtml,
  parseCompetitionSeasonHtml,
  parseHonoursHtml,
  parseKaderHtml,
  parsePlayerProfileHtml,
} from "./kader-html-parser.js";
import { createKaderHtmlStore, type KaderHtmlStore } from "./kader-html-store.js";
import { isPlaceholderPortraitBytes, isPlaceholderPortraitUrl } from "./portrait-placeholder.js";
import { labelToStartYear } from "./season-label.js";
import { resolveProfiles } from "./squad-profile-hop.js";
import { TransfermarktHttpError, TransfermarktWafChallengeError } from "./transfermarkt-errors.js";
import {
  classifyTransfermarktFailure,
  createAdaptiveTransfermarktDelay,
  createTransfermarktRetryFetch,
  createTransfermarktThrottleState,
  DEFAULT_TRANSFERMARKT_REQUEST_DELAY_MS,
  DEFAULT_TRANSFERMARKT_RETRY_BASE_DELAY_MS,
  DEFAULT_TRANSFERMARKT_RETRY_MAX_ATTEMPTS,
  type TransfermarktClock,
  type TransfermarktSleep,
} from "./transfermarkt-fetch-policy.js";
import {
  createTransfermarktCircuitState,
  createTransfermarktRateLimitGuard,
  TransfermarktCircuitOpenError,
} from "./transfermarkt-rate-limit.js";
import { directTransfermarktRequestHeaders } from "./transfermarkt-session.js";

export interface KaderFetchAdapterOptions {
  /** Directory of recorded Transfermarkt HTML fixtures (hermetic / CI mode). */
  fixturesDir?: string;
  /** Directory for caching live Transfermarkt HTML between retries. */
  cacheDir?: string;
  /** Optional HTML client for live fetch. Defaults to a cookie-keeping session. */
  fetchHtml?: (url: string) => Promise<string>;
  /** Optional binary client for portrait bytes. Defaults to the same session. */
  fetchBytes?: (url: string) => Promise<Uint8Array>;
  /** Milliseconds to wait between live Transfermarkt GETs. Set 0 to disable. */
  requestDelayMs?: number;
  /** Ceiling the adaptive throttle may back off to after retryable failures. */
  maxDelayMs?: number;
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

/** Career squad-number history. Not the profile page's current shirt number. */
export function playerJerseyNumbersUrl(playerId: string): string {
  return `https://www.transfermarkt.com/-/rueckennummern/spieler/${playerId}`;
}

export function clubFactsUrl(clubId: string): string {
  return `https://www.transfermarkt.com/-/datenfakten/verein/${clubId}`;
}

export function clubHonoursUrl(clubId: string): string {
  return `https://www.transfermarkt.com/-/erfolge/verein/${clubId}`;
}

export {
  directTransfermarktRequestHeaders,
  TransfermarktHttpError,
  TransfermarktWafChallengeError,
};

/**
 * There is no implicit transport. A live adapter used to fall back to a bare session on
 * this machine's IP whenever a caller forgot to wire one, which is the same silent direct
 * GET `resolveTransfermarktTransport` refuses. The caller names the transport or gets none.
 */
function missingTransportFetch(kind: "fetchHtml" | "fetchBytes"): (url: string) => never {
  return () => {
    throw new Error(
      `createKaderFetchAdapter needs an explicit ${kind} for live mode. Resolve the transport through resolveTransfermarktTransport (or pass fixturesDir) instead of falling back to this machine's IP.`,
    );
  };
}

/** Portrait bytes ride the direct connection by design (ADR-0043) — the CDN is not WAF'd. */
const PORTRAIT_CDN_HOST_SUFFIX = ".transfermarkt.technology";

async function fetchOptionalHtml(
  fetchHtml: (url: string) => Promise<string>,
  url: string,
): Promise<string | undefined> {
  try {
    return await fetchHtml(url);
  } catch (error) {
    if (classifyTransfermarktFailure(error) === "missing") {
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
  fetchJerseyNumbers(playerId: string): Promise<TransfermarktRawPlayerJerseyNumbers>;
}

function createKaderHtmlClient(
  loadCompetitionHtml: (competition: string, season: number) => Promise<string>,
  loadKaderHtml: (clubId: string, season: number) => Promise<string>,
  loadProfileHtml: (playerId: string) => Promise<string>,
  loadFactsHtml: (clubId: string) => Promise<string | undefined>,
  loadHonoursHtml: (clubId: string) => Promise<string | undefined>,
  loadPortrait: (playerId: string, src?: string) => Promise<Uint8Array | undefined>,
  loadJerseyNumbersHtml: (playerId: string) => Promise<string>,
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
      if (src && isPlaceholderPortraitUrl(src)) {
        seedProgress(`portrait hole player ${playerId} default silhouette ${safeSeedUrl(src)}`);
        return undefined;
      }
      const bytes = await loadPortrait(playerId, src);
      if (bytes && isPlaceholderPortraitBytes(bytes)) {
        seedProgress(`portrait hole player ${playerId} default silhouette bytes`);
        return undefined;
      }
      return bytes;
    },

    async fetchJerseyNumbers(playerId) {
      const parsed = parseJerseyNumbersHtml(await loadJerseyNumbersHtml(playerId), playerId);
      for (const warning of parsed.warnings) {
        if (warning.kind !== "missing_number") {
          seedProgress(`jersey warning player ${playerId} ${warning.kind}`);
        }
      }
      return {
        playerExternalId: playerId,
        rows: parsed.rows.map((row) => ({
          seasonLabel: row.seasonLabel,
          sideExternalId: row.sideExternalId,
          sideName: row.sideName,
          side: row.side,
          jerseyNumber: row.squadNumber,
        })),
      };
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

async function honoursWithMarkBytes(
  client: KaderHtmlClient,
  rows: Awaited<ReturnType<KaderHtmlClient["fetchClubHonours"]>>,
): Promise<TransfermarktRawHonour[]> {
  const cache = new Map<string, Uint8Array>();
  const result: TransfermarktRawHonour[] = [];
  for (const row of rows) {
    const honour: TransfermarktRawHonour = {
      seasonLabel: row.seasonLabel,
      title: row.title,
    };
    if (!row.imageSrc) {
      result.push(honour);
      continue;
    }
    const objectKey = catalogMarkObjectKeyFromCdnUrl(row.imageSrc);
    if (!objectKey) {
      result.push(honour);
      continue;
    }
    let bytes = cache.get(objectKey);
    if (!bytes) {
      bytes = await client.fetchPortrait("mark", row.imageSrc);
      if (bytes) {
        cache.set(objectKey, bytes);
      }
    }
    if (bytes) {
      honour.markObjectKey = objectKey;
      honour.markBytes = bytes;
    }
    result.push(honour);
  }
  return result;
}

async function fetchClubWithClient(
  client: KaderHtmlClient,
  params: { competition: string; clubExternalId: string },
  identity?: CompetitionIdentity,
) {
  const facts = await client.fetchClubFacts(params.clubExternalId);
  const honours = await honoursWithMarkBytes(
    client,
    await client.fetchClubHonours(params.clubExternalId),
  );
  const payload = mapClubToPayload({
    competitionSlug: params.competition,
    clubExternalId: params.clubExternalId,
    clubName: facts?.officialName ?? params.clubExternalId,
    facts,
    honours,
    identity,
  });
  const crestBytes = await client.fetchPortrait(
    params.clubExternalId,
    clubCrestCdnUrl(params.clubExternalId),
  );
  if (crestBytes && payload.clubs?.[0]) {
    payload.clubs[0].crestBytes = crestBytes;
  }
  return payload;
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

async function fetchNationalTeamWithClient(
  client: KaderHtmlClient,
  params: FetchNationalTeamParams,
) {
  const identity = catalogNationalTeamIdentity(params.nationalTeamRef);
  if (!identity) {
    throw new Error(`Unknown national team: ${params.nationalTeamRef}`);
  }
  const facts = await client.fetchClubFacts(identity.transfermarktId);
  const honours = await honoursWithMarkBytes(
    client,
    await client.fetchClubHonours(identity.transfermarktId),
  );
  return mapNationalTeamToPayload({
    nationalTeamRef: params.nationalTeamRef,
    teamName: facts?.officialName ?? identity.name,
    facts,
    honours,
    identity,
  });
}

async function fetchNationalTeamSeasonWithClient(
  client: KaderHtmlClient,
  params: FetchNationalTeamSeasonParams,
  onProfileFetch?: (playerId: string) => void,
  onProfileHole?: (playerId: string, error: unknown) => void,
) {
  const identity = catalogNationalTeamIdentity(params.nationalTeamRef);
  if (!identity) {
    throw new Error(`Unknown national team: ${params.nationalTeamRef}`);
  }
  const seasonLabel = params.season.trim();
  const startYear = labelToStartYear(seasonLabel);
  const { squadRows } = await client.fetchKader(identity.transfermarktId, startYear, identity.name);

  if (squadRows.length === 0) {
    throw new Error(
      `Missing kader for national team ${identity.transfermarktId} season ${seasonLabel}`,
    );
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

  return mapNationalTeamSeasonToPayload({
    nationalTeamRef: params.nationalTeamRef,
    seasonLabel,
    teamName: identity.name,
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
): FetchAdapter & JerseyNumbersFetcher & CatalogMarksFetcher {
  return {
    async fetchPlayerJerseyNumbers(playerExternalId) {
      return client.fetchJerseyNumbers(playerExternalId);
    },

    async fetchCdnBytes(src) {
      return client.fetchPortrait("mark", src);
    },

    async fetchClubHonours(clubId) {
      return client.fetchClubHonours(clubId);
    },

    async fetchLeague(params) {
      const payload = mapLeagueToPayload(params.competition);
      const badgeBytes = await client.fetchPortrait(
        "league",
        leagueBadgeCdnUrl(payload.competition.id),
      );
      if (badgeBytes) {
        payload.competition.badgeBytes = badgeBytes;
      }
      return payload;
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

    async fetchNationalTeam(params) {
      return fetchNationalTeamWithClient(client, params);
    },

    async fetchNationalTeamSeason(params) {
      return fetchNationalTeamSeasonWithClient(client, params, onProfileFetch, onProfileHole);
    },
  };
}

function createFixturesAdapter(
  store: KaderHtmlStore,
  onProfileFetch?: (playerId: string) => void,
  onProfileHole?: (playerId: string, error: unknown) => void,
  onMissingJerseyNumber?: (warning: KaderParseWarning) => void,
): FetchAdapter & JerseyNumbersFetcher & CatalogMarksFetcher {
  const client = createKaderHtmlClient(
    (competition, season) => store.loadCompetitionSeason(competition, season),
    (clubId, season) => store.loadKader(clubId, season),
    (playerId) => store.loadProfile(playerId),
    (clubId) => store.loadClubFacts(clubId),
    (clubId) => store.loadClubHonours(clubId),
    (playerId) => store.loadPortrait(playerId),
    (playerId) => store.loadJerseyNumbers(playerId),
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

/**
 * The direct connection may only reach the image CDN. Transfermarkt's own hosts sit behind
 * the WAF, and a portrait `src` is vendor-controlled, so anything else is a hole rather
 * than a bare GET from our IP while the HTML rides the proxy.
 */
function isPortraitCdnUrl(src: string): boolean {
  try {
    const host = new URL(src).hostname.toLowerCase();
    return host.endsWith(PORTRAIT_CDN_HOST_SUFFIX);
  } catch {
    return false;
  }
}

/** A missing portrait is a hole on that player, never a failed club-season. */
async function fetchPortraitBytes(
  fetchBytes: (url: string) => Promise<Uint8Array>,
  src: string | undefined,
): Promise<Uint8Array | undefined> {
  if (!src || !/^https?:\/\//i.test(src)) {
    return undefined;
  }
  if (!isPortraitCdnUrl(src)) {
    seedProgress(`portrait hole ${safeSeedUrl(src)} not the image CDN`);
    return undefined;
  }
  try {
    return await fetchBytes(src);
  } catch (error: unknown) {
    if (error instanceof TransfermarktCircuitOpenError) {
      throw error;
    }
    seedProgress(`portrait hole ${safeSeedUrl(src)} ${describeSeedError(error)}`);
    return undefined;
  }
}

function createLiveAdapter(
  fetchHtml: (url: string) => Promise<string>,
  fetchBytes: (url: string) => Promise<Uint8Array>,
  onProfileFetch?: (playerId: string) => void,
  onProfileHole?: (playerId: string, error: unknown) => void,
  onMissingJerseyNumber?: (warning: KaderParseWarning) => void,
): FetchAdapter & JerseyNumbersFetcher & CatalogMarksFetcher {
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
    async (_playerId, src) => fetchPortraitBytes(fetchBytes, src),
    async (playerId) => fetchHtml(playerJerseyNumbersUrl(playerId)),
    onMissingJerseyNumber,
  );

  return {
    async fetchPlayerJerseyNumbers(playerExternalId) {
      return client.fetchJerseyNumbers(playerExternalId);
    },

    async fetchCdnBytes(src) {
      return client.fetchPortrait("mark", src);
    },

    async fetchClubHonours(clubId) {
      return client.fetchClubHonours(clubId);
    },

    async fetchLeague(params) {
      const identity = await identityFor(params.competition);
      const payload = mapLeagueToPayload(params.competition, identity);
      const badgeBytes = await client.fetchPortrait(
        "league",
        leagueBadgeCdnUrl(payload.competition.id),
      );
      if (badgeBytes) {
        payload.competition.badgeBytes = badgeBytes;
      }
      return payload;
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

    async fetchNationalTeam(params) {
      return fetchNationalTeamWithClient(client, params);
    },

    async fetchNationalTeamSeason(params) {
      return fetchNationalTeamSeasonWithClient(client, params, onProfileFetch, onProfileHole);
    },
  };
}

interface LiveTransport {
  fetchHtml: (url: string) => Promise<string>;
  fetchBytes: (url: string) => Promise<Uint8Array>;
}

/**
 * One stack for every Transfermarkt GET: retry on transient upstream errors, shared
 * adaptive throttle, shared block circuit. Portrait bytes ride the same rails so images
 * cannot burst past the pacing the HTML fetch just backed off to.
 *
 * The disk cache wraps that whole stack from the outside. Inside it, a fully cached re-run
 * still paid pacing, backoff, and the circuit gate for reads that never touch the network —
 * 94 s of sleep for zero requests on one club-season.
 */
function buildLiveTransport(options: KaderFetchAdapterOptions): LiveTransport {
  const throttleState = createTransfermarktThrottleState(
    options.requestDelayMs ?? DEFAULT_TRANSFERMARKT_REQUEST_DELAY_MS,
    options.maxDelayMs,
  );
  const circuitState = createTransfermarktCircuitState();
  const retryOptions = {
    maxAttempts: options.retryMaxAttempts ?? DEFAULT_TRANSFERMARKT_RETRY_MAX_ATTEMPTS,
    baseDelayMs: options.retryBaseDelayMs ?? DEFAULT_TRANSFERMARKT_RETRY_BASE_DELAY_MS,
    sleep: options.sleep,
  };

  function wrap<T>(cached: (url: string) => Promise<T>): (url: string) => Promise<T> {
    const retried = createTransfermarktRetryFetch(cached, retryOptions);
    const paced = createAdaptiveTransfermarktDelay(retried, {
      state: throttleState,
      sleep: options.sleep,
      clock: options.clock,
    });
    return createTransfermarktRateLimitGuard(paced, {
      stopAfter: options.rateLimitStopAfter,
      state: circuitState,
    }).fetchHtml;
  }

  const baseHtml = options.fetchHtml ?? missingTransportFetch("fetchHtml");
  const baseBytes = options.fetchBytes ?? missingTransportFetch("fetchBytes");

  if (!options.cacheDir) {
    return { fetchHtml: wrap(baseHtml), fetchBytes: wrap(baseBytes) };
  }

  return {
    fetchHtml: wrapFetchHtmlWithKaderCache(
      wrap(baseHtml),
      createKaderHtmlLiveCache(options.cacheDir),
    ),
    fetchBytes: wrapFetchBytesWithKaderCache(
      wrap(baseBytes),
      createKaderBytesLiveCache(options.cacheDir),
    ),
  };
}

export function createKaderFetchAdapter(
  options: KaderFetchAdapterOptions = {},
): FetchAdapter & JerseyNumbersFetcher & CatalogMarksFetcher {
  if (options.fixturesDir) {
    const store = createKaderHtmlStore(options.fixturesDir);
    return createFixturesAdapter(
      store,
      options.onProfileFetch,
      options.onProfileHole,
      options.onMissingJerseyNumber,
    );
  }

  const transport = buildLiveTransport(options);
  return createLiveAdapter(
    transport.fetchHtml,
    transport.fetchBytes,
    options.onProfileFetch,
    options.onProfileHole,
    options.onMissingJerseyNumber,
  );
}
