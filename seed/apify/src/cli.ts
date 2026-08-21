#!/usr/bin/env node
import { parseCliArgs, runSeed } from "./run.js";
import { resolveFetchAdapter } from "./resolve-fetch-adapter.js";

async function main() {
  const parsed = parseCliArgs(process.argv);
  let resolved;
  try {
    resolved = await resolveFetchAdapter();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  }

  try {
    const { summary } = await runSeed({
      scope: parsed.scope,
      lane: parsed.lane,
      fetchAdapter: resolved.adapter,
    });

    console.log(JSON.stringify({ ok: true, lane: parsed.lane, summary }, null, 2));
  } finally {
    await resolved.close?.();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
