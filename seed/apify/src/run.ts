import { createDb } from "@kit/db";
import {
  type ParsedSeedScope,
  parseSeedScopeArgv,
  resolveSeasonRef,
  type SeedScope,
} from "@kit/seed-shared";
import type { FetchAdapter } from "./fetch/adapter.js";
import { parseLane, resolveDatabaseUrl } from "./lane.js";
import { mapFacts } from "./map/index.js";
import { normalize } from "./normalize/index.js";
import { type HierarchyGrain, type ParsedSeedCli, parseSeedApifyCli } from "./parse-cli.js";
import { filterFactsToClubSeason } from "./scope/club-season.js";
import {
  assertOutOfScopeSeasonsUnchanged,
  assertPairsInScope,
  resolveScopeSeasonLabels,
  SeedScopeIsolationError,
  snapshotSeasonPcsByLabel,
} from "./scope-isolation.js";
import { isClubSeasonAlreadySeeded } from "./seeded.js";
import type { Lane, MapResult } from "./types.js";

export interface RunSeedOptions {
  scope: SeedScope;
  lane: Lane;
  fetchAdapter: FetchAdapter;
  databaseUrl?: string;
  migrationsFolder?: string;
}

export interface ClubSeasonFailure {
  clubExternalId: string;
  season: string;
  error: string;
}

export interface RunSeedSummary {
  fetched: number;
  skipped: number;
  mapped: number;
  failures: ClubSeasonFailure[];
}

export interface RunSeedResult {
  summary: RunSeedSummary;
}

export interface RunHierarchyGrainOptions {
  kind: HierarchyGrain["kind"];
  competition: string;
  season?: string;
  lane: Lane;
  fetchAdapter: FetchAdapter;
  databaseUrl?: string;
}

export interface RunHierarchyGrainResult {
  summary: MapResult;
}

function emptyMapResult(): MapResult {
  return {
    countries: 0,
    leagues: 0,
    seasons: 0,
    clubs: 0,
    teamSeasons: 0,
    players: 0,
    playerClubSeasons: 0,
    catalogLabels: 0,
    externalIds: 0,
  };
}

function addMapResults(target: MapResult, source: MapResult): void {
  target.countries += source.countries;
  target.leagues += source.leagues;
  target.seasons += source.seasons;
  target.clubs += source.clubs;
  target.teamSeasons += source.teamSeasons;
  target.players += source.players;
  target.playerClubSeasons += source.playerClubSeasons;
  target.catalogLabels += source.catalogLabels;
  target.externalIds += source.externalIds;
}

function mapTotal(mapResult: MapResult): number {
  return (
    mapResult.countries +
    mapResult.leagues +
    mapResult.seasons +
    mapResult.clubs +
    mapResult.teamSeasons +
    mapResult.players +
    mapResult.playerClubSeasons +
    mapResult.catalogLabels +
    mapResult.externalIds
  );
}

async function expandScope(
  scope: SeedScope,
  fetchAdapter: FetchAdapter,
): Promise<Array<{ clubExternalId: string; seasonLabel: string }>> {
  if (scope.kind === "club") {
    const seasonLabel = resolveSeasonRef(scope.competition, scope.season);
    return [{ clubExternalId: scope.clubExternalId, seasonLabel }];
  }

  return fetchAdapter.listClubSeasonPairs({
    competition: scope.competition,
    fromSeason: scope.fromSeason,
    toSeason: scope.toSeason,
  });
}

/**
 * Hierarchy grain run (highest public interface for League / League season).
 * Injected FetchAdapter; refuses production via parseLane.
 */
export async function runHierarchyGrain(
  options: RunHierarchyGrainOptions,
): Promise<RunHierarchyGrainResult> {
  const lane = parseLane(options.lane);
  const databaseUrl = options.databaseUrl ?? resolveDatabaseUrl(lane);
  const { db, pool } = createDb(databaseUrl);

  try {
    if (options.kind === "league") {
      const raw = await options.fetchAdapter.fetchLeague({
        competition: options.competition,
      });
      const facts = normalize(raw);
      const summary = await mapFacts(db, facts, { depth: "league" });
      return { summary };
    }

    if (options.kind === "league_season") {
      if (!options.season?.trim()) {
        throw new Error("league_season grain requires season");
      }
      const seasonLabel = resolveSeasonRef(options.competition, options.season);
      const raw = await options.fetchAdapter.fetchLeagueSeason({
        competition: options.competition,
        season: seasonLabel,
      });
      const facts = normalize(raw);
      const summary = await mapFacts(db, facts, {
        depth: "league_season",
        allowedSeasonLabels: new Set([seasonLabel]),
      });
      return { summary };
    }

    const _exhaustive: never = options.kind;
    return _exhaustive;
  } finally {
    await pool.end();
  }
}

export async function runSeed(options: RunSeedOptions): Promise<RunSeedResult> {
  const lane = parseLane(options.lane);
  const databaseUrl = options.databaseUrl ?? resolveDatabaseUrl(lane);
  const competition = options.scope.competition;

  const pairs = await expandScope(options.scope, options.fetchAdapter);
  const inScopeSeasonLabels = resolveScopeSeasonLabels(options.scope);
  assertPairsInScope(pairs, inScopeSeasonLabels);

  const summary: RunSeedSummary = {
    fetched: 0,
    skipped: 0,
    mapped: 0,
    failures: [],
  };

  const { db, pool } = createDb(databaseUrl);
  try {
    const outOfScopeBefore = await snapshotSeasonPcsByLabel(db, competition);
    const aggregateMap = emptyMapResult();

    for (const pair of pairs) {
      const alreadySeeded = await isClubSeasonAlreadySeeded(
        db,
        competition,
        pair.clubExternalId,
        pair.seasonLabel,
      );

      if (alreadySeeded) {
        summary.skipped += 1;
        continue;
      }

      try {
        const raw = await options.fetchAdapter.fetchClubSeason({
          competition,
          clubExternalId: pair.clubExternalId,
          season: pair.seasonLabel,
        });
        summary.fetched += 1;

        const normalized = normalize(raw);
        const scopedFacts = filterFactsToClubSeason(normalized, {
          seasonLabel: pair.seasonLabel,
          clubExternalId: pair.clubExternalId,
        });
        if (scopedFacts.seasons.length === 0) {
          summary.failures.push({
            clubExternalId: pair.clubExternalId,
            season: pair.seasonLabel,
            error: `did not contain club ${pair.clubExternalId} for season ${pair.seasonLabel}`,
          });
          continue;
        }

        const mapResult = await mapFacts(db, scopedFacts, {
          allowedSeasonLabels: new Set([pair.seasonLabel]),
        });
        addMapResults(aggregateMap, mapResult);
      } catch (error: unknown) {
        if (error instanceof SeedScopeIsolationError) {
          throw error;
        }
        const message = error instanceof Error ? error.message : String(error);
        summary.failures.push({
          clubExternalId: pair.clubExternalId,
          season: pair.seasonLabel,
          error: message,
        });
      }
    }

    const outOfScopeAfter = await snapshotSeasonPcsByLabel(db, competition);
    assertOutOfScopeSeasonsUnchanged(outOfScopeBefore, outOfScopeAfter, inScopeSeasonLabels);

    summary.mapped = mapTotal(aggregateMap);
    return { summary };
  } finally {
    await pool.end();
  }
}

export function parseCliArgs(argv: string[]): ParsedSeedCli {
  return parseSeedApifyCli(argv.slice(2));
}

/** @deprecated Prefer parseCliArgs; kept for callers that need walk-only ParsedSeedScope. */
export function parseWalkCliArgs(argv: string[]): ParsedSeedScope {
  const result = parseSeedScopeArgv(argv.slice(2));
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.parsed;
}
