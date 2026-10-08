#!/usr/bin/env node
// Desktop entry point for `pnpm seed:bulk`. Load the gitignored .env with
// `node --env-file=.env`, normalise the lane env, then hand off to the CLI.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const cli = path.join(repoRoot, "seed/apify/dist/cli.js");

const LANES = new Set(["development", "staging"]);

/** The CX33 lane needs TLS, and node-postgres only honours it via the URL. */
function withLaneTls(databaseUrl) {
  const url = new URL(databaseUrl);
  url.searchParams.set("sslmode", "require");
  url.searchParams.set("uselibpqcompat", "true");
  return url.toString();
}

const USAGE = [
  "Expected one of:",
  "  pnpm seed:bulk <competition> <from-season> <to-season> [lane]",
  "  pnpm seed:bulk plan <plan.json> [lane]",
  "  pnpm seed:bulk status <plan-id-or-file>",
].join("\n");

function resolveArgv(argv) {
  if (argv[0] === "status" || LANES.has(argv.at(-1))) {
    return argv;
  }
  return [...argv, "development"];
}

if (process.argv.length <= 2) {
  process.stderr.write(`${USAGE}\n`);
  process.exit(1);
}

const env = { ...process.env };

if (env.DATABASE_URL) {
  env.DATABASE_URL = withLaneTls(env.DATABASE_URL);
}

// Say the transport out loud so a bulk run never silently falls back to the laptop IP.
env.SEED_TM_TRANSPORT ??= env.SEED_PROXY_URL?.trim() ? "proxy" : "direct";

const argv = resolveArgv(process.argv.slice(2));
process.stderr.write(`[seed] bulk transport=${env.SEED_TM_TRANSPORT} lane-tls=on\n`);

const result = spawnSync(process.execPath, [cli, "bulk", ...argv], { stdio: "inherit", env });
process.exit(result.status ?? 1);
