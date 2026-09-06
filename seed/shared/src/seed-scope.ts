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

export type NationalTeamSeedScope = {
  kind: "national_team";
  nationalTeamRef: string;
  season: string;
};

export type SeedScope = ClubSeedScope | CompetitionSeedScope | NationalTeamSeedScope;

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
 * NationalTeam + season: `national-team <ntRef> <season> [lane]`
 *
 * Hierarchy grains (`grain league` / `grain league-season`) are parsed by
 * `@kit/seed-apify` — they are not SeedScope walk modes.
 */
export function parseSeedScopeArgv(argv: string[]): ParseSeedScopeResult {
  const cleaned = argv.filter((arg) => arg !== "--");
  if (cleaned.length === 0) {
    return { ok: false, error: "Seed scope arguments are required" };
  }

  if (cleaned[0] === "club") {
    if (cleaned.length < 4 || cleaned.length > 5) {
      return {
        ok: false,
        error: "Expected: club <competition> <club-external-id> <season> [lane]",
      };
    }

    const [, competition, clubExternalId, season, laneInput] = cleaned;
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

  if (cleaned[0] === "national-team" || cleaned[0] === "national_team") {
    if (cleaned.length < 3 || cleaned.length > 4) {
      return {
        ok: false,
        error: "Expected: national-team <ntRef> <season> [lane]",
      };
    }

    const [, nationalTeamRef, season, laneInput] = cleaned;
    if (!nationalTeamRef?.trim() || !season?.trim()) {
      return { ok: false, error: "national-team scope requires national team ref and season" };
    }

    const laneParsed = parseLaneArg(laneInput);
    if ("ok" in laneParsed) {
      return laneParsed;
    }

    return {
      ok: true,
      parsed: {
        scope: {
          kind: "national_team",
          nationalTeamRef: nationalTeamRef.trim(),
          season: season.trim(),
        },
        lane: laneParsed.lane,
      },
    };
  }

  if (cleaned.length < 3 || cleaned.length > 4) {
    return {
      ok: false,
      error:
        "Expected: <competition> <from-season> <to-season> [lane] or club <competition> <club-id> <season> [lane] or national-team <ntRef> <season> [lane]",
    };
  }

  const [competition, fromSeason, toSeason, laneInput] = cleaned;
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
    `Usage (national-team + season): ${command} national-team <ntRef> <season> [lane]`,
    `Usage (League grain):        ${command} grain league <competition> [lane]`,
    `Usage (League season grain): ${command} grain league-season <competition> <season> [lane]`,
    "",
    "  0001 = that competition's first Transfermarkt season (e.g. Superliga 1991/92).",
    "  Season labels like 1995/96 are passed through unchanged.",
    "  Lane defaults to development; staging only when named. Production is rejected.",
  ].join("\n");
}
