#!/usr/bin/env node
import { createFixtureFetchAdapter } from "./fetch/fixture-adapter.js";
import {
  createApifyFetchAdapter,
  createLiveApifyFetchAdapter,
} from "./fetch/apify-adapter.js";
import { parseCliArgs, runSeed } from "./run.js";

async function resolveFetchAdapter() {
  const fixturePath = process.env.SEED_APIFY_FIXTURE;
  const recordingsDir = process.env.SEED_APIFY_RECORDINGS;
  const apifyToken = process.env.APIFY_TOKEN;
  const actorId = process.env.SEED_APIFY_ACTOR_ID;

  if (fixturePath) {
    return createFixtureFetchAdapter(fixturePath);
  }

  if (recordingsDir) {
    return createApifyFetchAdapter({ recordingsDir, actorId });
  }

  if (apifyToken) {
    return createLiveApifyFetchAdapter({ token: apifyToken, actorId });
  }

  console.error(
    "Seed fetch requires one of: SEED_APIFY_FIXTURE (nested fixture JSON), SEED_APIFY_RECORDINGS (recorded actor datasets), or APIFY_TOKEN (live Apify fetch).",
  );
  process.exit(1);
}

async function main() {
  const parsed = parseCliArgs(process.argv);
  const fetchAdapter = await resolveFetchAdapter();
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
