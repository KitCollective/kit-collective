import { createDb } from "@kit/db";
import type { FetchAdapter } from "./fetch/adapter.js";
import { normalize } from "./normalize/index.js";
import { mapFacts } from "./map/index.js";
import { parseLane, resolveDatabaseUrl } from "./lane.js";
import { filterSeasons } from "./season-range.js";
import type { MapResult, SeedCliArgs } from "./types.js";

export interface RunSeedOptions extends SeedCliArgs {
  fetchAdapter: FetchAdapter;
  databaseUrl?: string;
  migrationsFolder?: string;
}

export interface RunSeedResult {
  mapResult: MapResult;
}

export async function runSeed(options: RunSeedOptions): Promise<RunSeedResult> {
  const lane = parseLane(options.lane);
  const databaseUrl = options.databaseUrl ?? resolveDatabaseUrl(lane);

  const raw = await options.fetchAdapter.fetch({
    competition: options.competition,
    fromSeason: options.fromSeason,
    toSeason: options.toSeason,
  });

  const normalized = normalize(raw);
  const seasons = filterSeasons(normalized.seasons, options.fromSeason, options.toSeason);
  const scopedFacts = { ...normalized, seasons };

  const { db, pool } = createDb(databaseUrl);
  try {
    const mapResult = await mapFacts(db, scopedFacts);
    return { mapResult };
  } finally {
    await pool.end();
  }
}

export function parseCliArgs(argv: string[]): SeedCliArgs {
  const args = argv.slice(2);
  if (args.length !== 4) {
    throw new Error(
      "Usage: seed-apify <competition> <from-season> <to-season> <lane>\n" +
        "  from-season: 0001 = first season of competition, or season label/id\n" +
        "  to-season: season label/id or today\n" +
        "  lane: development | staging (production is rejected)",
    );
  }

  const [competition, fromSeason, toSeason, laneRaw] = args as [
    string,
    string,
    string,
    string,
  ];

  return {
    competition,
    fromSeason,
    toSeason,
    lane: parseLane(laneRaw),
  };
}
