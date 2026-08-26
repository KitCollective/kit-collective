/**
 * CI ratchet (KIT-34): seed development proof scripts must exist when seed/mcp changes.
 * Prevents claiming dev-Postgres row counts without committed, reproducible verify tooling.
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const required = [
  "seed/mcp/scripts/verify-development-db.mjs",
  "seed/mcp/scripts/run-seed-apify-mcp-path.mjs",
  "scripts/record-seed-development-proof.sh",
];

const missing = required.filter((rel) => !existsSync(join(root, rel)));

if (missing.length > 0) {
  console.error("check-seed-development-proof-scripts: missing required files:");
  for (const m of missing) {
    console.error(`  - ${m}`);
  }
  process.exit(1);
}

console.log("check-seed-development-proof-scripts: ok");
