import {
  type ParsedSeedScope,
  parseSeedScopeArgv,
  type ResolvedSeedLane,
  resolveSeedLane,
} from "@kit/seed-shared";

export type LeagueGrain = {
  kind: "league";
  competition: string;
};

export type LeagueSeasonGrain = {
  kind: "league_season";
  competition: string;
  season: string;
};

export type HierarchyGrain = LeagueGrain | LeagueSeasonGrain;

export type ParsedWalkCli = ParsedSeedScope & { mode: "walk" };

export type ParsedGrainCli = {
  mode: "grain";
  grain: HierarchyGrain;
  lane: ResolvedSeedLane;
};

export type ParsedSeedCli = ParsedWalkCli | ParsedGrainCli;

function parseGrainArgv(argv: string[]): ParsedGrainCli {
  const grainKind = argv[0];
  if (grainKind === "league") {
    if (argv.length < 2 || argv.length > 3) {
      throw new Error("Expected: grain league <competition> [lane]");
    }
    const competition = argv[1]?.trim();
    if (!competition) {
      throw new Error("league grain requires competition");
    }
    const laneResult = resolveSeedLane(argv[2]);
    if (!laneResult.ok) {
      throw new Error(laneResult.error);
    }
    return {
      mode: "grain",
      grain: { kind: "league", competition },
      lane: laneResult.lane,
    };
  }

  if (grainKind === "league-season" || grainKind === "league_season") {
    if (argv.length < 3 || argv.length > 4) {
      throw new Error("Expected: grain league-season <competition> <season> [lane]");
    }
    const competition = argv[1]?.trim();
    const season = argv[2]?.trim();
    if (!competition || !season) {
      throw new Error("league-season grain requires competition and season");
    }
    const laneResult = resolveSeedLane(argv[3]);
    if (!laneResult.ok) {
      throw new Error(laneResult.error);
    }
    return {
      mode: "grain",
      grain: { kind: "league_season", competition, season },
      lane: laneResult.lane,
    };
  }

  throw new Error("Expected grain kind: league | league-season");
}

/**
 * CLI entry for seed-apify: walk scopes (shared) or Hierarchy grains (league / league-season).
 */
export function parseSeedApifyCli(argv: string[]): ParsedSeedCli {
  const cleaned = argv.filter((arg) => arg !== "--");
  if (cleaned[0] === "grain") {
    return parseGrainArgv(cleaned.slice(1));
  }

  const result = parseSeedScopeArgv(cleaned);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return { mode: "walk", ...result.parsed };
}
