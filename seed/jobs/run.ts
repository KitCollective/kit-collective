import {
  ProductionLaneRejectedError,
  UnknownLaneError,
  prepareSeedRun,
  type SeedCli,
  type SeedToolName,
} from "../mcp/src/prepare-seed-run.ts";
import { formatSeedCliResult, runPreparedSeedCli } from "../mcp/src/run-cli.ts";

function toolForCli(cli: SeedCli): SeedToolName {
  switch (cli) {
    case "apify":
      return "seed_apify";
    case "fk":
      return "seed_fk";
    default: {
      const exhaustive: never = cli;
      throw new Error(`Unknown seed CLI: ${String(exhaustive)}`);
    }
  }
}

function flagValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  return process.argv[index + 1];
}

function readCli(): SeedCli {
  const raw = (flagValue("--cli") ?? process.env.SEED_CLI ?? "")
    .trim()
    .toLowerCase();
  if (raw === "apify" || raw === "fk") {
    return raw;
  }
  throw new Error("Pass --cli apify|fk or set SEED_CLI.");
}

async function main(): Promise<void> {
  const competition =
    flagValue("--competition") ?? process.env.SEED_COMPETITION?.trim() ?? "";
  const fromSeason =
    flagValue("--from-season") ?? process.env.SEED_FROM_SEASON?.trim() ?? "";
  const toSeason =
    flagValue("--to-season") ?? process.env.SEED_TO_SEASON?.trim() ?? "";
  if (!competition || !fromSeason || !toSeason) {
    throw new Error(
      "Need competition, from-season, and to-season (flags or SEED_* env).",
    );
  }

  const cli = readCli();
  const run = prepareSeedRun(toolForCli(cli), {
    competition,
    fromSeason,
    toSeason,
    lane: flagValue("--lane") ?? process.env.SEED_LANE,
  });
  const result = await runPreparedSeedCli(run);
  process.stdout.write(`${formatSeedCliResult(run, result)}\n`);
  process.exit(result.exitCode);
}

main().catch((error: unknown) => {
  const message =
    error instanceof ProductionLaneRejectedError ||
    error instanceof UnknownLaneError ||
    error instanceof Error
      ? error.message
      : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(2);
});
