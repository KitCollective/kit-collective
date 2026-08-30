import "reflect-metadata";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectionSaveResponseSchema,
  identitySessionSchema,
  wishlistEntriesSchema,
  wishlistEntrySchema,
} from "@kit/api-contract";
import {
  catalogLabel,
  club,
  country,
  createDb,
  entitlement,
  kit,
  league,
  resetDatabase,
  season,
  teamSeason,
  userJersey,
} from "@kit/db";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { eq } from "drizzle-orm";
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

async function startTrial(app: NestFastifyApplication, accessToken: string) {
  const response = await app.inject({
    method: "POST",
    url: "/v1/billing/trial",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "accept-language": "da",
    },
  });
  expect(response.statusCode).toBe(200);
}

type Fixture = {
  clubId: string;
  seasonId: string;
  clubLabelDa: string;
  seasonLabel: string;
  catalogKitId: string;
};

async function insertFixture(): Promise<Fixture> {
  const { db, pool } = createDb(DATABASE_URL);

  const [insertedCountry] = await db
    .insert(country)
    .values({ iso3166: "DK" })
    .returning({ id: country.id });
  if (!insertedCountry) {
    throw new Error("country insert failed");
  }

  const [insertedLeague] = await db
    .insert(league)
    .values({ countryId: insertedCountry.id })
    .returning({ id: league.id });
  if (!insertedLeague) {
    throw new Error("league insert failed");
  }

  const [insertedClub] = await db
    .insert(club)
    .values({ countryId: insertedCountry.id, kind: "club" })
    .returning({ id: club.id });
  if (!insertedClub) {
    throw new Error("club insert failed");
  }

  const seasonLabel = "2023/24";
  const [insertedSeason] = await db
    .insert(season)
    .values({
      leagueId: insertedLeague.id,
      label: seasonLabel,
      startsOn: "2023-07-01",
      endsOn: "2024-06-30",
      calendarKind: "split_year",
    })
    .returning({ id: season.id });
  if (!insertedSeason) {
    throw new Error("season insert failed");
  }

  await db.insert(teamSeason).values({
    clubId: insertedClub.id,
    seasonId: insertedSeason.id,
  });

  const [insertedKit] = await db
    .insert(kit)
    .values({
      clubId: insertedClub.id,
      seasonId: insertedSeason.id,
      type: "home",
    })
    .returning({ id: kit.id });
  if (!insertedKit) {
    throw new Error("kit insert failed");
  }

  const clubLabelDa = "F.C. København";
  await db.insert(catalogLabel).values([
    {
      entityType: "country",
      entityId: insertedCountry.id,
      locale: "da",
      kind: "label",
      text: "Danmark",
      source: "seed",
    },
    {
      entityType: "league",
      entityId: insertedLeague.id,
      locale: "da",
      kind: "label",
      text: "Superligaen",
      source: "seed",
    },
    {
      entityType: "club",
      entityId: insertedClub.id,
      locale: "da",
      kind: "label",
      text: clubLabelDa,
      source: "seed",
    },
  ]);

  await pool.end();

  return {
    clubId: insertedClub.id,
    seasonId: insertedSeason.id,
    clubLabelDa,
    seasonLabel,
    catalogKitId: insertedKit.id,
  };
}

async function saveJersey(
  app: NestFastifyApplication,
  accessToken: string,
  fixture: Fixture,
  options: { catalogKitId?: string | null } = {},
) {
  const response = await app.inject({
    method: "POST",
    url: "/v1/collection/jerseys/save",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "accept-language": "da",
    },
    payload: {
      clubId: fixture.clubId,
      seasonId: fixture.seasonId,
      type: "home",
      size: "m",
      condition: "used",
      catalogKitId: options.catalogKitId,
      photos: [{ role: "front", source: "gallery", contentBase64: JPEG_BASE64 }],
    },
  });

  expect(response.statusCode).toBe(201);
  return collectionSaveResponseSchema.parse(JSON.parse(response.body)).jersey;
}

describe("Wishlist Match /v1", () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.JWT_SECRET = "test-jwt-secret";
    delete process.env.R2_ENDPOINT;
    delete process.env.REDIS_URL;
    await prepareDatabase();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication(new FastifyAdapter());
    app.setGlobalPrefix("v1");
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
    const { pool } = createDb(DATABASE_URL);
    await pool.end();
  });

  it("returns matchedJerseyId when a peer bidding-enabled jersey matches AND facets", async () => {
    const fixture = await insertFixture();
    const watcher = await registerSession(app, "match-watcher@example.com");
    const peer = await registerSession(app, "match-peer@example.com");
    await startTrial(app, watcher.accessToken);

    await app.inject({
      method: "POST",
      url: "/v1/wishlist/entries",
      headers: { authorization: `Bearer ${watcher.accessToken}` },
      payload: {
        clubId: fixture.clubId,
        seasonId: fixture.seasonId,
        type: "home",
        size: "m",
      },
    });

    const peerJersey = await saveJersey(app, peer.accessToken, fixture);
    const enableResponse = await app.inject({
      method: "PATCH",
      url: `/v1/collection/jerseys/${peerJersey.id}/bidding`,
      headers: { authorization: `Bearer ${peer.accessToken}` },
      payload: { biddingEnabled: true },
    });
    expect(enableResponse.statusCode).toBe(200);

    const listResponse = await app.inject({
      method: "GET",
      url: "/v1/wishlist/entries",
      headers: { authorization: `Bearer ${watcher.accessToken}` },
    });

    const listed = wishlistEntriesSchema.parse(JSON.parse(listResponse.body));
    expect(listed.entries[0]?.matchedJerseyId).toBe(peerJersey.id);
  });

  it("never matches the owner's own Save", async () => {
    const fixture = await insertFixture();
    const owner = await registerSession(app, "match-own-save@example.com");
    await startTrial(app, owner.accessToken);

    await app.inject({
      method: "POST",
      url: "/v1/wishlist/entries",
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { clubId: fixture.clubId, type: "home" },
    });

    const ownJersey = await saveJersey(app, owner.accessToken, fixture);
    await app.inject({
      method: "PATCH",
      url: `/v1/collection/jerseys/${ownJersey.id}/bidding`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { biddingEnabled: true },
    });

    const listResponse = await app.inject({
      method: "GET",
      url: "/v1/wishlist/entries",
      headers: { authorization: `Bearer ${owner.accessToken}` },
    });

    const listed = wishlistEntriesSchema.parse(JSON.parse(listResponse.body));
    expect(listed.entries[0]?.matchedJerseyId).toBeNull();
  });

  it("excludes closed copies (bidding disabled)", async () => {
    const fixture = await insertFixture();
    const watcher = await registerSession(app, "match-closed@example.com");
    const peer = await registerSession(app, "match-closed-peer@example.com");
    await startTrial(app, watcher.accessToken);

    await app.inject({
      method: "POST",
      url: "/v1/wishlist/entries",
      headers: { authorization: `Bearer ${watcher.accessToken}` },
      payload: { clubId: fixture.clubId, type: "home" },
    });

    await saveJersey(app, peer.accessToken, fixture);

    const listResponse = await app.inject({
      method: "GET",
      url: "/v1/wishlist/entries",
      headers: { authorization: `Bearer ${watcher.accessToken}` },
    });

    const listed = wishlistEntriesSchema.parse(JSON.parse(listResponse.body));
    expect(listed.entries[0]?.matchedJerseyId).toBeNull();
  });

  it("excludes seed Kits linked on UserJersey", async () => {
    const fixture = await insertFixture();
    const watcher = await registerSession(app, "match-seed-kit@example.com");
    const peer = await registerSession(app, "match-seed-kit-peer@example.com");
    await startTrial(app, watcher.accessToken);

    await app.inject({
      method: "POST",
      url: "/v1/wishlist/entries",
      headers: { authorization: `Bearer ${watcher.accessToken}` },
      payload: { clubId: fixture.clubId, type: "home" },
    });

    const peerJersey = await saveJersey(app, peer.accessToken, fixture, {
      catalogKitId: fixture.catalogKitId,
    });
    await app.inject({
      method: "PATCH",
      url: `/v1/collection/jerseys/${peerJersey.id}/bidding`,
      headers: { authorization: `Bearer ${peer.accessToken}` },
      payload: { biddingEnabled: true },
    });

    const listResponse = await app.inject({
      method: "GET",
      url: "/v1/wishlist/entries",
      headers: { authorization: `Bearer ${watcher.accessToken}` },
    });

    const listed = wishlistEntriesSchema.parse(JSON.parse(listResponse.body));
    expect(listed.entries[0]?.matchedJerseyId).toBeNull();
  });

  it("hides match hits after entitlement lapse while rows remain", async () => {
    const fixture = await insertFixture();
    const watcher = await registerSession(app, "match-lapse@example.com");
    const peer = await registerSession(app, "match-lapse-peer@example.com");
    await startTrial(app, watcher.accessToken);

    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/wishlist/entries",
      headers: { authorization: `Bearer ${watcher.accessToken}` },
      payload: { clubId: fixture.clubId, type: "home" },
    });
    const created = wishlistEntrySchema.parse(JSON.parse(createResponse.body));

    const peerJersey = await saveJersey(app, peer.accessToken, fixture);
    await app.inject({
      method: "PATCH",
      url: `/v1/collection/jerseys/${peerJersey.id}/bidding`,
      headers: { authorization: `Bearer ${peer.accessToken}` },
      payload: { biddingEnabled: true },
    });

    const { db, pool } = createDb(DATABASE_URL);
    await db.delete(entitlement).where(eq(entitlement.userId, watcher.user.id));
    await pool.end();

    const listResponse = await app.inject({
      method: "GET",
      url: "/v1/wishlist/entries",
      headers: { authorization: `Bearer ${watcher.accessToken}` },
    });

    const listed = wishlistEntriesSchema.parse(JSON.parse(listResponse.body));
    expect(listed.entries).toHaveLength(1);
    expect(listed.entries[0]?.id).toBe(created.id);
    expect(listed.entries[0]?.matchedJerseyId).toBeNull();
  });

  it("does not expose another collector's wishlist hits", async () => {
    const fixture = await insertFixture();
    const owner = await registerSession(app, "match-owner@example.com");
    const stranger = await registerSession(app, "match-stranger@example.com");
    await startTrial(app, owner.accessToken);

    await app.inject({
      method: "POST",
      url: "/v1/wishlist/entries",
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { clubId: fixture.clubId, type: "home" },
    });

    const strangerList = await app.inject({
      method: "GET",
      url: "/v1/wishlist/entries",
      headers: { authorization: `Bearer ${stranger.accessToken}` },
    });

    expect(strangerList.statusCode).toBe(200);
    expect(wishlistEntriesSchema.parse(JSON.parse(strangerList.body)).entries).toHaveLength(0);
  });

  it("enqueues match processing on Collection Save without blocking the response", async () => {
    const fixture = await insertFixture();
    const saver = await registerSession(app, "match-save-enqueue@example.com");
    const started = Date.now();

    const response = await app.inject({
      method: "POST",
      url: "/v1/collection/jerseys/save",
      headers: { authorization: `Bearer ${saver.accessToken}` },
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
    expect(Date.now() - started).toBeLessThan(5_000);

    const { db, pool } = createDb(DATABASE_URL);
    const [row] = await db
      .select({ id: userJersey.id })
      .from(userJersey)
      .where(eq(userJersey.userId, saver.user.id))
      .limit(1);
    await pool.end();

    expect(row?.id).toBeDefined();
  });
});
