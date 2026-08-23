import {
  formatSeedCliUsage,
  parseSeedCliArgs,
  type ResolvedSeedLane,
  resolveSeasonRef,
  resolveCompetition as resolveSharedCompetition,
} from "@kit/seed-shared";
import type { SeedLane } from "./types.js";

export type CompetitionDefinition = {
  leagueTransfermarktId: string;
  firstSeasonLabel: string;
};

export function resolveCompetition(name: string): CompetitionDefinition | undefined {
  const def = resolveSharedCompetition(name);
  if (!def?.firstSeasonLabel) {
    return undefined;
  }
  return {
    leagueTransfermarktId: def.leagueTransfermarktId,
    firstSeasonLabel: def.firstSeasonLabel,
  };
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
        lane: ResolvedSeedLane;
      };
    }
  | {
      ok: false;
      error: string;
    } {
  const parsed = parseSeedCliArgs(argv);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }

  const competitionDef = resolveCompetition(parsed.args.competition);
  if (!competitionDef) {
    return { ok: false, error: `Unknown competition: ${parsed.args.competition}` };
  }

  let fromSeason: string;
  let toSeason: string;
  try {
    fromSeason = resolveSeasonRef(parsed.args.competition, parsed.args.fromSeason);
    toSeason = resolveSeasonRef(parsed.args.competition, parsed.args.toSeason);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message };
  }

  return {
    ok: true,
    args: {
      competition: parsed.args.competition.trim().toLowerCase(),
      fromSeason,
      toSeason,
      lane: parsed.args.lane,
    },
  };
}

export function formatFkCliUsage(): string {
  return formatSeedCliUsage("kit-seed-fkapi");
}
