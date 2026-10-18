import "reflect-metadata";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectionConversationDetailSchema,
  collectionConversationsSchema,
  collectionRespondBidResponseSchema,
  collectionSaveResponseSchema,
  collectionSendBidResponseSchema,
  collectionSendMessageResponseSchema,
  identitySessionSchema,
} from "@kit/api-contract";
import {
  catalogLabel,
  club,
  conversationMessage,
  country,
  createDb,
  league,
  resetDatabase,
  season,
  teamSeason,
  user,
} from "@kit/db";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../dist/app.module.js";
import { OBJECT_STORE } from "../dist/collection/collection.service.js";
import type { ObjectStoreAdapter } from "../dist/collection/object-store.js";
import { clearAuthThrottleHits } from "./helpers/auth-throttle.js";

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
    payload: { email, password: "password123" },
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

  return { clubId: insertedClub!.id, seasonId: insertedSeason!.id };
}

async function saveJerseyForUser(
  app: NestFastifyApplication,
  session: Awaited<ReturnType<typeof registerSession>>,
  fixture: Awaited<ReturnType<typeof insertClubSeasonFixture>>,
  kit: { type: "home" | "away"; size: "m" | "l" } = { type: "home", size: "m" },
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
      type: kit.type,
      size: kit.size,
      condition: "used",
      photos: [{ role: "front", source: "gallery", contentBase64: JPEG_BASE64 }],
    },
  });

  expect(response.statusCode).toBe(201);
  return collectionSaveResponseSchema.parse(JSON.parse(response.body)).jersey;
}

async function getIndbakke(
  app: NestFastifyApplication,
  session: Awaited<ReturnType<typeof registerSession>>,
) {
  const response = await app.inject({
    method: "GET",
    url: "/v1/collection/conversations",
    headers: { authorization: `Bearer ${session.accessToken}`, "accept-language": "da" },
  });
  expect(response.statusCode).toBe(200);
  return collectionConversationsSchema.parse(JSON.parse(response.body));
}

async function createBidConversation(
  app: NestFastifyApplication,
  owner: Awaited<ReturnType<typeof registerSession>>,
  bidder: Awaited<ReturnType<typeof registerSession>>,
  jerseyId: string,
  amountDkk = 350,
) {
  await app.inject({
    method: "PATCH",
    url: `/v1/collection/jerseys/${jerseyId}/bidding`,
    headers: { authorization: `Bearer ${owner.accessToken}` },
    payload: { biddingEnabled: true },
  });

  const bidResponse = await app.inject({
    method: "POST",
    url: `/v1/collection/jerseys/${jerseyId}/bids`,
    headers: { authorization: `Bearer ${bidder.accessToken}` },
    payload: { amountDkk },
  });
  expect(bidResponse.statusCode).toBe(201);
  return collectionSendBidResponseSchema.parse(JSON.parse(bidResponse.body));
}

describe("Collection conversations /v1", () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.JWT_SECRET = "test-jwt-secret";
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

  beforeEach(async () => {
    await clearAuthThrottleHits();
  });

  it("rejects unauthenticated conversation list with 401", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/collection/conversations",
    });

    expect(response.statusCode).toBe(401);
  });

  it("returns an empty conversation list for an authenticated collector", async () => {
    const registerResponse = await app.inject({
      method: "POST",
      url: "/v1/identity/register",
      payload: {
        email: "inbox@example.com",
        password: "password123",
      },
    });
    const session = identitySessionSchema.parse(JSON.parse(registerResponse.body));

    const response = await app.inject({
      method: "GET",
      url: "/v1/collection/conversations",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = collectionConversationsSchema.parse(JSON.parse(response.body));
    expect(body).toEqual({ waiting: [], conversations: [], unreadCount: 0 });
  });

  it("rejects unauthenticated conversation detail with 401", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/collection/conversations/00000000-0000-0000-0000-000000000099",
    });
    expect(response.statusCode).toBe(401);
  });

  it("isolates conversation detail to participants", async () => {
    const fixture = await insertClubSeasonFixture();
    const owner = await registerSession(app, "owner-detail@example.com");
    const bidder = await registerSession(app, "bidder-detail@example.com");
    const outsider = await registerSession(app, "outsider-detail@example.com");
    const jersey = await saveJerseyForUser(app, owner, fixture);
    const { conversationId } = await createBidConversation(app, owner, bidder, jersey.id);

    const forbidden = await app.inject({
      method: "GET",
      url: `/v1/collection/conversations/${conversationId}`,
      headers: { authorization: `Bearer ${outsider.accessToken}` },
    });
    expect(forbidden.statusCode).toBe(404);

    const allowed = await app.inject({
      method: "GET",
      url: `/v1/collection/conversations/${conversationId}`,
      headers: {
        authorization: `Bearer ${owner.accessToken}`,
        "accept-language": "da",
      },
    });
    expect(allowed.statusCode).toBe(200);
    const detail = collectionConversationDetailSchema.parse(JSON.parse(allowed.body));
    expect(detail.id).toBe(conversationId);
    expect(detail.messages.length).toBe(1);
    expect(detail.messages[0]?.kind).toBe("bid");
    expect(detail.messages[0]?.jersey?.clubLabel).toBe("F.C. København");
  });

  it("marks conversation read when opening detail and updates inbox unread", async () => {
    const fixture = await insertClubSeasonFixture();
    const owner = await registerSession(app, "owner-read@example.com");
    const bidder = await registerSession(app, "bidder-read@example.com");
    const jersey = await saveJerseyForUser(app, owner, fixture);
    const { conversationId } = await createBidConversation(app, owner, bidder, jersey.id);

    const unreadInbox = await app.inject({
      method: "GET",
      url: "/v1/collection/conversations",
      headers: { authorization: `Bearer ${owner.accessToken}` },
    });
    const unreadBody = collectionConversationsSchema.parse(JSON.parse(unreadInbox.body));
    expect(unreadBody.unreadCount).toBe(1);

    await app.inject({
      method: "GET",
      url: `/v1/collection/conversations/${conversationId}`,
      headers: {
        authorization: `Bearer ${owner.accessToken}`,
        "accept-language": "da",
      },
    });

    const readInbox = await app.inject({
      method: "GET",
      url: "/v1/collection/conversations",
      headers: { authorization: `Bearer ${owner.accessToken}` },
    });
    const readBody = collectionConversationsSchema.parse(JSON.parse(readInbox.body));
    expect(readBody.unreadCount).toBe(0);
    expect(readBody.conversations[0]?.unread).toBe(false);
  });

  it("posts text and image messages for participants", async () => {
    const fixture = await insertClubSeasonFixture();
    const owner = await registerSession(app, "owner-msg@example.com");
    const bidder = await registerSession(app, "bidder-msg@example.com");
    const jersey = await saveJerseyForUser(app, owner, fixture);
    const { conversationId } = await createBidConversation(app, owner, bidder, jersey.id);

    const textResponse = await app.inject({
      method: "POST",
      url: `/v1/collection/conversations/${conversationId}/messages`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { text: "Tak for buddet" },
    });
    expect(textResponse.statusCode).toBe(201);
    collectionSendMessageResponseSchema.parse(JSON.parse(textResponse.body));

    const textInboxResponse = await app.inject({
      method: "GET",
      url: "/v1/collection/conversations",
      headers: { authorization: `Bearer ${owner.accessToken}` },
    });
    const textInboxBody = collectionConversationsSchema.parse(JSON.parse(textInboxResponse.body));
    expect(textInboxBody.conversations[0]?.latest).toEqual({
      kind: "text",
      text: "Tak for buddet",
    });

    const imageResponse = await app.inject({
      method: "POST",
      url: `/v1/collection/conversations/${conversationId}/messages`,
      headers: { authorization: `Bearer ${bidder.accessToken}` },
      payload: { contentBase64: JPEG_BASE64 },
    });
    expect(imageResponse.statusCode).toBe(201);
    const imageBody = collectionSendMessageResponseSchema.parse(JSON.parse(imageResponse.body));

    const detailResponse = await app.inject({
      method: "GET",
      url: `/v1/collection/conversations/${conversationId}`,
      headers: {
        authorization: `Bearer ${owner.accessToken}`,
        "accept-language": "da",
      },
    });
    const detail = collectionConversationDetailSchema.parse(JSON.parse(detailResponse.body));
    expect(
      detail.messages.some(
        (message) => message.kind === "text" && message.text === "Tak for buddet",
      ),
    ).toBe(true);
    const imageMessage = detail.messages.find((message) => message.id === imageBody.messageId);
    expect(imageMessage?.kind).toBe("image");
    expect(imageMessage?.imageUrl).toContain("/photo");

    const photoResponse = await app.inject({
      method: "GET",
      url: imageMessage!.imageUrl!,
      headers: { authorization: `Bearer ${owner.accessToken}` },
    });
    expect(photoResponse.statusCode).toBe(200);
    expect(photoResponse.headers["content-type"]).toContain("image/jpeg");

    const inboxResponse = await app.inject({
      method: "GET",
      url: "/v1/collection/conversations",
      headers: { authorization: `Bearer ${owner.accessToken}` },
    });
    const inboxBody = collectionConversationsSchema.parse(JSON.parse(inboxResponse.body));
    expect(inboxBody.conversations[0]?.latest).toEqual({ kind: "image" });
  });

  it("rejects message post from non-participant with 404", async () => {
    const fixture = await insertClubSeasonFixture();
    const owner = await registerSession(app, "owner-post@example.com");
    const bidder = await registerSession(app, "bidder-post@example.com");
    const outsider = await registerSession(app, "outsider-post@example.com");
    const jersey = await saveJerseyForUser(app, owner, fixture);
    const { conversationId } = await createBidConversation(app, owner, bidder, jersey.id);

    const response = await app.inject({
      method: "POST",
      url: `/v1/collection/conversations/${conversationId}/messages`,
      headers: { authorization: `Bearer ${outsider.accessToken}` },
      payload: { text: "Hej" },
    });
    expect(response.statusCode).toBe(404);
  });

  it("the Indbakke response separates waiting from conversations", async () => {
    const fixture = await insertClubSeasonFixture();
    const owner = await registerSession(app, "owner-indbakke@example.com");
    const bidder = await registerSession(app, "bidder-indbakke@example.com");
    const homeJersey = await saveJerseyForUser(app, owner, fixture);
    const awayJersey = await saveJerseyForUser(app, owner, fixture, { type: "away", size: "l" });
    const homeBid = await createBidConversation(app, owner, bidder, homeJersey.id, 300);
    const awayBid = await createBidConversation(app, owner, bidder, awayJersey.id, 450);
    expect(awayBid.conversationId).toBe(homeBid.conversationId);

    const ownerInbox = await getIndbakke(app, owner);

    // One row per incoming pending Bud, newest first, each with its own jersey.
    expect(ownerInbox.waiting).toEqual([
      {
        messageId: awayBid.messageId,
        conversationId: homeBid.conversationId,
        userJerseyId: awayJersey.id,
        bidderHandle: bidder.user.handle,
        amountDkk: 450,
        createdAt: expect.any(String),
        jersey: { clubLabel: "F.C. København", seasonLabel: "2023/24", type: "Ude" },
        thumbUrl: expect.stringMatching(/^\/v1\/collection\/photos\/[0-9a-f-]{36}$/),
      },
      {
        messageId: homeBid.messageId,
        conversationId: homeBid.conversationId,
        userJerseyId: homeJersey.id,
        bidderHandle: bidder.user.handle,
        amountDkk: 300,
        createdAt: expect.any(String),
        jersey: { clubLabel: "F.C. København", seasonLabel: "2023/24", type: "Hjemme" },
        thumbUrl: expect.stringMatching(/^\/v1\/collection\/photos\/[0-9a-f-]{36}$/),
      },
    ]);

    // Still one Conversation per Collector, whose latest event is the newest Bud.
    expect(ownerInbox.conversations).toHaveLength(1);
    expect(ownerInbox.conversations[0]).toMatchObject({
      id: homeBid.conversationId,
      peerHandle: bidder.user.handle,
      peerAvatarUrl: null,
      latest: { kind: "bid", amountDkk: 450, status: "pending", role: "incoming" },
      unread: true,
    });
    // The count is of unread Conversation rows, not of Buds.
    expect(ownerInbox.unreadCount).toBe(1);

    // The bidder waits for an answer; nothing waits for the bidder.
    const bidderInbox = await getIndbakke(app, bidder);
    expect(bidderInbox.waiting).toEqual([]);
    expect(bidderInbox.conversations).toHaveLength(1);
    expect(bidderInbox.conversations[0]?.latest).toEqual({
      kind: "bid",
      amountDkk: 450,
      status: "pending",
      role: "outgoing",
    });
    expect(bidderInbox.conversations[0]?.unread).toBe(false);
    expect(bidderInbox.unreadCount).toBe(0);
  });

  it("leaves waiting once a Bud is accepted or declined", async () => {
    const fixture = await insertClubSeasonFixture();
    const owner = await registerSession(app, "owner-answered@example.com");
    const bidder = await registerSession(app, "bidder-answered@example.com");
    const homeJersey = await saveJerseyForUser(app, owner, fixture);
    const awayJersey = await saveJerseyForUser(app, owner, fixture, { type: "away", size: "l" });
    const homeBid = await createBidConversation(app, owner, bidder, homeJersey.id);
    const awayBid = await createBidConversation(app, owner, bidder, awayJersey.id);

    const respond = (messageId: string, decision: "accept" | "decline") =>
      app.inject({
        method: "PATCH",
        url: `/v1/collection/conversations/${homeBid.conversationId}/messages/${messageId}/bid`,
        headers: { authorization: `Bearer ${owner.accessToken}` },
        payload: { decision },
      });

    expect((await respond(homeBid.messageId, "decline")).statusCode).toBe(200);
    expect((await getIndbakke(app, owner)).waiting.map((row) => row.messageId)).toEqual([
      awayBid.messageId,
    ]);

    expect((await respond(awayBid.messageId, "accept")).statusCode).toBe(200);
    const answered = await getIndbakke(app, owner);
    expect(answered.waiting).toEqual([]);
    expect(answered.conversations[0]?.latest).toEqual({
      kind: "bid",
      amountDkk: 350,
      status: "accepted",
      role: "incoming",
    });
  });

  it("gives the peer Avatar URL only when the peer has a photo", async () => {
    const fixture = await insertClubSeasonFixture();
    const owner = await registerSession(app, "owner-avatar@example.com");
    const bidder = await registerSession(app, "bidder-avatar@example.com");
    const jersey = await saveJerseyForUser(app, owner, fixture);
    await createBidConversation(app, owner, bidder, jersey.id);

    expect((await getIndbakke(app, owner)).conversations[0]?.peerAvatarUrl).toBeNull();

    const { db, pool } = createDb(DATABASE_URL);
    await db
      .update(user)
      .set({ avatarObjectKey: `avatar/${bidder.user.id}.jpg` })
      .where(eq(user.id, bidder.user.id));
    await pool.end();

    expect((await getIndbakke(app, owner)).conversations[0]?.peerAvatarUrl).toBe(
      `/v1/identity/peers/${bidder.user.id}/avatar`,
    );
  });

  it("lets the jersey owner accept a pending bid and blocks the sender", async () => {
    const fixture = await insertClubSeasonFixture();
    const owner = await registerSession(app, "owner-accept@example.com");
    const bidder = await registerSession(app, "bidder-accept@example.com");
    const jersey = await saveJerseyForUser(app, owner, fixture);
    const { conversationId, messageId } = await createBidConversation(
      app,
      owner,
      bidder,
      jersey.id,
    );

    const forbidden = await app.inject({
      method: "PATCH",
      url: `/v1/collection/conversations/${conversationId}/messages/${messageId}/bid`,
      headers: { authorization: `Bearer ${bidder.accessToken}` },
      payload: { decision: "accept" },
    });
    expect(forbidden.statusCode).toBe(403);

    const acceptResponse = await app.inject({
      method: "PATCH",
      url: `/v1/collection/conversations/${conversationId}/messages/${messageId}/bid`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { decision: "accept" },
    });
    expect(acceptResponse.statusCode).toBe(200);
    const acceptBody = collectionRespondBidResponseSchema.parse(JSON.parse(acceptResponse.body));
    expect(acceptBody.bidStatus).toBe("accepted");

    const peerDetail = await app.inject({
      method: "GET",
      url: `/v1/collection/conversations/${conversationId}`,
      headers: {
        authorization: `Bearer ${bidder.accessToken}`,
        "accept-language": "da",
      },
    });
    const peerBody = collectionConversationDetailSchema.parse(JSON.parse(peerDetail.body));
    expect(peerBody.messages[0]?.bidStatus).toBe("accepted");

    const ownerInbox = await getIndbakke(app, owner);
    expect(ownerInbox.waiting).toEqual([]);
    expect(ownerInbox.conversations[0]?.latest).toMatchObject({ kind: "bid", status: "accepted" });
  });

  it("marks the Conversation read when a waiting Bud opens its thread, and the Bud keeps waiting", async () => {
    const fixture = await insertClubSeasonFixture();
    const owner = await registerSession(app, "owner-actread@example.com");
    const bidder = await registerSession(app, "bidder-actread@example.com");
    const jersey = await saveJerseyForUser(app, owner, fixture);
    const { conversationId, messageId } = await createBidConversation(
      app,
      owner,
      bidder,
      jersey.id,
    );

    const before = await getIndbakke(app, owner);
    expect(before.waiting.map((row) => row.messageId)).toEqual([messageId]);
    expect(before.conversations[0]?.unread).toBe(true);
    expect(before.unreadCount).toBe(1);

    await app.inject({
      method: "GET",
      url: `/v1/collection/conversations/${conversationId}`,
      headers: {
        authorization: `Bearer ${owner.accessToken}`,
        "accept-language": "da",
      },
    });

    const after = await getIndbakke(app, owner);
    expect(after.unreadCount).toBe(0);
    expect(after.conversations[0]?.unread).toBe(false);
    // Reading does not answer the Bud.
    expect(after.waiting.map((row) => row.messageId)).toEqual([messageId]);
  });

  it("lands a Bud on a second UserJersey of the same owner in the existing Conversation", async () => {
    const fixture = await insertClubSeasonFixture();
    const owner = await registerSession(app, "owner-pair@example.com");
    const bidder = await registerSession(app, "bidder-pair@example.com");
    const homeJersey = await saveJerseyForUser(app, owner, fixture);
    const awayJersey = await saveJerseyForUser(app, owner, fixture, { type: "away", size: "l" });
    const bidderJersey = await saveJerseyForUser(app, bidder, fixture);

    const first = await createBidConversation(app, owner, bidder, homeJersey.id);
    const second = await createBidConversation(app, owner, bidder, awayJersey.id);
    const reverse = await createBidConversation(app, bidder, owner, bidderJersey.id);

    expect(second.conversationId).toBe(first.conversationId);
    expect(reverse.conversationId).toBe(first.conversationId);

    for (const session of [owner, bidder]) {
      const inbox = await app.inject({
        method: "GET",
        url: "/v1/collection/conversations",
        headers: { authorization: `Bearer ${session.accessToken}` },
      });
      const inboxBody = collectionConversationsSchema.parse(JSON.parse(inbox.body));
      expect(inboxBody.conversations.map((item) => item.id)).toEqual([first.conversationId]);
    }
  });

  it("keeps one Conversation when two first Buds of a pair arrive at once", async () => {
    const fixture = await insertClubSeasonFixture();
    const owner = await registerSession(app, "owner-race@example.com");
    const bidder = await registerSession(app, "bidder-race@example.com");
    const homeJersey = await saveJerseyForUser(app, owner, fixture);
    const awayJersey = await saveJerseyForUser(app, owner, fixture, { type: "away", size: "l" });

    for (const jersey of [homeJersey, awayJersey]) {
      await app.inject({
        method: "PATCH",
        url: `/v1/collection/jerseys/${jersey.id}/bidding`,
        headers: { authorization: `Bearer ${owner.accessToken}` },
        payload: { biddingEnabled: true },
      });
    }

    const responses = await Promise.all(
      [homeJersey, awayJersey].map((jersey) =>
        app.inject({
          method: "POST",
          url: `/v1/collection/jerseys/${jersey.id}/bids`,
          headers: { authorization: `Bearer ${bidder.accessToken}` },
          payload: { amountDkk: 350 },
        }),
      ),
    );
    expect(responses.map((response) => response.statusCode)).toEqual([201, 201]);
    const [first, second] = responses.map((response) =>
      collectionSendBidResponseSchema.parse(JSON.parse(response.body)),
    );

    expect(second!.conversationId).toBe(first!.conversationId);

    const detail = await app.inject({
      method: "GET",
      url: `/v1/collection/conversations/${first!.conversationId}`,
      headers: { authorization: `Bearer ${owner.accessToken}`, "accept-language": "da" },
    });
    expect(detail.statusCode).toBe(200);
    const detailBody = collectionConversationDetailSchema.parse(JSON.parse(detail.body));
    expect(detailBody.messages.map((message) => message.id).sort()).toEqual(
      [first!.messageId, second!.messageId].sort(),
    );
  });

  it("refuses a second Bud on a UserJersey while one is pending and accepts a new one after a decline", async () => {
    const fixture = await insertClubSeasonFixture();
    const owner = await registerSession(app, "owner-pending@example.com");
    const bidder = await registerSession(app, "bidder-pending@example.com");
    const homeJersey = await saveJerseyForUser(app, owner, fixture);
    const awayJersey = await saveJerseyForUser(app, owner, fixture, { type: "away", size: "l" });
    const { conversationId, messageId } = await createBidConversation(
      app,
      owner,
      bidder,
      homeJersey.id,
    );

    const sendBid = (jerseyId: string) =>
      app.inject({
        method: "POST",
        url: `/v1/collection/jerseys/${jerseyId}/bids`,
        headers: { authorization: `Bearer ${bidder.accessToken}` },
        payload: { amountDkk: 400 },
      });
    const messageCount = async () => {
      const detail = await app.inject({
        method: "GET",
        url: `/v1/collection/conversations/${conversationId}`,
        headers: { authorization: `Bearer ${bidder.accessToken}`, "accept-language": "da" },
      });
      return collectionConversationDetailSchema.parse(JSON.parse(detail.body)).messages.length;
    };

    expect((await sendBid(homeJersey.id)).statusCode).toBe(409);
    expect(await messageCount()).toBe(1);

    // The pending Bud blocks its own UserJersey only.
    await createBidConversation(app, owner, bidder, awayJersey.id);
    expect(await messageCount()).toBe(2);

    const decline = await app.inject({
      method: "PATCH",
      url: `/v1/collection/conversations/${conversationId}/messages/${messageId}/bid`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { decision: "decline" },
    });
    expect(decline.statusCode).toBe(200);

    expect((await sendBid(homeJersey.id)).statusCode).toBe(201);
    expect(await messageCount()).toBe(3);
  });

  it("exposes the UserJersey of each message in a thread that spans several jerseys", async () => {
    const fixture = await insertClubSeasonFixture();
    const owner = await registerSession(app, "owner-jersey@example.com");
    const bidder = await registerSession(app, "bidder-jersey@example.com");
    const homeJersey = await saveJerseyForUser(app, owner, fixture);
    const awayJersey = await saveJerseyForUser(app, owner, fixture, { type: "away", size: "l" });
    const homeBid = await createBidConversation(app, owner, bidder, homeJersey.id);
    const awayBid = await createBidConversation(app, owner, bidder, awayJersey.id);

    const sendText = async (text: string) => {
      const response = await app.inject({
        method: "POST",
        url: `/v1/collection/conversations/${homeBid.conversationId}/messages`,
        headers: { authorization: `Bearer ${bidder.accessToken}` },
        payload: { text },
      });
      return collectionSendMessageResponseSchema.parse(JSON.parse(response.body)).messageId;
    };
    const plainTextId = await sendText("Hej");
    const jerseyTextId = await sendText("Er den stadig til salg?");

    // Nothing writes a UserJersey on an ordinary message yet; the read side already serves one.
    const { db, pool } = createDb(DATABASE_URL);
    await db
      .update(conversationMessage)
      .set({
        userJerseyId: awayJersey.id,
        jerseyClubId: fixture.clubId,
        jerseySeasonId: fixture.seasonId,
        jerseyType: "away",
        jerseySize: "l",
      })
      .where(eq(conversationMessage.id, jerseyTextId));
    await pool.end();

    const response = await app.inject({
      method: "GET",
      url: `/v1/collection/conversations/${homeBid.conversationId}`,
      headers: { authorization: `Bearer ${owner.accessToken}`, "accept-language": "da" },
    });
    expect(response.statusCode).toBe(200);
    const detail = collectionConversationDetailSchema.parse(JSON.parse(response.body));
    const jerseyOf = (messageId: string) =>
      detail.messages.find((message) => message.id === messageId)?.jersey;

    const showcaseThumb = expect.stringMatching(/^\/v1\/collection\/showcase\/photos\//);
    const awayJerseyCard = {
      userJerseyId: awayJersey.id,
      thumbUrl: showcaseThumb,
      openForBid: true,
      clubLabel: "F.C. København",
      seasonLabel: "2023/24",
      type: "away",
      size: "l",
    };
    expect(jerseyOf(homeBid.messageId)).toEqual({
      userJerseyId: homeJersey.id,
      thumbUrl: showcaseThumb,
      openForBid: true,
      clubLabel: "F.C. København",
      seasonLabel: "2023/24",
      type: "home",
      size: "m",
    });
    expect(jerseyOf(awayBid.messageId)).toEqual(awayJerseyCard);
    expect(jerseyOf(jerseyTextId)).toEqual(awayJerseyCard);
    expect(jerseyOf(plainTextId)).toBeUndefined();
  });

  it("keeps the Conversation and declines pending Buds when their UserJersey is deleted", async () => {
    const fixture = await insertClubSeasonFixture();
    const owner = await registerSession(app, "owner-delete@example.com");
    const bidder = await registerSession(app, "bidder-delete@example.com");
    const homeJersey = await saveJerseyForUser(app, owner, fixture);
    const awayJersey = await saveJerseyForUser(app, owner, fixture, { type: "away", size: "l" });
    const homeBid = await createBidConversation(app, owner, bidder, homeJersey.id);
    const awayBid = await createBidConversation(app, owner, bidder, awayJersey.id);
    await app.inject({
      method: "POST",
      url: `/v1/collection/conversations/${homeBid.conversationId}/messages`,
      headers: { authorization: `Bearer ${bidder.accessToken}` },
      payload: { text: "Hej" },
    });

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/v1/collection/jerseys/${homeJersey.id}`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
    });
    expect(deleteResponse.statusCode).toBe(204);

    for (const session of [owner, bidder]) {
      const inboxBody = await getIndbakke(app, session);
      expect(inboxBody.conversations.map((item) => item.id)).toEqual([homeBid.conversationId]);
      expect(inboxBody.conversations[0]?.latest).toEqual({ kind: "text", text: "Hej" });
    }

    const response = await app.inject({
      method: "GET",
      url: `/v1/collection/conversations/${homeBid.conversationId}`,
      headers: { authorization: `Bearer ${bidder.accessToken}`, "accept-language": "da" },
    });
    const detail = collectionConversationDetailSchema.parse(JSON.parse(response.body));
    expect(detail.messages).toHaveLength(3);

    const deletedJerseyBid = detail.messages.find((message) => message.id === homeBid.messageId);
    expect(deletedJerseyBid?.bidStatus).toBe("declined");
    expect(deletedJerseyBid?.jersey).toEqual({
      userJerseyId: null,
      thumbUrl: null,
      openForBid: false,
      clubLabel: "F.C. København",
      seasonLabel: "2023/24",
      type: "home",
      size: "m",
    });

    const otherJerseyBid = detail.messages.find((message) => message.id === awayBid.messageId);
    expect(otherJerseyBid?.bidStatus).toBe("pending");
    expect(otherJerseyBid?.jersey?.userJerseyId).toBe(awayJersey.id);
  });

  it("refuses a response to a Bud whose UserJersey is gone", async () => {
    const fixture = await insertClubSeasonFixture();
    const owner = await registerSession(app, "owner-gone@example.com");
    const bidder = await registerSession(app, "bidder-gone@example.com");
    const jersey = await saveJerseyForUser(app, owner, fixture);
    const { conversationId, messageId } = await createBidConversation(
      app,
      owner,
      bidder,
      jersey.id,
    );

    // What the database does to the Bud when its UserJersey is removed outside the owner's delete.
    const { db, pool } = createDb(DATABASE_URL);
    await db
      .update(conversationMessage)
      .set({ userJerseyId: null })
      .where(eq(conversationMessage.id, messageId));
    await pool.end();

    const response = await app.inject({
      method: "PATCH",
      url: `/v1/collection/conversations/${conversationId}/messages/${messageId}/bid`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { decision: "accept" },
    });
    expect(response.statusCode).toBe(400);
  });

  it("lists every waiting Bud of a thread with its own jersey line and drops a deleted jersey", async () => {
    const fixture = await insertClubSeasonFixture();
    const owner = await registerSession(app, "owner-lines@example.com");
    const bidder = await registerSession(app, "bidder-lines@example.com");
    const homeJersey = await saveJerseyForUser(app, owner, fixture);
    const awayJersey = await saveJerseyForUser(app, owner, fixture, { type: "away", size: "l" });
    const homeBid = await createBidConversation(app, owner, bidder, homeJersey.id);
    const awayBid = await createBidConversation(app, owner, bidder, awayJersey.id);

    const before = await getIndbakke(app, owner);
    expect(
      before.waiting.map((row) => [
        row.messageId,
        `${row.jersey.clubLabel} · ${row.jersey.seasonLabel} · ${row.jersey.type}`,
        row.userJerseyId,
      ]),
    ).toEqual([
      [awayBid.messageId, "F.C. København · 2023/24 · Ude", awayJersey.id],
      [homeBid.messageId, "F.C. København · 2023/24 · Hjemme", homeJersey.id],
    ]);
    expect(before.unreadCount).toBe(1);

    await app.inject({
      method: "DELETE",
      url: `/v1/collection/jerseys/${homeJersey.id}`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
    });

    // Deleting declines the Bud on that jersey: it leaves waiting, the thread stays.
    const afterDelete = await getIndbakke(app, owner);
    expect(afterDelete.waiting.map((row) => row.messageId)).toEqual([awayBid.messageId]);
    expect(afterDelete.conversations.map((row) => row.id)).toEqual([homeBid.conversationId]);
  });

  it("keeps a waiting Bud without a thumb when its UserJersey link is gone", async () => {
    const fixture = await insertClubSeasonFixture();
    const owner = await registerSession(app, "owner-nothumb@example.com");
    const bidder = await registerSession(app, "bidder-nothumb@example.com");
    const jersey = await saveJerseyForUser(app, owner, fixture);
    const { messageId } = await createBidConversation(app, owner, bidder, jersey.id);

    const { db, pool } = createDb(DATABASE_URL);
    await db
      .update(conversationMessage)
      .set({ userJerseyId: null })
      .where(eq(conversationMessage.id, messageId));
    await pool.end();

    const inbox = await getIndbakke(app, owner);
    expect(inbox.waiting).toHaveLength(1);
    expect(inbox.waiting[0]).toMatchObject({ messageId, userJerseyId: null, thumbUrl: null });
  });

  it("serves the photo of an image message whose bytes sit under another Conversation id", async () => {
    const fixture = await insertClubSeasonFixture();
    const owner = await registerSession(app, "owner-photo@example.com");
    const bidder = await registerSession(app, "bidder-photo@example.com");
    const outsider = await registerSession(app, "outsider-photo@example.com");
    const jersey = await saveJerseyForUser(app, owner, fixture);
    const { conversationId } = await createBidConversation(app, owner, bidder, jersey.id);

    // A message of a merged thread keeps the key it was stored under.
    const messageId = randomUUID();
    const imageObjectKey = `conversation/${randomUUID()}/${messageId}.jpg`;
    await app
      .get<ObjectStoreAdapter>(OBJECT_STORE)
      .putObject(imageObjectKey, Buffer.from(JPEG_BASE64, "base64"));
    const { db, pool } = createDb(DATABASE_URL);
    await db.insert(conversationMessage).values({
      id: messageId,
      conversationId,
      senderId: bidder.user.id,
      kind: "image",
      imageObjectKey,
    });
    await pool.end();

    const photoUrl = `/v1/collection/conversations/${conversationId}/messages/${messageId}/photo`;
    const served = await app.inject({
      method: "GET",
      url: photoUrl,
      headers: { authorization: `Bearer ${owner.accessToken}` },
    });
    expect(served.statusCode).toBe(200);
    expect(served.headers["content-type"]).toContain("image/jpeg");

    const refused = await app.inject({
      method: "GET",
      url: photoUrl,
      headers: { authorization: `Bearer ${outsider.accessToken}` },
    });
    expect(refused.statusCode).toBe(404);
  });

  it("no longer serves a separate activity list", async () => {
    const registered = await registerSession(app, "inbox-no-activity@example.com");
    const response = await app.inject({
      method: "GET",
      url: "/v1/collection/activity",
      headers: { authorization: `Bearer ${registered.accessToken}` },
    });
    expect(response.statusCode).toBe(404);
  });
});
