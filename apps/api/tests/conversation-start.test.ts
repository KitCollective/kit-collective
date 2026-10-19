import "reflect-metadata";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectionConversationDetailSchema,
  collectionConversationPeerSchema,
  collectionConversationsSchema,
  collectionSaveResponseSchema,
  collectionSendBidResponseSchema,
  collectionSendMessageResponseSchema,
  identitySessionSchema,
} from "@kit/api-contract";
import {
  catalogLabel,
  club,
  conversation,
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

async function getInbox(
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

type Session = Awaited<ReturnType<typeof registerSession>>;

async function conversationCount() {
  const { db, pool } = createDb(DATABASE_URL);
  const rows = await db.select({ id: conversation.id }).from(conversation);
  await pool.end();
  return rows.length;
}

describe("Starting a Conversation without a Bud /v1", () => {
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

  const as = (session: Session) => ({ authorization: `Bearer ${session.accessToken}` });

  const lookup = async (viewer: Session, peerId: string) => {
    const response = await app.inject({
      method: "GET",
      url: `/v1/collection/peers/${peerId}/conversation`,
      headers: as(viewer),
    });
    return response;
  };

  const sendToPeer = (sender: Session, peerId: string, payload: Record<string, unknown>) =>
    app.inject({
      method: "POST",
      url: `/v1/collection/peers/${peerId}/messages`,
      headers: as(sender),
      payload,
    });

  const detailOf = async (viewer: Session, conversationId: string) => {
    const response = await app.inject({
      method: "GET",
      url: `/v1/collection/conversations/${conversationId}`,
      headers: { ...as(viewer), "accept-language": "da" },
    });
    expect(response.statusCode).toBe(200);
    return collectionConversationDetailSchema.parse(JSON.parse(response.body));
  };

  const block = async (blocker: Session, peerId: string) => {
    const response = await app.inject({
      method: "POST",
      url: `/v1/moderation/peers/${peerId}/block`,
      headers: as(blocker),
    });
    expect(response.statusCode).toBe(201);
  };

  it("a first message to a peer from a jersey creates one Conversation, listed under conversations for both, and the receiver's detail carries that jersey", async () => {
    const fixture = await insertClubSeasonFixture();
    const owner = await registerSession(app, "owner-start@example.com");
    const writer = await registerSession(app, "writer-start@example.com");
    const jersey = await saveJerseyForUser(app, owner, fixture);

    const response = await sendToPeer(writer, owner.user.id, {
      text: "Er den stadig til salg?",
      userJerseyId: jersey.id,
    });
    expect(response.statusCode).toBe(201);
    const sent = collectionSendMessageResponseSchema.parse(JSON.parse(response.body));

    const ownerInbox = await getInbox(app, owner);
    const writerInbox = await getInbox(app, writer);
    expect(ownerInbox.conversations.map((item) => item.id)).toEqual([sent.conversationId]);
    expect(writerInbox.conversations.map((item) => item.id)).toEqual([sent.conversationId]);
    // A message is not a Bud: nothing waits for the owner.
    expect(ownerInbox.waiting).toEqual([]);

    const detail = await detailOf(owner, sent.conversationId);
    const message = detail.messages.find((item) => item.id === sent.messageId);
    expect(message).toMatchObject({
      kind: "text",
      role: "incoming",
      text: "Er den stadig til salg?",
    });
    expect(message?.jersey).toEqual({
      userJerseyId: jersey.id,
      thumbUrl: expect.stringMatching(/^\/v1\/collection\/showcase\/photos\//),
      openForBid: false,
      clubLabel: "F.C. København",
      seasonLabel: "2023/24",
      type: "home",
      size: "m",
    });
  });

  it("looks a peer up without creating a Conversation", async () => {
    const owner = await registerSession(app, "owner-lookup@example.com");
    const viewer = await registerSession(app, "viewer-lookup@example.com");

    const response = await lookup(viewer, owner.user.id);
    expect(response.statusCode).toBe(200);
    const peer = collectionConversationPeerSchema.parse(JSON.parse(response.body));
    expect(peer).toMatchObject({
      peerId: owner.user.id,
      handle: owner.user.handle,
      jerseyCount: 0,
      avatarUrl: null,
      conversationId: null,
    });

    expect((await getInbox(app, viewer)).conversations).toEqual([]);
    expect((await getInbox(app, owner)).conversations).toEqual([]);
  });

  it("looks up the existing Conversation of a Bud and lands a profile message in it", async () => {
    const fixture = await insertClubSeasonFixture();
    const owner = await registerSession(app, "owner-existing@example.com");
    const bidder = await registerSession(app, "bidder-existing@example.com");
    const jersey = await saveJerseyForUser(app, owner, fixture);
    const bid = await createBidConversation(app, owner, bidder, jersey.id);

    const peer = collectionConversationPeerSchema.parse(
      JSON.parse((await lookup(bidder, owner.user.id)).body),
    );
    expect(peer.conversationId).toBe(bid.conversationId);
    expect(peer.jerseyCount).toBe(1);

    const response = await sendToPeer(bidder, owner.user.id, { text: "Hej igen" });
    expect(response.statusCode).toBe(201);
    const sent = collectionSendMessageResponseSchema.parse(JSON.parse(response.body));
    expect(sent.conversationId).toBe(bid.conversationId);

    const detail = await detailOf(owner, bid.conversationId);
    const message = detail.messages.find((item) => item.id === sent.messageId);
    expect(message?.text).toBe("Hej igen");
    expect(message?.jersey).toBeUndefined();
    expect((await getInbox(app, owner)).conversations).toHaveLength(1);
  });

  it("refuses a message when either Collector blocked the other, and creates nothing", async () => {
    const before = await conversationCount();
    const sender = await registerSession(app, "sender-blocked@example.com");
    const peer = await registerSession(app, "peer-blocked@example.com");
    const other = await registerSession(app, "other-blocked@example.com");

    await block(sender, peer.user.id);
    expect((await sendToPeer(sender, peer.user.id, { text: "Hej" })).statusCode).toBe(403);
    expect((await lookup(sender, peer.user.id)).statusCode).toBe(404);

    await block(other, sender.user.id);
    expect((await sendToPeer(sender, other.user.id, { text: "Hej" })).statusCode).toBe(403);
    expect((await sendToPeer(peer, sender.user.id, { text: "Hej" })).statusCode).toBe(403);

    expect(await conversationCount()).toBe(before);
  });

  it("refuses a message to oneself and to an unknown Collector", async () => {
    const before = await conversationCount();
    const session = await registerSession(app, "self-message@example.com");

    expect((await sendToPeer(session, session.user.id, { text: "Hej" })).statusCode).toBe(403);
    expect((await lookup(session, session.user.id)).statusCode).toBe(404);
    expect((await sendToPeer(session, randomUUID(), { text: "Hej" })).statusCode).toBe(404);
    expect((await lookup(session, randomUUID())).statusCode).toBe(404);
    expect((await lookup(session, "not-a-uuid")).statusCode).toBe(404);

    expect(await conversationCount()).toBe(before);
  });

  it("refuses a private jersey and a jersey the peer does not own, and creates nothing", async () => {
    const before = await conversationCount();
    const fixture = await insertClubSeasonFixture();
    const owner = await registerSession(app, "owner-refuse@example.com");
    const writer = await registerSession(app, "writer-refuse@example.com");
    const stranger = await registerSession(app, "stranger-refuse@example.com");
    const privateJersey = await saveJerseyForUser(app, owner, fixture);
    const strangerJersey = await saveJerseyForUser(app, stranger, fixture);

    const privatePatch = await app.inject({
      method: "PATCH",
      url: `/v1/collection/jerseys/${privateJersey.id}/private`,
      headers: as(owner),
      payload: { private: true },
    });
    expect(privatePatch.statusCode).toBe(200);

    for (const userJerseyId of [privateJersey.id, strangerJersey.id, randomUUID()]) {
      const response = await sendToPeer(writer, owner.user.id, { text: "Hej", userJerseyId });
      expect(response.statusCode).toBe(400);
    }

    expect(await conversationCount()).toBe(before);
    expect((await getInbox(app, writer)).conversations).toEqual([]);
  });

  it("validates userJerseyId on the per-Conversation endpoint the same way and keeps its snapshot", async () => {
    const fixture = await insertClubSeasonFixture();
    const owner = await registerSession(app, "owner-perconv@example.com");
    const bidder = await registerSession(app, "bidder-perconv@example.com");
    const homeJersey = await saveJerseyForUser(app, owner, fixture);
    const awayJersey = await saveJerseyForUser(app, owner, fixture, { type: "away", size: "l" });
    const bidderJersey = await saveJerseyForUser(app, bidder, fixture);
    const { conversationId } = await createBidConversation(app, owner, bidder, homeJersey.id);
    const post = (userJerseyId: string) =>
      app.inject({
        method: "POST",
        url: `/v1/collection/conversations/${conversationId}/messages`,
        headers: as(bidder),
        payload: { text: "Og den her?", userJerseyId },
      });

    // The sender's own jersey is not the peer's.
    expect((await post(bidderJersey.id)).statusCode).toBe(400);
    expect((await post(randomUUID())).statusCode).toBe(400);

    const ok = await post(awayJersey.id);
    expect(ok.statusCode).toBe(201);
    const sent = collectionSendMessageResponseSchema.parse(JSON.parse(ok.body));
    expect(sent.conversationId).toBe(conversationId);

    const detail = await detailOf(owner, conversationId);
    expect(detail.messages.find((item) => item.id === sent.messageId)?.jersey).toMatchObject({
      userJerseyId: awayJersey.id,
      type: "away",
      size: "l",
    });
  });

  it("looks up null for a thread the viewer hid, and a send brings it back", async () => {
    const fixture = await insertClubSeasonFixture();
    const owner = await registerSession(app, "owner-hidden@example.com");
    const bidder = await registerSession(app, "bidder-hidden@example.com");
    const jersey = await saveJerseyForUser(app, owner, fixture);
    const bid = await createBidConversation(app, owner, bidder, jersey.id);

    const hide = await app.inject({
      method: "DELETE",
      url: `/v1/collection/conversations/${bid.conversationId}`,
      headers: as(bidder),
    });
    expect(hide.statusCode).toBe(204);
    expect((await getInbox(app, bidder)).conversations).toEqual([]);

    const peer = collectionConversationPeerSchema.parse(
      JSON.parse((await lookup(bidder, owner.user.id)).body),
    );
    expect(peer.conversationId).toBeNull();
    // The lookup is read-only: the thread stays hidden.
    expect((await getInbox(app, bidder)).conversations).toEqual([]);

    const sent = collectionSendMessageResponseSchema.parse(
      JSON.parse((await sendToPeer(bidder, owner.user.id, { text: "Tilbage" })).body),
    );
    expect(sent.conversationId).toBe(bid.conversationId);
    expect((await getInbox(app, bidder)).conversations.map((item) => item.id)).toEqual([
      bid.conversationId,
    ]);
  });

  it("gives the peer Avatar URL and shared city on the lookup, like the Conversation peer", async () => {
    const owner = await registerSession(app, "owner-summary@example.com");
    const viewer = await registerSession(app, "viewer-summary@example.com");
    const { db, pool } = createDb(DATABASE_URL);
    await db
      .update(user)
      .set({ city: "Aarhus", showCity: true, avatarObjectKey: "avatars/test.jpg" })
      .where(eq(user.id, owner.user.id));
    await pool.end();

    const peer = collectionConversationPeerSchema.parse(
      JSON.parse((await lookup(viewer, owner.user.id)).body),
    );
    expect(peer.city).toBe("Aarhus");
    expect(peer.avatarUrl).toBe(`/v1/identity/peers/${owner.user.id}/avatar`);
  });
});
