import type { SpawnOptions } from "node:child_process";
import {
  laneDatabaseEnvVar,
  type ParsedSeedScope,
  type ResolvedSeedLane,
  resolveSeedLane,
  type SeedScope,
} from "@kit/seed-shared";

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

export type SeedMcpInput = {
  competition: string;
  fromSeason?: string;
  toSeason?: string;
  club?: string;
  season?: string;
  lane?: string | null;
};

export function parseSeedMcpInput(
  input: SeedMcpInput,
): { ok: true; parsed: ParsedSeedScope } | { ok: false; error: string } {
  const laneResult = resolveSeedLane(input.lane);
  if (!laneResult.ok) {
    return { ok: false, error: laneResult.error };
  }

  const competition = input.competition?.trim();
  if (!competition) {
    return { ok: false, error: "competition is required" };
  }

  const club = input.club?.trim();
  const season = input.season?.trim();

  if (club) {
    if (!season) {
      return { ok: false, error: "season is required when club is set" };
    }
    return {
      ok: true,
      parsed: {
        scope: {
          kind: "club",
          competition,
          clubExternalId: club,
          season,
        },
        lane: laneResult.lane,
      },
    };
  }

  const fromSeason = input.fromSeason?.trim();
  const toSeason = input.toSeason?.trim();
  if (!fromSeason || !toSeason) {
    return {
      ok: false,
      error:
        "fromSeason and toSeason are required for competition scope (or provide club + season)",
    };
  }

  return {
    ok: true,
    parsed: {
      scope: {
        kind: "competition",
        competition,
        fromSeason,
        toSeason,
      },
      lane: laneResult.lane,
    },
  };
}

export function buildSeedCliInvocation(
  target: SeedCliTarget,
  parsed: ParsedSeedScope,
): { command: string; argv: string[] } {
  const pkg = CLI_PACKAGES[target];
  const scopeArgs = scopeToCliArgs(parsed.scope);
  return {
    command: "pnpm",
    argv: ["--filter", pkg, "run", "seed", "--", ...scopeArgs, parsed.lane],
  };
}

function scopeToCliArgs(scope: SeedScope): string[] {
  if (scope.kind === "club") {
    return ["club", scope.competition, scope.clubExternalId, scope.season];
  }
  return [scope.competition, scope.fromSeason, scope.toSeason];
}

export function omitCoolifyHostEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(env).filter(([key]) => !key.startsWith("COOLIFY_")),
  ) as NodeJS.ProcessEnv;
}

export function laneEnvForCli(lane: ResolvedSeedLane): NodeJS.ProcessEnv {
  const databaseVar = laneDatabaseEnvVar(lane);
  const databaseUrl =
    lane === "staging" ? process.env.SEED_STAGING_DATABASE_URL : process.env.DATABASE_URL;

  return {
    ...omitCoolifyHostEnv(process.env),
    SEED_LANE: lane,
    ...(databaseUrl ? { [databaseVar]: databaseUrl, DATABASE_URL: databaseUrl } : {}),
  };
}

export type RunSeedCliResult =
  | { ok: true; exitCode: number; stdout: string; stderr: string }
  | { ok: false; error: string };

export async function runSeedCli(
  target: SeedCliTarget,
  input: SeedMcpInput,
  runner: CliRunner,
): Promise<RunSeedCliResult> {
  const parsedResult = parseSeedMcpInput(input);
  if (!parsedResult.ok) {
    return { ok: false, error: parsedResult.error };
  }

  const { command, argv } = buildSeedCliInvocation(target, parsedResult.parsed);
  const { exitCode, stdout, stderr } = await runner(command, argv, {
    env: laneEnvForCli(parsedResult.parsed.lane),
    cwd: process.env.SEED_REPO_ROOT ?? process.cwd(),
  });

  return { ok: true, exitCode, stdout, stderr };
}
