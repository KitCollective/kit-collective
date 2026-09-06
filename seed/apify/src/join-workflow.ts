import { createDb, type Db, SEED_CREATE_DB_OPTIONS } from "@kit/db";
import { resolveSeasonRef, type SeedScope } from "@kit/seed-shared";
import type { FetchAdapter } from "./fetch/adapter.js";
import { parseLane, resolveDatabaseUrl } from "./lane.js";
import type { PortraitStore } from "./map/index.js";
import { resolvePortraitStoreFromEnv } from "./portrait-store.js";
import { runHierarchyGrain } from "./run.js";
import { isClubSeasonAlreadySeeded, isNationalTeamSeasonAlreadySeeded } from "./seeded.js";
import type { Lane, MapResult } from "./types.js";

export type FkJoinRunResult = {
  kitsUpserted: number;
  photosWritten: number;
};

export type FkJoinRunner = (input: {
  scope: SeedScope;
  databaseUrl: string;
}) => Promise<FkJoinRunResult>;

export type JoinWorkflowSummary = {
  path: "club" | "national_team";
  apify: MapResult;
  clubSeasonsFetched: number;
  clubSeasonsSkipped: number;
  nationalTeamSeasonSkipped: boolean;
  fk: FkJoinRunResult;
};

export type RunJoinWorkflowOptions = {
  path: "club";
  competition: string;
  season: string;
  lane: Lane;
  fetchAdapter: FetchAdapter;
  databaseUrl?: string;
  portraitStore?: PortraitStore;
  fkRunner: FkJoinRunner;
};

export type RunNationalTeamJoinWorkflowOptions = {
  path: "national_team";
  nationalTeamRef: string;
  season: string;
  lane: Lane;
  fetchAdapter: FetchAdapter;
  databaseUrl?: string;
  portraitStore?: PortraitStore;
  fkRunner: FkJoinRunner;
};

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
    honours: 0,
    playerPhotos: 0,
    nationalTeams: 0,
    nationalTeamSeasons: 0,
    playerNationalTeamSeasons: 0,
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
  target.honours += source.honours;
  target.playerPhotos += source.playerPhotos;
  target.nationalTeams += source.nationalTeams;
  target.nationalTeamSeasons += source.nationalTeamSeasons;
  target.playerNationalTeamSeasons += source.playerNationalTeamSeasons;
}

async function listClubIdsForSeason(
  fetchAdapter: FetchAdapter,
  competition: string,
  seasonLabel: string,
): Promise<string[]> {
  const raw = await fetchAdapter.fetchLeagueSeason({ competition, season: seasonLabel });
  const clubs = raw.seasons[0]?.clubs ?? [];
  return clubs.map((club) => club.id);
}

async function runClubSeasonGrains(
  db: Db,
  options: RunJoinWorkflowOptions,
  seasonLabel: string,
  clubIds: string[],
  aggregate: MapResult,
): Promise<{ fetched: number; skipped: number }> {
  let fetched = 0;
  let skipped = 0;
  const portraitStore = options.portraitStore ?? resolvePortraitStoreFromEnv();

  for (const clubExternalId of clubIds) {
    const clubResult = await runHierarchyGrain({
      kind: "club",
      competition: options.competition,
      clubExternalId,
      lane: options.lane,
      fetchAdapter: options.fetchAdapter,
      databaseUrl: options.databaseUrl,
    });
    addMapResults(aggregate, clubResult.summary);

    const alreadySeeded = await isClubSeasonAlreadySeeded(
      db,
      options.competition,
      clubExternalId,
      seasonLabel,
    );
    if (alreadySeeded) {
      skipped += 1;
      continue;
    }

    const seasonResult = await runHierarchyGrain({
      kind: "club_season",
      competition: options.competition,
      clubExternalId,
      season: seasonLabel,
      lane: options.lane,
      fetchAdapter: options.fetchAdapter,
      databaseUrl: options.databaseUrl,
      portraitStore,
    });
    addMapResults(aggregate, seasonResult.summary);
    fetched += 1;
  }

  return { fetched, skipped };
}

export async function runClubJoinWorkflow(
  options: RunJoinWorkflowOptions,
): Promise<JoinWorkflowSummary> {
  const lane = parseLane(options.lane);
  const databaseUrl = options.databaseUrl ?? resolveDatabaseUrl(lane);
  const seasonLabel = resolveSeasonRef(options.competition, options.season);
  const aggregate = emptyMapResult();

  const leagueResult = await runHierarchyGrain({
    kind: "league",
    competition: options.competition,
    lane: options.lane,
    fetchAdapter: options.fetchAdapter,
    databaseUrl,
  });
  addMapResults(aggregate, leagueResult.summary);

  const leagueSeasonResult = await runHierarchyGrain({
    kind: "league_season",
    competition: options.competition,
    season: seasonLabel,
    lane: options.lane,
    fetchAdapter: options.fetchAdapter,
    databaseUrl,
  });
  addMapResults(aggregate, leagueSeasonResult.summary);

  const clubIds = await listClubIdsForSeason(
    options.fetchAdapter,
    options.competition,
    seasonLabel,
  );
  if (clubIds.length === 0) {
    throw new Error(`No clubs found for ${options.competition} ${seasonLabel}`);
  }

  const { db, pool } = createDb(databaseUrl, SEED_CREATE_DB_OPTIONS);
  let clubSeasonStats: { fetched: number; skipped: number };
  try {
    clubSeasonStats = await runClubSeasonGrains(db, options, seasonLabel, clubIds, aggregate);
  } finally {
    await pool.end();
  }

  const fkScope: SeedScope = {
    kind: "competition",
    competition: options.competition,
    fromSeason: seasonLabel,
    toSeason: seasonLabel,
  };
  const fk = await options.fkRunner({ scope: fkScope, databaseUrl });

  return {
    path: "club",
    apify: aggregate,
    clubSeasonsFetched: clubSeasonStats.fetched,
    clubSeasonsSkipped: clubSeasonStats.skipped,
    nationalTeamSeasonSkipped: false,
    fk,
  };
}

export async function runNationalTeamJoinWorkflow(
  options: RunNationalTeamJoinWorkflowOptions,
): Promise<JoinWorkflowSummary> {
  const lane = parseLane(options.lane);
  const databaseUrl = options.databaseUrl ?? resolveDatabaseUrl(lane);
  const seasonLabel = options.season.trim();
  const aggregate = emptyMapResult();

  const entityResult = await runHierarchyGrain({
    kind: "national_team",
    nationalTeamRef: options.nationalTeamRef,
    lane: options.lane,
    fetchAdapter: options.fetchAdapter,
    databaseUrl,
  });
  addMapResults(aggregate, entityResult.summary);

  const { db, pool } = createDb(databaseUrl, SEED_CREATE_DB_OPTIONS);
  let nationalTeamSeasonSkipped = false;
  try {
    const alreadySeeded = await isNationalTeamSeasonAlreadySeeded(
      db,
      options.nationalTeamRef,
      seasonLabel,
    );
    if (!alreadySeeded) {
      const seasonResult = await runHierarchyGrain({
        kind: "national_team_season",
        nationalTeamRef: options.nationalTeamRef,
        season: seasonLabel,
        lane: options.lane,
        fetchAdapter: options.fetchAdapter,
        databaseUrl,
        portraitStore: options.portraitStore ?? resolvePortraitStoreFromEnv(),
      });
      addMapResults(aggregate, seasonResult.summary);
    } else {
      nationalTeamSeasonSkipped = true;
    }
  } finally {
    await pool.end();
  }

  const fkScope: SeedScope = {
    kind: "national_team",
    nationalTeamRef: options.nationalTeamRef,
    season: seasonLabel,
  };
  const fk = await options.fkRunner({ scope: fkScope, databaseUrl });

  return {
    path: "national_team",
    apify: aggregate,
    clubSeasonsFetched: 0,
    clubSeasonsSkipped: 0,
    nationalTeamSeasonSkipped,
    fk,
  };
}
