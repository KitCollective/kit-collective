import { fileURLToPath } from "node:url";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { resetDatabase } from "@kit/db";
import { parseCliArgs } from "../src/cli-args.js";
import { createFixtureFetchAdapter } from "../src/fetch.js";
import { normalizeRawKit } from "../src/normalize.js";
import { runFkSeed } from "../src/mapper.js";
import { runCli } from "../src/run.js";
import type { FkFetchAdapter, ObjectStoreAdapter } from "../src/types.js";
import { EXTERNAL_SYSTEM_FKAPI, EXTERNAL_SYSTEM_TRANSFERMARKT } from "../src/types.js";

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../packages/db/migrations",
);

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://kit:kit@localhost:5432/kit_test";

async function seedApifyPrerequisites(pool: Pool) {
  const countryRow = await pool.query<{ id: string }>(
    `INSERT INTO country (iso3166) VALUES ('DK') RETURNING id`,
  );
  const countryId = countryRow.rows[0]!.id;

  const clubRow = await pool.query<{ id: string }>(
    `INSERT INTO club (country_id, kind) VALUES ($1, 'club') RETURNING id`,
    [countryId],
  );
  const clubId = clubRow.rows[0]!.id;

  await pool.query(
    `INSERT INTO external_id (entity_type, entity_id, system, value)
     VALUES ('club', $1, $2, '190')`,
    [clubId, EXTERNAL_SYSTEM_TRANSFERMARKT],
  );

  const seasonRow = await pool.query<{ id: string }>(
    `INSERT INTO season (label, starts_on, ends_on, calendar_kind)
     VALUES ('1998/99', '1998-07-01', '1999-06-30', 'split_year') RETURNING id`,
  );
  const seasonId = seasonRow.rows[0]!.id;

  await pool.query(
    `INSERT INTO team_season (club_id, season_id) VALUES ($1, $2)`,
    [clubId, seasonId],
  );

  return { clubId, seasonId };
}

function createMemoryObjectStore(): ObjectStoreAdapter & { objects: Map<string, Uint8Array> } {
  const objects = new Map<string, Uint8Array>();
  return {
    objects,
    async putObject(key: string, bytes: Uint8Array): Promise<void> {
      objects.set(key, bytes);
    },
  };
}

describe("FK seed CLI args", () => {
  it("matches Apify seed shape: competition, from, to, lane", () => {
    const parsed = parseCliArgs(["superliga", "0001", "2025/26", "development"]);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.args).toEqual({
        competition: "superliga",
        fromSeason: "1991/92",
        toSeason: "2025/26",
        lane: "development",
      });
    }
  });

  it("rejects lane production", () => {
    const parsed = parseCliArgs(["superliga", "0001", "today", "production"]);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error).toContain("production");
    }
  });
});

describe("normalize", () => {
  it("drops forbidden Transfermarkt fields", () => {
    const result = normalizeRawKit({
      id: "fk-1",
      clubTransfermarktId: "190",
      seasonTransfermarktId: "DK1-1998",
      seasonLabel: "1998/99",
      type: "home",
      marketValue: 1000000,
    });
    expect(result).toBeNull();
  });
});

describe("FK seed mapper", () => {
  let pool: Pool;

  beforeAll(async () => {
    await resetDatabase(DATABASE_URL, migrationsFolder);
    pool = new Pool({ connectionString: DATABASE_URL });
  });

  afterAll(async () => {
    await pool.end();
  });

  it("refuses when club/season prerequisites are missing", async () => {
    const objectStore = createMemoryObjectStore();
    await expect(
      runFkSeed({
        databaseUrl: DATABASE_URL,
        fetchAdapter: createFixtureFetchAdapter(),
        objectStore,
        scope: {
          competition: "superliga",
          fromSeason: "1998/99",
          toSeason: "1998/99",
        },
      }),
    ).rejects.toThrow(/Missing Club row/);
  });

  it("writes Kit + KitPhoto with admin_only and unresolved rights", async () => {
    const { clubId, seasonId } = await seedApifyPrerequisites(pool);
    const objectStore = createMemoryObjectStore();

    const result = await runFkSeed({
      databaseUrl: DATABASE_URL,
      fetchAdapter: createFixtureFetchAdapter(),
      objectStore,
      scope: {
        competition: "superliga",
        fromSeason: "1998/99",
        toSeason: "1998/99",
      },
    });

    expect(result.kitsUpserted).toBe(2);
    expect(result.photosWritten).toBe(2);

    const kits = await pool.query<{
      id: string;
      club_id: string;
      season_id: string;
      type: string;
    }>(`SELECT id, club_id, season_id, type FROM kit ORDER BY type`);

    expect(kits.rows).toHaveLength(2);
    for (const row of kits.rows) {
      expect(row.club_id).toBe(clubId);
      expect(row.season_id).toBe(seasonId);
    }

    const fkIds = await pool.query<{ value: string }>(
      `SELECT value FROM external_id WHERE system = $1 ORDER BY value`,
      [EXTERNAL_SYSTEM_FKAPI],
    );
    expect(fkIds.rows.map((r) => r.value)).toEqual(["fk-1001", "fk-1002"]);

    const photos = await pool.query<{ rights: string; visibility: string; object_key: string }>(
      `SELECT rights, visibility, object_key FROM kit_photo ORDER BY object_key`,
    );
    expect(photos.rows).toHaveLength(2);
    for (const photo of photos.rows) {
      expect(photo.rights).toBe("unresolved");
      expect(photo.visibility).toBe("admin_only");
      expect(photo.object_key.startsWith("kit/")).toBe(true);
    }

    expect(objectStore.objects.size).toBe(2);
  });

  it("is idempotent on second run", async () => {
    const objectStore = createMemoryObjectStore();
    const fetchAdapter = createFixtureFetchAdapter();

    await runFkSeed({
      databaseUrl: DATABASE_URL,
      fetchAdapter,
      objectStore,
      scope: {
        competition: "superliga",
        fromSeason: "1998/99",
        toSeason: "1998/99",
      },
    });

    const firstKitIds = await pool.query<{ id: string }>(`SELECT id FROM kit ORDER BY id`);
    const firstCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM kit`,
    );

    const second = await runFkSeed({
      databaseUrl: DATABASE_URL,
      fetchAdapter,
      objectStore,
      scope: {
        competition: "superliga",
        fromSeason: "1998/99",
        toSeason: "1998/99",
      },
    });

    expect(second.kitsUpserted).toBe(2);
    expect(second.photosWritten).toBe(0);

    const secondKitIds = await pool.query<{ id: string }>(`SELECT id FROM kit ORDER BY id`);
    const secondCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM kit`,
    );

    expect(secondKitIds.rows).toEqual(firstKitIds.rows);
    expect(secondCount.rows[0]!.count).toBe(firstCount.rows[0]!.count);
  });

  it("does not call Football Kit Archive when using injected fetch adapter", async () => {
    const fakeAdapter: FkFetchAdapter = {
      async fetchKits() {
        return [
          {
            id: "fk-injected",
            clubTransfermarktId: "190",
            seasonTransfermarktId: "DK1-1998",
            seasonLabel: "1998/99",
            type: "home",
            imageBytes: Uint8Array.from([1, 2, 3]),
          },
        ];
      },
    };

    const objectStore = createMemoryObjectStore();
    await runFkSeed({
      databaseUrl: DATABASE_URL,
      fetchAdapter: fakeAdapter,
      objectStore,
      scope: {
        competition: "superliga",
        fromSeason: "1998/99",
        toSeason: "1998/99",
      },
    });

    const row = await pool.query<{ value: string }>(
      `SELECT value FROM external_id WHERE system = $1 AND value = 'fk-injected'`,
      [EXTERNAL_SYSTEM_FKAPI],
    );
    expect(row.rows).toHaveLength(1);
  });
});

describe("runCli", () => {
  it("runs end-to-end with fake adapters", async () => {
    await resetDatabase(DATABASE_URL, migrationsFolder);
    const pool = new Pool({ connectionString: DATABASE_URL });
    await seedApifyPrerequisites(pool);
    await pool.end();

    const objectStore = createMemoryObjectStore();
    await runCli({
      argv: ["superliga", "1998/99", "1998/99", "development"],
      databaseUrl: DATABASE_URL,
      fetchAdapter: createFixtureFetchAdapter(),
      objectStore,
    });

    const verifyPool = new Pool({ connectionString: DATABASE_URL });
    const count = await verifyPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM kit`,
    );
    expect(Number(count.rows[0]!.count)).toBeGreaterThan(0);
    await verifyPool.end();
  });
});
