import "reflect-metadata";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectionJerseysSchema,
  collectionSaveResponseSchema,
  collectionShortcutSchema,
  collectionShortcutsSchema,
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

async function insertClubSeasonFixture(clubLabelDa = "F.C. København") {
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
    text: clubLabelDa,
    source: "seed",
  });

  await pool.end();

  return {
    clubId: insertedClub!.id,
    seasonId: insertedSeason!.id,
    clubLabelDa,
  };
}

async function saveJersey(
  app: NestFastifyApplication,
  accessToken: string,
  clubId: string,
  seasonId: string,
) {
  const response = await app.inject({
    method: "POST",
    url: "/v1/collection/jerseys/save",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "accept-language": "da",
    },
    payload: {
      clubId,
      seasonId,
      type: "home",
      size: "m",
      condition: "used",
      photos: [{ role: "front", source: "gallery", contentBase64: JPEG_BASE64 }],
    },
  });

  expect(response.statusCode).toBe(201);
  return collectionSaveResponseSchema.parse(JSON.parse(response.body));
}

describe("Collection shortcuts /v1", () => {
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

  it("rejects unauthenticated shortcut list with 401", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/collection/shortcuts",
    });

    expect(response.statusCode).toBe(401);
  });

  it("rejects unauthenticated filtered jersey list with 401", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/collection/jerseys?shortcutId=550e8400-e29b-41d4-a716-446655440000",
    });

    expect(response.statusCode).toBe(401);
  });

  it("rejects shortcut write with zero facets", async () => {
    const session = await registerSession(app, "shortcut-zero@example.com");

    const response = await app.inject({
      method: "POST",
      url: "/v1/collection/shortcuts",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      payload: { name: "Empty" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("creates club shortcut with auto-name and filters jerseys by clubId", async () => {
    const session = await registerSession(app, "shortcut-club@example.com");
    const fixture = await insertClubSeasonFixture();
    await saveJersey(app, session.accessToken, fixture.clubId, fixture.seasonId);

    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/collection/shortcuts",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        "accept-language": "da",
      },
      payload: { clubId: fixture.clubId },
    });

    expect(createResponse.statusCode).toBe(201);
    const shortcut = collectionShortcutSchema.parse(JSON.parse(createResponse.body));
    expect(shortcut.name).toBe(fixture.clubLabelDa);
    expect(shortcut.clubId).toBe(fixture.clubId);
    expect(shortcut.matchCount).toBe(1);

    const alleResponse = await app.inject({
      method: "GET",
      url: "/v1/collection/jerseys",
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    const alleBody = collectionJerseysSchema.parse(JSON.parse(alleResponse.body));
    expect(alleBody.jerseys.length).toBe(1);

    const filteredResponse = await app.inject({
      method: "GET",
      url: `/v1/collection/jerseys?shortcutId=${shortcut.id}`,
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    const filteredBody = collectionJerseysSchema.parse(JSON.parse(filteredResponse.body));
    expect(filteredBody.jerseys.length).toBe(1);
    expect(filteredBody.jerseys[0]?.clubId).toBe(fixture.clubId);
  });

  it("isolates shortcuts to owner on edit and delete", async () => {
    const owner = await registerSession(app, "shortcut-owner@example.com");
    const other = await registerSession(app, "shortcut-other@example.com");
    const fixture = await insertClubSeasonFixture("Brøndby IF");

    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/collection/shortcuts",
      headers: {
        authorization: `Bearer ${owner.accessToken}`,
        "accept-language": "da",
      },
      payload: { clubId: fixture.clubId },
    });
    const shortcut = collectionShortcutSchema.parse(JSON.parse(createResponse.body));

    const editResponse = await app.inject({
      method: "PATCH",
      url: `/v1/collection/shortcuts/${shortcut.id}`,
      headers: { authorization: `Bearer ${other.accessToken}` },
      payload: { clubId: fixture.clubId, name: "Stolen" },
    });
    expect([403, 404]).toContain(editResponse.statusCode);

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/v1/collection/shortcuts/${shortcut.id}`,
      headers: { authorization: `Bearer ${other.accessToken}` },
    });
    expect([403, 404]).toContain(deleteResponse.statusCode);

    const listResponse = await app.inject({
      method: "GET",
      url: "/v1/collection/shortcuts",
      headers: { authorization: `Bearer ${owner.accessToken}` },
    });
    const listBody = collectionShortcutsSchema.parse(JSON.parse(listResponse.body));
    expect(listBody.shortcuts.some((row) => row.id === shortcut.id)).toBe(true);
  });
});
