import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

/** Test helper — resets Postgres and applies SQL migrations from the product repo. */
export async function resetTestDatabase(
  connectionString: string,
  migrationsFolder: string,
): Promise<void> {
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
