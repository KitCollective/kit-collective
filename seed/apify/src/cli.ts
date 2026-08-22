#!/usr/bin/env node
import type { FetchAdapter } from "./fetch/adapter.js";
import { resolveFetchAdapter } from "./resolve-fetch-adapter.js";
import { parseCliArgs, runSeed } from "./run.js";

async function main() {
  const parsed = parseCliArgs(process.argv);
  let fetchAdapter: FetchAdapter;
  try {
    fetchAdapter = await resolveFetchAdapter();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  }
  const { summary } = await runSeed({
    scope: parsed.scope,
    lane: parsed.lane,
    fetchAdapter,
  });

  console.log(JSON.stringify({ ok: true, lane: parsed.lane, summary }, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
