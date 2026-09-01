import "reflect-metadata";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  type CollectionJersey,
  collectionConversationsSchema,
  collectionDiscoverJerseysSchema,
  collectionFavoritesSchema,
  collectionJerseysSchema,
  collectionJerseyUpdateResponseSchema,
  collectionPeerJerseySchema,
  collectionSaveResponseSchema,
  collectionSendBidResponseSchema,
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
  visionLog,
} from "@kit/db";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../dist/app.module.js";
import { FailingVisionAdapter, SlowVisionAdapter } from "../dist/vision/test-vision.adapters.js";
import { VISION_ADAPTER } from "../dist/vision/vision.adapter.js";

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
});
