import { resolveSeedLane } from "@kit/seed-shared";
import type { CliRunner } from "./run-cli.js";
import { laneEnvForCli, resolveSeedRepoRoot } from "./run-cli.js";

const APIFY_FILTER = ["--filter", "@kit/seed-apify", "exec", "node", "dist/cli.js"] as const;

export const SEED_GRAIN_KINDS = [
  "league",
  "league-season",
  "club",
  "club-season",
  "club-proof",
  "national-team",
  "national-team-season",
  "national-team-proof",
] as const;

export type SeedGrainKind = (typeof SEED_GRAIN_KINDS)[number];

export type SeedGrainInput = {
  kind: SeedGrainKind;
  competition?: string;
  clubId?: string;
  ntRef?: string;
  season?: string;
  lane?: string | null;
};

export type SeedJoinInput = {
  subcommand: "club" | "national-team" | "sentence";
  competition?: string;
  ntRef?: string;
  season?: string;
  sentence?: string;
  lane?: string | null;
};

export type SeedHttpRunResult =
  | { ok: true; exitCode: number; stdout: string; stderr: string }
  | { ok: false; error: string };

function required(value: string | undefined, label: string): string | { error: string } {
  const trimmed = value?.trim();
  if (!trimmed) {
    return { error: `${label} is required` };
  }
  return trimmed;
}

function grainCliArgs(input: SeedGrainInput): string[] | { error: string } {
  switch (input.kind) {
    case "league": {
      const competition = required(input.competition, "competition");
      if (typeof competition !== "string") {
        return competition;
      }
      return ["grain", "league", competition];
    }
    case "league-season":
    case "club-proof": {
      const competition = required(input.competition, "competition");
      const season = required(input.season, "season");
      if (typeof competition !== "string") {
        return competition;
      }
      if (typeof season !== "string") {
        return season;
      }
      return ["grain", input.kind, competition, season];
    }
    case "club": {
      const competition = required(input.competition, "competition");
      const clubId = required(input.clubId, "clubId");
      if (typeof competition !== "string") {
        return competition;
      }
      if (typeof clubId !== "string") {
        return clubId;
      }
      return ["grain", "club", competition, clubId];
    }
    case "club-season": {
      const competition = required(input.competition, "competition");
      const clubId = required(input.clubId, "clubId");
      const season = required(input.season, "season");
      if (typeof competition !== "string") {
        return competition;
      }
      if (typeof clubId !== "string") {
        return clubId;
      }
      if (typeof season !== "string") {
        return season;
      }
      return ["grain", "club-season", competition, clubId, season];
    }
    case "national-team": {
      const ntRef = required(input.ntRef, "ntRef");
      if (typeof ntRef !== "string") {
        return ntRef;
      }
      return ["grain", "national-team", ntRef];
    }
    case "national-team-season":
    case "national-team-proof": {
      const ntRef = required(input.ntRef, "ntRef");
      const season = required(input.season, "season");
      if (typeof ntRef !== "string") {
        return ntRef;
      }
      if (typeof season !== "string") {
        return season;
      }
      return ["grain", input.kind, ntRef, season];
    }
    default: {
      return { error: `unsupported grain kind: ${String(input.kind)}` };
    }
  }
}

function joinCliArgs(input: SeedJoinInput): string[] | { error: string } {
  if (input.subcommand === "sentence") {
    const sentence = required(input.sentence, "sentence");
    if (typeof sentence !== "string") {
      return sentence;
    }
    return ["join", "sentence", sentence];
  }
  if (input.subcommand === "club") {
    const competition = required(input.competition, "competition");
    const season = required(input.season, "season");
    if (typeof competition !== "string") {
      return competition;
    }
    if (typeof season !== "string") {
      return season;
    }
    return ["join", "club", competition, season];
  }
  const ntRef = required(input.ntRef, "ntRef");
  const season = required(input.season, "season");
  if (typeof ntRef !== "string") {
    return ntRef;
  }
  if (typeof season !== "string") {
    return season;
  }
  return ["join", "national-team", ntRef, season];
}

async function runApifyCli(
  scopeArgs: string[],
  lane: ReturnType<typeof resolveSeedLane>,
  runner: CliRunner,
): Promise<SeedHttpRunResult> {
  if (!lane.ok) {
    return { ok: false, error: lane.error };
  }
  const argv = [...APIFY_FILTER, ...scopeArgs];
  if (!(scopeArgs[0] === "join" && scopeArgs[1] === "sentence")) {
    argv.push(lane.lane);
  }
  const { exitCode, stdout, stderr } = await runner("pnpm", argv, {
    env: laneEnvForCli(lane.lane),
    cwd: resolveSeedRepoRoot(),
  });
  return { ok: true, exitCode, stdout, stderr };
}

export async function runSeedGrain(
  input: SeedGrainInput,
  runner: CliRunner,
): Promise<SeedHttpRunResult> {
  const args = grainCliArgs(input);
  if (!Array.isArray(args)) {
    return { ok: false, error: args.error };
  }
  return runApifyCli(args, resolveSeedLane(input.lane), runner);
}

export async function runSeedJoin(
  input: SeedJoinInput,
  runner: CliRunner,
): Promise<SeedHttpRunResult> {
  const args = joinCliArgs(input);
  if (!Array.isArray(args)) {
    return { ok: false, error: args.error };
  }
  return runApifyCli(args, resolveSeedLane(input.lane), runner);
}
