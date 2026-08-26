import "reflect-metadata";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  adminCollectorJerseyDrillSchema,
  adminCollectorJerseyIndexSchema,
  adminCollectorListSchema,
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
  userJersey,
  userJerseyPhoto,
} from "@kit/db";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ADMIN_OBJECT_STORE } from "../dist/admin/admin-catalog.service.js";
import { AppModule } from "../dist/app.module.js";
import { OBJECT_STORE } from "../dist/collection/collection.service.js";
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

async function loginAdmin(app: NestFastifyApplication, email: string) {
  const response = await app.inject({
    method: "POST",
    url: "/v1/identity/login",
    payload: {
      email,
      password: "password123",
    },
  });
  return identitySessionSchema.parse(JSON.parse(response.body));
}

describe("Admin collectors /v1", () => {
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
      .overrideProvider(OBJECT_STORE)
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

  it("returns 403 for collector token on admin collectors", async () => {
    const session = await registerUser(app, "collector-only@example.com");
    const response = await app.inject({
      method: "GET",
      url: "/v1/admin/collectors",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
    });
    expect(response.statusCode).toBe(403);
  });

  it("lists users, jerseys, photos, take-down, and role guards", async () => {
    const collector = await registerUser(app, "listed-collector@example.com");
    await registerUser(app, "staff-b@example.com");
    await promoteToAdmin("staff-b@example.com");
    const adminSession = await loginAdmin(app, "staff-b@example.com");

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

    await db.insert(catalogLabel).values({
      entityType: "club",
      entityId: insertedClub!.id,
      locale: "en",
      kind: "label",
      text: "FC Copenhagen",
      source: "seed",
    });

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

    const kitObjectKey = `kit/${insertedKit!.id}/photo.jpg`;
    await objectStore.putObject(kitObjectKey, Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]));
    await db.insert(kitPhoto).values({
      kitId: insertedKit!.id,
      objectKey: kitObjectKey,
      rights: "unresolved",
      visibility: "admin_only",
    });

    const [insertedJersey] = await db
      .insert(userJersey)
      .values({
        userId: collector.user.id,
        clubId: insertedClub!.id,
        seasonId: insertedSeason!.id,
        catalogKitId: insertedKit!.id,
        type: "home",
        size: "m",
        condition: "used",
      })
      .returning({ id: userJersey.id });

    const photoId = crypto.randomUUID();
    const photoObjectKey = `user/${collector.user.id}/${insertedJersey!.id}/${photoId}.jpg`;
    const photoBytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
    await objectStore.putObject(photoObjectKey, photoBytes);
    await db.insert(userJerseyPhoto).values({
      id: photoId,
      userJerseyId: insertedJersey!.id,
      objectKey: photoObjectKey,
      role: "front",
      source: "camera",
      ocrStatus: "none",
    });

    await pool.end();

    const listResponse = await app.inject({
      method: "GET",
      url: "/v1/admin/collectors",
      headers: {
        authorization: `Bearer ${adminSession.accessToken}`,
      },
    });
    expect(listResponse.statusCode).toBe(200);
    const listBody = adminCollectorListSchema.parse(JSON.parse(listResponse.body));
    const collectorRow = listBody.rows.find((row) => row.email === "listed-collector@example.com");
    expect(collectorRow?.jerseyCount).toBe(1);
    expect(collectorRow).not.toHaveProperty("passwordHash");

    const jerseyIndexResponse = await app.inject({
      method: "GET",
      url: "/v1/admin/collectors/jerseys",
      headers: {
        authorization: `Bearer ${adminSession.accessToken}`,
      },
    });
    expect(jerseyIndexResponse.statusCode).toBe(200);
    const jerseyIndex = adminCollectorJerseyIndexSchema.parse(JSON.parse(jerseyIndexResponse.body));
    expect(jerseyIndex.rows.some((row) => row.id === insertedJersey!.id)).toBe(true);
    expect(jerseyIndex.rows.find((row) => row.id === insertedJersey!.id)?.userEmail).toBe(
      "listed-collector@example.com",
    );

    const jerseysResponse = await app.inject({
      method: "GET",
      url: `/v1/admin/collectors/${collector.user.id}/jerseys`,
      headers: {
        authorization: `Bearer ${adminSession.accessToken}`,
      },
    });
    expect(jerseysResponse.statusCode).toBe(200);

    const drillResponse = await app.inject({
      method: "GET",
      url: `/v1/admin/collectors/${collector.user.id}/jerseys/${insertedJersey!.id}`,
      headers: {
        authorization: `Bearer ${adminSession.accessToken}`,
      },
    });
    expect(drillResponse.statusCode).toBe(200);
    const drillBody = adminCollectorJerseyDrillSchema.parse(JSON.parse(drillResponse.body));
    expect(drillBody.photos).toHaveLength(1);

    const photoResponse = await app.inject({
      method: "GET",
      url: `/v1/admin/collectors/${collector.user.id}/jerseys/${insertedJersey!.id}/photos/${photoId}`,
      headers: {
        authorization: `Bearer ${adminSession.accessToken}`,
      },
    });
    expect(photoResponse.statusCode).toBe(200);
    expect(Buffer.from(photoResponse.rawPayload)).toEqual(Buffer.from(photoBytes));

    const takeDownResponse = await app.inject({
      method: "DELETE",
      url: `/v1/admin/collectors/${collector.user.id}/jerseys/${insertedJersey!.id}`,
      headers: {
        authorization: `Bearer ${adminSession.accessToken}`,
      },
    });
    expect(takeDownResponse.statusCode).toBe(204);

    const { db: verifyDb, pool: verifyPool } = createDb(DATABASE_URL);
    const remainingJersey = await verifyDb
      .select({ id: userJersey.id })
      .from(userJersey)
      .where(eq(userJersey.id, insertedJersey!.id));
    expect(remainingJersey).toHaveLength(0);

    const remainingKit = await verifyDb
      .select({ id: kit.id })
      .from(kit)
      .where(eq(kit.id, insertedKit!.id));
    expect(remainingKit).toHaveLength(1);

    const remainingKitPhoto = await verifyDb
      .select({ id: kitPhoto.id })
      .from(kitPhoto)
      .where(eq(kitPhoto.kitId, insertedKit!.id));
    expect(remainingKitPhoto).toHaveLength(1);

    const remainingUser = await verifyDb
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, collector.user.id));
    expect(remainingUser).toHaveLength(1);

    const objectStillExists = await objectStore.objectExists(photoObjectKey);
    expect(objectStillExists).toBe(false);

    await verifyPool.end();

    const selfDemote = await app.inject({
      method: "PATCH",
      url: `/v1/admin/collectors/${adminSession.user.id}/role`,
      headers: {
        authorization: `Bearer ${adminSession.accessToken}`,
      },
      payload: { role: "user" },
    });
    expect(selfDemote.statusCode).toBe(409);
    const selfDemoteBody: unknown = JSON.parse(selfDemote.body);
    expect(selfDemoteBody).toMatchObject({
      code: "SELF_DEMOTE",
      message: "You cannot demote your own Staff access.",
    });

    const promoteCollector = await app.inject({
      method: "PATCH",
      url: `/v1/admin/collectors/${collector.user.id}/role`,
      headers: {
        authorization: `Bearer ${adminSession.accessToken}`,
      },
      payload: { role: "admin" },
    });
    expect(promoteCollector.statusCode).toBe(200);

    const demoteCollector = await app.inject({
      method: "PATCH",
      url: `/v1/admin/collectors/${collector.user.id}/role`,
      headers: {
        authorization: `Bearer ${adminSession.accessToken}`,
      },
      payload: { role: "user" },
    });
    expect(demoteCollector.statusCode).toBe(200);

    const collectorCollection = await app.inject({
      method: "GET",
      url: "/v1/collection/jerseys",
      headers: {
        authorization: `Bearer ${collector.accessToken}`,
      },
    });
    expect(collectorCollection.statusCode).toBe(200);
    const jerseys = collectionJerseysSchema.parse(JSON.parse(collectorCollection.body));
    expect(jerseys).toEqual({ jerseys: [] });
  });

  it("filters jersey index by club CatalogLabel", async () => {
    const collector = await registerUser(app, "club-search-collector@example.com");
    await registerUser(app, "club-search-admin@example.com");
    await promoteToAdmin("club-search-admin@example.com");
    const adminSession = await loginAdmin(app, "club-search-admin@example.com");

    const { db, pool } = createDb(DATABASE_URL);

    const [insertedCountry] = await db
      .insert(country)
      .values({ iso3166: "SE" })
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
        text: "Malmo FF",
        source: "seed",
      },
      {
        entityType: "club",
        entityId: insertedClub!.id,
        locale: "da",
        kind: "label",
        text: "Malmø FF",
        source: "seed",
      },
    ]);

    const [insertedSeason] = await db
      .insert(season)
      .values({
        leagueId: insertedLeague!.id,
        label: "2022/23",
        startsOn: "2022-07-01",
        endsOn: "2023-06-30",
        calendarKind: "split_year",
      })
      .returning({ id: season.id });

    const [insertedJersey] = await db
      .insert(userJersey)
      .values({
        userId: collector.user.id,
        clubId: insertedClub!.id,
        seasonId: insertedSeason!.id,
        type: "home",
        size: "m",
        condition: "used",
      })
      .returning({ id: userJersey.id });

    await pool.end();

    const clubSearchResponse = await app.inject({
      method: "GET",
      url: "/v1/admin/collectors/jerseys?q=Malmo",
      headers: {
        authorization: `Bearer ${adminSession.accessToken}`,
      },
    });
    expect(clubSearchResponse.statusCode).toBe(200);
    const clubSearch = adminCollectorJerseyIndexSchema.parse(JSON.parse(clubSearchResponse.body));
    const matched = clubSearch.rows.find((row) => row.id === insertedJersey!.id);
    expect(matched?.clubLabel).toBe("Malmo FF");
    expect(matched?.userEmail).toBe("club-search-collector@example.com");

    const missResponse = await app.inject({
      method: "GET",
      url: "/v1/admin/collectors/jerseys?q=NoSuchClub",
      headers: {
        authorization: `Bearer ${adminSession.accessToken}`,
      },
    });
    expect(missResponse.statusCode).toBe(200);
    const missBody = adminCollectorJerseyIndexSchema.parse(JSON.parse(missResponse.body));
    expect(missBody.rows).toHaveLength(0);
  });

  it("returns 404 for missing jersey take-down", async () => {
    await promoteToAdmin("staff-b@example.com");
    const adminSession = await loginAdmin(app, "staff-b@example.com");
    const collector = await registerUser(app, "missing-jersey@example.com");

    const response = await app.inject({
      method: "DELETE",
      url: `/v1/admin/collectors/${collector.user.id}/jerseys/550e8400-e29b-41d4-a716-446655440099`,
      headers: {
        authorization: `Bearer ${adminSession.accessToken}`,
      },
    });
    expect(response.statusCode).toBe(404);
  });

  it("keeps jersey and photo bytes when object-store delete fails mid take-down", async () => {
    const collector = await registerUser(app, "partial-takedown@example.com");
    await promoteToAdmin("staff-b@example.com");
    const adminSession = await loginAdmin(app, "staff-b@example.com");

    const { db, pool } = createDb(DATABASE_URL);

    const [insertedCountry] = await db
      .insert(country)
      .values({ iso3166: "NO" })
      .returning({ id: country.id });

    const [insertedLeague] = await db
      .insert(league)
      .values({ countryId: insertedCountry!.id })
      .returning({ id: league.id });

    const [insertedClub] = await db
      .insert(club)
      .values({ countryId: insertedCountry!.id, kind: "club" })
      .returning({ id: club.id });

    await db.insert(catalogLabel).values({
      entityType: "club",
      entityId: insertedClub!.id,
      locale: "en",
      kind: "label",
      text: "Rosenborg",
      source: "seed",
    });

    const [insertedSeason] = await db
      .insert(season)
      .values({
        leagueId: insertedLeague!.id,
        label: "2023/24",
        startsOn: "2023-07-01",
        endsOn: "2024-06-30",
        calendarKind: "split_year",
      })
      .returning({ id: season.id });

    await db.insert(teamSeason).values({
      clubId: insertedClub!.id,
      seasonId: insertedSeason!.id,
    });

    const [insertedJersey] = await db
      .insert(userJersey)
      .values({
        userId: collector.user.id,
        clubId: insertedClub!.id,
        seasonId: insertedSeason!.id,
        type: "away",
        size: "l",
        condition: "new",
      })
      .returning({ id: userJersey.id });

    const photo1Id = crypto.randomUUID();
    const photo2Id = crypto.randomUUID();
    const photo1Key = `user/${collector.user.id}/${insertedJersey!.id}/${photo1Id}.jpg`;
    const photo2Key = `user/${collector.user.id}/${insertedJersey!.id}/${photo2Id}.jpg`;
    const photo1Bytes = Uint8Array.from([0x01, 0x02, 0x03]);
    const photo2Bytes = Uint8Array.from([0x04, 0x05, 0x06]);
    await objectStore.putObject(photo1Key, photo1Bytes);
    await objectStore.putObject(photo2Key, photo2Bytes);
    await db.insert(userJerseyPhoto).values([
      {
        id: photo1Id,
        userJerseyId: insertedJersey!.id,
        objectKey: photo1Key,
        role: "front",
        source: "camera",
        ocrStatus: "none",
      },
      {
        id: photo2Id,
        userJerseyId: insertedJersey!.id,
        objectKey: photo2Key,
        role: "back",
        source: "camera",
        ocrStatus: "none",
      },
    ]);

    await pool.end();

    const failingStore = {
      ...objectStore,
      deleteObject: async (key: string) => {
        if (key === photo2Key) {
          throw new Error("simulated object-store failure");
        }
        return objectStore.deleteObject(key);
      },
    };

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ADMIN_OBJECT_STORE)
      .useValue(failingStore)
      .overrideProvider(OBJECT_STORE)
      .useValue(failingStore)
      .compile();

    const failingApp = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    failingApp.setGlobalPrefix("v1");
    await failingApp.init();
    await failingApp.getHttpAdapter().getInstance().ready();

    try {
      const takeDownResponse = await failingApp.inject({
        method: "DELETE",
        url: `/v1/admin/collectors/${collector.user.id}/jerseys/${insertedJersey!.id}`,
        headers: {
          authorization: `Bearer ${adminSession.accessToken}`,
        },
      });
      expect(takeDownResponse.statusCode).toBe(500);

      const { db: verifyDb, pool: verifyPool } = createDb(DATABASE_URL);
      const remainingJersey = await verifyDb
        .select({ id: userJersey.id })
        .from(userJersey)
        .where(eq(userJersey.id, insertedJersey!.id));
      expect(remainingJersey).toHaveLength(1);

      const remainingPhotos = await verifyDb
        .select({ id: userJerseyPhoto.id })
        .from(userJerseyPhoto)
        .where(eq(userJerseyPhoto.userJerseyId, insertedJersey!.id));
      expect(remainingPhotos).toHaveLength(2);

      const firstPhotoStillExists = await objectStore.objectExists(photo1Key);
      expect(firstPhotoStillExists).toBe(true);
      const firstPhotoBytes = await objectStore.getObject(photo1Key);
      expect(firstPhotoBytes).toEqual(photo1Bytes);

      await verifyPool.end();
    } finally {
      await failingApp.close();
    }
  });
});
