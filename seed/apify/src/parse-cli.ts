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

export type ClubGrain = {
  kind: "club";
  competition: string;
  clubExternalId: string;
};

export type ClubSeasonGrain = {
  kind: "club_season";
  competition: string;
  clubExternalId: string;
  season: string;
};

export type ClubProofGrain = {
  kind: "club_proof";
  competition: string;
  season: string;
};

export type HierarchyGrain =
  | LeagueGrain
  | LeagueSeasonGrain
  | ClubGrain
  | ClubSeasonGrain
  | ClubProofGrain;

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

  if (grainKind === "club") {
    if (argv.length < 3 || argv.length > 4) {
      throw new Error("Expected: grain club <competition> <clubId> [lane]");
    }
    const competition = argv[1]?.trim();
    const clubExternalId = argv[2]?.trim();
    if (!competition || !clubExternalId) {
      throw new Error("club grain requires competition and club id");
    }
    const laneResult = resolveSeedLane(argv[3]);
    if (!laneResult.ok) {
      throw new Error(laneResult.error);
    }
    return {
      mode: "grain",
      grain: { kind: "club", competition, clubExternalId },
      lane: laneResult.lane,
    };
  }

  if (grainKind === "club-season" || grainKind === "club_season") {
    if (argv.length < 4 || argv.length > 5) {
      throw new Error("Expected: grain club-season <competition> <clubId> <season> [lane]");
    }
    const competition = argv[1]?.trim();
    const clubExternalId = argv[2]?.trim();
    const season = argv[3]?.trim();
    if (!competition || !clubExternalId || !season) {
      throw new Error("club-season grain requires competition, club id, and season");
    }
    const laneResult = resolveSeedLane(argv[4]);
    if (!laneResult.ok) {
      throw new Error(laneResult.error);
    }
    return {
      mode: "grain",
      grain: { kind: "club_season", competition, clubExternalId, season },
      lane: laneResult.lane,
    };
  }

  if (grainKind === "club-proof" || grainKind === "club_proof") {
    if (argv.length < 3 || argv.length > 4) {
      throw new Error("Expected: grain club-proof <competition> <season> [lane]");
    }
    const competition = argv[1]?.trim();
    const season = argv[2]?.trim();
    if (!competition || !season) {
      throw new Error("club-proof grain requires competition and season");
    }
    const laneResult = resolveSeedLane(argv[3]);
    if (!laneResult.ok) {
      throw new Error(laneResult.error);
    }
    return {
      mode: "grain",
      grain: { kind: "club_proof", competition, season },
      lane: laneResult.lane,
    };
  }

  throw new Error("Expected grain kind: league | league-season | club | club-season | club-proof");
}

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
