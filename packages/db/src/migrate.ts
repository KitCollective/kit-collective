import { drizzle } from "drizzle-orm/node-postgres";
import { migrate as drizzleMigrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { assertDatabaseUrlTls } from "./database-url-guard.js";
import { assertResetDatabaseAllowed } from "./reset-database-guard.js";
import * as schema from "./schema/index.js";
import { seedEuropeanCountries } from "./seed/european-countries.js";

export type Db = ReturnType<typeof createDb>["db"];

export type CreateDbOptions = {
  statementTimeoutMillis?: number;
};

export const NEST_STATEMENT_TIMEOUT_MILLIS = 5000;
export const SEED_CREATE_DB_OPTIONS: CreateDbOptions = { statementTimeoutMillis: 0 };

function statementTimeoutSql(millis: number): string {
  if (!Number.isFinite(millis) || millis < 0) {
    throw new Error("statementTimeoutMillis must be a non-negative finite number");
  }
  return `SET statement_timeout = ${Math.floor(millis)}`;
}

export function createDb(connectionString: string, options?: CreateDbOptions) {
  assertDatabaseUrlTls(connectionString);
  const statementTimeoutMillis = options?.statementTimeoutMillis ?? NEST_STATEMENT_TIMEOUT_MILLIS;
  const pool = new Pool({
    connectionString,
    connectionTimeoutMillis: 2000,
    onConnect: async (client) => {
      await client.query(statementTimeoutSql(statementTimeoutMillis));
    },
  });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

export async function migrate(connectionString: string, migrationsFolder: string) {
  const { db, pool } = createDb(connectionString, SEED_CREATE_DB_OPTIONS);
  await drizzleMigrate(db, { migrationsFolder });
  await seedEuropeanCountries(db);
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
