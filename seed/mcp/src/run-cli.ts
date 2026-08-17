import {
  laneDatabaseEnvVar,
  resolveSeedLane,
  type ResolvedSeedLane,
  type SeedCliArgs,
} from "@kit/seed-shared";
import type { SpawnOptions } from "node:child_process";

export type CliRunner = (
  command: string,
  args: string[],
  options: SpawnOptions,
) => Promise<{ exitCode: number; stdout: string; stderr: string }>;

export type SeedCliTarget = "apify" | "fkapi";

const CLI_PACKAGES: Record<SeedCliTarget, string> = {
  apify: "@kit/seed-apify",
  fkapi: "@kit/seed-fkapi",
};

export function buildSeedCliInvocation(
  target: SeedCliTarget,
  args: SeedCliArgs,
): { command: string; argv: string[] } {
  const pkg = CLI_PACKAGES[target];
  return {
    command: "pnpm",
    argv: [
      "--filter",
      pkg,
      "run",
      "seed",
      "--",
      args.competition,
      args.fromSeason,
      args.toSeason,
      args.lane,
    ],
  };
}

export function laneEnvForCli(lane: ResolvedSeedLane): NodeJS.ProcessEnv {
  const databaseVar = laneDatabaseEnvVar(lane);
  const databaseUrl =
    lane === "staging"
      ? process.env.SEED_STAGING_DATABASE_URL
      : process.env.DATABASE_URL;

  return {
    ...process.env,
    SEED_LANE: lane,
    ...(databaseUrl ? { [databaseVar]: databaseUrl, DATABASE_URL: databaseUrl } : {}),
  };
}

export type RunSeedCliResult =
  | { ok: true; exitCode: number; stdout: string; stderr: string }
  | { ok: false; error: string };

export async function runSeedCli(
  target: SeedCliTarget,
  input: {
    competition: string;
    fromSeason: string;
    toSeason: string;
    lane?: string | null;
  },
  runner: CliRunner,
): Promise<RunSeedCliResult> {
  const laneResult = resolveSeedLane(input.lane);
  if (!laneResult.ok) {
    return { ok: false, error: laneResult.error };
  }

  const args: SeedCliArgs = {
    competition: input.competition.trim(),
    fromSeason: input.fromSeason.trim(),
    toSeason: input.toSeason.trim(),
    lane: laneResult.lane,
  };

  if (!args.competition || !args.fromSeason || !args.toSeason) {
    return { ok: false, error: "competition, fromSeason, and toSeason are required" };
  }

  const { command, argv } = buildSeedCliInvocation(target, args);
  const { exitCode, stdout, stderr } = await runner(command, argv, {
    env: laneEnvForCli(args.lane),
    cwd: process.env.SEED_REPO_ROOT ?? process.cwd(),
  });

  return { ok: true, exitCode, stdout, stderr };
}
