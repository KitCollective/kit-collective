import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { isRecognizablyTestDatabase } from "./test-database-url.js";

/** Test helper — resets Postgres and applies SQL migrations from the product repo. */
export async function resetTestDatabase(
  connectionString: string,
  migrationsFolder: string,
): Promise<void> {
  if (!isRecognizablyTestDatabase(connectionString)) {
    throw new Error(
      "resetTestDatabase refused: connection must be localhost/127.0.0.1 or a database name containing test. Shared development Postgres must not be wiped by tests.",
    );
  }
  const pool = new Pool({ connectionString });
  await pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
  await pool.query("CREATE SCHEMA public");
  await pool.end();

  const migratePool = new Pool({ connectionString });
  const db = drizzle(migratePool);
  await migrate(db, { migrationsFolder });
  await migratePool.end();
}
