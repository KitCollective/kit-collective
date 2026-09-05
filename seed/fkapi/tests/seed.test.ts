import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseCliArgs } from "../src/cli-args.js";
import { createFixtureFetchAdapter } from "../src/fetch.js";
import { runFkSeed } from "../src/mapper.js";
import { normalizeRawKit } from "../src/normalize.js";
import { runCli } from "../src/run.js";
import type { FkFetchAdapter, ObjectStoreAdapter } from "../src/types.js";
import { EXTERNAL_SYSTEM_FKAPI } from "../src/types.js";
import {
  allocateTestFixtureScope,
  createScopedFixtureFetchAdapter,
  seedApifyPrerequisites,
} from "./fixture-scope.js";
import { resetTestDatabase } from "./test-db.js";

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../packages/db/migrations",
);

const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://kit:kit@localhost:5432/kit_test";

function createMemoryObjectStore(): ObjectStoreAdapter & { objects: Map<string, Uint8Array> } {
  const objects = new Map<string, Uint8Array>();
  return {
    objects,
    async putObject(key: string, bytes: Uint8Array): Promise<void> {
      objects.set(key, bytes);
    },
    async objectExists(key: string): Promise<boolean> {
      return objects.has(key);
    },
  };
}

describe("FK seed CLI args", () => {
  it("matches shared seed CLI contract: competition, from, to, lane", () => {
    const parsed = parseCliArgs(["superliga", "0001", "2025/26", "development"]);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.parsed.scope).toEqual({
        kind: "competition",
        competition: "superliga",
        fromSeason: "0001",
        toSeason: "2025/26",
      });
      expect(parsed.parsed.lane).toBe("development");
    }
  });

  it("parses club + season scope", () => {
    const parsed = parseCliArgs(["club", "superliga", "club-190", "1998/99", "development"]);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.parsed.scope).toEqual({
        kind: "club",
        competition: "superliga",
        clubExternalId: "club-190",
        season: "1998/99",
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

  it("keeps kit sponsor and colour hex when the catalog kept them", () => {
    const result = normalizeRawKit({
      id: "fk-1",
      clubTransfermarktId: "190",
      seasonTransfermarktId: "DK1-1998",
      seasonLabel: "2010/11",
      type: "home",
      sponsorName: "Carlsberg",
      primaryColorHex: "#FFFFFF",
      secondaryColorHex: "000000",
    });
    expect(result).toEqual({
      id: "fk-1",
      clubTransfermarktId: "190",
      seasonTransfermarktId: "DK1-1998",
      seasonLabel: "2010/11",
      type: "home",
      sponsorName: "Carlsberg",
      primaryColorHex: "FFFFFF",
      secondaryColorHex: "000000",
    });
  });
});

describe("FK seed mapper", () => {
  let pool: Pool;

  beforeAll(async () => {
    await resetTestDatabase(DATABASE_URL, migrationsFolder);
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
          kind: "competition",
          competition: "superliga",
          fromSeason: "1998/99",
          toSeason: "1998/99",
        },
      }),
    ).rejects.toThrow(/Missing Club row/);
  });

  it("writes Kit + KitPhoto with admin_only and unresolved rights", async () => {
    const scope = allocateTestFixtureScope();
    const { clubId, seasonId } = await seedApifyPrerequisites(pool, scope);
    const objectStore = createMemoryObjectStore();

    const result = await runFkSeed({
      databaseUrl: DATABASE_URL,
      fetchAdapter: createScopedFixtureFetchAdapter(scope),
      objectStore,
      scope: {
        kind: "competition",
        competition: "superliga",
        fromSeason: scope.seasonLabel,
        toSeason: scope.seasonLabel,
      },
    });

    expect(result.kitsUpserted).toBe(2);
    expect(result.photosWritten).toBe(2);

    const kits = await pool.query<{
      id: string;
      club_id: string;
      season_id: string;
      type: string;
      manufacturer_id: string | null;
      sponsor_name: string | null;
      primary_color_hex: string | null;
      secondary_color_hex: string | null;
    }>(
      `SELECT id, club_id, season_id, type, manufacturer_id, sponsor_name, primary_color_hex, secondary_color_hex FROM kit ORDER BY type`,
    );

    expect(kits.rows).toHaveLength(2);
    for (const row of kits.rows) {
      expect(row.club_id).toBe(clubId);
      expect(row.season_id).toBe(seasonId);
    }

    const home = kits.rows.find((row) => row.type === "home");
    const away = kits.rows.find((row) => row.type === "away");
    expect(home?.sponsor_name).toBe("Carlsberg");
    expect(away?.sponsor_name).toBeNull();
    expect(home?.primary_color_hex).toBe("FFFFFF");
    expect(home?.secondary_color_hex).toBe("000000");
    expect(away?.primary_color_hex).toBe("0000FF");
    expect(away?.secondary_color_hex).toBe("FFFFFF");
    expect(home?.manufacturer_id).toBeTruthy();
    expect(away?.manufacturer_id).toBe(home?.manufacturer_id);

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

  it("refuses accept when object store reports missing bytes after putObject", async () => {
    const scope = allocateTestFixtureScope();
    await seedApifyPrerequisites(pool, scope);

    const brokenStore: ObjectStoreAdapter = {
      async putObject() {},
      async objectExists() {
        return false;
      },
    };

    await expect(
      runFkSeed({
        databaseUrl: DATABASE_URL,
        fetchAdapter: createScopedFixtureFetchAdapter(scope),
        objectStore: brokenStore,
        scope: {
          kind: "competition",
          competition: "superliga",
          fromSeason: scope.seasonLabel,
          toSeason: scope.seasonLabel,
        },
      }),
    ).rejects.toThrow(/Lane R2 object missing after putObject/);
  });

  it("refuses accept when a kit has no archive image bytes", async () => {
    const scope = allocateTestFixtureScope();
    await seedApifyPrerequisites(pool, scope);

    const imagelessAdapter: FkFetchAdapter = {
      async fetchKits() {
        return [
          {
            id: "fk-no-image",
            clubTransfermarktId: scope.clubTransfermarktId,
            seasonTransfermarktId: "DK1-1998",
            seasonLabel: scope.seasonLabel,
            type: "home",
          },
        ];
      },
    };

    await expect(
      runFkSeed({
        databaseUrl: DATABASE_URL,
        fetchAdapter: imagelessAdapter,
        objectStore: createMemoryObjectStore(),
        scope: {
          kind: "competition",
          competition: "superliga",
          fromSeason: scope.seasonLabel,
          toSeason: scope.seasonLabel,
        },
      }),
    ).rejects.toThrow(/no archive image bytes/);

    const kitRow = await pool.query<{ value: string }>(
      `SELECT value FROM external_id WHERE system = $1 AND value = 'fk-no-image'`,
      [EXTERNAL_SYSTEM_FKAPI],
    );
    expect(kitRow.rows).toHaveLength(0);
  });

  it("is idempotent on second run", async () => {
    const scope = allocateTestFixtureScope();
    await seedApifyPrerequisites(pool, scope);
    const objectStore = createMemoryObjectStore();
    const fetchAdapter = createScopedFixtureFetchAdapter(scope);
    const runScope = {
      kind: "competition" as const,
      competition: "superliga",
      fromSeason: scope.seasonLabel,
      toSeason: scope.seasonLabel,
    };

    await runFkSeed({
      databaseUrl: DATABASE_URL,
      fetchAdapter,
      objectStore,
      scope: runScope,
    });

    const firstKitIds = await pool.query<{ id: string }>(`SELECT id FROM kit ORDER BY id`);
    const firstCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM kit`,
    );

    const second = await runFkSeed({
      databaseUrl: DATABASE_URL,
      fetchAdapter,
      objectStore,
      scope: runScope,
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

  it("fetches kits for a club + season scope without searching the competition range", async () => {
    const scope = allocateTestFixtureScope();
    const { clubId, seasonId } = await seedApifyPrerequisites(pool, scope);
    const objectStore = createMemoryObjectStore();

    const result = await runFkSeed({
      databaseUrl: DATABASE_URL,
      fetchAdapter: createScopedFixtureFetchAdapter(scope),
      objectStore,
      scope: {
        kind: "club",
        competition: "superliga",
        clubExternalId: `club-${scope.clubTransfermarktId}`,
        season: scope.seasonLabel,
      },
    });

    expect(result.kitsUpserted).toBe(2);
    const kits = await pool.query<{ club_id: string; season_id: string }>(
      `SELECT club_id, season_id FROM kit`,
    );
    expect(kits.rows).toHaveLength(2);
    for (const row of kits.rows) {
      expect(row.club_id).toBe(clubId);
      expect(row.season_id).toBe(seasonId);
    }
  });

  it("refuses club scope when season row is missing for an existing club", async () => {
    const scope = allocateTestFixtureScope();
    const countryRow = await pool.query<{ id: string }>(
      `INSERT INTO country (iso3166) VALUES ('DK') RETURNING id`,
    );
    const clubRow = await pool.query<{ id: string }>(
      `INSERT INTO club (country_id, kind) VALUES ($1, 'club') RETURNING id`,
      [countryRow.rows[0]!.id],
    );
    await pool.query(
      `INSERT INTO external_id (entity_type, entity_id, system, value)
       VALUES ('club', $1, 'transfermarkt', $2)`,
      [clubRow.rows[0]!.id, scope.clubTransfermarktId],
    );

    const objectStore = createMemoryObjectStore();
    await expect(
      runFkSeed({
        databaseUrl: DATABASE_URL,
        fetchAdapter: createScopedFixtureFetchAdapter(scope),
        objectStore,
        scope: {
          kind: "club",
          competition: "superliga",
          clubExternalId: scope.clubTransfermarktId,
          season: scope.seasonLabel,
        },
      }),
    ).rejects.toThrow(/Missing Season row/);
  });

  it("refuses club scope when club or season prerequisites are missing", async () => {
    const objectStore = createMemoryObjectStore();
    await expect(
      runFkSeed({
        databaseUrl: DATABASE_URL,
        fetchAdapter: createFixtureFetchAdapter(),
        objectStore,
        scope: {
          kind: "club",
          competition: "superliga",
          clubExternalId: "club-190",
          season: "1998/99",
        },
      }),
    ).rejects.toThrow(/Missing Club row/);
  });

  it("does not call Football Kit Archive when using injected fetch adapter", async () => {
    const scope = allocateTestFixtureScope();
    await seedApifyPrerequisites(pool, scope);

    const fakeAdapter: FkFetchAdapter = {
      async fetchKits() {
        return [
          {
            id: "fk-injected",
            clubTransfermarktId: scope.clubTransfermarktId,
            seasonTransfermarktId: "DK1-1998",
            seasonLabel: scope.seasonLabel,
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
        kind: "competition",
        competition: "superliga",
        fromSeason: scope.seasonLabel,
        toSeason: scope.seasonLabel,
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
  it("requires FKAPI_BASE_URL when no fetch adapter is injected", async () => {
    const previous = process.env.FKAPI_BASE_URL;
    delete process.env.FKAPI_BASE_URL;
    await expect(
      runCli({
        argv: ["superliga", "1998/99", "1998/99", "development"],
        databaseUrl: DATABASE_URL,
        objectStore: createMemoryObjectStore(),
      }),
    ).rejects.toThrow(/FKAPI_BASE_URL/);
    if (previous) {
      process.env.FKAPI_BASE_URL = previous;
    }
  });

  it("runs end-to-end with fake adapters", async () => {
    const scope = allocateTestFixtureScope();
    await resetTestDatabase(DATABASE_URL, migrationsFolder);
    const setupPool = new Pool({ connectionString: DATABASE_URL });
    await seedApifyPrerequisites(setupPool, scope);
    await setupPool.end();

    const objectStore = createMemoryObjectStore();
    await runCli({
      argv: ["superliga", scope.seasonLabel, scope.seasonLabel, "development"],
      databaseUrl: DATABASE_URL,
      fetchAdapter: createScopedFixtureFetchAdapter(scope),
      objectStore,
    });

    const verifyPool = new Pool({ connectionString: DATABASE_URL });
    const count = await verifyPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM kit`,
    );
    expect(Number(count.rows[0]?.count)).toBeGreaterThan(0);
    await verifyPool.end();
  });
});
