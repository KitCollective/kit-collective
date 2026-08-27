import { drizzle } from "drizzle-orm/node-postgres";
import { migrate as drizzleMigrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { assertResetDatabaseAllowed } from "./reset-database-guard.js";
import * as schema from "./schema/index.js";

export type Db = ReturnType<typeof createDb>["db"];

export function createDb(connectionString: string) {
  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

export async function migrate(connectionString: string, migrationsFolder: string) {
  const { db, pool } = createDb(connectionString);
  await drizzleMigrate(db, { migrationsFolder });
  await pool.end();
}

export async function resetDatabase(connectionString: string, migrationsFolder: string) {
  assertResetDatabaseAllowed(connectionString);
  const pool = new Pool({ connectionString });
  await pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
  await pool.query("CREATE SCHEMA public");
  await pool.end();
  await migrate(connectionString, migrationsFolder);
}
