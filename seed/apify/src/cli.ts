#!/usr/bin/env node
import { createFixtureFetchAdapter } from "./fetch/fixture-adapter.js";
import { parseCliArgs, runSeed } from "./run.js";

async function main() {
  const args = parseCliArgs(process.argv);
  const fixturePath = process.env.SEED_APIFY_FIXTURE;

  if (!fixturePath) {
    console.error(
      "SEED_APIFY_FIXTURE is required. Live Apify fetch is not wired in this slice; use fixture mode for hermetic runs.",
    );
    process.exit(1);
  }

  const fetchAdapter = createFixtureFetchAdapter(fixturePath);
  const { mapResult } = await runSeed({ ...args, fetchAdapter });
  console.log(JSON.stringify({ ok: true, lane: args.lane, mapResult }, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
