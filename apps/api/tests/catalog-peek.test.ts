import "reflect-metadata";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NestFastifyApplication, FastifyAdapter } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import {
  createDb,
  country,
  club,
  catalogLabel,
  kit,
  kitPhoto,
  league,
  player,
  playerClubSeason,
  resetDatabase,
  season,
  teamSeason,
} from "@kit/db";
import { AppModule } from "../dist/app.module.js";

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../packages/db/migrations",
);

const DATABASE_URL =
  process.env.API_TEST_DATABASE_URL ??
  "postgresql://kit:kit@localhost:5432/kit_api_test";

async function prepareDatabase() {
  await resetDatabase(DATABASE_URL, migrationsFolder);
}

describe("GET /v1/catalog/peek", () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    await prepareDatabase();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.setGlobalPrefix("v1");
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns text/html with no seasons on an empty catalog", async () => {
    const response = await app.inject({ method: "GET", url: "/v1/catalog/peek" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");

    const html = response.body;
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Catalog peek");
    expect(html).toContain("no seasons");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("object_key");
    expect(html).not.toContain("r2");
  });

  it("lists inserted season, club, squad counts, kit types, and photo counts", async () => {
    const { db, pool } = createDb(DATABASE_URL);

    const [insertedCountry] = await db
      .insert(country)
      .values({ iso3166: "DK" })
      .returning({ id: country.id });

    const [insertedLeague] = await db
      .insert(league)
      .values({ countryId: insertedCountry!.id })
      .returning({ id: league.id });

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

    await db.insert(teamSeason).values({
      clubId: insertedClub!.id,
      seasonId: insertedSeason!.id,
    });

    const [playerOne] = await db.insert(player).values({}).returning({ id: player.id });
    const [playerTwo] = await db.insert(player).values({}).returning({ id: player.id });

    await db.insert(playerClubSeason).values([
      {
        playerId: playerOne!.id,
        clubId: insertedClub!.id,
        seasonId: insertedSeason!.id,
        squadNumber: 1,
      },
      {
        playerId: playerTwo!.id,
        clubId: insertedClub!.id,
        seasonId: insertedSeason!.id,
        squadNumber: 9,
      },
    ]);

    const [homeKit] = await db
      .insert(kit)
      .values({
        clubId: insertedClub!.id,
        seasonId: insertedSeason!.id,
        type: "home",
      })
      .returning({ id: kit.id });

    const [awayKit] = await db
      .insert(kit)
      .values({
        clubId: insertedClub!.id,
        seasonId: insertedSeason!.id,
        type: "away",
      })
      .returning({ id: kit.id });

    await db.insert(kitPhoto).values([
      { kitId: homeKit!.id, objectKey: "dev/archive/home-1.jpg" },
      { kitId: homeKit!.id, objectKey: "dev/archive/home-2.jpg" },
      { kitId: awayKit!.id, objectKey: "dev/archive/away-1.jpg" },
    ]);

    await pool.end();

    const response = await app.inject({ method: "GET", url: "/v1/catalog/peek" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");

    const html = response.body;
    expect(html).toContain("2024/25");
    expect(html).toContain("F.C. København");
    expect(html).toContain("squad: 2");
    expect(html).toContain("home");
    expect(html).toContain("2 photos");
    expect(html).toContain("away");
    expect(html).toContain("1 photo");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("object_key");
    expect(html).not.toContain("dev/archive");
    expect(html).not.toContain("r2");
  });
});
