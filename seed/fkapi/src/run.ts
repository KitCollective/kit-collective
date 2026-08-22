import { parseCliArgs } from "./cli-args.js";
import { createFkApiFetchAdapter } from "./fetch.js";
import { runFkSeed } from "./mapper.js";
import { createR2ObjectStore } from "./object-store.js";
import { assertSeedProxyAvailable, resolveSeedProxyConfig } from "./proxy-config.js";
import type { FkFetchAdapter, ObjectStoreAdapter } from "./types.js";

export type RunCliOptions = {
  argv: string[];
  databaseUrl: string;
  fetchAdapter?: FkFetchAdapter;
  objectStore?: ObjectStoreAdapter;
};

export async function runCli(options: RunCliOptions): Promise<void> {
  const parsed = parseCliArgs(options.argv);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }

  const fetchAdapter = options.fetchAdapter ?? resolveDefaultFetchAdapter();
  const objectStore = options.objectStore ?? createR2ObjectStore();

  const result = await runFkSeed({
    databaseUrl: options.databaseUrl,
    fetchAdapter,
    objectStore,
    scope: {
      competition: parsed.args.competition,
      fromSeason: parsed.args.fromSeason,
      toSeason: parsed.args.toSeason,
    },
  });

  console.log(
    JSON.stringify({
      lane: parsed.args.lane,
      competition: parsed.args.competition,
      fromSeason: parsed.args.fromSeason,
      toSeason: parsed.args.toSeason,
      kitsUpserted: result.kitsUpserted,
      photosWritten: result.photosWritten,
    }),
  );
}

function resolveDefaultFetchAdapter(): FkFetchAdapter {
  if (!process.env.FKAPI_BASE_URL) {
    throw new Error(
      "FKApi fetch requires FKAPI_BASE_URL. Tests inject a fetch adapter; CLI runs must set FKAPI_BASE_URL explicitly.",
    );
  }

  const proxyConfig = resolveSeedProxyConfig();
  assertSeedProxyAvailable(proxyConfig);

  return createFkApiFetchAdapter({ proxyConfig });
}
