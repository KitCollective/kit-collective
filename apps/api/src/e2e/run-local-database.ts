import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDb, resetDatabase } from "@kit/db";
import { insertLocalFixtureCatalog } from "./local-catalog.js";

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../packages/db/migrations",
);

/**
 * `pnpm --filter @kit/api e2e:local-database`: a disposable database for running
 * the device flows on this machine. Drops and recreates the schema, then adds
 * the fixture catalog. `resetDatabase` refuses anything but localhost or a
 * database named `*test*`.
 */
async function main(): Promise<void> {
  const databaseUrl = process.env.E2E_LOCAL_DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("E2E_LOCAL_DATABASE_URL is required (never the lane DATABASE_URL)");
  }
  await resetDatabase(databaseUrl, migrationsFolder);
  const { db, pool } = createDb(databaseUrl);
  try {
    await insertLocalFixtureCatalog(db);
    process.stdout.write("Local device-flow database is ready.\n");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
