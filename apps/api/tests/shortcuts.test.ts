import "reflect-metadata";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  catalogFacetSearchResponseSchema,
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
  player,
  playerClubSeason,
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

type Fixture = {
  countryId: string;
  leagueId: string;
  clubId: string;
  seasonId: string;
  playerId: string;
  countryLabelDa: string;
  leagueLabelDa: string;
  clubLabelDa: string;
  playerLabelDa: string;
};

async function insertFullFixture(): Promise<Fixture> {
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

  const [insertedPlayer] = await db.insert(player).values({}).returning({ id: player.id });

  await db.insert(playerClubSeason).values({
    playerId: insertedPlayer!.id,
    clubId: insertedClub!.id,
    seasonId: insertedSeason!.id,
    squadNumber: 9,
  });

  const countryLabelDa = "Danmark";
  const leagueLabelDa = "Superligaen";
  const clubLabelDa = "F.C. København";
  const playerLabelDa = "Jonas Wind";

  await db.insert(catalogLabel).values([
    {
      entityType: "country",
      entityId: insertedCountry!.id,
      locale: "da",
      kind: "label",
      text: countryLabelDa,
      source: "seed",
    },
    {
      entityType: "league",
      entityId: insertedLeague!.id,
      locale: "da",
      kind: "label",
      text: leagueLabelDa,
      source: "seed",
    },
    {
      entityType: "club",
      entityId: insertedClub!.id,
      locale: "da",
      kind: "label",
      text: clubLabelDa,
      source: "seed",
    },
    {
      entityType: "player",
      entityId: insertedPlayer!.id,
      locale: "da",
      kind: "label",
      text: playerLabelDa,
      source: "seed",
    },
  ]);

  await pool.end();

  return {
    countryId: insertedCountry!.id,
    leagueId: insertedLeague!.id,
    clubId: insertedClub!.id,
    seasonId: insertedSeason!.id,
    playerId: insertedPlayer!.id,
    countryLabelDa,
    leagueLabelDa,
    clubLabelDa,
    playerLabelDa,
  };
}

async function insertSecondClubInSameCountry(
  countryId: string,
  leagueId: string,
  clubLabelDa: string,
): Promise<{ clubId: string; seasonId: string }> {
  const { db, pool } = createDb(DATABASE_URL);

  const [insertedClub] = await db
    .insert(club)
    .values({ countryId, kind: "club" })
    .returning({ id: club.id });

  const [insertedSeason] = await db
    .insert(season)
    .values({
      leagueId,
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

  it("rejects shortcut write without any facet", async () => {
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

  it("filters jerseys with AND of country and club facets", async () => {
    const session = await registerSession(app, "shortcut-and@example.com");
    const fixture = await insertFullFixture();
    const secondClub = await insertSecondClubInSameCountry(
      fixture.countryId,
      fixture.leagueId,
      "Brøndby IF",
    );

    await saveJersey(app, session.accessToken, fixture.clubId, fixture.seasonId);
    await saveJersey(app, session.accessToken, secondClub.clubId, secondClub.seasonId);

    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/collection/shortcuts",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        "accept-language": "da",
      },
      payload: { countryId: fixture.countryId, clubId: fixture.clubId },
    });

    expect(createResponse.statusCode).toBe(201);
    const shortcut = collectionShortcutSchema.parse(JSON.parse(createResponse.body));
    expect(shortcut.name).toBe(`${fixture.countryLabelDa} · ${fixture.clubLabelDa}`);
    expect(shortcut.matchCount).toBe(1);

    const alleResponse = await app.inject({
      method: "GET",
      url: "/v1/collection/jerseys",
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    const alleBody = collectionJerseysSchema.parse(JSON.parse(alleResponse.body));
    expect(alleBody.jerseys.length).toBe(2);

    const filteredResponse = await app.inject({
      method: "GET",
      url: `/v1/collection/jerseys?shortcutId=${shortcut.id}`,
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    const filteredBody = collectionJerseysSchema.parse(JSON.parse(filteredResponse.body));
    expect(filteredBody.jerseys.length).toBe(1);
    expect(filteredBody.jerseys[0]?.clubId).toBe(fixture.clubId);
    expect(filteredBody.jerseys.some((jersey) => jersey.clubId === secondClub.clubId)).toBe(false);
  });

  it("filters jerseys by league via Season.leagueId", async () => {
    const session = await registerSession(app, "shortcut-league@example.com");
    const fixture = await insertFullFixture();
    await saveJersey(app, session.accessToken, fixture.clubId, fixture.seasonId);

    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/collection/shortcuts",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        "accept-language": "da",
      },
      payload: { leagueId: fixture.leagueId },
    });

    const shortcut = collectionShortcutSchema.parse(JSON.parse(createResponse.body));
    expect(shortcut.matchCount).toBe(1);

    const filteredResponse = await app.inject({
      method: "GET",
      url: `/v1/collection/jerseys?shortcutId=${shortcut.id}`,
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    const filteredBody = collectionJerseysSchema.parse(JSON.parse(filteredResponse.body));
    expect(filteredBody.jerseys.length).toBe(1);
  });

  it("filters jerseys by player via PlayerClubSeason squad", async () => {
    const session = await registerSession(app, "shortcut-player@example.com");
    const fixture = await insertFullFixture();
    await saveJersey(app, session.accessToken, fixture.clubId, fixture.seasonId);

    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/collection/shortcuts",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        "accept-language": "da",
      },
      payload: { playerId: fixture.playerId },
    });

    const shortcut = collectionShortcutSchema.parse(JSON.parse(createResponse.body));
    expect(shortcut.name).toBe(fixture.playerLabelDa);
    expect(shortcut.matchCount).toBe(1);

    const filteredResponse = await app.inject({
      method: "GET",
      url: `/v1/collection/jerseys?shortcutId=${shortcut.id}`,
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    const filteredBody = collectionJerseysSchema.parse(JSON.parse(filteredResponse.body));
    expect(filteredBody.jerseys.length).toBe(1);
  });

  it("persists drag reorder via orderedIds", async () => {
    const session = await registerSession(app, "shortcut-reorder@example.com");
    const fixture = await insertFullFixture();

    const first = await app.inject({
      method: "POST",
      url: "/v1/collection/shortcuts",
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: { clubId: fixture.clubId },
    });
    const second = await app.inject({
      method: "POST",
      url: "/v1/collection/shortcuts",
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: { leagueId: fixture.leagueId },
    });

    const shortcutA = collectionShortcutSchema.parse(JSON.parse(first.body));
    const shortcutB = collectionShortcutSchema.parse(JSON.parse(second.body));

    const reorderResponse = await app.inject({
      method: "PUT",
      url: "/v1/collection/shortcuts/reorder",
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: { orderedIds: [shortcutB.id, shortcutA.id] },
    });

    expect(reorderResponse.statusCode).toBe(200);
    const listBody = collectionShortcutsSchema.parse(JSON.parse(reorderResponse.body));
    expect(listBody.shortcuts.map((row) => row.id)).toEqual([shortcutB.id, shortcutA.id]);
    expect(listBody.shortcuts[0]?.sortOrder).toBe(0);
    expect(listBody.shortcuts[1]?.sortOrder).toBe(1);
  });

  it("isolates shortcuts to owner on edit and delete", async () => {
    const owner = await registerSession(app, "shortcut-owner@example.com");
    const other = await registerSession(app, "shortcut-other@example.com");
    const fixture = await insertFullFixture();

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

describe("Catalog facet picker /v1", () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.JWT_SECRET = "test-jwt-secret";
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

  it("returns country, league, and player picker rows without KitPhoto URLs", async () => {
    const fixture = await insertFullFixture();
    const session = await registerSession(app, "facet-picker@example.com");

    for (const [path, label] of [
      ["/v1/catalog/countries/search?q=danmark", fixture.countryLabelDa],
      ["/v1/catalog/leagues/search?q=superliga", fixture.leagueLabelDa],
      ["/v1/catalog/players/search?q=wind", fixture.playerLabelDa],
    ] as const) {
      const response = await app.inject({
        method: "GET",
        url: path,
        headers: { authorization: `Bearer ${session.accessToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = catalogFacetSearchResponseSchema.parse(JSON.parse(response.body));
      expect(body.items.some((row) => row.label === label)).toBe(true);
      expect(JSON.stringify(body)).not.toMatch(/kit_photo|object_key|http/i);
    }
  });
});
