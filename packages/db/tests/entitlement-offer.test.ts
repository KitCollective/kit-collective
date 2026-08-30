import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, offer } from "../src/index.js";
import { resetDatabase } from "../src/migrate.js";

const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), "../migrations");

const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://kit:kit@localhost:5432/kit_test";

describe("entitlement and offer schema", () => {
  beforeAll(async () => {
    await resetDatabase(DATABASE_URL, migrationsFolder);
  });

  afterAll(async () => {
    const { pool } = createDb(DATABASE_URL);
    await pool.end();
  });

  it("seeds a default offer row for Nest-trial", async () => {
    const { db, pool } = createDb(DATABASE_URL);
    const rows = await db.select().from(offer);
    await pool.end();

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      monthProductId: "com.kitcollective.premium.month",
      yearProductId: "com.kitcollective.premium.year",
      trialEnabled: true,
      trialDays: 3,
    });
  });
});
