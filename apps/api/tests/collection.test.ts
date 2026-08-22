import "reflect-metadata";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectionJerseysSchema,
  collectionSaveResponseSchema,
  identitySessionSchema,
} from "@kit/api-contract";
import {
  catalogLabel,
  club,
  country,
  createDb,
  league,
  resetDatabase,
  season,
  teamSeason,
} from "@kit/db";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../dist/app.module.js";

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../packages/db/migrations",
);

const DATABASE_URL =
  process.env.API_TEST_DATABASE_URL ?? "postgresql://kit:kit@localhost:5432/kit_api_test";

const JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFwABAQEBAAAAAAAAAAAAAAAAAAUGB//EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA//2Q==";

async function prepareDatabase() {
  await resetDatabase(DATABASE_URL, migrationsFolder);
}

async function registerSession(app: NestFastifyApplication, email: string) {
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

async function insertClubSeasonFixture() {
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

  await db.insert(catalogLabel).values({
    entityType: "club",
    entityId: insertedClub!.id,
    locale: "da",
    kind: "label",
    text: "F.C. København",
    source: "seed",
  });

  await pool.end();

  return {
    clubId: insertedClub!.id,
    seasonId: insertedSeason!.id,
  };
}

describe("Collection /v1", () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.JWT_SECRET = "test-jwt-secret";
    delete process.env.R2_ENDPOINT;
    await prepareDatabase();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.setGlobalPrefix("v1");
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("rejects unauthenticated save with 401", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/collection/jerseys/save",
      payload: {
        clubId: "00000000-0000-0000-0000-000000000001",
        seasonId: "00000000-0000-0000-0000-000000000002",
        type: "home",
        size: "m",
        condition: "used",
        photos: [{ role: "front", source: "gallery", contentBase64: JPEG_BASE64 }],
      },
    });

    expect(response.statusCode).toBe(401);
  });

  it("saves a UserJersey with nullable catalogKitId and user object keys", async () => {
    const session = await registerSession(app, "save@example.com");
    const fixture = await insertClubSeasonFixture();

    const response = await app.inject({
      method: "POST",
      url: "/v1/collection/jerseys/save",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        "accept-language": "da",
      },
      payload: {
        clubId: fixture.clubId,
        seasonId: fixture.seasonId,
        catalogKitId: null,
        type: "home",
        size: "m",
        condition: "used",
        photos: [{ role: "front", source: "gallery", contentBase64: JPEG_BASE64 }],
      },
    });

    expect(response.statusCode).toBe(201);
    const body = collectionSaveResponseSchema.parse(JSON.parse(response.body));
    expect(body.jersey.catalogKitId).toBeNull();
    expect(body.jersey.clubLabel).toBe("F.C. København");
    expect(body.jersey.seasonLabel).toBe("2023/24");
    expect(body.jersey.photos.length).toBeGreaterThanOrEqual(1);
    expect(body.jersey.photos[0]?.objectKey.startsWith(`user/${session.user.id}/`)).toBe(true);
    expect(body.jersey.photos[0]?.ocrStatus).toBe("none");
    expect(body.jersey.photos[0]?.objectKey.includes("kit/")).toBe(false);
  });

  it("lists saved jerseys with catalog labels and user photo URLs", async () => {
    const session = await registerSession(app, "list@example.com");
    const fixture = await insertClubSeasonFixture();

    await app.inject({
      method: "POST",
      url: "/v1/collection/jerseys/save",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      payload: {
        clubId: fixture.clubId,
        seasonId: fixture.seasonId,
        type: "away",
        size: "l",
        condition: "new",
        photos: [{ role: "front", source: "gallery", contentBase64: JPEG_BASE64 }],
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/collection/jerseys",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        "accept-language": "da",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = collectionJerseysSchema.parse(JSON.parse(response.body));
    expect(body.jerseys.length).toBe(1);
    expect(body.jerseys[0]?.clubLabel).toBe("F.C. København");
    expect(body.jerseys[0]?.photos[0]?.photoUrl.startsWith("/v1/collection/photos/")).toBe(true);
    expect(JSON.stringify(body)).not.toContain("kit/");
  });

  it("is idempotent when the same draftId is retried", async () => {
    const session = await registerSession(app, "draft@example.com");
    const fixture = await insertClubSeasonFixture();
    const draftId = "11111111-1111-1111-1111-111111111111";

    const first = await app.inject({
      method: "POST",
      url: "/v1/collection/jerseys/save",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      payload: {
        draftId,
        clubId: fixture.clubId,
        seasonId: fixture.seasonId,
        type: "home",
        size: "s",
        condition: "worn",
        photos: [{ role: "front", source: "gallery", contentBase64: JPEG_BASE64 }],
      },
    });

    const second = await app.inject({
      method: "POST",
      url: "/v1/collection/jerseys/save",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      payload: {
        draftId,
        clubId: fixture.clubId,
        seasonId: fixture.seasonId,
        type: "home",
        size: "s",
        condition: "worn",
        photos: [{ role: "front", source: "gallery", contentBase64: JPEG_BASE64 }],
      },
    });

    const firstBody = collectionSaveResponseSchema.parse(JSON.parse(first.body));
    const secondBody = collectionSaveResponseSchema.parse(JSON.parse(second.body));
    expect(secondBody.jersey.id).toBe(firstBody.jersey.id);
  });
});
