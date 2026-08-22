import "reflect-metadata";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  catalogClubSearchResponseSchema,
  catalogClubSeasonsResponseSchema,
  identitySessionSchema,
} from "@kit/api-contract";
import {
  catalogLabel,
  club,
  country,
  createDb,
  league,
  nationalTeam,
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

async function registerCollector(app: NestFastifyApplication, email: string) {
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

describe("Catalog picker /v1", () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.JWT_SECRET = "test-jwt-secret";
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

  it("rejects unauthenticated club search with 401", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/catalog/clubs/search?q=fck",
    });

    expect(response.statusCode).toBe(401);
  });

  it("rejects unauthenticated club seasons with 401", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/catalog/clubs/550e8400-e29b-41d4-a716-446655440000/seasons",
    });

    expect(response.statusCode).toBe(401);
  });

  it("matches labels and aliases across locales and resolves da before en", async () => {
    const { db, pool } = createDb(DATABASE_URL);

    const [insertedCountry] = await db
      .insert(country)
      .values({ iso3166: "DK" })
      .returning({ id: country.id });

    const [insertedClub] = await db
      .insert(club)
      .values({ countryId: insertedCountry!.id, kind: "club" })
      .returning({ id: club.id });

    await db.insert(catalogLabel).values([
      {
        entityType: "club",
        entityId: insertedClub!.id,
        locale: "da",
        kind: "label",
        text: "F.C. København",
        source: "seed",
      },
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
    ]);

    await pool.end();

    const session = await registerCollector(app, "picker@example.com");

    const response = await app.inject({
      method: "GET",
      url: "/v1/catalog/clubs/search?q=fck&locale=da",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = catalogClubSearchResponseSchema.parse(JSON.parse(response.body));
    expect(body.clubs).toEqual([
      {
        id: insertedClub!.id,
        label: "F.C. København",
      },
    ]);
    expect(JSON.stringify(body)).not.toMatch(/kit_photo|object_key|http/i);
  });

  it("includes national teams in club search results", async () => {
    const { db, pool } = createDb(DATABASE_URL);

    const [insertedCountry] = await db
      .insert(country)
      .values({ iso3166: "DK" })
      .returning({ id: country.id });

    const [insertedNationalTeam] = await db
      .insert(nationalTeam)
      .values({ countryId: insertedCountry!.id, gender: "men" })
      .returning({ id: nationalTeam.id });

    await db.insert(catalogLabel).values({
      entityType: "national_team",
      entityId: insertedNationalTeam!.id,
      locale: "da",
      kind: "label",
      text: "Danmark",
      source: "seed",
    });

    await pool.end();

    const session = await registerCollector(app, "national@example.com");

    const response = await app.inject({
      method: "GET",
      url: "/v1/catalog/clubs/search?q=danmark&locale=da",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = catalogClubSearchResponseSchema.parse(JSON.parse(response.body));
    expect(body.clubs).toEqual([
      {
        id: insertedNationalTeam!.id,
        label: "Danmark",
      },
    ]);
  });

  it("lists seasons for a club from TeamSeason", async () => {
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

    const [olderSeason] = await db
      .insert(season)
      .values({
        leagueId: insertedLeague!.id,
        label: "2022/23",
        startsOn: "2022-07-01",
        endsOn: "2023-06-30",
        calendarKind: "split_year",
      })
      .returning({ id: season.id });

    const [newerSeason] = await db
      .insert(season)
      .values({
        leagueId: insertedLeague!.id,
        label: "2023/24",
        startsOn: "2023-07-01",
        endsOn: "2024-06-30",
        calendarKind: "split_year",
      })
      .returning({ id: season.id });

    await db.insert(teamSeason).values([
      { clubId: insertedClub!.id, seasonId: olderSeason!.id },
      { clubId: insertedClub!.id, seasonId: newerSeason!.id },
    ]);

    await pool.end();

    const session = await registerCollector(app, "seasons@example.com");

    const response = await app.inject({
      method: "GET",
      url: `/v1/catalog/clubs/${insertedClub!.id}/seasons?locale=da`,
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = catalogClubSeasonsResponseSchema.parse(JSON.parse(response.body));
    expect(body.seasons).toEqual([
      { id: newerSeason!.id, label: "2023/24" },
      { id: olderSeason!.id, label: "2022/23" },
    ]);
  });
});
