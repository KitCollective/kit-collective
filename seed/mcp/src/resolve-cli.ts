import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SeedCli } from "./prepare-seed-run.ts";

const MCP_SRC_DIR = path.dirname(fileURLToPath(import.meta.url));
export const SEED_ROOT = path.resolve(MCP_SRC_DIR, "..", "..");

const CLI_DIR: Record<SeedCli, string> = {
  apify: "apify",
  fk: "fkapi",
};

const ENV_BIN: Record<SeedCli, string> = {
  apify: "SEED_APIFY_BIN",
  fk: "SEED_FK_BIN",
};

function candidateBins(cliDir: string): string[] {
  return [
    path.join(cliDir, "bin", "seed.mjs"),
    path.join(cliDir, "bin", "seed.js"),
    path.join(cliDir, "src", "cli.ts"),
    path.join(cliDir, "src", "cli.mjs"),
    path.join(cliDir, "src", "cli.js"),
  ];
}

export function resolveSeedCliBin(cli: SeedCli): string {
  const envName = ENV_BIN[cli];
  const fromEnv = process.env[envName]?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  const cliDir = path.join(SEED_ROOT, CLI_DIR[cli]);
  const candidates = candidateBins(cliDir);
  const found = candidates.find((file) => existsSync(file));
  return found ?? candidates[0]!;
}

export function nodeArgsForBin(bin: string): string[] {
  if (bin.endsWith(".ts")) {
    return ["--experimental-strip-types", bin];
  }
  return [bin];
}
