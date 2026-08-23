import { type ResolvedSeedLane, resolveSeedLane } from "./lane.js";

export type ClubSeedScope = {
  kind: "club";
  competition: string;
  clubExternalId: string;
  season: string;
};

export type CompetitionSeedScope = {
  kind: "competition";
  competition: string;
  fromSeason: string;
  toSeason: string;
};

export type SeedScope = ClubSeedScope | CompetitionSeedScope;

export type ParsedSeedScope = {
  scope: SeedScope;
  lane: ResolvedSeedLane;
};

export type ParseSeedScopeResult =
  | { ok: true; parsed: ParsedSeedScope }
  | { ok: false; error: string };

function parseLaneArg(
  laneInput: string | undefined,
): ParseSeedScopeResult | { lane: ResolvedSeedLane } {
  const laneResult = resolveSeedLane(laneInput);
  if (!laneResult.ok) {
    return { ok: false, error: laneResult.error };
  }
  return { lane: laneResult.lane };
}

/**
 * Competition range: `<competition> <from-season> <to-season> [lane]`
 * Club + season: `club <competition> <club-external-id> <season> [lane]`
 */
export function parseSeedScopeArgv(argv: string[]): ParseSeedScopeResult {
  const args = argv[0] === "--" ? argv.slice(1) : argv;

  if (args.length === 0) {
    return { ok: false, error: "Seed scope arguments are required" };
  }

  if (args[0] === "club") {
    if (args.length < 4 || args.length > 5) {
      return {
        ok: false,
        error: "Expected: club <competition> <club-external-id> <season> [lane]",
      };
    }

    const [, competition, clubExternalId, season, laneInput] = args;
    if (!competition?.trim() || !clubExternalId?.trim() || !season?.trim()) {
      return { ok: false, error: "club scope requires competition, club id, and season" };
    }

    const laneParsed = parseLaneArg(laneInput);
    if ("ok" in laneParsed) {
      return laneParsed;
    }

    return {
      ok: true,
      parsed: {
        scope: {
          kind: "club",
          competition: competition.trim(),
          clubExternalId: clubExternalId.trim(),
          season: season.trim(),
        },
        lane: laneParsed.lane,
      },
    };
  }

  if (args.length < 3 || args.length > 4) {
    return {
      ok: false,
      error:
        "Expected: <competition> <from-season> <to-season> [lane] or club <competition> <club-id> <season> [lane]",
    };
  }

  const [competition, fromSeason, toSeason, laneInput] = args;
  if (!competition?.trim() || !fromSeason?.trim() || !toSeason?.trim()) {
    return { ok: false, error: "competition and season range must be non-empty" };
  }

  const laneParsed = parseLaneArg(laneInput);
  if ("ok" in laneParsed) {
    return laneParsed;
  }

  return {
    ok: true,
    parsed: {
      scope: {
        kind: "competition",
        competition: competition.trim(),
        fromSeason: fromSeason.trim(),
        toSeason: toSeason.trim(),
      },
      lane: laneParsed.lane,
    },
  };
}

export function formatSeedScopeUsage(command: string): string {
  return [
    `Usage (competition range): ${command} <competition> <from-season> <to-season> [lane]`,
    `Usage (club + season):       ${command} club <competition> <club-external-id> <season> [lane]`,
    "",
    "  0001 = that competition's first Transfermarkt season (e.g. Superliga 1991/92).",
    "  Season labels like 1995/96 are passed through unchanged.",
    "  Lane defaults to development; staging only when named. Production is rejected.",
  ].join("\n");
}
