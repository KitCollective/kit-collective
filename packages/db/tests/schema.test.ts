import path from "node:path";
import { fileURLToPath } from "node:url";
import { HONOUR_SUBJECT_TYPES, PREFERRED_FOOT } from "@kit/domain";
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
        "honour",
        "player_jersey_number",
        "player_photo",
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

  it("exports preferred foot and honour subject types from @kit/domain", () => {
    expect(PREFERRED_FOOT).toEqual(["left", "right", "both"]);
    expect(HONOUR_SUBJECT_TYPES).toEqual(["club", "national_team", "player"]);
  });

  it("adds kit colour columns", async () => {
    const columns = await columnNames(pool, "kit");
    expect(columns).toEqual(
      expect.arrayContaining(["primary_color_hex", "secondary_color_hex", "sponsor_name"]),
    );
  });

  it("adds club rich-grain fact columns", async () => {
    const columns = await columnNames(pool, "club");
    expect(columns).toEqual(
      expect.arrayContaining([
        "founded_on",
        "stadium_name",
        "stadium_capacity",
        "primary_color_hex",
        "secondary_color_hex",
        "website_url",
      ]),
    );
  });

  it("adds ISO and football codes on country", async () => {
    const columns = await columnNames(pool, "country");
    expect(columns).toEqual(
      expect.arrayContaining([
        "iso3166",
        "iso3166_alpha3",
        "iso3166_numeric",
        "iso3166_reserved",
        "fifa",
        "ioc",
      ]),
    );
  });

  it("adds player body columns", async () => {
    const columns = await columnNames(pool, "player");
    expect(columns).toEqual(
      expect.arrayContaining([
        "date_of_birth",
        "height_cm",
        "preferred_foot",
        "primary_country_id",
        "place_of_birth",
      ]),
    );
  });

  it("adds player_club_season.position", async () => {
    const columns = await columnNames(pool, "player_club_season");
    expect(columns).toContain("position");
  });

  it("creates national_team_season and player_national_team_season tables", async () => {
    const { rows } = await pool.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables
       WHERE schemaname = 'public'
         AND tablename IN ('national_team_season', 'player_national_team_season')
       ORDER BY tablename`,
    );
    expect(rows.map((r) => r.tablename)).toEqual([
      "national_team_season",
      "player_national_team_season",
    ]);
  });

  it("adds national_team fact columns", async () => {
    const columns = await columnNames(pool, "national_team");
    expect(columns).toEqual(expect.arrayContaining(["founded_on", "confederation"]));
  });

  it("adds player_national_team_season squad and call-up columns", async () => {
    const columns = await columnNames(pool, "player_national_team_season");
    expect(columns).toEqual(
      expect.arrayContaining(["squad_number", "position", "call_up_club_id"]),
    );
  });

  it("creates honour, player_jersey_number, and player_photo tables", async () => {
    const { rows } = await pool.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables
       WHERE schemaname = 'public'
         AND tablename IN ('honour', 'player_jersey_number', 'player_photo')
       ORDER BY tablename`,
    );
    expect(rows.map((r) => r.tablename)).toEqual([
      "honour",
      "player_jersey_number",
      "player_photo",
    ]);
  });

  it("rejects duplicate honour rows for the same subject, season label, and title", async () => {
    const country = await pool.query<{ id: string }>(
      `INSERT INTO country (iso3166) VALUES ('NO') RETURNING id`,
    );
    const countryId = country.rows[0]?.id;
    expect(countryId).toBeTruthy();
    const club = await pool.query<{ id: string }>(
      `INSERT INTO club (country_id) VALUES ($1) RETURNING id`,
      [countryId],
    );
    const subjectId = club.rows[0]?.id;
    expect(subjectId).toBeTruthy();

    await pool.query(
      `INSERT INTO honour (subject_type, subject_id, season_label, title)
       VALUES ('club', $1, '2010/11', 'Danish champion')`,
      [subjectId],
    );

    await expect(
      pool.query(
        `INSERT INTO honour (subject_type, subject_id, season_label, title)
         VALUES ('club', $1, '2010/11', 'Danish champion')`,
        [subjectId],
      ),
    ).rejects.toThrow();

    await pool.query(
      `INSERT INTO honour (subject_type, subject_id, season_label, title)
       VALUES ('club', $1, NULL, 'Danish Superliga')`,
      [subjectId],
    );

    await expect(
      pool.query(
        `INSERT INTO honour (subject_type, subject_id, season_label, title)
         VALUES ('club', $1, NULL, 'Danish Superliga')`,
        [subjectId],
      ),
    ).rejects.toThrow();
  });

  it("defaults player_photo rights to unresolved and visibility to admin_only", async () => {
    const player = await pool.query<{ id: string }>(
      `INSERT INTO player DEFAULT VALUES RETURNING id`,
    );
    const playerId = player.rows[0]?.id;
    expect(playerId).toBeTruthy();

    const inserted = await pool.query<{ rights: string; visibility: string }>(
      `INSERT INTO player_photo (player_id, object_key)
       VALUES ($1, 'players/portrait.jpg')
       RETURNING rights, visibility`,
      [playerId],
    );

    expect(inserted.rows[0]).toEqual({
      rights: "unresolved",
      visibility: "admin_only",
    });
  });
});

async function columnNames(pool: Pool, table: string): Promise<string[]> {
  const { rows } = await pool.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [table],
  );
  return rows.map((r) => r.column_name);
}
