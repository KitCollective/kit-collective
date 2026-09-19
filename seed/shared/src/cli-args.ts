import { type ResolvedSeedLane, resolveSeedLane } from "./lane.js";

export type SeedCliArgs = {
  competition: string;
  fromSeason: string;
  toSeason: string;
  lane: ResolvedSeedLane;
};

export type ParseCliArgsResult = { ok: true; args: SeedCliArgs } | { ok: false; error: string };

/**
 * Positional CLI contract shared by seed/apify and seed/fkapi:
 *   <competition> <from-season> <to-season> [lane]
 *
 * `0001` means the competition's first season (resolved by each CLI mapper).
 */
export function parseSeedCliArgs(argv: string[]): ParseCliArgsResult {
  if (argv.length < 3 || argv.length > 4) {
    return {
      ok: false,
      error: "Expected 3–4 arguments: competition from-season to-season [lane]",
    };
  }

  const [competition, fromSeason, toSeason, laneInput] = argv;

  if (!competition?.trim() || !fromSeason?.trim() || !toSeason?.trim()) {
    return { ok: false, error: "competition and season range must be non-empty" };
  }

  const laneResult = resolveSeedLane(laneInput);
  if (!laneResult.ok) {
    return { ok: false, error: laneResult.error };
  }

  return {
    ok: true,
    args: {
      competition: competition.trim(),
      fromSeason: fromSeason.trim(),
      toSeason: toSeason.trim(),
      lane: laneResult.lane,
    },
  };
}

export function formatSeedCliUsage(command: string): string {
  return [
    `Usage: ${command} <competition> <from-season> <to-season> [lane]`,
    "",
    "  competition   Competition slug or id (e.g. superligaen, championship)",
    "  from-season   Start season label or 0001 for the competition's first season",
    "  to-season     End season label or today",
    "  lane          development (default) or staging when explicitly named",
    "",
    "Lane rules: unnamed chat targets development. Staging only when named.",
    "Production is rejected.",
  ].join("\n");
}
