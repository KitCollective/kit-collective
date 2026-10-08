import { afterAll, describe, expect, it } from "vitest";
import { createDb, SEED_CREATE_DB_OPTIONS } from "../src/index.js";
import { resolveKitDbTestDatabaseUrl } from "./test-database-url.js";

const DATABASE_URL = resolveKitDbTestDatabaseUrl();

function statementTimeoutMillis(raw: string): number {
  const trimmed = raw.trim().toLowerCase();
  const msMatch = trimmed.match(/^(\d+(?:\.\d+)?)ms$/);
  if (msMatch) {
    return Number(msMatch[1]);
  }
  const sMatch = trimmed.match(/^(\d+(?:\.\d+)?)s$/);
  if (sMatch) {
    return Number(sMatch[1]) * 1000;
  }
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }
  const clock = trimmed.match(/^(\d+):(\d+):(\d+)$/);
  if (clock) {
    return (Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3])) * 1000;
  }
  throw new Error(`unrecognized statement_timeout: ${raw}`);
}

describe("createDb Nest pool", () => {
  const pools: Array<ReturnType<typeof createDb>["pool"]> = [];

  afterAll(async () => {
    await Promise.all(pools.map((pool) => pool.end()));
  });

  it("sets connectionTimeoutMillis to 2000", () => {
    const { pool } = createDb(DATABASE_URL);
    pools.push(pool);
    expect(pool.options.connectionTimeoutMillis).toBe(2000);
  });

  it("sets statement_timeout to 5000 on a connected Nest client", async () => {
    const { pool } = createDb(DATABASE_URL);
    pools.push(pool);
    const result = await pool.query("SHOW statement_timeout");
    expect(statementTimeoutMillis(String(result.rows[0]?.statement_timeout))).toBe(5000);
  });

  it("does not inherit 5000ms statement_timeout when seed passes 0", async () => {
    const { pool } = createDb(DATABASE_URL, SEED_CREATE_DB_OPTIONS);
    pools.push(pool);
    const result = await pool.query("SHOW statement_timeout");
    expect(statementTimeoutMillis(String(result.rows[0]?.statement_timeout))).toBe(0);
  });
});
