import "reflect-metadata";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  COLLECTION_SHOWCASE_JERSEY_CAP,
  collectionSaveResponseSchema,
  collectionShowcaseJerseysSchema,
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

  await db.insert(catalogLabel).values([
    {
      entityType: "country",
      entityId: insertedCountry!.id,
      locale: "da",
      kind: "label",
      text: "Danmark",
      source: "seed",
    },
    {
      entityType: "league",
      entityId: insertedLeague!.id,
      locale: "da",
      kind: "label",
      text: "Superligaen",
      source: "seed",
    },
    {
      entityType: "club",
      entityId: insertedClub!.id,
      locale: "da",
      kind: "label",
      text: "F.C. København",
      source: "seed",
    },
  ]);

  await pool.end();

  return {
    clubId: insertedClub!.id,
    seasonId: insertedSeason!.id,
  };
}

async function saveJerseyForUser(
  app: NestFastifyApplication,
  session: Awaited<ReturnType<typeof registerSession>>,
  fixture: Awaited<ReturnType<typeof insertClubSeasonFixture>>,
) {
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
      type: "home",
      size: "m",
      condition: "used",
      photos: [{ role: "front", source: "gallery", contentBase64: JPEG_BASE64 }],
    },
  });

  expect(response.statusCode).toBe(201);
  return collectionSaveResponseSchema.parse(JSON.parse(response.body)).jersey;
}

describe("Collection showcase /v1", () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.JWT_SECRET = "test-jwt-secret";
    process.env.BETTER_AUTH_SECRET = "test-better-auth-secret-not-for-production";
    process.env.BETTER_AUTH_URL = "http://127.0.0.1:3000";
    delete process.env.R2_ENDPOINT;
    await resetDatabase(DATABASE_URL, migrationsFolder);

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

  it("returns 200 with an empty jersey list before any public copies exist", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/collection/showcase/jerseys",
      headers: { "accept-language": "da" },
    });

    expect(response.statusCode).toBe(200);
    expect(collectionShowcaseJerseysSchema.parse(JSON.parse(response.body))).toEqual({
      jerseys: [],
    });
  });

  it("omits private UserJerseys from the unsigned showcase GET", async () => {
    const fixture = await insertClubSeasonFixture();
    const publicUser = await registerSession(app, "showcase-public@example.com");
    const privateUser = await registerSession(app, "showcase-private@example.com");

    const publicJersey = await saveJerseyForUser(app, publicUser, fixture);
    const privateJersey = await saveJerseyForUser(app, privateUser, fixture);

    const patchPrivate = await app.inject({
      method: "PATCH",
      url: `/v1/collection/jerseys/${privateJersey.id}/private`,
      headers: { authorization: `Bearer ${privateUser.accessToken}` },
      payload: { private: true },
    });
    expect(patchPrivate.statusCode).toBe(200);

    const response = await app.inject({
      method: "GET",
      url: "/v1/collection/showcase/jerseys",
      headers: { "accept-language": "da" },
    });

    expect(response.statusCode).toBe(200);
    const body = collectionShowcaseJerseysSchema.parse(JSON.parse(response.body));
    expect(body.jerseys.map((jersey) => jersey.id)).toEqual([publicJersey.id]);
    expect(body.jerseys[0]?.photos[0]?.photoUrl).toContain("/v1/collection/showcase/photos/");
  });

  it("serves showcase photos without auth for non-private jerseys", async () => {
    const fixture = await insertClubSeasonFixture();
    const session = await registerSession(app, "showcase-photo@example.com");
    await saveJerseyForUser(app, session, fixture);

    const showcase = await app.inject({
      method: "GET",
      url: "/v1/collection/showcase/jerseys",
      headers: { "accept-language": "da" },
    });
    const body = collectionShowcaseJerseysSchema.parse(JSON.parse(showcase.body));
    const photoId = body.jerseys[0]?.photos[0]?.id;
    expect(photoId).toBeDefined();

    const photo = await app.inject({
      method: "GET",
      url: `/v1/collection/showcase/photos/${photoId}`,
    });

    expect(photo.statusCode).toBe(200);
    expect(photo.headers["content-type"]).toBe("image/jpeg");
  });

  it("keeps anonymous own-collection GET and Save on 401", async () => {
    const list = await app.inject({
      method: "GET",
      url: "/v1/collection/jerseys",
    });
    expect(list.statusCode).toBe(401);

    const save = await app.inject({
      method: "POST",
      url: "/v1/collection/jerseys/save",
      payload: {
        clubId: "11111111-1111-4111-8111-111111111111",
        seasonId: "22222222-2222-4222-8222-222222222222",
        type: "home",
        size: "m",
        condition: "used",
        photos: [{ role: "front", source: "gallery", contentBase64: JPEG_BASE64 }],
      },
    });
    expect(save.statusCode).toBe(401);
  });

  it("coarsely caps the unsigned showcase jersey list", async () => {
    expect(COLLECTION_SHOWCASE_JERSEY_CAP).toBe(40);
  });
});
