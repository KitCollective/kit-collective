import type { SeedLane } from "./types.js";

export type CompetitionDefinition = {
  /** Transfermarkt league id used for season external ids in Apify seed. */
  leagueTransfermarktId: string;
  /** Label of the first season ("0001" resolves to this). */
  firstSeasonLabel: string;
};

const COMPETITIONS: Record<string, CompetitionDefinition> = {
  superliga: {
    leagueTransfermarktId: "DK1",
    firstSeasonLabel: "1991/92",
  },
  championship: {
    leagueTransfermarktId: "GB2",
    firstSeasonLabel: "2004/05",
  },
};

export function resolveCompetition(name: string): CompetitionDefinition | undefined {
  const key = name.trim().toLowerCase();
  return COMPETITIONS[key];
}

export function parseLane(lane: string): SeedLane | "production" | undefined {
  const normalized = lane.trim().toLowerCase();
  if (normalized === "development" || normalized === "staging") {
    return normalized;
  }
  if (normalized === "production") {
    return "production";
  }
  return undefined;
}

export function parseCliArgs(argv: string[]):
  | {
      ok: true;
      args: {
        competition: string;
        fromSeason: string;
        toSeason: string;
        lane: SeedLane;
      };
    }
  | {
      ok: false;
      error: string;
    } {
  if (argv.length !== 4) {
    return {
      ok: false,
      error: "Usage: kit-seed-fkapi <competition> <from-season> <to-season> <lane>",
    };
  }

  const competition = argv[0];
  const fromSeason = argv[1];
  const toSeason = argv[2];
  const laneRaw = argv[3];

  if (!competition || !fromSeason || !toSeason || !laneRaw) {
    return {
      ok: false,
      error: "Usage: kit-seed-fkapi <competition> <from-season> <to-season> <lane>",
    };
  }

  const competitionDef = resolveCompetition(competition);
  if (!competitionDef) {
    return { ok: false, error: `Unknown competition: ${competition}` };
  }

  const lane = parseLane(laneRaw);
  if (lane === undefined) {
    return {
      ok: false,
      error: `Invalid lane: ${laneRaw}. Use development or staging.`,
    };
  }
  if (lane === "production") {
    return { ok: false, error: "Lane production is rejected for FK seed." };
  }

  const resolvedFrom = fromSeason === "0001" ? competitionDef.firstSeasonLabel : fromSeason;
  const resolvedTo = toSeason === "today" ? "today" : toSeason;

  return {
    ok: true,
    args: {
      competition: competition.trim().toLowerCase(),
      fromSeason: resolvedFrom,
      toSeason: resolvedTo,
      lane,
    },
  };
}
