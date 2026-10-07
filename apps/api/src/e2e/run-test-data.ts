import { assertDatabaseUrlTls, createDb, SEED_CREATE_DB_OPTIONS } from "@kit/db";
import { CollectionService } from "../collection/collection.service.js";
import { applyTestData } from "./test-data.js";
import { readTestDataConfig } from "./test-data-config.js";

/**
 * `pnpm --filter @kit/api e2e:test-data`: puts the two device-flow test
 * Collectors into their known state on the lane `DATABASE_URL` points at.
 */
async function main(): Promise<void> {
  const config = readTestDataConfig(process.env);
  assertDatabaseUrlTls(config.databaseUrl);
  const { db, pool } = createDb(config.databaseUrl, SEED_CREATE_DB_OPTIONS);
  try {
    await applyTestData({
      db,
      objectStore: CollectionService.objectStoreFactory(),
      credentials: config.credentials,
    });
    process.stdout.write("Device-flow test data applied.\n");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
