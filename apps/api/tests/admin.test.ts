import "reflect-metadata";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  adminKitDrillSchema,
  adminStamdataListSchema,
  collectionJerseysSchema,
  identitySessionSchema,
} from "@kit/api-contract";
import {
  catalogLabel,
  club,
  country,
  createDb,
  kit,
  kitPhoto,
  league,
  resetDatabase,
  season,
  teamSeason,
  user,
} from "@kit/db";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ADMIN_OBJECT_STORE } from "../dist/admin/admin-catalog.service.js";
import { AppModule } from "../dist/app.module.js";
import { createMemoryObjectStore } from "../dist/collection/object-store.js";

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../packages/db/migrations",
);

const DATABASE_URL =
  process.env.API_TEST_DATABASE_URL ?? "postgresql://kit:kit@localhost:5432/kit_api_test";

const objectStore = createMemoryObjectStore();

async function registerUser(app: NestFastifyApplication, email: string) {
  const response = await app.inject({
    method: "POST",
    url: "/v1/identity/register",
    payload: {
      email,
      password: "password123",
    },
  });
  return identitySessionSchema.parse(JSON.parse(response.body));
}

async function promoteToAdmin(email: string) {
  const { db, pool } = createDb(DATABASE_URL);
  await db.update(user).set({ role: "admin" }).where(eq(user.email, email.toLowerCase()));
  await pool.end();
}

describe("Admin /v1", () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.JWT_SECRET = "test-jwt-secret";
    await resetDatabase(DATABASE_URL, migrationsFolder);

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ADMIN_OBJECT_STORE)
      .useValue(objectStore)
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.setGlobalPrefix("v1");
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns 401 for unauthenticated admin stamdata", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/admin/catalog/stamdata",
    });

    expect(response.statusCode).toBe(401);
  });

  it("returns 403 for collector token on admin stamdata", async () => {
    const session = await registerUser(app, "collector-admin@example.com");

    const response = await app.inject({
      method: "GET",
      url: "/v1/admin/catalog/stamdata",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
    });

    expect(response.statusCode).toBe(403);
  });

  it("lists en labels, alias search, and serves KitPhoto bytes for admin", async () => {
    const { db, pool } = createDb(DATABASE_URL);

    const [insertedCountry] = await db
      .insert(country)
      .values({ iso3166: "DK" })
      .returning({ id: country.id });

    const [insertedLeague] = await db
      .insert(league)
      .values({ countryId: insertedCountry!.id })
      .returning({ id: league.id });

    const [insertedClub] = await db
      .insert(club)
      .values({ countryId: insertedCountry!.id, kind: "club" })
      .returning({ id: club.id });

    await db.insert(catalogLabel).values([
      {
        entityType: "club",
        entityId: insertedClub!.id,
        locale: "en",
        kind: "label",
        text: "FC Copenhagen",
        source: "seed",
      },
      {
        entityType: "club",
        entityId: insertedClub!.id,
        locale: "da",
        kind: "alias",
        text: "FCK",
        source: "seed",
      },
      {
        entityType: "league",
        entityId: insertedLeague!.id,
        locale: "en",
        kind: "label",
        text: "Superliga",
        source: "seed",
      },
      {
        entityType: "country",
        entityId: insertedCountry!.id,
        locale: "en",
        kind: "label",
        text: "Denmark",
        source: "seed",
      },
      {
        entityType: "country",
        entityId: insertedCountry!.id,
        locale: "da",
        kind: "alias",
        text: "Danmark",
        source: "seed",
      },
      {
        entityType: "league",
        entityId: insertedLeague!.id,
        locale: "da",
        kind: "alias",
        text: "SL",
        source: "seed",
      },
    ]);

    const [insertedSeason] = await db
      .insert(season)
      .values({
        leagueId: insertedLeague!.id,
        label: "2024/25",
        startsOn: "2024-07-01",
        endsOn: "2025-06-30",
        calendarKind: "split_year",
      })
      .returning({ id: season.id });

    await db.insert(teamSeason).values({
      clubId: insertedClub!.id,
      seasonId: insertedSeason!.id,
    });

    const [insertedKit] = await db
      .insert(kit)
      .values({
        clubId: insertedClub!.id,
        seasonId: insertedSeason!.id,
        type: "home",
      })
      .returning({ id: kit.id });

    const objectKey = `kit/${insertedKit!.id}/photo.jpg`;
    const photoBytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
    await objectStore.putObject(objectKey, photoBytes);

    await db.insert(kitPhoto).values({
      kitId: insertedKit!.id,
      objectKey,
      rights: "unresolved",
      visibility: "admin_only",
    });

    await pool.end();

    await registerUser(app, "staff@example.com");
    await promoteToAdmin("staff@example.com");

    const loginResponse = await app.inject({
      method: "POST",
      url: "/v1/identity/login",
      payload: {
        email: "staff@example.com",
        password: "password123",
      },
    });
    const adminSession = identitySessionSchema.parse(JSON.parse(loginResponse.body));
    expect(adminSession.user.role).toBe("admin");

    const aliasSearch = await app.inject({
      method: "GET",
      url: "/v1/admin/catalog/stamdata?q=FCK",
      headers: {
        authorization: `Bearer ${adminSession.accessToken}`,
      },
    });
    expect(aliasSearch.statusCode).toBe(200);
    const aliasBody = adminStamdataListSchema.parse(JSON.parse(aliasSearch.body));
    expect(aliasBody.rows.some((row) => row.label.includes("FC Copenhagen"))).toBe(true);

    const countryAliasSearch = await app.inject({
      method: "GET",
      url: "/v1/admin/catalog/stamdata?q=Danmark",
      headers: {
        authorization: `Bearer ${adminSession.accessToken}`,
      },
    });
    expect(countryAliasSearch.statusCode).toBe(200);
    const countryAliasBody = adminStamdataListSchema.parse(JSON.parse(countryAliasSearch.body));
    expect(countryAliasBody.rows.some((row) => row.entityType === "club")).toBe(true);

    const leagueAliasSearch = await app.inject({
      method: "GET",
      url: "/v1/admin/catalog/stamdata?q=SL",
      headers: {
        authorization: `Bearer ${adminSession.accessToken}`,
      },
    });
    expect(leagueAliasSearch.statusCode).toBe(200);
    const leagueAliasBody = adminStamdataListSchema.parse(JSON.parse(leagueAliasSearch.body));
    expect(
      leagueAliasBody.rows.some(
        (row) => row.entityType === "season" || row.entityType === "club_season",
      ),
    ).toBe(true);

    const clubDrillResponse = await app.inject({
      method: "GET",
      url: `/v1/admin/catalog/clubs/${insertedClub!.id}`,
      headers: {
        authorization: `Bearer ${adminSession.accessToken}`,
      },
    });
    expect(clubDrillResponse.statusCode).toBe(200);

    const seasonDrillResponse = await app.inject({
      method: "GET",
      url: `/v1/admin/catalog/seasons/${insertedSeason!.id}`,
      headers: {
        authorization: `Bearer ${adminSession.accessToken}`,
      },
    });
    expect(seasonDrillResponse.statusCode).toBe(200);

    const listResponse = await app.inject({
      method: "GET",
      url: "/v1/admin/catalog/stamdata",
      headers: {
        authorization: `Bearer ${adminSession.accessToken}`,
      },
    });
    expect(listResponse.statusCode).toBe(200);
    const listBody = adminStamdataListSchema.parse(JSON.parse(listResponse.body));
    const kitRow = listBody.rows.find((row) => row.entityType === "kit");
    expect(kitRow?.label).toContain("FC Copenhagen");
    expect(kitRow?.photoPath).toBe(`/v1/admin/catalog/kits/${insertedKit!.id}/photo`);

    const drillResponse = await app.inject({
      method: "GET",
      url: `/v1/admin/catalog/kits/${insertedKit!.id}`,
      headers: {
        authorization: `Bearer ${adminSession.accessToken}`,
      },
    });
    expect(drillResponse.statusCode).toBe(200);
    const drillBody = adminKitDrillSchema.parse(JSON.parse(drillResponse.body));
    expect(drillBody.clubLabel).toBe("FC Copenhagen");

    const photoResponse = await app.inject({
      method: "GET",
      url: `/v1/admin/catalog/kits/${insertedKit!.id}/photo`,
      headers: {
        authorization: `Bearer ${adminSession.accessToken}`,
      },
    });
    expect(photoResponse.statusCode).toBe(200);
    expect(Buffer.from(photoResponse.rawPayload)).toEqual(Buffer.from(photoBytes));

    const collectorSession = await registerUser(app, "another-collector@example.com");
    const forbiddenPhoto = await app.inject({
      method: "GET",
      url: `/v1/admin/catalog/kits/${insertedKit!.id}/photo`,
      headers: {
        authorization: `Bearer ${collectorSession.accessToken}`,
      },
    });
    expect(forbiddenPhoto.statusCode).toBe(403);
  });

  it("keeps register role=user and lets admin list own collection jerseys", async () => {
    const collector = await registerUser(app, "dual-role@example.com");
    expect(collector.user.role).toBe("user");

    await promoteToAdmin("dual-role@example.com");
    const loginResponse = await app.inject({
      method: "POST",
      url: "/v1/identity/login",
      payload: {
        email: "dual-role@example.com",
        password: "password123",
      },
    });
    const adminSession = identitySessionSchema.parse(JSON.parse(loginResponse.body));

    const collectionResponse = await app.inject({
      method: "GET",
      url: "/v1/collection/jerseys",
      headers: {
        authorization: `Bearer ${adminSession.accessToken}`,
      },
    });

    expect(collectionResponse.statusCode).toBe(200);
    const jerseys = collectionJerseysSchema.parse(JSON.parse(collectionResponse.body));
    expect(jerseys).toEqual({ jerseys: [] });
  });
});
