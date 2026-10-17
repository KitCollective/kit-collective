import "reflect-metadata";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  type CollectionJersey,
  collectionConversationsSchema,
  collectionDiscoverCatalogDrillSchema,
  collectionDiscoverHomeSchema,
  collectionDiscoverJerseysSchema,
  collectionDiscoverTypeaheadSchema,
  collectionFavoritesSchema,
  collectionJerseysSchema,
  collectionJerseyUpdateResponseSchema,
  collectionPeerJerseySchema,
  collectionPeerJerseysSchema,
  collectionSaveResponseSchema,
  collectionSendBidResponseSchema,
  identityPeerProfileSchema,
  identitySessionSchema,
} from "@kit/api-contract";
import {
  catalogLabel,
  club,
  country,
  createDb,
  jerseyDraft,
  kit,
  league,
  nationalTeam,
  nationalTeamSeason,
  patch,
  player,
  playerClubSeason,
  resetDatabase,
  season,
  teamSeason,
  userJersey,
  userJerseyFavorite,
  userJerseyPatch,
  userJerseyPhoto,
  visionLog,
} from "@kit/db";
import {
  type JerseySize,
  lightboxObjectKey,
  MAX_ORIGINAL_PHOTO_BYTES_UNIVERSAL,
  originalObjectKey,
  photoObjectKeysForDeletion,
  photoPrefixFromStoredObjectKey,
  stripObjectKey,
  variantObjectKey,
} from "@kit/domain";
import { Logger } from "@nestjs/common";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { and, count, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AppModule } from "../dist/app.module.js";
import { OBJECT_STORE } from "../dist/collection/collection.service.js";
import type { ObjectStoreAdapter } from "../dist/collection/object-store.js";
import { createR2ObjectStore } from "../dist/collection/r2-object-store.js";
import { FailingVisionAdapter, SlowVisionAdapter } from "../dist/vision/test-vision.adapters.js";
import { VISION_ADAPTER } from "../dist/vision/vision.adapter.js";
import { clearAuthThrottleHits } from "./helpers/auth-throttle.js";

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

async function insertNationalTeamSeasonFixture() {
  const { db, pool } = createDb(DATABASE_URL);

  const [insertedCountry] = await db
    .insert(country)
    .values({ iso3166: "IS" })
    .returning({ id: country.id });

  const [insertedNationalTeam] = await db
    .insert(nationalTeam)
    .values({ countryId: insertedCountry!.id, gender: "men" })
    .returning({ id: nationalTeam.id });

  const [insertedSeason] = await db
    .insert(season)
    .values({
      label: "2024",
      startsOn: "2024-01-01",
      endsOn: "2024-12-31",
      calendarKind: "calendar",
    })
    .returning({ id: season.id });

  await db.insert(nationalTeamSeason).values({
    nationalTeamId: insertedNationalTeam!.id,
    seasonId: insertedSeason!.id,
  });

  await db.insert(catalogLabel).values([
    {
      entityType: "country",
      entityId: insertedCountry!.id,
      locale: "da",
      kind: "label",
      text: "Island",
      source: "seed",
    },
    {
      entityType: "national_team",
      entityId: insertedNationalTeam!.id,
      locale: "da",
      kind: "label",
      text: "Danmark",
      source: "seed",
    },
  ]);

  await pool.end();

  return {
    nationalTeamId: insertedNationalTeam!.id,
    seasonId: insertedSeason!.id,
  };
}

async function saveJerseyForUser(
  app: NestFastifyApplication,
  session: Awaited<ReturnType<typeof registerSession>>,
  fixture: Awaited<ReturnType<typeof insertClubSeasonFixture>>,
  options: { catalogKitId?: string | null; size?: JerseySize } = {},
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
      size: options.size ?? "m",
      condition: "used",
      ...(options.catalogKitId !== undefined ? { catalogKitId: options.catalogKitId } : {}),
      photos: [{ role: "front", source: "gallery", contentBase64: JPEG_BASE64 }],
    },
  });

  expect(response.statusCode).toBe(201);
  return collectionSaveResponseSchema.parse(JSON.parse(response.body)).jersey;
}

async function saveNationalTeamJerseyForUser(
  app: NestFastifyApplication,
  session: Awaited<ReturnType<typeof registerSession>>,
  fixture: Awaited<ReturnType<typeof insertNationalTeamSeasonFixture>>,
) {
  const response = await app.inject({
    method: "POST",
    url: "/v1/collection/jerseys/save",
    headers: {
      authorization: `Bearer ${session.accessToken}`,
      "accept-language": "da",
    },
    payload: {
      nationalTeamId: fixture.nationalTeamId,
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

type Session = Awaited<ReturnType<typeof registerSession>>;

async function patchJerseyPrivate(
  app: NestFastifyApplication,
  session: Session,
  jerseyId: string,
  value: boolean,
) {
  return app.inject({
    method: "PATCH",
    url: `/v1/collection/jerseys/${jerseyId}/private`,
    headers: { authorization: `Bearer ${session.accessToken}` },
    payload: { private: value },
  });
}

async function patchJerseyBidding(
  app: NestFastifyApplication,
  session: Session,
  jerseyId: string,
  value: boolean,
) {
  return app.inject({
    method: "PATCH",
    url: `/v1/collection/jerseys/${jerseyId}/bidding`,
    headers: { authorization: `Bearer ${session.accessToken}` },
    payload: { biddingEnabled: value },
  });
}

async function waitForDerivativeObjects(
  objectStore: ObjectStoreAdapter,
  storedObjectKey: string,
): Promise<void> {
  const prefix = photoPrefixFromStoredObjectKey(storedObjectKey);
  if (!prefix) {
    throw new Error("invalid photo object key");
  }
  const stripKey = stripObjectKey(prefix);
  const lightboxKey = lightboxObjectKey(prefix);
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const [stripExists, lightboxExists] = await Promise.all([
      objectStore.objectExists(stripKey),
      objectStore.objectExists(lightboxKey),
    ]);
    if (stripExists && lightboxExists) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for derivative objects");
}

async function waitForPhotoVariants(
  app: NestFastifyApplication,
  session: Session,
  photoId: string,
  storedObjectKey: string,
): Promise<void> {
  const objectStore = app.get<ObjectStoreAdapter>(OBJECT_STORE);
  await waitForDerivativeObjects(objectStore, storedObjectKey);

  const stripResponse = await app.inject({
    method: "GET",
    url: `/v1/collection/photos/${photoId}?variant=strip`,
    headers: { authorization: `Bearer ${session.accessToken}` },
  });
  const lightboxResponse = await app.inject({
    method: "GET",
    url: `/v1/collection/photos/${photoId}?variant=lightbox`,
    headers: { authorization: `Bearer ${session.accessToken}` },
  });
  if (stripResponse.statusCode !== 200 || lightboxResponse.statusCode !== 200) {
    throw new Error("strip/lightbox variants not served after derivatives exist");
  }
}

async function findOwnJersey(
  app: NestFastifyApplication,
  session: Session,
  jerseyId: string,
): Promise<CollectionJersey | undefined> {
  const response = await app.inject({
    method: "GET",
    url: "/v1/collection/jerseys",
    headers: { authorization: `Bearer ${session.accessToken}`, "accept-language": "da" },
  });
  expect(response.statusCode).toBe(200);
  const body = collectionJerseysSchema.parse(JSON.parse(response.body));
  return body.jerseys.find((item) => item.id === jerseyId);
}

async function getPeerJerseyRaw(app: NestFastifyApplication, session: Session, jerseyId: string) {
  return app.inject({
    method: "GET",
    url: `/v1/collection/jerseys/${jerseyId}/peer`,
    headers: { authorization: `Bearer ${session.accessToken}`, "accept-language": "da" },
  });
}

async function discoverJerseyIds(app: NestFastifyApplication, session: Session): Promise<string[]> {
  const response = await app.inject({
    method: "GET",
    url: "/v1/collection/discover/jerseys",
    headers: { authorization: `Bearer ${session.accessToken}`, "accept-language": "da" },
  });
  expect(response.statusCode).toBe(200);
  const body = collectionDiscoverJerseysSchema.parse(JSON.parse(response.body));
  return body.jerseys.map((jersey) => jersey.id);
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

  beforeEach(async () => {
    await clearAuthThrottleHits();
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

  it("saves a national-team UserJersey with nationalTeamId", async () => {
    const session = await registerSession(app, "save-nt@example.com");
    const fixture = await insertNationalTeamSeasonFixture();

    const response = await app.inject({
      method: "POST",
      url: "/v1/collection/jerseys/save",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        "accept-language": "da",
      },
      payload: {
        nationalTeamId: fixture.nationalTeamId,
        seasonId: fixture.seasonId,
        type: "home",
        size: "m",
        condition: "used",
        photos: [{ role: "front", source: "gallery", contentBase64: JPEG_BASE64 }],
      },
    });

    expect(response.statusCode).toBe(201);
    const body = collectionSaveResponseSchema.parse(JSON.parse(response.body));
    expect(body.jersey.clubId).toBeNull();
    expect(body.jersey.nationalTeamId).toBe(fixture.nationalTeamId);
    expect(body.jersey.nationalTeamLabel).toBe("Danmark");
    expect(body.jersey.clubLabel).toBeNull();

    const listResponse = await app.inject({
      method: "GET",
      url: "/v1/collection/jerseys",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        "accept-language": "da",
      },
    });
    expect(listResponse.statusCode).toBe(200);
    const listed = collectionJerseysSchema.parse(JSON.parse(listResponse.body));
    const saved = listed.jerseys.find((jersey) => jersey.id === body.jersey.id);
    expect(saved?.nationalTeamId).toBe(fixture.nationalTeamId);
    expect(saved?.clubId).toBeNull();
  });

  it("rejects a national-team UUID in clubId", async () => {
    const session = await registerSession(app, "save-nt-as-club@example.com");
    const fixture = await insertNationalTeamSeasonFixture();

    const response = await app.inject({
      method: "POST",
      url: "/v1/collection/jerseys/save",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        "accept-language": "da",
      },
      payload: {
        clubId: fixture.nationalTeamId,
        seasonId: fixture.seasonId,
        type: "home",
        size: "m",
        condition: "used",
        photos: [{ role: "front", source: "gallery", contentBase64: JPEG_BASE64 }],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.body).toMatch(/clubId is not a catalog club/);
  });

  it("rejects duplicate universal photo roles on save", async () => {
    const session = await registerSession(app, "photo-roles-dup@example.com");
    const fixture = await insertClubSeasonFixture();

    const duplicateResponse = await app.inject({
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
        photos: [
          { role: "front", source: "gallery", contentBase64: JPEG_BASE64 },
          { role: "front", source: "gallery", contentBase64: JPEG_BASE64 },
        ],
      },
    });

    expect(duplicateResponse.statusCode).toBe(400);
  });

  it("persists other photo role with optional label on save", async () => {
    const session = await registerSession(app, "photo-roles-other@example.com");
    const fixture = await insertClubSeasonFixture();

    const saveResponse = await app.inject({
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
        photos: [
          { role: "front", source: "gallery", contentBase64: JPEG_BASE64 },
          { role: "other", source: "gallery", contentBase64: JPEG_BASE64, label: "Vaskemærke" },
        ],
      },
    });

    expect(saveResponse.statusCode).toBe(201);
    const body = collectionSaveResponseSchema.parse(JSON.parse(saveResponse.body));
    const otherPhoto = body.jersey.photos.find((photo) => photo.role === "other");
    expect(otherPhoto?.label).toBe("Vaskemærke");
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

  it("returns 2xx Save while Vision adapter is slow", async () => {
    const slowAdapter = new SlowVisionAdapter(3000);
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(VISION_ADAPTER)
      .useValue(slowAdapter)
      .compile();

    const slowApp = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    slowApp.setGlobalPrefix("v1");
    await slowApp.init();
    await slowApp.getHttpAdapter().getInstance().ready();

    const session = await registerSession(slowApp, "slow-vision@example.com");
    const fixture = await insertClubSeasonFixture();

    const response = await slowApp.inject({
      method: "POST",
      url: "/v1/collection/jerseys/save",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
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
    await slowApp.close();
  });

  it("returns 2xx Save when Vision adapter fails", async () => {
    const failingAdapter = new FailingVisionAdapter();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(VISION_ADAPTER)
      .useValue(failingAdapter)
      .compile();

    const failApp = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    failApp.setGlobalPrefix("v1");
    await failApp.init();
    await failApp.getHttpAdapter().getInstance().ready();

    const session = await registerSession(failApp, "fail-vision@example.com");
    const fixture = await insertClubSeasonFixture();

    const response = await failApp.inject({
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

    expect(response.statusCode).toBe(201);
    await failApp.close();
  });

  it("sets VisionLog userAction when Save enqueues vision without client visionJobId (ratchet KIT-27)", async () => {
    const session = await registerSession(app, "vision-reconcile@example.com");
    const fixture = await insertClubSeasonFixture();

    const response = await app.inject({
      method: "POST",
      url: "/v1/collection/jerseys/save",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
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
    const body = collectionSaveResponseSchema.parse(JSON.parse(response.body));
    expect(body.visionJobId).toBeDefined();
    const visionJobId = body.visionJobId;
    if (!visionJobId) {
      throw new Error("expected visionJobId in Save response");
    }

    const { db, pool } = createDb(DATABASE_URL);
    const [row] = await db
      .select({ userAction: visionLog.userAction })
      .from(visionLog)
      .where(eq(visionLog.id, visionJobId))
      .limit(1);
    await pool.end();

    expect(row?.userAction).toBe("ignored");
  });

  it("rejects unauthenticated inbox and bid calls with 401", async () => {
    const fixture = await insertClubSeasonFixture();

    const conversations = await app.inject({
      method: "GET",
      url: "/v1/collection/conversations",
    });
    const discover = await app.inject({
      method: "GET",
      url: "/v1/collection/discover/jerseys",
    });
    const bid = await app.inject({
      method: "POST",
      url: "/v1/collection/jerseys/00000000-0000-0000-0000-000000000099/bids",
      payload: { amountDkk: 100 },
    });
    const peer = await app.inject({
      method: "GET",
      url: "/v1/collection/jerseys/00000000-0000-0000-0000-000000000099/peer",
    });

    expect(conversations.statusCode).toBe(401);
    expect(discover.statusCode).toBe(401);
    expect(bid.statusCode).toBe(401);
    expect(peer.statusCode).toBe(401);
    expect(fixture.clubId).toBeDefined();
  });

  it("creates a pending bid conversation and lists unread for the owner", async () => {
    const fixture = await insertClubSeasonFixture();
    const owner = await registerSession(app, "owner-bid@example.com");
    const bidder = await registerSession(app, "bidder@example.com");
    const ownerJersey = await saveJerseyForUser(app, owner, fixture);

    const enableResponse = await app.inject({
      method: "PATCH",
      url: `/v1/collection/jerseys/${ownerJersey.id}/bidding`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { biddingEnabled: true },
    });
    expect(enableResponse.statusCode).toBe(200);

    const discoverResponse = await app.inject({
      method: "GET",
      url: "/v1/collection/discover/jerseys?q=københavn",
      headers: {
        authorization: `Bearer ${bidder.accessToken}`,
        "accept-language": "da",
      },
    });
    expect(discoverResponse.statusCode).toBe(200);
    const discoverBody = collectionDiscoverJerseysSchema.parse(JSON.parse(discoverResponse.body));
    expect(discoverBody.jerseys.some((jersey) => jersey.id === ownerJersey.id)).toBe(true);

    const peerResponse = await app.inject({
      method: "GET",
      url: `/v1/collection/jerseys/${ownerJersey.id}/peer`,
      headers: {
        authorization: `Bearer ${bidder.accessToken}`,
        "accept-language": "da",
      },
    });
    expect(peerResponse.statusCode).toBe(200);
    const peerBody = collectionPeerJerseySchema.parse(JSON.parse(peerResponse.body));
    expect(peerBody.biddingEnabled).toBe(true);
    expect(peerBody.ownerHandle).toBeTruthy();
    expect(peerBody.ownerId).toBeTruthy();
    expect(peerBody.photos.length).toBeGreaterThan(0);

    const bidResponse = await app.inject({
      method: "POST",
      url: `/v1/collection/jerseys/${ownerJersey.id}/bids`,
      headers: { authorization: `Bearer ${bidder.accessToken}` },
      payload: { amountDkk: 350 },
    });
    expect(bidResponse.statusCode).toBe(201);
    collectionSendBidResponseSchema.parse(JSON.parse(bidResponse.body));

    const inboxResponse = await app.inject({
      method: "GET",
      url: "/v1/collection/conversations",
      headers: { authorization: `Bearer ${owner.accessToken}` },
    });
    expect(inboxResponse.statusCode).toBe(200);
    const inboxBody = collectionConversationsSchema.parse(JSON.parse(inboxResponse.body));
    expect(inboxBody.unreadCount).toBe(1);
    expect(inboxBody.conversations.length).toBe(1);
    expect(inboxBody.conversations[0]?.unread).toBe(true);
    expect(inboxBody.conversations[0]?.snippet).toContain("350");
  });

  it("shows the latest Bud amount of each UserJersey when one Conversation holds Buds on several", async () => {
    const fixture = await insertClubSeasonFixture();
    const owner = await registerSession(app, "owner-latest-bid@example.com");
    const bidder = await registerSession(app, "bidder-latest-bid@example.com");
    const firstJersey = await saveJerseyForUser(app, owner, fixture);
    const secondJersey = await saveJerseyForUser(app, owner, fixture);
    const untouchedJersey = await saveJerseyForUser(app, owner, fixture);

    const conversationIds: string[] = [];
    for (const [jersey, amountDkk] of [
      [firstJersey, 350],
      [secondJersey, 500],
    ] as const) {
      await patchJerseyBidding(app, owner, jersey.id, true);
      const bidResponse = await app.inject({
        method: "POST",
        url: `/v1/collection/jerseys/${jersey.id}/bids`,
        headers: { authorization: `Bearer ${bidder.accessToken}` },
        payload: { amountDkk },
      });
      expect(bidResponse.statusCode).toBe(201);
      conversationIds.push(
        collectionSendBidResponseSchema.parse(JSON.parse(bidResponse.body)).conversationId,
      );
    }
    expect(conversationIds[1]).toBe(conversationIds[0]);

    const latestBidOf = async (jerseyId: string) => {
      const response = await getPeerJerseyRaw(app, bidder, jerseyId);
      expect(response.statusCode).toBe(200);
      return collectionPeerJerseySchema.parse(JSON.parse(response.body)).latestBidAmountDkk;
    };
    expect(await latestBidOf(firstJersey.id)).toBe(350);
    expect(await latestBidOf(secondJersey.id)).toBe(500);
    expect(await latestBidOf(untouchedJersey.id)).toBeNull();
  });

  it("counts unanswered pending bids per jersey on GET /collection/jerseys", async () => {
    const fixture = await insertClubSeasonFixture();
    const owner = await registerSession(app, "unanswered-owner@example.com");
    const bidderA = await registerSession(app, "unanswered-bidder-a@example.com");
    const bidderB = await registerSession(app, "unanswered-bidder-b@example.com");
    const bidderC = await registerSession(app, "unanswered-bidder-c@example.com");
    const biddedJersey = await saveJerseyForUser(app, owner, fixture);
    const quietJersey = await saveJerseyForUser(app, owner, fixture);
    await patchJerseyBidding(app, owner, biddedJersey.id, true);

    const listOwnerJerseys = async () => {
      const response = await app.inject({
        method: "GET",
        url: "/v1/collection/jerseys",
        headers: { authorization: `Bearer ${owner.accessToken}`, "accept-language": "da" },
      });
      expect(response.statusCode).toBe(200);
      const jerseys = collectionJerseysSchema.parse(JSON.parse(response.body)).jerseys;
      return new Map(jerseys.map((jersey) => [jersey.id, jersey.unansweredBidCount]));
    };

    const sendBid = async (bidder: Session, amountDkk: number) => {
      const response = await app.inject({
        method: "POST",
        url: `/v1/collection/jerseys/${biddedJersey.id}/bids`,
        headers: { authorization: `Bearer ${bidder.accessToken}` },
        payload: { amountDkk },
      });
      expect(response.statusCode).toBe(201);
      return collectionSendBidResponseSchema.parse(JSON.parse(response.body));
    };

    const noBids = await listOwnerJerseys();
    expect(noBids.get(biddedJersey.id)).toBe(0);
    expect(noBids.get(quietJersey.id)).toBe(0);

    const bidA = await sendBid(bidderA, 300);
    const afterOne = await listOwnerJerseys();
    expect(afterOne.get(biddedJersey.id)).toBe(1);
    expect(afterOne.get(quietJersey.id)).toBe(0);

    await sendBid(bidderB, 350);
    const afterTwo = await listOwnerJerseys();
    expect(afterTwo.get(biddedJersey.id)).toBe(2);
    expect(afterTwo.get(quietJersey.id)).toBe(0);

    const declineResponse = await app.inject({
      method: "PATCH",
      url: `/v1/collection/conversations/${bidA.conversationId}/messages/${bidA.messageId}/bid`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { decision: "decline" },
    });
    expect(declineResponse.statusCode).toBe(200);
    const afterDecline = await listOwnerJerseys();
    expect(afterDecline.get(biddedJersey.id)).toBe(1);

    await sendBid(bidderC, 400);
    expect((await listOwnerJerseys()).get(biddedJersey.id)).toBe(2);

    const blockResponse = await app.inject({
      method: "POST",
      url: `/v1/moderation/peers/${bidderC.user.id}/block`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
    });
    expect(blockResponse.statusCode).toBe(201);
    const afterBlock = await listOwnerJerseys();
    expect(afterBlock.get(biddedJersey.id)).toBe(1);
    expect(afterBlock.get(quietJersey.id)).toBe(0);
  });

  it("rejects bidding on own UserJersey and when bidding is disabled", async () => {
    const fixture = await insertClubSeasonFixture();
    const owner = await registerSession(app, "owner-self@example.com");
    const ownerJersey = await saveJerseyForUser(app, owner, fixture);

    const ownBid = await app.inject({
      method: "POST",
      url: `/v1/collection/jerseys/${ownerJersey.id}/bids`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { amountDkk: 200 },
    });
    expect(ownBid.statusCode).toBe(403);

    await app.inject({
      method: "PATCH",
      url: `/v1/collection/jerseys/${ownerJersey.id}/bidding`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { biddingEnabled: true },
    });

    const bidder = await registerSession(app, "bidder-disabled@example.com");
    await app.inject({
      method: "PATCH",
      url: `/v1/collection/jerseys/${ownerJersey.id}/bidding`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { biddingEnabled: false },
    });

    const disabledBid = await app.inject({
      method: "POST",
      url: `/v1/collection/jerseys/${ownerJersey.id}/bids`,
      headers: { authorization: `Bearer ${bidder.accessToken}` },
      payload: { amountDkk: 200 },
    });
    expect(disabledBid.statusCode).toBe(400);
  });

  it("excludes own jerseys from discover results", async () => {
    const fixture = await insertClubSeasonFixture();
    const owner = await registerSession(app, "owner-discover@example.com");
    const ownerJersey = await saveJerseyForUser(app, owner, fixture);

    await app.inject({
      method: "PATCH",
      url: `/v1/collection/jerseys/${ownerJersey.id}/bidding`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { biddingEnabled: true },
    });

    const discoverResponse = await app.inject({
      method: "GET",
      url: "/v1/collection/discover/jerseys",
      headers: {
        authorization: `Bearer ${owner.accessToken}`,
        "accept-language": "da",
      },
    });

    const discoverBody = collectionDiscoverJerseysSchema.parse(JSON.parse(discoverResponse.body));
    expect(discoverBody.jerseys.some((jersey) => jersey.id === ownerJersey.id)).toBe(false);
  });

  it("rejects unauthenticated favorites calls with 401", async () => {
    const list = await app.inject({
      method: "GET",
      url: "/v1/collection/favorites",
    });
    const add = await app.inject({
      method: "POST",
      url: "/v1/collection/favorites",
      payload: { userJerseyId: "00000000-0000-0000-0000-000000000099" },
    });
    const remove = await app.inject({
      method: "DELETE",
      url: "/v1/collection/favorites/00000000-0000-0000-0000-000000000099",
    });

    expect(list.statusCode).toBe(401);
    expect(add.statusCode).toBe(401);
    expect(remove.statusCode).toBe(401);
  });

  it("adds, lists, and removes another collector's UserJersey as a favorite", async () => {
    const fixture = await insertClubSeasonFixture();
    const owner = await registerSession(app, "owner-fav@example.com");
    const collector = await registerSession(app, "collector-fav@example.com");
    const ownerJersey = await saveJerseyForUser(app, owner, fixture);

    const ownFavorite = await app.inject({
      method: "POST",
      url: "/v1/collection/favorites",
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { userJerseyId: ownerJersey.id },
    });
    expect(ownFavorite.statusCode).toBe(403);

    const addResponse = await app.inject({
      method: "POST",
      url: "/v1/collection/favorites",
      headers: { authorization: `Bearer ${collector.accessToken}` },
      payload: { userJerseyId: ownerJersey.id },
    });
    expect(addResponse.statusCode).toBe(201);

    const listResponse = await app.inject({
      method: "GET",
      url: "/v1/collection/favorites",
      headers: {
        authorization: `Bearer ${collector.accessToken}`,
        "accept-language": "da",
      },
    });
    expect(listResponse.statusCode).toBe(200);
    const listBody = collectionFavoritesSchema.parse(JSON.parse(listResponse.body));
    expect(listBody.favorites).toHaveLength(1);
    expect(listBody.favorites[0]?.userJerseyId).toBe(ownerJersey.id);
    expect(listBody.favorites[0]?.clubLabel).toBe("F.C. København");
    expect(listBody.favorites[0]).not.toHaveProperty("ownerHandle");
    expect(listBody.favorites[0]?.photoUrl).toContain("/v1/collection/photos/");

    const photoResponse = await app.inject({
      method: "GET",
      url: listBody.favorites[0]!.photoUrl,
      headers: { authorization: `Bearer ${collector.accessToken}` },
    });
    expect(photoResponse.statusCode).toBe(200);
    expect(photoResponse.headers["content-type"]).toMatch(/image\//);

    const disableBidding = await app.inject({
      method: "PATCH",
      url: `/v1/collection/jerseys/${ownerJersey.id}/bidding`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { biddingEnabled: false },
    });
    expect(disableBidding.statusCode).toBe(200);

    const photoAfterBiddingOff = await app.inject({
      method: "GET",
      url: listBody.favorites[0]!.photoUrl,
      headers: { authorization: `Bearer ${collector.accessToken}` },
    });
    expect(photoAfterBiddingOff.statusCode).toBe(200);

    const removeResponse = await app.inject({
      method: "DELETE",
      url: `/v1/collection/favorites/${ownerJersey.id}`,
      headers: { authorization: `Bearer ${collector.accessToken}` },
    });
    expect(removeResponse.statusCode).toBe(204);

    const emptyList = await app.inject({
      method: "GET",
      url: "/v1/collection/favorites",
      headers: { authorization: `Bearer ${collector.accessToken}` },
    });
    const emptyBody = collectionFavoritesSchema.parse(JSON.parse(emptyList.body));
    expect(emptyBody.favorites).toHaveLength(0);
  });

  it("defaults private to false and is visible to a peer on discover + peer detail (owner/peer)", async () => {
    const fixture = await insertClubSeasonFixture();
    const owner = await registerSession(app, "private-default-owner@example.com");
    const peer = await registerSession(app, "private-default-peer@example.com");
    const ownerJersey = await saveJerseyForUser(app, owner, fixture);

    const enableResponse = await patchJerseyBidding(app, owner, ownerJersey.id, true);
    expect(enableResponse.statusCode).toBe(200);

    const ownListJersey = await findOwnJersey(app, owner, ownerJersey.id);
    expect(ownListJersey?.private).toBe(false);

    const discoverIds = await discoverJerseyIds(app, peer);
    expect(discoverIds).toContain(ownerJersey.id);

    const peerResponse = await getPeerJerseyRaw(app, peer, ownerJersey.id);
    expect(peerResponse.statusCode).toBe(200);
    const peerBody = collectionPeerJerseySchema.parse(JSON.parse(peerResponse.body));
    expect(peerBody.id).toBe(ownerJersey.id);
  });

  it("PATCH private true forces biddingEnabled false in the same write, reflected in owner list (owner)", async () => {
    const fixture = await insertClubSeasonFixture();
    const owner = await registerSession(app, "private-set-owner@example.com");
    const ownerJersey = await saveJerseyForUser(app, owner, fixture);

    const enableResponse = await patchJerseyBidding(app, owner, ownerJersey.id, true);
    expect(enableResponse.statusCode).toBe(200);
    expect((await findOwnJersey(app, owner, ownerJersey.id))?.biddingEnabled).toBe(true);

    const privateResponse = await patchJerseyPrivate(app, owner, ownerJersey.id, true);
    expect(privateResponse.statusCode).toBe(200);

    const jersey = await findOwnJersey(app, owner, ownerJersey.id);
    expect(jersey?.private).toBe(true);
    expect(jersey?.biddingEnabled).toBe(false);
  });

  it("while private, biddingEnabled cannot become or stay true (owner)", async () => {
    const fixture = await insertClubSeasonFixture();
    const owner = await registerSession(app, "private-bidding-owner@example.com");
    const ownerJersey = await saveJerseyForUser(app, owner, fixture);

    await patchJerseyBidding(app, owner, ownerJersey.id, true);
    expect((await findOwnJersey(app, owner, ownerJersey.id))?.biddingEnabled).toBe(true);

    const privateResponse = await patchJerseyPrivate(app, owner, ownerJersey.id, true);
    expect(privateResponse.statusCode).toBe(200);
    expect((await findOwnJersey(app, owner, ownerJersey.id))?.biddingEnabled).toBe(false);

    const biddingResponse = await patchJerseyBidding(app, owner, ownerJersey.id, true);
    expect(biddingResponse.statusCode).toBe(200);

    const jersey = await findOwnJersey(app, owner, ownerJersey.id);
    expect(jersey?.private).toBe(true);
    expect(jersey?.biddingEnabled).toBe(false);
  });

  it("foreign GET of a private jersey 404s with the same shape as a nonexistent id (peer)", async () => {
    const fixture = await insertClubSeasonFixture();
    const owner = await registerSession(app, "private-leak-owner@example.com");
    const peer = await registerSession(app, "private-leak-peer@example.com");
    const ownerJersey = await saveJerseyForUser(app, owner, fixture);

    await patchJerseyBidding(app, owner, ownerJersey.id, true);
    const privateResponse = await patchJerseyPrivate(app, owner, ownerJersey.id, true);
    expect(privateResponse.statusCode).toBe(200);

    const privatePeerResponse = await getPeerJerseyRaw(app, peer, ownerJersey.id);
    expect(privatePeerResponse.statusCode).toBe(404);

    const nonexistentResponse = await getPeerJerseyRaw(
      app,
      peer,
      "00000000-0000-0000-0000-0000000000aa",
    );
    expect(nonexistentResponse.statusCode).toBe(404);

    const privateBody = JSON.parse(privatePeerResponse.body);
    const nonexistentBody = JSON.parse(nonexistentResponse.body);
    expect(privateBody.statusCode).toBe(nonexistentBody.statusCode);
    expect(privateBody.message).toBe(nonexistentBody.message);
    expect(privateBody.error).toBe(nonexistentBody.error);
  });

  it("excludes private jerseys from discover results (peer)", async () => {
    const fixture = await insertClubSeasonFixture();
    const owner = await registerSession(app, "private-discover-owner@example.com");
    const peer = await registerSession(app, "private-discover-peer@example.com");
    const ownerJersey = await saveJerseyForUser(app, owner, fixture);

    await patchJerseyBidding(app, owner, ownerJersey.id, true);
    expect(await discoverJerseyIds(app, peer)).toContain(ownerJersey.id);

    const privateResponse = await patchJerseyPrivate(app, owner, ownerJersey.id, true);
    expect(privateResponse.statusCode).toBe(200);

    const discoverIdsAfter = await discoverJerseyIds(app, peer);
    expect(discoverIdsAfter).not.toContain(ownerJersey.id);

    const peerDetailAfter = await getPeerJerseyRaw(app, peer, ownerJersey.id);
    expect(peerDetailAfter.statusCode).toBe(404);
  });

  it("clearing private restores peer detail visibility with no second publish verb (owner/peer)", async () => {
    const fixture = await insertClubSeasonFixture();
    const owner = await registerSession(app, "private-clear-owner@example.com");
    const peer = await registerSession(app, "private-clear-peer@example.com");
    const ownerJersey = await saveJerseyForUser(app, owner, fixture);

    expect((await getPeerJerseyRaw(app, peer, ownerJersey.id)).statusCode).toBe(200);

    const privateResponse = await patchJerseyPrivate(app, owner, ownerJersey.id, true);
    expect(privateResponse.statusCode).toBe(200);
    expect((await getPeerJerseyRaw(app, peer, ownerJersey.id)).statusCode).toBe(404);

    const clearResponse = await patchJerseyPrivate(app, owner, ownerJersey.id, false);
    expect(clearResponse.statusCode).toBe(200);

    expect((await findOwnJersey(app, owner, ownerJersey.id))?.private).toBe(false);
    expect((await getPeerJerseyRaw(app, peer, ownerJersey.id)).statusCode).toBe(200);
  });

  it("owner still sees private jerseys in listJerseys with the private flag (owner)", async () => {
    const fixture = await insertClubSeasonFixture();
    const owner = await registerSession(app, "private-ownlist-owner@example.com");
    const ownerJersey = await saveJerseyForUser(app, owner, fixture);

    await patchJerseyPrivate(app, owner, ownerJersey.id, true);

    const listResponse = await app.inject({
      method: "GET",
      url: "/v1/collection/jerseys",
      headers: { authorization: `Bearer ${owner.accessToken}`, "accept-language": "da" },
    });
    expect(listResponse.statusCode).toBe(200);
    const body = collectionJerseysSchema.parse(JSON.parse(listResponse.body));
    expect(body.jerseys.some((item) => item.id === ownerJersey.id)).toBe(true);
    expect(body.jerseys.find((item) => item.id === ownerJersey.id)?.private).toBe(true);
  });

  it("peer-facing schemas (discover + peer detail) do not expose private (peer)", async () => {
    const fixture = await insertClubSeasonFixture();
    const owner = await registerSession(app, "private-schema-owner@example.com");
    const peer = await registerSession(app, "private-schema-peer@example.com");
    const ownerJersey = await saveJerseyForUser(app, owner, fixture);

    await patchJerseyBidding(app, owner, ownerJersey.id, true);

    const discoverIds = await discoverJerseyIds(app, peer);
    expect(discoverIds).toContain(ownerJersey.id);

    const discoverResponse = await app.inject({
      method: "GET",
      url: "/v1/collection/discover/jerseys",
      headers: { authorization: `Bearer ${peer.accessToken}`, "accept-language": "da" },
    });
    const discoverBody = collectionDiscoverJerseysSchema.parse(JSON.parse(discoverResponse.body));
    const discoverJersey = discoverBody.jerseys.find((item) => item.id === ownerJersey.id);
    expect(discoverJersey).toBeDefined();
    expect("private" in discoverJersey!).toBe(false);

    const peerResponse = await getPeerJerseyRaw(app, peer, ownerJersey.id);
    const peerBody = collectionPeerJerseySchema.parse(JSON.parse(peerResponse.body));
    expect("private" in peerBody).toBe(false);
  });

  it("omits a favorited jersey from peer favorites after the owner marks it private (peer)", async () => {
    const fixture = await insertClubSeasonFixture();
    const owner = await registerSession(app, "private-fav-owner@example.com");
    const peer = await registerSession(app, "private-fav-peer@example.com");
    const ownerJersey = await saveJerseyForUser(app, owner, fixture);

    const addFavorite = await app.inject({
      method: "POST",
      url: "/v1/collection/favorites",
      headers: { authorization: `Bearer ${peer.accessToken}` },
      payload: { userJerseyId: ownerJersey.id },
    });
    expect(addFavorite.statusCode).toBe(201);

    const listBefore = await app.inject({
      method: "GET",
      url: "/v1/collection/favorites",
      headers: {
        authorization: `Bearer ${peer.accessToken}`,
        "accept-language": "da",
      },
    });
    expect(collectionFavoritesSchema.parse(JSON.parse(listBefore.body)).favorites).toHaveLength(1);

    const privateResponse = await patchJerseyPrivate(app, owner, ownerJersey.id, true);
    expect(privateResponse.statusCode).toBe(200);

    const listAfter = await app.inject({
      method: "GET",
      url: "/v1/collection/favorites",
      headers: {
        authorization: `Bearer ${peer.accessToken}`,
        "accept-language": "da",
      },
    });
    expect(listAfter.statusCode).toBe(200);
    const listBody = collectionFavoritesSchema.parse(JSON.parse(listAfter.body));
    expect(listBody.favorites).toHaveLength(0);
  });

  it("returns 404 for peer photo bytes on a favorited jersey after private toggle (peer)", async () => {
    const fixture = await insertClubSeasonFixture();
    const owner = await registerSession(app, "private-fav-photo-owner@example.com");
    const peer = await registerSession(app, "private-fav-photo-peer@example.com");
    const ownerJersey = await saveJerseyForUser(app, owner, fixture);

    const addFavorite = await app.inject({
      method: "POST",
      url: "/v1/collection/favorites",
      headers: { authorization: `Bearer ${peer.accessToken}` },
      payload: { userJerseyId: ownerJersey.id },
    });
    expect(addFavorite.statusCode).toBe(201);

    const listResponse = await app.inject({
      method: "GET",
      url: "/v1/collection/favorites",
      headers: {
        authorization: `Bearer ${peer.accessToken}`,
        "accept-language": "da",
      },
    });
    const listBody = collectionFavoritesSchema.parse(JSON.parse(listResponse.body));
    const photoUrl = listBody.favorites[0]?.photoUrl;
    expect(photoUrl).toBeDefined();

    const photoBefore = await app.inject({
      method: "GET",
      url: photoUrl!,
      headers: { authorization: `Bearer ${peer.accessToken}` },
    });
    expect(photoBefore.statusCode).toBe(200);

    const privateResponse = await patchJerseyPrivate(app, owner, ownerJersey.id, true);
    expect(privateResponse.statusCode).toBe(200);

    const photoAfter = await app.inject({
      method: "GET",
      url: photoUrl!,
      headers: { authorization: `Bearer ${peer.accessToken}` },
    });
    expect(photoAfter.statusCode).toBe(404);
  });

  it("owner PATCH updates jersey metadata via collection update envelope (owner)", async () => {
    const fixture = await insertClubSeasonFixture();
    const owner = await registerSession(app, "update-jersey-owner@example.com");
    const ownerJersey = await saveJerseyForUser(app, owner, fixture);

    const updateResponse = await app.inject({
      method: "PATCH",
      url: `/v1/collection/jerseys/${ownerJersey.id}`,
      headers: { authorization: `Bearer ${owner.accessToken}`, "accept-language": "da" },
      payload: {
        clubId: fixture.clubId,
        seasonId: fixture.seasonId,
        type: "away",
        size: "xl",
        condition: "worn",
      },
    });
    expect(updateResponse.statusCode).toBe(200);
    const body = collectionJerseyUpdateResponseSchema.parse(JSON.parse(updateResponse.body));
    expect(body.jersey.id).toBe(ownerJersey.id);
    expect(body.jersey.type).toBe("away");
    expect(body.jersey.size).toBe("xl");
    expect(body.jersey.condition).toBe("worn");
  });

  it("owner DELETE removes jersey from own list (owner)", async () => {
    const fixture = await insertClubSeasonFixture();
    const owner = await registerSession(app, "delete-jersey-owner@example.com");
    const ownerJersey = await saveJerseyForUser(app, owner, fixture);

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/v1/collection/jerseys/${ownerJersey.id}`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
    });
    expect(deleteResponse.statusCode).toBe(204);
    expect(await findOwnJersey(app, owner, ownerJersey.id)).toBeUndefined();
  });

  it("owner DELETE removes a jersey with a favourite, a Vision log, a draft and a patch (owner)", async () => {
    const fixture = await insertClubSeasonFixture();
    const owner = await registerSession(app, "delete-dependents-owner@example.com");
    const favoriter = await registerSession(app, "delete-dependents-favoriter@example.com");
    const ownerJersey = await saveJerseyForUser(app, owner, fixture);

    const { db, pool } = createDb(DATABASE_URL);
    const [insertedPatch] = await db
      .insert(patch)
      .values({ seasonId: fixture.seasonId })
      .returning({ id: patch.id });
    await db.insert(userJerseyFavorite).values({
      collectorId: favoriter.user.id,
      userJerseyId: ownerJersey.id,
    });
    await db.insert(visionLog).values({ userId: owner.user.id, userJerseyId: ownerJersey.id });
    await db
      .insert(jerseyDraft)
      .values({ id: randomUUID(), userId: owner.user.id, userJerseyId: ownerJersey.id });
    await db
      .insert(userJerseyPatch)
      .values({ userJerseyId: ownerJersey.id, patchId: insertedPatch!.id });

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/v1/collection/jerseys/${ownerJersey.id}`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
    });
    expect(deleteResponse.statusCode).toBe(204);

    const remaining = {
      userJersey: await db
        .select({ id: userJersey.id })
        .from(userJersey)
        .where(eq(userJersey.id, ownerJersey.id)),
      favorites: await db
        .select({ id: userJerseyFavorite.id })
        .from(userJerseyFavorite)
        .where(eq(userJerseyFavorite.userJerseyId, ownerJersey.id)),
      visionLogs: await db
        .select({ id: visionLog.id })
        .from(visionLog)
        .where(eq(visionLog.userJerseyId, ownerJersey.id)),
      drafts: await db
        .select({ id: jerseyDraft.id })
        .from(jerseyDraft)
        .where(eq(jerseyDraft.userJerseyId, ownerJersey.id)),
      patches: await db
        .select({ patchId: userJerseyPatch.patchId })
        .from(userJerseyPatch)
        .where(eq(userJerseyPatch.userJerseyId, ownerJersey.id)),
    };
    await pool.end();
    expect(remaining).toEqual({
      userJersey: [],
      favorites: [],
      visionLogs: [],
      drafts: [],
      patches: [],
    });
  });

  it("peer DELETE of foreign jersey returns 404 (peer)", async () => {
    const fixture = await insertClubSeasonFixture();
    const owner = await registerSession(app, "delete-jersey-peer-owner@example.com");
    const peer = await registerSession(app, "delete-jersey-peer@example.com");
    const ownerJersey = await saveJerseyForUser(app, owner, fixture);

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/v1/collection/jerseys/${ownerJersey.id}`,
      headers: { authorization: `Bearer ${peer.accessToken}` },
    });
    expect(deleteResponse.statusCode).toBe(404);
    expect(await findOwnJersey(app, owner, ownerJersey.id)).toBeDefined();
  });

  it("peer profile GET by handle returns public fields only (peer)", async () => {
    const fixture = await insertClubSeasonFixture();
    const owner = await registerSession(app, "peer-profile-owner@example.com");
    const viewer = await registerSession(app, "peer-profile-viewer@example.com");
    await saveJerseyForUser(app, owner, fixture);

    const profileResponse = await app.inject({
      method: "GET",
      url: `/v1/identity/peers/by-handle/${owner.user.handle}`,
      headers: { authorization: `Bearer ${viewer.accessToken}`, "accept-language": "da" },
    });
    expect(profileResponse.statusCode).toBe(200);
    const profile = identityPeerProfileSchema.parse(JSON.parse(profileResponse.body));
    expect(profile.handle).toBe(owner.user.handle);
    expect(JSON.parse(profileResponse.body)).not.toHaveProperty("email");
  });

  it("peer jersey grid omits private copies (peer)", async () => {
    const fixture = await insertClubSeasonFixture();
    const owner = await registerSession(app, "peer-grid-owner@example.com");
    const viewer = await registerSession(app, "peer-grid-viewer@example.com");
    const visibleJersey = await saveJerseyForUser(app, owner, fixture);
    const privateJersey = await saveJerseyForUser(app, owner, fixture);

    const privatePatch = await app.inject({
      method: "PATCH",
      url: `/v1/collection/jerseys/${privateJersey.id}/private`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { private: true },
    });
    expect(privatePatch.statusCode).toBe(200);

    const profileResponse = await app.inject({
      method: "GET",
      url: `/v1/identity/peers/by-handle/${owner.user.handle}`,
      headers: { authorization: `Bearer ${viewer.accessToken}`, "accept-language": "da" },
    });
    const profile = identityPeerProfileSchema.parse(JSON.parse(profileResponse.body));

    const gridResponse = await app.inject({
      method: "GET",
      url: `/v1/collection/peers/${profile.id}/jerseys`,
      headers: { authorization: `Bearer ${viewer.accessToken}`, "accept-language": "da" },
    });
    expect(gridResponse.statusCode).toBe(200);
    const grid = collectionPeerJerseysSchema.parse(JSON.parse(gridResponse.body));
    expect(grid.jerseys.some((jersey) => jersey.id === visibleJersey.id)).toBe(true);
    expect(grid.jerseys.some((jersey) => jersey.id === privateJersey.id)).toBe(false);
  });

  it("blocked peer profile returns 404 (peer)", async () => {
    const fixture = await insertClubSeasonFixture();
    const owner = await registerSession(app, "peer-block-profile-owner@example.com");
    const viewer = await registerSession(app, "peer-block-profile-viewer@example.com");
    await saveJerseyForUser(app, owner, fixture);

    const profileResponse = await app.inject({
      method: "GET",
      url: `/v1/identity/peers/by-handle/${owner.user.handle}`,
      headers: { authorization: `Bearer ${viewer.accessToken}`, "accept-language": "da" },
    });
    const profile = identityPeerProfileSchema.parse(JSON.parse(profileResponse.body));

    const blockResponse = await app.inject({
      method: "POST",
      url: `/v1/moderation/peers/${profile.id}/block`,
      headers: { authorization: `Bearer ${viewer.accessToken}` },
    });
    expect(blockResponse.statusCode).toBe(201);

    const hiddenProfile = await app.inject({
      method: "GET",
      url: `/v1/identity/peers/${profile.id}`,
      headers: { authorization: `Bearer ${viewer.accessToken}`, "accept-language": "da" },
    });
    expect(hiddenProfile.statusCode).toBe(404);
  });

  it("rejects unauthenticated Søg magazine home with 401", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/collection/discover/home",
    });
    expect(response.statusCode).toBe(401);
  });

  it("composes Søg magazine shelves and omits empty, private, own, and blocked rows", async () => {
    const fixture = await insertClubSeasonFixture();
    const owner = await registerSession(app, "magazine-owner@example.com");
    const bidder = await registerSession(app, "magazine-bidder@example.com");
    const viewer = await registerSession(app, "magazine-viewer@example.com");
    const blockedOwner = await registerSession(app, "magazine-blocked@example.com");

    const visibleJersey = await saveJerseyForUser(app, owner, fixture);
    const biddingJersey = await saveJerseyForUser(app, bidder, fixture);
    await patchJerseyBidding(app, bidder, biddingJersey.id, true);
    const privateJersey = await saveJerseyForUser(app, owner, fixture);
    await patchJerseyPrivate(app, owner, privateJersey.id, true);
    const blockedJersey = await saveJerseyForUser(app, blockedOwner, fixture);
    await patchJerseyBidding(app, blockedOwner, blockedJersey.id, true);

    const ownerHomeResponse = await app.inject({
      method: "GET",
      url: "/v1/collection/discover/home",
      headers: { authorization: `Bearer ${owner.accessToken}`, "accept-language": "da" },
    });
    expect(ownerHomeResponse.statusCode).toBe(200);
    const ownHome = collectionDiscoverHomeSchema.parse(JSON.parse(ownerHomeResponse.body));
    expect(ownHome.moreJerseys?.some((jersey) => jersey.id === visibleJersey.id)).toBeFalsy();
    expect(ownHome.openForBid?.some((jersey) => jersey.id === biddingJersey.id)).toBe(true);

    const blockResponse = await app.inject({
      method: "POST",
      url: `/v1/moderation/peers/${blockedOwner.user.id}/block`,
      headers: { authorization: `Bearer ${viewer.accessToken}` },
    });
    expect(blockResponse.statusCode).toBe(201);

    const homeResponse = await app.inject({
      method: "GET",
      url: "/v1/collection/discover/home",
      headers: { authorization: `Bearer ${viewer.accessToken}`, "accept-language": "da" },
    });
    expect(homeResponse.statusCode).toBe(200);
    const home = collectionDiscoverHomeSchema.parse(JSON.parse(homeResponse.body));
    expect(home.clubs?.some((club) => club.clubId === fixture.clubId)).toBe(true);
    expect(home.openForBid?.some((jersey) => jersey.id === biddingJersey.id)).toBe(true);
    expect(home.openForBid?.some((jersey) => jersey.id === visibleJersey.id)).toBe(false);
    expect(home.collectors?.some((collector) => collector.handle === owner.user.handle)).toBe(true);
    expect(home.collectors?.some((collector) => collector.handle === bidder.user.handle)).toBe(
      true,
    );
    expect(
      home.collectors?.some((collector) => collector.handle === blockedOwner.user.handle),
    ).toBe(false);
    expect(home.moreJerseys?.some((jersey) => jersey.id === visibleJersey.id)).toBe(true);
    expect(home.moreJerseys?.some((jersey) => jersey.id === biddingJersey.id)).toBe(true);
    expect(home.moreJerseys?.some((jersey) => jersey.id === privateJersey.id)).toBe(false);
    expect(home.moreJerseys?.some((jersey) => jersey.id === blockedJersey.id)).toBe(false);
    expect(JSON.parse(homeResponse.body)).not.toHaveProperty("entitlement");
  });

  it("counts copies per side and collector, orders shelves by copies, and carries size", async () => {
    const clubX = await insertClubSeasonFixture();
    const clubY = await insertClubSeasonFixture();
    const ownerA = await registerSession(app, "magazine-count-a@example.com");
    const ownerB = await registerSession(app, "magazine-count-b@example.com");
    const blockedOwner = await registerSession(app, "magazine-count-blocked@example.com");
    const viewer = await registerSession(app, "magazine-count-viewer@example.com");

    const openJersey = await saveJerseyForUser(app, ownerA, clubX, { size: "xl" });
    await patchJerseyBidding(app, ownerA, openJersey.id, true);
    const closedJersey = await saveJerseyForUser(app, ownerA, clubX, { size: "s" });
    const privateJersey = await saveJerseyForUser(app, ownerA, clubX);
    await patchJerseyPrivate(app, ownerA, privateJersey.id, true);
    const otherClubJersey = await saveJerseyForUser(app, ownerB, clubY);
    const blockedJersey = await saveJerseyForUser(app, blockedOwner, clubY);
    await patchJerseyBidding(app, blockedOwner, blockedJersey.id, true);
    const ownJerseyX = await saveJerseyForUser(app, viewer, clubX);
    const ownJerseyY = await saveJerseyForUser(app, viewer, clubY);
    await patchJerseyBidding(app, viewer, ownJerseyY.id, true);

    const blockResponse = await app.inject({
      method: "POST",
      url: `/v1/moderation/peers/${blockedOwner.user.id}/block`,
      headers: { authorization: `Bearer ${viewer.accessToken}` },
    });
    expect(blockResponse.statusCode).toBe(201);

    const homeResponse = await app.inject({
      method: "GET",
      url: "/v1/collection/discover/home",
      headers: { authorization: `Bearer ${viewer.accessToken}`, "accept-language": "da" },
    });
    expect(homeResponse.statusCode).toBe(200);
    const home = collectionDiscoverHomeSchema.parse(JSON.parse(homeResponse.body));

    const clubCounts = home.clubs?.map((item) => item.jerseyCount) ?? [];
    expect(clubCounts).toEqual([...clubCounts].sort((left, right) => right - left));
    expect(
      home.clubs
        ?.filter((item) => [clubX.clubId, clubY.clubId].includes(item.clubId))
        .map((item) => [item.clubId, item.jerseyCount]),
    ).toEqual([
      [clubX.clubId, 2],
      [clubY.clubId, 1],
    ]);
    const collectorA = home.collectors?.find((item) => item.handle === ownerA.user.handle);
    expect(collectorA).toMatchObject({ jerseyCount: 2, openForBidCount: 1 });
    const collectorB = home.collectors?.find((item) => item.handle === ownerB.user.handle);
    expect(collectorB).toMatchObject({ jerseyCount: 1, openForBidCount: 0 });
    expect(home.collectors?.some((item) => item.handle === blockedOwner.user.handle)).toBe(false);
    expect(home.collectors?.some((item) => item.handle === viewer.user.handle)).toBe(false);

    const ownerAOpen = home.openForBid?.filter(
      (jersey) => jersey.ownerHandle === ownerA.user.handle,
    );
    expect(ownerAOpen?.map((jersey) => [jersey.id, jersey.size])).toEqual([[openJersey.id, "xl"]]);
    const moreById = new Map(home.moreJerseys?.map((jersey) => [jersey.id, jersey]));
    expect(moreById.get(closedJersey.id)?.size).toBe("s");
    expect(moreById.get(otherClubJersey.id)?.size).toBe("m");
    for (const absentId of [privateJersey.id, blockedJersey.id, ownJerseyX.id, ownJerseyY.id]) {
      expect(moreById.has(absentId)).toBe(false);
      expect(home.openForBid?.some((jersey) => jersey.id === absentId)).toBeFalsy();
    }
  });

  it("orders national team shelf by copies", async () => {
    const fewer = await insertNationalTeamSeasonFixture();
    const more = await insertNationalTeamSeasonFixture();
    const owner = await registerSession(app, "magazine-nt-owner@example.com");
    const viewer = await registerSession(app, "magazine-nt-viewer@example.com");

    await saveNationalTeamJerseyForUser(app, owner, fewer);
    await saveNationalTeamJerseyForUser(app, owner, more);
    await saveNationalTeamJerseyForUser(app, owner, more);

    const homeResponse = await app.inject({
      method: "GET",
      url: "/v1/collection/discover/home",
      headers: { authorization: `Bearer ${viewer.accessToken}`, "accept-language": "da" },
    });
    expect(homeResponse.statusCode).toBe(200);
    const home = collectionDiscoverHomeSchema.parse(JSON.parse(homeResponse.body));
    const teamCounts = home.nationalTeams?.map((item) => item.jerseyCount) ?? [];
    expect(teamCounts).toEqual([...teamCounts].sort((left, right) => right - left));
    expect(
      home.nationalTeams
        ?.filter((item) =>
          [more.nationalTeamId, fewer.nationalTeamId].includes(item.nationalTeamId),
        )
        .map((item) => [item.nationalTeamId, item.jerseyCount]),
    ).toEqual([
      [more.nationalTeamId, 2],
      [fewer.nationalTeamId, 1],
    ]);
  });

  it("rejects unauthenticated Søg catalog drills with 401", async () => {
    const clubResponse = await app.inject({
      method: "GET",
      url: "/v1/collection/discover/clubs/11111111-1111-4111-8111-111111111111",
    });
    const playerResponse = await app.inject({
      method: "GET",
      url: "/v1/collection/discover/players/11111111-1111-4111-8111-111111111111",
    });
    const kitResponse = await app.inject({
      method: "GET",
      url: "/v1/collection/discover/kits/11111111-1111-4111-8111-111111111111",
    });
    const nationalTeamResponse = await app.inject({
      method: "GET",
      url: "/v1/collection/discover/national-teams/11111111-1111-4111-8111-111111111111",
    });
    expect(clubResponse.statusCode).toBe(401);
    expect(playerResponse.statusCode).toBe(401);
    expect(kitResponse.statusCode).toBe(401);
    expect(nationalTeamResponse.statusCode).toBe(401);
  });

  it("composes Club and Player catalog drills with locale labels and omitted rows", async () => {
    const fixture = await insertClubSeasonFixture();
    const { db, pool } = createDb(DATABASE_URL);
    await db.insert(catalogLabel).values({
      entityType: "club",
      entityId: fixture.clubId,
      locale: "en",
      kind: "label",
      text: "FC Copenhagen",
      source: "seed",
    });
    const [insertedPlayer] = await db.insert(player).values({}).returning({ id: player.id });
    await db.insert(playerClubSeason).values({
      playerId: insertedPlayer!.id,
      clubId: fixture.clubId,
      seasonId: fixture.seasonId,
    });
    await db.insert(catalogLabel).values([
      {
        entityType: "player",
        entityId: insertedPlayer!.id,
        locale: "da",
        kind: "label",
        text: "Jonas Wind",
        source: "seed",
      },
      {
        entityType: "player",
        entityId: insertedPlayer!.id,
        locale: "en",
        kind: "label",
        text: "Jonas Wind EN",
        source: "seed",
      },
    ]);
    const [fixtureClub] = await db
      .select({ countryId: club.countryId })
      .from(club)
      .where(eq(club.id, fixture.clubId));
    const [emptyClub] = await db
      .insert(club)
      .values({ countryId: fixtureClub!.countryId, kind: "club" })
      .returning({ id: club.id });
    await db.insert(catalogLabel).values({
      entityType: "club",
      entityId: emptyClub!.id,
      locale: "da",
      kind: "label",
      text: "Tom Klub",
      source: "seed",
    });
    await pool.end();

    const owner = await registerSession(app, "catalog-drill-owner@example.com");
    const viewer = await registerSession(app, "catalog-drill-viewer@example.com");
    const blockedOwner = await registerSession(app, "catalog-drill-blocked@example.com");

    const visibleJersey = await saveJerseyForUser(app, owner, fixture);
    const privateJersey = await saveJerseyForUser(app, owner, fixture);
    await patchJerseyPrivate(app, owner, privateJersey.id, true);
    const blockedJersey = await saveJerseyForUser(app, blockedOwner, fixture);

    const blockResponse = await app.inject({
      method: "POST",
      url: `/v1/moderation/peers/${blockedOwner.user.id}/block`,
      headers: { authorization: `Bearer ${viewer.accessToken}` },
    });
    expect(blockResponse.statusCode).toBe(201);

    const unknownClub = await app.inject({
      method: "GET",
      url: "/v1/collection/discover/clubs/11111111-1111-4111-8111-111111111111",
      headers: { authorization: `Bearer ${viewer.accessToken}`, "accept-language": "da" },
    });
    const unknownPlayer = await app.inject({
      method: "GET",
      url: "/v1/collection/discover/players/11111111-1111-4111-8111-111111111111",
      headers: { authorization: `Bearer ${viewer.accessToken}`, "accept-language": "da" },
    });
    expect(unknownClub.statusCode).toBe(404);
    expect(unknownPlayer.statusCode).toBe(404);

    const daClubResponse = await app.inject({
      method: "GET",
      url: `/v1/collection/discover/clubs/${fixture.clubId}`,
      headers: { authorization: `Bearer ${viewer.accessToken}`, "accept-language": "da" },
    });
    expect(daClubResponse.statusCode).toBe(200);
    const daClub = collectionDiscoverCatalogDrillSchema.parse(JSON.parse(daClubResponse.body));
    expect(daClub).toMatchObject({
      kind: "club",
      id: fixture.clubId,
      title: "F.C. København",
    });
    expect(daClub.jerseys.some((jersey) => jersey.id === visibleJersey.id)).toBe(true);
    expect(daClub.jerseys.some((jersey) => jersey.id === privateJersey.id)).toBe(false);
    expect(daClub.jerseys.some((jersey) => jersey.id === blockedJersey.id)).toBe(false);
    expect(
      daClub.jerseys.some(
        (jersey) => jersey.id === visibleJersey.id && jersey.ownerHandle === owner.user.handle,
      ),
    ).toBe(true);
    expect(daClub.count).toBe(daClub.jerseys.length);
    expect(JSON.parse(daClubResponse.body)).not.toHaveProperty("entitlement");

    const ownClubResponse = await app.inject({
      method: "GET",
      url: `/v1/collection/discover/clubs/${fixture.clubId}`,
      headers: { authorization: `Bearer ${owner.accessToken}`, "accept-language": "da" },
    });
    const ownClub = collectionDiscoverCatalogDrillSchema.parse(JSON.parse(ownClubResponse.body));
    expect(ownClub.jerseys.some((jersey) => jersey.id === visibleJersey.id)).toBe(false);

    const enClubResponse = await app.inject({
      method: "GET",
      url: `/v1/collection/discover/clubs/${fixture.clubId}`,
      headers: { authorization: `Bearer ${viewer.accessToken}`, "accept-language": "en" },
    });
    const enClub = collectionDiscoverCatalogDrillSchema.parse(JSON.parse(enClubResponse.body));
    expect(enClub.title).toBe("FC Copenhagen");

    const emptyClubResponse = await app.inject({
      method: "GET",
      url: `/v1/collection/discover/clubs/${emptyClub!.id}`,
      headers: { authorization: `Bearer ${viewer.accessToken}`, "accept-language": "da" },
    });
    expect(emptyClubResponse.statusCode).toBe(200);
    const emptyDrill = collectionDiscoverCatalogDrillSchema.parse(
      JSON.parse(emptyClubResponse.body),
    );
    expect(emptyDrill).toMatchObject({
      kind: "club",
      id: emptyClub!.id,
      title: "Tom Klub",
      count: 0,
      jerseys: [],
    });

    const daPlayerResponse = await app.inject({
      method: "GET",
      url: `/v1/collection/discover/players/${insertedPlayer!.id}`,
      headers: { authorization: `Bearer ${viewer.accessToken}`, "accept-language": "da" },
    });
    expect(daPlayerResponse.statusCode).toBe(200);
    const daPlayer = collectionDiscoverCatalogDrillSchema.parse(JSON.parse(daPlayerResponse.body));
    expect(daPlayer).toMatchObject({
      kind: "player",
      id: insertedPlayer!.id,
      title: "Jonas Wind",
    });
    expect(daPlayer.jerseys.some((jersey) => jersey.id === visibleJersey.id)).toBe(true);
    expect(daPlayer.jerseys.some((jersey) => jersey.id === privateJersey.id)).toBe(false);
    expect(daPlayer.jerseys.some((jersey) => jersey.id === blockedJersey.id)).toBe(false);

    const enPlayerResponse = await app.inject({
      method: "GET",
      url: `/v1/collection/discover/players/${insertedPlayer!.id}`,
      headers: { authorization: `Bearer ${viewer.accessToken}`, "accept-language": "en" },
    });
    const enPlayer = collectionDiscoverCatalogDrillSchema.parse(JSON.parse(enPlayerResponse.body));
    expect(enPlayer.title).toBe("Jonas Wind EN");
  });

  it("composes Kit catalog drills with locale labels and omitted rows", async () => {
    const fixture = await insertClubSeasonFixture();
    const { db, pool } = createDb(DATABASE_URL);
    await db.insert(catalogLabel).values({
      entityType: "club",
      entityId: fixture.clubId,
      locale: "en",
      kind: "label",
      text: "FC Copenhagen",
      source: "seed",
    });
    const [insertedKit] = await db
      .insert(kit)
      .values({ clubId: fixture.clubId, seasonId: fixture.seasonId, type: "home" })
      .returning({ id: kit.id });
    const [emptyKit] = await db
      .insert(kit)
      .values({ clubId: fixture.clubId, seasonId: fixture.seasonId, type: "away" })
      .returning({ id: kit.id });
    await pool.end();

    const owner = await registerSession(app, "kit-drill-owner@example.com");
    const viewer = await registerSession(app, "kit-drill-viewer@example.com");
    const blockedOwner = await registerSession(app, "kit-drill-blocked@example.com");

    const visibleJersey = await saveJerseyForUser(app, owner, fixture, {
      catalogKitId: insertedKit!.id,
    });
    const nullKitJersey = await saveJerseyForUser(app, owner, fixture);
    const privateJersey = await saveJerseyForUser(app, owner, fixture, {
      catalogKitId: insertedKit!.id,
    });
    await patchJerseyPrivate(app, owner, privateJersey.id, true);
    const blockedJersey = await saveJerseyForUser(app, blockedOwner, fixture, {
      catalogKitId: insertedKit!.id,
    });

    const blockResponse = await app.inject({
      method: "POST",
      url: `/v1/moderation/peers/${blockedOwner.user.id}/block`,
      headers: { authorization: `Bearer ${viewer.accessToken}` },
    });
    expect(blockResponse.statusCode).toBe(201);

    const unknownKit = await app.inject({
      method: "GET",
      url: "/v1/collection/discover/kits/11111111-1111-4111-8111-111111111111",
      headers: { authorization: `Bearer ${viewer.accessToken}`, "accept-language": "da" },
    });
    expect(unknownKit.statusCode).toBe(404);

    const daKitResponse = await app.inject({
      method: "GET",
      url: `/v1/collection/discover/kits/${insertedKit!.id}`,
      headers: { authorization: `Bearer ${viewer.accessToken}`, "accept-language": "da" },
    });
    expect(daKitResponse.statusCode).toBe(200);
    const daKit = collectionDiscoverCatalogDrillSchema.parse(JSON.parse(daKitResponse.body));
    expect(daKit).toMatchObject({
      kind: "kit",
      id: insertedKit!.id,
      title: "F.C. København 2023/24 Hjemme",
    });
    expect(daKit.jerseys.some((jersey) => jersey.id === visibleJersey.id)).toBe(true);
    expect(daKit.jerseys.some((jersey) => jersey.id === nullKitJersey.id)).toBe(false);
    expect(daKit.jerseys.some((jersey) => jersey.id === privateJersey.id)).toBe(false);
    expect(daKit.jerseys.some((jersey) => jersey.id === blockedJersey.id)).toBe(false);
    expect(
      daKit.jerseys.some(
        (jersey) => jersey.id === visibleJersey.id && jersey.ownerHandle === owner.user.handle,
      ),
    ).toBe(true);
    expect(daKit.count).toBe(daKit.jerseys.length);
    expect(JSON.parse(daKitResponse.body)).not.toHaveProperty("entitlement");

    const ownKitResponse = await app.inject({
      method: "GET",
      url: `/v1/collection/discover/kits/${insertedKit!.id}`,
      headers: { authorization: `Bearer ${owner.accessToken}`, "accept-language": "da" },
    });
    const ownKit = collectionDiscoverCatalogDrillSchema.parse(JSON.parse(ownKitResponse.body));
    expect(ownKit.jerseys.some((jersey) => jersey.id === visibleJersey.id)).toBe(false);

    const enKitResponse = await app.inject({
      method: "GET",
      url: `/v1/collection/discover/kits/${insertedKit!.id}`,
      headers: { authorization: `Bearer ${viewer.accessToken}`, "accept-language": "en" },
    });
    const enKit = collectionDiscoverCatalogDrillSchema.parse(JSON.parse(enKitResponse.body));
    expect(enKit.title).toBe("FC Copenhagen 2023/24 Hjemme");

    const emptyKitResponse = await app.inject({
      method: "GET",
      url: `/v1/collection/discover/kits/${emptyKit!.id}`,
      headers: { authorization: `Bearer ${viewer.accessToken}`, "accept-language": "da" },
    });
    expect(emptyKitResponse.statusCode).toBe(200);
    const emptyDrill = collectionDiscoverCatalogDrillSchema.parse(
      JSON.parse(emptyKitResponse.body),
    );
    expect(emptyDrill).toMatchObject({
      kind: "kit",
      id: emptyKit!.id,
      title: "F.C. København 2023/24 Ude",
      count: 0,
      jerseys: [],
    });
  });

  it("rejects unauthenticated Søg typeahead with 401 and empty query with 400", async () => {
    const unauthenticated = await app.inject({
      method: "GET",
      url: "/v1/collection/discover/typeahead?q=københavn",
    });
    expect(unauthenticated.statusCode).toBe(401);

    const viewer = await registerSession(app, "typeahead-empty-q@example.com");
    const emptyQuery = await app.inject({
      method: "GET",
      url: "/v1/collection/discover/typeahead?q=",
      headers: { authorization: `Bearer ${viewer.accessToken}`, "accept-language": "da" },
    });
    expect(emptyQuery.statusCode).toBe(400);
  });

  it("replaces magazine search with typeahead hits and does not write stamdata", async () => {
    const fixture = await insertClubSeasonFixture();
    const { db, pool } = createDb(DATABASE_URL);
    const [insertedPlayer] = await db.insert(player).values({}).returning({ id: player.id });
    await db.insert(catalogLabel).values({
      entityType: "player",
      entityId: insertedPlayer!.id,
      locale: "da",
      kind: "label",
      text: "Jonas Wind",
      source: "seed",
    });
    const [insertedKit] = await db
      .insert(kit)
      .values({ clubId: fixture.clubId, seasonId: fixture.seasonId, type: "home" })
      .returning({ id: kit.id });
    await db.insert(catalogLabel).values({
      entityType: "club",
      entityId: fixture.clubId,
      locale: "en",
      kind: "alias",
      text: "FCK",
      source: "seed",
    });
    const [labelCountBefore] = await db.select({ value: count() }).from(catalogLabel);
    await pool.end();

    const owner = await registerSession(app, "typeahead-owner@example.com");
    const viewer = await registerSession(app, "typeahead-viewer@example.com");
    const blockedOwner = await registerSession(app, "typeahead-blocked@example.com");

    const visibleJersey = await saveJerseyForUser(app, owner, fixture);
    const privateJersey = await saveJerseyForUser(app, owner, fixture);
    await patchJerseyPrivate(app, owner, privateJersey.id, true);
    const blockedJersey = await saveJerseyForUser(app, blockedOwner, fixture);

    const blockResponse = await app.inject({
      method: "POST",
      url: `/v1/moderation/peers/${blockedOwner.user.id}/block`,
      headers: { authorization: `Bearer ${viewer.accessToken}` },
    });
    expect(blockResponse.statusCode).toBe(201);

    const clubQuery = await app.inject({
      method: "GET",
      url: "/v1/collection/discover/typeahead?q=K%C3%B8benhavn",
      headers: { authorization: `Bearer ${viewer.accessToken}`, "accept-language": "da" },
    });
    expect(clubQuery.statusCode).toBe(200);
    const clubHits = collectionDiscoverTypeaheadSchema.parse(JSON.parse(clubQuery.body));
    expect(clubHits.clubs?.some((clubHit) => clubHit.clubId === fixture.clubId)).toBe(true);
    expect(clubHits.kits?.some((kitHit) => kitHit.kitId === insertedKit!.id)).toBe(true);
    expect(clubHits.jerseys?.some((jersey) => jersey.id === visibleJersey.id)).toBe(true);
    expect(clubHits.jerseys?.some((jersey) => jersey.id === privateJersey.id)).toBe(false);
    expect(clubHits.jerseys?.some((jersey) => jersey.id === blockedJersey.id)).toBe(false);
    expect(JSON.parse(clubQuery.body)).not.toHaveProperty("entitlement");
    expect(JSON.parse(clubQuery.body)).not.toHaveProperty("leagues");

    const aliasQuery = await app.inject({
      method: "GET",
      url: "/v1/collection/discover/typeahead?q=FCK",
      headers: { authorization: `Bearer ${viewer.accessToken}`, "accept-language": "da" },
    });
    const aliasHits = collectionDiscoverTypeaheadSchema.parse(JSON.parse(aliasQuery.body));
    expect(aliasHits.clubs?.some((clubHit) => clubHit.clubId === fixture.clubId)).toBe(true);
    expect(aliasHits.clubs?.[0]?.clubLabel).toBe("F.C. København");
    expect(aliasHits.kits?.some((kitHit) => kitHit.kitId === insertedKit!.id)).toBe(true);
    expect(aliasHits.jerseys?.some((jersey) => jersey.id === visibleJersey.id)).toBe(true);

    const playerQuery = await app.inject({
      method: "GET",
      url: "/v1/collection/discover/typeahead?q=Jonas",
      headers: { authorization: `Bearer ${viewer.accessToken}`, "accept-language": "da" },
    });
    const playerHits = collectionDiscoverTypeaheadSchema.parse(JSON.parse(playerQuery.body));
    expect(playerHits.players?.some((hit) => hit.playerId === insertedPlayer!.id)).toBe(true);

    const collectorQuery = await app.inject({
      method: "GET",
      url: `/v1/collection/discover/typeahead?q=${encodeURIComponent(owner.user.handle)}`,
      headers: { authorization: `Bearer ${viewer.accessToken}`, "accept-language": "da" },
    });
    const collectorHits = collectionDiscoverTypeaheadSchema.parse(JSON.parse(collectorQuery.body));
    expect(collectorHits.collectors?.some((hit) => hit.handle === owner.user.handle)).toBe(true);
    expect(collectorHits.collectors?.some((hit) => hit.handle === blockedOwner.user.handle)).toBe(
      false,
    );

    const { db: afterDb, pool: afterPool } = createDb(DATABASE_URL);
    const [labelCountAfter] = await afterDb.select({ value: count() }).from(catalogLabel);
    await afterPool.end();
    expect(labelCountAfter?.value).toBe(labelCountBefore?.value);
  });

  it("carries counts, kit photo and player number on typeahead hits that match the drill", async () => {
    const fixture = await insertClubSeasonFixture();
    const { db, pool } = createDb(DATABASE_URL);
    const [kitA] = await db
      .insert(kit)
      .values({ clubId: fixture.clubId, seasonId: fixture.seasonId, type: "home" })
      .returning({ id: kit.id });
    const [kitB] = await db
      .insert(kit)
      .values({ clubId: fixture.clubId, seasonId: fixture.seasonId, type: "home" })
      .returning({ id: kit.id });
    const [newerSeason] = await db
      .insert(season)
      .values({
        label: "2024/25",
        startsOn: "2024-07-01",
        endsOn: "2025-06-30",
        calendarKind: "split_year",
      })
      .returning({ id: season.id });
    const [numberedPlayer] = await db.insert(player).values({}).returning({ id: player.id });
    const [unnumberedPlayer] = await db.insert(player).values({}).returning({ id: player.id });
    await db.insert(playerClubSeason).values([
      {
        playerId: numberedPlayer!.id,
        clubId: fixture.clubId,
        seasonId: fixture.seasonId,
        squadNumber: 9,
      },
      {
        playerId: numberedPlayer!.id,
        clubId: fixture.clubId,
        seasonId: newerSeason!.id,
        squadNumber: 10,
      },
      {
        playerId: unnumberedPlayer!.id,
        clubId: fixture.clubId,
        seasonId: fixture.seasonId,
        squadNumber: null,
      },
    ]);
    await db.insert(catalogLabel).values([
      {
        entityType: "player",
        entityId: numberedPlayer!.id,
        locale: "da",
        kind: "label",
        text: "Tal Tellemand",
        source: "seed",
      },
      {
        entityType: "player",
        entityId: unnumberedPlayer!.id,
        locale: "da",
        kind: "label",
        text: "Tal Uden Nummer",
        source: "seed",
      },
    ]);
    await pool.end();

    const owner = await registerSession(app, "typeahead-count-owner@example.com");
    const viewer = await registerSession(app, "typeahead-count-viewer@example.com");
    const blockedOwner = await registerSession(app, "typeahead-count-blocked@example.com");

    const visibleJersey = await saveJerseyForUser(app, owner, fixture, {
      catalogKitId: kitA!.id,
    });
    const privateKitAJersey = await saveJerseyForUser(app, owner, fixture, {
      catalogKitId: kitA!.id,
    });
    const privateKitBJersey = await saveJerseyForUser(app, owner, fixture, {
      catalogKitId: kitB!.id,
    });
    await patchJerseyPrivate(app, owner, privateKitAJersey.id, true);
    await patchJerseyPrivate(app, owner, privateKitBJersey.id, true);
    await saveJerseyForUser(app, viewer, fixture, { catalogKitId: kitA!.id });
    await saveJerseyForUser(app, blockedOwner, fixture, { catalogKitId: kitA!.id });
    const blockResponse = await app.inject({
      method: "POST",
      url: `/v1/moderation/peers/${blockedOwner.user.id}/block`,
      headers: { authorization: `Bearer ${viewer.accessToken}` },
    });
    expect(blockResponse.statusCode).toBe(201);

    const headers = { authorization: `Bearer ${viewer.accessToken}`, "accept-language": "da" };
    const typeahead = async (q: string) => {
      const response = await app.inject({
        method: "GET",
        url: `/v1/collection/discover/typeahead?q=${encodeURIComponent(q)}`,
        headers,
      });
      expect(response.statusCode).toBe(200);
      return collectionDiscoverTypeaheadSchema.parse(JSON.parse(response.body));
    };
    const drillCount = async (path: string) => {
      const response = await app.inject({ method: "GET", url: path, headers });
      expect(response.statusCode).toBe(200);
      return collectionDiscoverCatalogDrillSchema.parse(JSON.parse(response.body)).count;
    };

    const clubHits = await typeahead("København");
    const clubHit = clubHits.clubs?.find((hit) => hit.clubId === fixture.clubId);
    expect(clubHit?.jerseyCount).toBe(1);
    expect(clubHit?.jerseyCount).toBe(
      await drillCount(`/v1/collection/discover/clubs/${fixture.clubId}`),
    );

    const kitAHit = clubHits.kits?.find((hit) => hit.kitId === kitA!.id);
    expect(kitAHit?.jerseyCount).toBe(1);
    expect(kitAHit?.jerseyCount).toBe(await drillCount(`/v1/collection/discover/kits/${kitA!.id}`));
    expect(kitAHit?.photo?.id).toBe(visibleJersey.photos[0]?.id);

    const kitBHit = clubHits.kits?.find((hit) => hit.kitId === kitB!.id);
    expect(kitBHit?.jerseyCount).toBe(0);
    expect(kitBHit?.photo).toBeNull();

    const ownerHandleHits = await typeahead(owner.user.handle);
    expect(
      ownerHandleHits.collectors?.find((hit) => hit.handle === owner.user.handle)?.jerseyCount,
    ).toBe(1);
    const blockedHandleHits = await typeahead(blockedOwner.user.handle);
    expect(blockedHandleHits.collectors).toBeUndefined();

    const playerHits = await typeahead("Tal ");
    const numbered = playerHits.players?.find((hit) => hit.playerId === numberedPlayer!.id);
    expect(numbered?.number).toBe(10);
    expect(numbered?.jerseyCount).toBe(1);
    expect(numbered?.jerseyCount).toBe(
      await drillCount(`/v1/collection/discover/players/${numberedPlayer!.id}`),
    );
    const unnumbered = playerHits.players?.find((hit) => hit.playerId === unnumberedPlayer!.id);
    expect(unnumbered?.number).toBeNull();
    expect(unnumbered?.jerseyCount).toBe(1);
    expect(unnumbered?.jerseyCount).toBe(
      await drillCount(`/v1/collection/discover/players/${unnumberedPlayer!.id}`),
    );
  });

  it("stores grid JPEG on save and serves variant=grid", async () => {
    const session = await registerSession(app, "grid-variant@example.com");
    const fixture = await insertClubSeasonFixture();

    const saveResponse = await app.inject({
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

    expect(saveResponse.statusCode).toBe(201);
    const saved = collectionSaveResponseSchema.parse(JSON.parse(saveResponse.body));
    const photo = saved.jersey.photos[0];
    expect(photo?.objectKey.endsWith("/grid.jpg")).toBe(true);

    const gridResponse = await app.inject({
      method: "GET",
      url: `/v1/collection/photos/${photo?.id}?variant=grid`,
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    expect(gridResponse.statusCode).toBe(200);
    expect(gridResponse.headers["content-type"]).toContain("image/jpeg");

    const defaultResponse = await app.inject({
      method: "GET",
      url: `/v1/collection/photos/${photo?.id}`,
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    expect(defaultResponse.statusCode).toBe(200);
    expect(defaultResponse.rawPayload).toEqual(gridResponse.rawPayload);
  });

  it("rejects original variant for collectors", async () => {
    const session = await registerSession(app, "grid-original-block@example.com");
    const fixture = await insertClubSeasonFixture();
    const jersey = await saveJerseyForUser(app, session, fixture);
    const photoId = jersey.photos[0]?.id;

    const response = await app.inject({
      method: "GET",
      url: `/v1/collection/photos/${photoId}?variant=original`,
      headers: { authorization: `Bearer ${session.accessToken}` },
    });

    expect(response.statusCode).toBe(403);
  });

  it("serves strip and lightbox variants after save without waiting on original upload", async () => {
    const session = await registerSession(app, "strip-lightbox@example.com");
    const fixture = await insertClubSeasonFixture();

    const saveResponse = await app.inject({
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

    expect(saveResponse.statusCode).toBe(201);
    const saved = collectionSaveResponseSchema.parse(JSON.parse(saveResponse.body));
    const photoId = saved.jersey.photos[0]?.id;
    const objectKey = saved.jersey.photos[0]?.objectKey;

    await waitForPhotoVariants(app, session, photoId!, objectKey!);

    const stripResponse = await app.inject({
      method: "GET",
      url: `/v1/collection/photos/${photoId}?variant=strip`,
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    const lightboxResponse = await app.inject({
      method: "GET",
      url: `/v1/collection/photos/${photoId}?variant=lightbox`,
      headers: { authorization: `Bearer ${session.accessToken}` },
    });

    expect(stripResponse.statusCode).toBe(200);
    expect(lightboxResponse.statusCode).toBe(200);
    expect(stripResponse.headers["content-type"]).toContain("image/jpeg");
    expect(lightboxResponse.headers["content-type"]).toContain("image/jpeg");
    expect(stripResponse.rawPayload.length).toBeGreaterThan(0);
    expect(lightboxResponse.rawPayload.length).toBeGreaterThan(0);
  });

  it("accepts original upload on a separate PUT after save", async () => {
    const session = await registerSession(app, "original-put@example.com");
    const fixture = await insertClubSeasonFixture();
    const jersey = await saveJerseyForUser(app, session, fixture);
    const photoId = jersey.photos[0]?.id;

    const uploadResponse = await app.inject({
      method: "PUT",
      url: `/v1/collection/photos/${photoId}/original`,
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: { contentBase64: JPEG_BASE64 },
    });

    expect(uploadResponse.statusCode).toBe(204);

    const blockedResponse = await app.inject({
      method: "GET",
      url: `/v1/collection/photos/${photoId}?variant=original`,
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    expect(blockedResponse.statusCode).toBe(403);
  });

  it("rejects oversized original upload", async () => {
    const session = await registerSession(app, "original-oversize@example.com");
    const fixture = await insertClubSeasonFixture();
    const jersey = await saveJerseyForUser(app, session, fixture);
    const photoId = jersey.photos[0]?.id;
    const oversized = Buffer.alloc(MAX_ORIGINAL_PHOTO_BYTES_UNIVERSAL + 1, 0xff).toString("base64");

    const uploadResponse = await app.inject({
      method: "PUT",
      url: `/v1/collection/photos/${photoId}/original`,
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: { contentBase64: oversized },
    });

    expect([400, 413]).toContain(uploadResponse.statusCode);
  });

  it("DELETE removes grid, strip, lightbox, and original bytes from object store", async () => {
    const session = await registerSession(app, "delete-photo-variants@example.com");
    const fixture = await insertClubSeasonFixture();
    const jersey = await saveJerseyForUser(app, session, fixture);
    const photo = jersey.photos[0];
    const photoId = photo?.id;
    const objectKey = photo?.objectKey;
    const objectStore = app.get<ObjectStoreAdapter>(OBJECT_STORE);

    await waitForDerivativeObjects(objectStore, objectKey!);

    const originalUpload = await app.inject({
      method: "PUT",
      url: `/v1/collection/photos/${photoId}/original`,
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: { contentBase64: JPEG_BASE64 },
    });
    expect(originalUpload.statusCode).toBe(204);

    const prefix = photoPrefixFromStoredObjectKey(objectKey!);
    expect(prefix).not.toBeNull();
    const variantKeys = [
      variantObjectKey(prefix!, "grid"),
      stripObjectKey(prefix!),
      lightboxObjectKey(prefix!),
      originalObjectKey(prefix!),
    ];
    for (const key of variantKeys) {
      expect(await objectStore.objectExists(key)).toBe(true);
    }

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/v1/collection/jerseys/${jersey.id}`,
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    expect(deleteResponse.statusCode).toBe(204);

    for (const key of photoObjectKeysForDeletion(objectKey!)) {
      expect(await objectStore.objectExists(key)).toBe(false);
    }
  });

  it("rejects a save whose photo bytes are not an image, storing nothing", async () => {
    const session = await registerSession(app, "save-non-image@example.com");
    const fixture = await insertClubSeasonFixture();
    const objectStore = app.get<ObjectStoreAdapter>(OBJECT_STORE);
    const putKeys: string[] = [];
    const originalPut = objectStore.putObject.bind(objectStore);
    objectStore.putObject = async (key, bytes) => {
      putKeys.push(key);
      await originalPut(key, bytes);
    };
    const notAnImage = Buffer.from("%PDF-1.4 not an image").toString("base64");

    try {
      const response = await app.inject({
        method: "POST",
        url: "/v1/collection/jerseys/save",
        headers: { authorization: `Bearer ${session.accessToken}` },
        payload: {
          clubId: fixture.clubId,
          seasonId: fixture.seasonId,
          type: "home",
          size: "m",
          condition: "used",
          photos: [{ role: "front", source: "gallery", contentBase64: notAnImage }],
        },
      });

      expect(response.statusCode).toBe(400);
      expect(putKeys).toEqual([]);
    } finally {
      objectStore.putObject = originalPut;
    }
  });

  it("rejects oversized save uploads", async () => {
    const session = await registerSession(app, "grid-clamp@example.com");
    const fixture = await insertClubSeasonFixture();
    const oversized = Buffer.alloc(2 * 1024 * 1024 + 1, 0xff).toString("base64");

    const response = await app.inject({
      method: "POST",
      url: "/v1/collection/jerseys/save",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      payload: {
        clubId: fixture.clubId,
        seasonId: fixture.seasonId,
        type: "home",
        size: "m",
        condition: "used",
        photos: [{ role: "front", source: "gallery", contentBase64: oversized }],
      },
    });

    expect([400, 413]).toContain(response.statusCode);
  });

  it("persists optional player and sleeve patch on save", async () => {
    const fixture = await insertClubSeasonFixture();
    const { db, pool } = createDb(DATABASE_URL);
    const [insertedPlayer] = await db.insert(player).values({}).returning({ id: player.id });
    await db.insert(playerClubSeason).values({
      playerId: insertedPlayer!.id,
      clubId: fixture.clubId,
      seasonId: fixture.seasonId,
      squadNumber: 10,
    });
    await db.insert(catalogLabel).values({
      entityType: "player",
      entityId: insertedPlayer!.id,
      locale: "da",
      kind: "label",
      text: "Jonas Wind",
      source: "seed",
    });
    const [insertedPatch] = await db
      .insert(patch)
      .values({ seasonId: fixture.seasonId })
      .returning({ id: patch.id });
    await db.insert(catalogLabel).values({
      entityType: "patch",
      entityId: insertedPatch!.id,
      locale: "da",
      kind: "label",
      text: "Superligaen",
      source: "seed",
    });
    await pool.end();

    const session = await registerSession(app, "player-patch-save@example.com");
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
        playerId: insertedPlayer!.id,
        patchIds: [insertedPatch!.id],
        photos: [{ role: "front", source: "gallery", contentBase64: JPEG_BASE64 }],
      },
    });

    expect(response.statusCode).toBe(201);
    const saved = collectionSaveResponseSchema.parse(JSON.parse(response.body));
    expect(saved.jersey.playerId).toBe(insertedPlayer!.id);
    expect(saved.jersey.playerLabel).toBe("Jonas Wind");
    expect(saved.jersey.playerNumber).toBe("10");
    expect(saved.jersey.patches).toEqual([{ id: insertedPatch!.id, label: "Superligaen" }]);

    const listResponse = await app.inject({
      method: "GET",
      url: "/v1/collection/jerseys",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        "accept-language": "da",
      },
    });
    const listed = collectionJerseysSchema.parse(JSON.parse(listResponse.body));
    const jersey = listed.jerseys.find((row) => row.id === saved.jersey.id);
    expect(jersey?.playerId).toBe(insertedPlayer!.id);
    expect(jersey?.patches).toEqual([{ id: insertedPatch!.id, label: "Superligaen" }]);

    const { db: verifyDb, pool: verifyPool } = createDb(DATABASE_URL);
    const [row] = await verifyDb
      .select({ playerId: userJersey.playerId })
      .from(userJersey)
      .where(eq(userJersey.id, saved.jersey.id));
    const patchRows = await verifyDb
      .select({ patchId: userJerseyPatch.patchId })
      .from(userJerseyPatch)
      .where(eq(userJerseyPatch.userJerseyId, saved.jersey.id));
    await verifyPool.end();
    expect(row?.playerId).toBe(insertedPlayer!.id);
    expect(patchRows.map((entry) => entry.patchId)).toEqual([insertedPatch!.id]);
  });

  describe("Save is atomic and one bad UserJersey does not break Samling (KIT-379)", () => {
    const NOT_AN_IMAGE_BASE64 = Buffer.from("not an image at all").toString("base64");

    function postSave(
      session: Session,
      fixture: Awaited<ReturnType<typeof insertClubSeasonFixture>>,
      photos: { role: "front" | "back"; contentBase64: string }[],
      draftId?: string,
    ) {
      return app.inject({
        method: "POST",
        url: "/v1/collection/jerseys/save",
        headers: { authorization: `Bearer ${session.accessToken}`, "accept-language": "da" },
        payload: {
          ...(draftId ? { draftId } : {}),
          clubId: fixture.clubId,
          seasonId: fixture.seasonId,
          type: "home",
          size: "m",
          condition: "used",
          photos: photos.map((photo) => ({ ...photo, source: "gallery" })),
        },
      });
    }

    function listOwn(session: Session) {
      return app.inject({
        method: "GET",
        url: "/v1/collection/jerseys",
        headers: { authorization: `Bearer ${session.accessToken}`, "accept-language": "da" },
      });
    }

    async function ownRowCounts(userId: string) {
      const { db, pool } = createDb(DATABASE_URL);
      try {
        const [jerseys] = await db
          .select({ n: count() })
          .from(userJersey)
          .where(eq(userJersey.userId, userId));
        const [photos] = await db
          .select({ n: count() })
          .from(userJerseyPhoto)
          .innerJoin(userJersey, eq(userJerseyPhoto.userJerseyId, userJersey.id))
          .where(eq(userJersey.userId, userId));
        return { jerseys: jerseys!.n, photos: photos!.n };
      } finally {
        await pool.end();
      }
    }

    it("a Save whose photo fails validation answers 400 and leaves no jersey or photo rows", async () => {
      const session = await registerSession(app, "kit379-invalid@example.com");
      const fixture = await insertClubSeasonFixture();

      const response = await postSave(session, fixture, [
        { role: "front", contentBase64: JPEG_BASE64 },
        { role: "back", contentBase64: NOT_AN_IMAGE_BASE64 },
      ]);

      expect(response.statusCode).toBe(400);
      expect(await ownRowCounts(session.user.id)).toEqual({ jerseys: 0, photos: 0 });
    });

    it("a Save whose object-store put fails leaves no rows and removes the objects it put", async () => {
      const session = await registerSession(app, "kit379-put-fails@example.com");
      const fixture = await insertClubSeasonFixture();
      const objectStore = app.get<ObjectStoreAdapter>(OBJECT_STORE);
      const originalPut = objectStore.putObject.bind(objectStore);
      const putKeys: string[] = [];
      objectStore.putObject = async (key, bytes) => {
        if (putKeys.length === 1) {
          throw new Error("object store down");
        }
        putKeys.push(key);
        await originalPut(key, bytes);
      };

      let response: Awaited<ReturnType<typeof postSave>>;
      try {
        response = await postSave(session, fixture, [
          { role: "front", contentBase64: JPEG_BASE64 },
          { role: "back", contentBase64: JPEG_BASE64 },
        ]);
      } finally {
        objectStore.putObject = originalPut;
      }

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
      expect(await ownRowCounts(session.user.id)).toEqual({ jerseys: 0, photos: 0 });
      expect(putKeys).toHaveLength(1);
      expect(await objectStore.objectExists(putKeys[0]!)).toBe(false);
    });

    it("lists the existing jerseys while a Save is in flight with its photo put held open", async () => {
      const session = await registerSession(app, "kit379-in-flight@example.com");
      const fixture = await insertClubSeasonFixture();
      const first = await postSave(session, fixture, [
        { role: "front", contentBase64: JPEG_BASE64 },
      ]);
      expect(first.statusCode).toBe(201);
      const firstId = collectionSaveResponseSchema.parse(JSON.parse(first.body)).jersey.id;

      const objectStore = app.get<ObjectStoreAdapter>(OBJECT_STORE);
      const originalPut = objectStore.putObject.bind(objectStore);
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let putStarted!: () => void;
      const putReached = new Promise<void>((resolve) => {
        putStarted = resolve;
      });
      objectStore.putObject = async (key, bytes) => {
        putStarted();
        await gate;
        await originalPut(key, bytes);
      };

      let listDuringSave: Awaited<ReturnType<typeof listOwn>>;
      let second: Awaited<ReturnType<typeof postSave>>;
      try {
        const pending = postSave(session, fixture, [{ role: "front", contentBase64: JPEG_BASE64 }]);
        await putReached;
        listDuringSave = await listOwn(session);
        release();
        second = await pending;
      } finally {
        release();
        objectStore.putObject = originalPut;
      }

      expect(listDuringSave.statusCode).toBe(200);
      const duringIds = collectionJerseysSchema
        .parse(JSON.parse(listDuringSave.body))
        .jerseys.map((jersey) => jersey.id);
      expect(duringIds).toContain(firstId);

      expect(second.statusCode).toBe(201);
      const secondId = collectionSaveResponseSchema.parse(JSON.parse(second.body)).jersey.id;
      expect(await findOwnJersey(app, session, secondId)).toBeDefined();
      expect(await findOwnJersey(app, session, firstId)).toBeDefined();
    });

    it("a retried Save after a failed one answers 201 and both jerseys are listed", async () => {
      const session = await registerSession(app, "kit379-retry@example.com");
      const fixture = await insertClubSeasonFixture();
      const ok = await postSave(session, fixture, [{ role: "front", contentBase64: JPEG_BASE64 }]);
      const okId = collectionSaveResponseSchema.parse(JSON.parse(ok.body)).jersey.id;
      const draftId = randomUUID();

      const bad = await postSave(
        session,
        fixture,
        [{ role: "front", contentBase64: NOT_AN_IMAGE_BASE64 }],
        draftId,
      );
      expect(bad.statusCode).toBe(400);

      const retry = await postSave(
        session,
        fixture,
        [{ role: "front", contentBase64: JPEG_BASE64 }],
        draftId,
      );
      expect(retry.statusCode).toBe(201);
      const retryId = collectionSaveResponseSchema.parse(JSON.parse(retry.body)).jersey.id;

      expect(await findOwnJersey(app, session, okId)).toBeDefined();
      expect(await findOwnJersey(app, session, retryId)).toBeDefined();
      expect(await ownRowCounts(session.user.id)).toEqual({ jerseys: 2, photos: 2 });

      const again = await postSave(
        session,
        fixture,
        [{ role: "front", contentBase64: JPEG_BASE64 }],
        draftId,
      );
      expect(collectionSaveResponseSchema.parse(JSON.parse(again.body)).jersey.id).toBe(retryId);
    });

    it("a legacy jersey with no photo rows does not 404 the list; the others are returned and the row is logged", async () => {
      const session = await registerSession(app, "kit379-legacy@example.com");
      const fixture = await insertClubSeasonFixture();
      const ok = await postSave(session, fixture, [{ role: "front", contentBase64: JPEG_BASE64 }]);
      const okId = collectionSaveResponseSchema.parse(JSON.parse(ok.body)).jersey.id;

      const { db, pool } = createDb(DATABASE_URL);
      const [legacy] = await db
        .insert(userJersey)
        .values({
          userId: session.user.id,
          clubId: fixture.clubId,
          seasonId: fixture.seasonId,
          type: "home",
          size: "m",
          condition: "used",
        })
        .returning({ id: userJersey.id });
      await pool.end();

      const warn = vi.spyOn(Logger.prototype, "warn");
      try {
        const response = await listOwn(session);
        expect(response.statusCode).toBe(200);
        const ids = collectionJerseysSchema
          .parse(JSON.parse(response.body))
          .jerseys.map((jersey) => jersey.id);
        expect(ids).toEqual([okId]);
        expect(warn.mock.calls.some((call) => String(call[0]).includes(legacy!.id))).toBe(true);
      } finally {
        warn.mockRestore();
      }
    });

    it.each(["club", "country", "league", "national_team"] as const)(
      "a jersey whose %s label row is missing does not 404 the list; the others are returned and the row is logged",
      async (missing) => {
        const session = await registerSession(app, `kit384-${missing}@example.com`);
        const clubFixture = await insertClubSeasonFixture();
        const nationalTeamFixture = await insertNationalTeamSeasonFixture();
        const badIsNationalTeam = missing === "national_team";

        const ok = await postSave(session, clubFixture, [
          { role: "front", contentBase64: JPEG_BASE64 },
        ]);
        expect(ok.statusCode).toBe(201);
        const okId = collectionSaveResponseSchema.parse(JSON.parse(ok.body)).jersey.id;

        // A national-team jersey is saved by hand: postSave only takes a club fixture.
        const nationalTeamSave = await app.inject({
          method: "POST",
          url: "/v1/collection/jerseys/save",
          headers: { authorization: `Bearer ${session.accessToken}`, "accept-language": "da" },
          payload: {
            nationalTeamId: nationalTeamFixture.nationalTeamId,
            seasonId: nationalTeamFixture.seasonId,
            type: "home",
            size: "m",
            condition: "used",
            photos: [{ role: "front", source: "gallery", contentBase64: JPEG_BASE64 }],
          },
        });
        expect(nationalTeamSave.statusCode).toBe(201);
        const nationalTeamId = collectionSaveResponseSchema.parse(JSON.parse(nationalTeamSave.body))
          .jersey.id;

        const badId = badIsNationalTeam ? nationalTeamId : okId;
        const goodId = badIsNationalTeam ? okId : nationalTeamId;

        // Delete the label after the Save: the Save response resolves labels too.
        const { db, pool } = createDb(DATABASE_URL);
        try {
          let entityId: string;
          if (missing === "club") {
            entityId = clubFixture.clubId;
          } else if (missing === "national_team") {
            entityId = nationalTeamFixture.nationalTeamId;
          } else if (missing === "country") {
            const [row] = await db
              .select({ countryId: club.countryId })
              .from(club)
              .where(eq(club.id, clubFixture.clubId));
            entityId = row!.countryId;
          } else {
            const [row] = await db
              .select({ leagueId: season.leagueId })
              .from(season)
              .where(eq(season.id, clubFixture.seasonId));
            entityId = row!.leagueId!;
          }
          const deleted = await db
            .delete(catalogLabel)
            .where(and(eq(catalogLabel.entityType, missing), eq(catalogLabel.entityId, entityId)))
            .returning({ id: catalogLabel.id });
          expect(deleted.length).toBeGreaterThan(0);
        } finally {
          await pool.end();
        }

        const warn = vi.spyOn(Logger.prototype, "warn");
        try {
          const response = await listOwn(session);
          expect(response.statusCode).toBe(200);
          const ids = collectionJerseysSchema
            .parse(JSON.parse(response.body))
            .jerseys.map((jersey) => jersey.id);
          expect(ids).toEqual([goodId]);
          expect(warn.mock.calls.some((call) => String(call[0]).includes(badId))).toBe(true);
        } finally {
          warn.mockRestore();
        }
      },
    );
  });
});

describe("R2 object store content type", () => {
  const R2_ENV_KEYS = [
    "R2_ENDPOINT",
    "R2_BUCKET",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
  ] as const;
  const savedEnv: Partial<Record<(typeof R2_ENV_KEYS)[number], string>> = {};

  beforeAll(() => {
    for (const key of R2_ENV_KEYS) {
      savedEnv[key] = process.env[key];
    }
    process.env.R2_ENDPOINT = "https://r2.example.test";
    process.env.R2_BUCKET = "kit-test";
    process.env.R2_ACCESS_KEY_ID = "test-access-key";
    process.env.R2_SECRET_ACCESS_KEY = "test-secret-key";
  });

  afterAll(() => {
    for (const key of R2_ENV_KEYS) {
      const previous = savedEnv[key];
      if (previous === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous;
      }
    }
  });

  function storeWithRecordingClient() {
    const sent: Array<{ input: { ContentType?: string; Key?: string } }> = [];
    const client = {
      async send(command: unknown) {
        // SAFETY: the store only sends PutObjectCommand here, whose `input` carries Key and ContentType.
        sent.push(command as (typeof sent)[number]);
        return {};
      },
    };
    return { store: createR2ObjectStore(client), sent };
  }

  function riffWebp(): Uint8Array {
    const bytes = new Uint8Array(16);
    bytes.set([0x52, 0x49, 0x46, 0x46], 0);
    bytes.set([0xac, 0x03, 0x00, 0x00], 4);
    bytes.set([0x57, 0x45, 0x42, 0x50], 8);
    bytes.set([0x56, 0x50, 0x38, 0x58], 12);
    return bytes;
  }

  it("stores JPEG bytes as image/jpeg", async () => {
    const { store, sent } = storeWithRecordingClient();
    await store.putObject("jpeg-key", Uint8Array.from(Buffer.from(JPEG_BASE64, "base64")));
    expect(sent).toHaveLength(1);
    expect(sent[0]?.input.ContentType).toBe("image/jpeg");
  });

  it("stores WebP bytes as image/webp, not image/jpeg", async () => {
    const { store, sent } = storeWithRecordingClient();
    await store.putObject("webp-key", riffWebp());
    expect(sent).toHaveLength(1);
    expect(sent[0]?.input.ContentType).toBe("image/webp");
  });

  it("rejects non-image bytes without sending to R2", async () => {
    const { store, sent } = storeWithRecordingClient();
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
    await expect(store.putObject("pdf-key", pdf)).rejects.toThrow("pdf-key");
    const riffWave = new Uint8Array(16);
    riffWave.set([0x52, 0x49, 0x46, 0x46], 0);
    riffWave.set([0x57, 0x41, 0x56, 0x45], 8);
    await expect(store.putObject("wave-key", riffWave)).rejects.toThrow("wave-key");
    expect(sent).toHaveLength(0);
  });
});
