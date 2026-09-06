import { assertDatabaseUrlTls } from "../database-url-guard.js";
import { createDb, SEED_CREATE_DB_OPTIONS } from "../migrate.js";
import { seedDevCatalog } from "./dev-catalog.js";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required to seed the Confirm picker fixture");
  }
  assertDatabaseUrlTls(url);

  const { db, pool } = createDb(url, SEED_CREATE_DB_OPTIONS);
  try {
    const result = await seedDevCatalog(db);
    console.log(
      `dev-catalog: clubs=${result.clubs} leagues=${result.leagues} seasons=${result.seasons} teamSeasons=${result.teamSeasons} players=${result.players} playerClubSeasons=${result.playerClubSeasons}`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
