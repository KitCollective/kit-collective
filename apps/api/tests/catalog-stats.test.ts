import "reflect-metadata";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { catalogStatsSchema } from "@kit/api-contract";
import { catalogLabel, club, country, createDb, resetDatabase } from "@kit/db";
import { EUROPEAN_COUNTRIES } from "@kit/domain";
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

async function prepareDatabase() {
  await resetDatabase(DATABASE_URL, migrationsFolder);
}

describe("GET /v1/catalog/stats", () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
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

  it("returns European stamdata counts on a catalog with no clubs", async () => {
    const response = await app.inject({ method: "GET", url: "/v1/catalog/stats" });
    expect(response.statusCode).toBe(200);

    const body = catalogStatsSchema.parse(JSON.parse(response.body));
    expect(body.countries).toBe(EUROPEAN_COUNTRIES.length);
    expect(body.catalogLabels).toBeGreaterThan(EUROPEAN_COUNTRIES.length);
    expect(body).toMatchObject({
      leagues: 0,
      clubs: 0,
      nationalTeams: 0,
      seasons: 0,
      teamSeasons: 0,
      players: 0,
      playerClubSeasons: 0,
      manufacturers: 0,
      kits: 0,
      kitPhotos: 0,
      externalIds: 0,
      users: 0,
    });
  });

  it("returns non-zero counts after inserting a fixture club and label", async () => {
    const { db, pool } = createDb(DATABASE_URL);

    const [insertedCountry] = await db
      .insert(country)
      .values({ iso3166: "US" })
      .returning({ id: country.id });

    const [insertedClub] = await db
      .insert(club)
      .values({ countryId: insertedCountry!.id, kind: "club" })
      .returning({ id: club.id });

    await db.insert(catalogLabel).values({
      entityType: "club",
      entityId: insertedClub!.id,
      locale: "da",
      kind: "label",
      text: "F.C. København",
      source: "seed",
    });

    await pool.end();

    const response = await app.inject({ method: "GET", url: "/v1/catalog/stats" });
    expect(response.statusCode).toBe(200);

    const body = catalogStatsSchema.parse(JSON.parse(response.body));
    expect(body.countries).toBeGreaterThanOrEqual(1);
    expect(body.clubs).toBeGreaterThanOrEqual(1);
    expect(body.catalogLabels).toBeGreaterThanOrEqual(1);
    expect(body).not.toHaveProperty("photoBytes");
    expect(body).not.toHaveProperty("objectKey");
  });
});
