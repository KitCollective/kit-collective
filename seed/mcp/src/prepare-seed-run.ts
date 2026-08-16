export type SeedToolName = "seed_apify" | "seed_fk";
export type SeedCli = "apify" | "fk";
export type SeedLane = "development" | "staging";

export type SeedToolInput = {
  competition: string;
  fromSeason: string;
  toSeason: string;
  lane?: string;
};

export type PreparedSeedRun = {
  tool: SeedToolName;
  cli: SeedCli;
  lane: SeedLane;
  argv: string[];
};

export class ProductionLaneRejectedError extends Error {
  constructor(lane: string) {
    super(
      `Seed MCP refuses lane "${lane}". Production is impossible from these tools.`,
    );
    this.name = "ProductionLaneRejectedError";
  }
}

export class UnknownLaneError extends Error {
  constructor(lane: string) {
    super(
      `Unknown seed lane "${lane}". Name development (default) or staging. Production is impossible.`,
    );
    this.name = "UnknownLaneError";
  }
}

const PRODUCTION_ALIASES = new Set(["production", "prod"]);

export function resolveSeedLane(lane: string | undefined): SeedLane {
  const named = lane?.trim() ?? "";
  if (named === "") {
    return "development";
  }

  const normalized = named.toLowerCase();
  if (normalized === "development") {
    return "development";
  }
  if (normalized === "staging") {
    return "staging";
  }
  if (PRODUCTION_ALIASES.has(normalized)) {
    throw new ProductionLaneRejectedError(named);
  }
  throw new UnknownLaneError(named);
}

export function buildSeedCliArgv(input: {
  competition: string;
  fromSeason: string;
  toSeason: string;
  lane: SeedLane;
}): string[] {
  return [
    "--competition",
    input.competition,
    "--from-season",
    input.fromSeason,
    "--to-season",
    input.toSeason,
    "--lane",
    input.lane,
  ];
}

function cliForTool(tool: SeedToolName): SeedCli {
  switch (tool) {
    case "seed_apify":
      return "apify";
    case "seed_fk":
      return "fk";
    default: {
      const exhaustive: never = tool;
      throw new Error(`Unknown seed tool: ${String(exhaustive)}`);
    }
  }
}

export function prepareSeedRun(
  tool: SeedToolName,
  input: SeedToolInput,
): PreparedSeedRun {
  const lane = resolveSeedLane(input.lane);
  return {
    tool,
    cli: cliForTool(tool),
    lane,
    argv: buildSeedCliArgv({
      competition: input.competition,
      fromSeason: input.fromSeason,
      toSeason: input.toSeason,
      lane,
    }),
  };
}
