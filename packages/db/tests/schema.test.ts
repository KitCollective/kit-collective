import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetDatabase } from "../src/migrate.js";

const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), "../migrations");

const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://kit:kit@localhost:5432/kit_test";

const IDENTITY_TABLES = [
  "country",
  "league",
  "club",
  "national_team",
  "player",
  "manufacturer",
] as const;

async function prepareDatabase() {
  await resetDatabase(DATABASE_URL, migrationsFolder);
}

describe("stamdata schema", () => {
  let pool: Pool;

  beforeAll(async () => {
    await prepareDatabase();
    pool = new Pool({ connectionString: DATABASE_URL });
  });

  afterAll(async () => {
    await pool.end();
  });

  it("creates all stamdata and user tables", async () => {
    const { rows } = await pool.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
    );
    const tables = rows.map((r) => r.tablename);
    expect(tables).toEqual(
      expect.arrayContaining([
        "country",
        "league",
        "club",
        "national_team",
        "season",
        "team_season",
        "player",
        "player_club_season",
        "manufacturer",
        "kit",
        "kit_photo",
        "catalog_label",
        "external_id",
        "user",
        "moderation_block",
        "moderation_report",
      ]),
    );
  });

  it("identity tables have no name column", async () => {
    for (const table of IDENTITY_TABLES) {
      const { rows } = await pool.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'name'`,
        [table],
      );
      expect(rows, `${table} should not have a name column`).toHaveLength(0);
    }
  });

  it("enforces one label per (entity, locale)", async () => {
    const country = await pool.query<{ id: string }>(
      `INSERT INTO country (iso3166) VALUES ('DK') RETURNING id`,
    );
    const entityId = country.rows[0]!.id;

    await pool.query(
      `INSERT INTO catalog_label (entity_type, entity_id, locale, kind, text)
       VALUES ('country', $1, 'da', 'label', 'Danmark')`,
      [entityId],
    );

    await expect(
      pool.query(
        `INSERT INTO catalog_label (entity_type, entity_id, locale, kind, text)
         VALUES ('country', $1, 'da', 'label', 'Denmark')`,
        [entityId],
      ),
    ).rejects.toThrow();
  });

  it("enforces ExternalId unique on (system, value)", async () => {
    const country = await pool.query<{ id: string }>(
      `INSERT INTO country (iso3166) VALUES ('SE') RETURNING id`,
    );
    const entityId = country.rows[0]!.id;

    await pool.query(
      `INSERT INTO external_id (entity_type, entity_id, system, value)
       VALUES ('country', $1, 'wikidata', 'Q211')`,
      [entityId],
    );

    await expect(
      pool.query(
        `INSERT INTO external_id (entity_type, entity_id, system, value)
         VALUES ('country', $1, 'wikidata', 'Q211')`,
        [entityId],
      ),
    ).rejects.toThrow();
  });

  it("enforces User email unique", async () => {
    await pool.query(
      `INSERT INTO "user" (email, password_hash, handle) VALUES ('a@example.com', 'hash', 'user_a')`,
    );

    await expect(
      pool.query(
        `INSERT INTO "user" (email, password_hash, handle) VALUES ('a@example.com', 'hash2', 'user_a2')`,
      ),
    ).rejects.toThrow();
  });

  it("enforces User handle unique", async () => {
    await pool.query(
      `INSERT INTO "user" (email, password_hash, handle) VALUES ('b@example.com', 'hash', 'shared_handle')`,
    );

    await expect(
      pool.query(
        `INSERT INTO "user" (email, password_hash, handle) VALUES ('c@example.com', 'hash2', 'shared_handle')`,
      ),
    ).rejects.toThrow();
  });

  it("stores optional country_id on user", async () => {
    const country = await pool.query<{ id: string }>(
      `INSERT INTO country (iso3166) VALUES ('DK') RETURNING id`,
    );
    const countryId = country.rows[0]!.id;

    const inserted = await pool.query<{ country_id: string | null }>(
      `INSERT INTO "user" (email, password_hash, handle, country_id)
       VALUES ('loc@example.com', 'hash', 'loc_user', $1)
       RETURNING country_id`,
      [countryId],
    );

    expect(inserted.rows[0]?.country_id).toBe(countryId);
  });
});
