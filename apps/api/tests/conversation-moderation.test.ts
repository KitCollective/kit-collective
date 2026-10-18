import "reflect-metadata";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectionBlockConversationResponseSchema,
  collectionBlockPeerResponseSchema,
  collectionConversationPeerSchema,
  collectionConversationsSchema,
  collectionPeerJerseySchema,
  collectionReportConversationResponseSchema,
  collectionReportPeerResponseSchema,
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
  user,
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

async function getInbox(
  app: NestFastifyApplication,
  session: Awaited<ReturnType<typeof registerSession>>,
) {
  const response = await app.inject({
    method: "GET",
    url: "/v1/collection/conversations",
    headers: { authorization: `Bearer ${session.accessToken}` },
  });
  return collectionConversationsSchema.parse(JSON.parse(response.body));
}

async function createBidConversation(
  app: NestFastifyApplication,
  owner: Awaited<ReturnType<typeof registerSession>>,
  bidder: Awaited<ReturnType<typeof registerSession>>,
  jerseyId: string,
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
    payload: { amountDkk: 350 },
  });
  expect(bidResponse.statusCode).toBe(201);
  return collectionSendBidResponseSchema.parse(JSON.parse(bidResponse.body));
}

describe("Conversation moderation /v1", () => {
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

  it("rejects moderation actions without session with 401", async () => {
    const conversationId = "00000000-0000-0000-0000-000000000099";

    expect(
      (
        await app.inject({
          method: "POST",
          url: `/v1/moderation/conversations/${conversationId}/report`,
          payload: {},
        })
      ).statusCode,
    ).toBe(401);

    expect(
      (
        await app.inject({
          method: "POST",
          url: `/v1/moderation/conversations/${conversationId}/block`,
        })
      ).statusCode,
    ).toBe(401);

    expect(
      (
        await app.inject({
          method: "DELETE",
          url: `/v1/collection/conversations/${conversationId}`,
        })
      ).statusCode,
    ).toBe(401);
  });

  it("persists a report and returns 201", async () => {
    const fixture = await insertClubSeasonFixture();
    const owner = await registerSession(app, "owner-report@example.com");
    const bidder = await registerSession(app, "bidder-report@example.com");
    const jersey = await saveJerseyForUser(app, owner, fixture);
    const { conversationId } = await createBidConversation(app, owner, bidder, jersey.id);

    const response = await app.inject({
      method: "POST",
      url: `/v1/moderation/conversations/${conversationId}/report`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { reason: "Upassende adfærd" },
    });

    expect(response.statusCode).toBe(201);
    collectionReportConversationResponseSchema.parse(JSON.parse(response.body));
  });

  it("hides a conversation only for the deleter", async () => {
    const fixture = await insertClubSeasonFixture();
    const owner = await registerSession(app, "owner-hide@example.com");
    const bidder = await registerSession(app, "bidder-hide@example.com");
    const jersey = await saveJerseyForUser(app, owner, fixture);
    const { conversationId } = await createBidConversation(app, owner, bidder, jersey.id);

    const hideResponse = await app.inject({
      method: "DELETE",
      url: `/v1/collection/conversations/${conversationId}`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
    });
    expect(hideResponse.statusCode).toBe(204);

    const ownerInbox = await app.inject({
      method: "GET",
      url: "/v1/collection/conversations",
      headers: { authorization: `Bearer ${owner.accessToken}` },
    });
    const ownerBody = collectionConversationsSchema.parse(JSON.parse(ownerInbox.body));
    expect(ownerBody.conversations).toHaveLength(0);
    expect(ownerBody.waiting).toHaveLength(0);
    expect(ownerBody.unreadCount).toBe(0);

    const bidderInbox = await app.inject({
      method: "GET",
      url: "/v1/collection/conversations",
      headers: { authorization: `Bearer ${bidder.accessToken}` },
    });
    const bidderBody = collectionConversationsSchema.parse(JSON.parse(bidderInbox.body));
    expect(bidderBody.conversations).toHaveLength(1);
    expect(bidderBody.conversations[0]?.id).toBe(conversationId);
  });

  // The owner reads the thread, then hides it, so a return can only come from something new.
  async function readThenHide(
    session: Awaited<ReturnType<typeof registerSession>>,
    conversationId: string,
  ) {
    const read = await app.inject({
      method: "GET",
      url: `/v1/collection/conversations/${conversationId}`,
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    expect(read.statusCode).toBe(200);

    const hide = await app.inject({
      method: "DELETE",
      url: `/v1/collection/conversations/${conversationId}`,
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    expect(hide.statusCode).toBe(204);
    expect(await listInbox(session)).toEqual([]);
  }

  async function listInbox(session: Awaited<ReturnType<typeof registerSession>>) {
    const inbox = await app.inject({
      method: "GET",
      url: "/v1/collection/conversations",
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    return collectionConversationsSchema.parse(JSON.parse(inbox.body)).conversations;
  }

  it("a hidden Conversation returns unread when the other Collector writes", async () => {
    const fixture = await insertClubSeasonFixture();
    const owner = await registerSession(app, "owner-unhide-msg@example.com");
    const bidder = await registerSession(app, "bidder-unhide-msg@example.com");
    const jersey = await saveJerseyForUser(app, owner, fixture);
    const { conversationId } = await createBidConversation(app, owner, bidder, jersey.id);
    await readThenHide(owner, conversationId);

    const send = await app.inject({
      method: "POST",
      url: `/v1/collection/conversations/${conversationId}/messages`,
      headers: { authorization: `Bearer ${bidder.accessToken}` },
      payload: { text: "Er den stadig til salg?" },
    });
    expect(send.statusCode).toBe(201);

    const inbox = await listInbox(owner);
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toMatchObject({ id: conversationId, unread: true });
  });

  it("a hidden Conversation returns unread when the other Collector sends a Bud", async () => {
    const fixture = await insertClubSeasonFixture();
    const owner = await registerSession(app, "owner-unhide-bid@example.com");
    const bidder = await registerSession(app, "bidder-unhide-bid@example.com");
    const first = await saveJerseyForUser(app, owner, fixture);
    const second = await saveJerseyForUser(app, owner, fixture);
    const { conversationId } = await createBidConversation(app, owner, bidder, first.id);
    await readThenHide(owner, conversationId);

    await app.inject({
      method: "PATCH",
      url: `/v1/collection/jerseys/${second.id}/bidding`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { biddingEnabled: true },
    });
    const bid = await app.inject({
      method: "POST",
      url: `/v1/collection/jerseys/${second.id}/bids`,
      headers: { authorization: `Bearer ${bidder.accessToken}` },
      payload: { amountDkk: 400 },
    });
    expect(bid.statusCode).toBe(201);
    expect(collectionSendBidResponseSchema.parse(JSON.parse(bid.body)).conversationId).toBe(
      conversationId,
    );

    const inbox = await listInbox(owner);
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toMatchObject({ id: conversationId, unread: true });
  });

  it("declining a Bud writes no message and leaves a hidden Conversation hidden", async () => {
    const fixture = await insertClubSeasonFixture();
    const owner = await registerSession(app, "owner-unhide-decline@example.com");
    const bidder = await registerSession(app, "bidder-unhide-decline@example.com");
    const jersey = await saveJerseyForUser(app, owner, fixture);
    const { conversationId, messageId } = await createBidConversation(
      app,
      owner,
      bidder,
      jersey.id,
    );
    await readThenHide(bidder, conversationId);

    const decline = await app.inject({
      method: "PATCH",
      url: `/v1/collection/conversations/${conversationId}/messages/${messageId}/bid`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { decision: "decline" },
    });
    expect(decline.statusCode).toBe(200);

    expect(await listInbox(bidder)).toEqual([]);
  });

  it("blocks a peer and hides the thread for both collectors", async () => {
    const fixture = await insertClubSeasonFixture();
    const owner = await registerSession(app, "owner-block@example.com");
    const bidder = await registerSession(app, "bidder-block@example.com");
    const jersey = await saveJerseyForUser(app, owner, fixture);
    const { conversationId, messageId } = await createBidConversation(
      app,
      owner,
      bidder,
      jersey.id,
    );

    const ownerBefore = await getInbox(app, owner);
    expect(ownerBefore.waiting.map((row) => row.messageId)).toEqual([messageId]);
    expect(ownerBefore.conversations).toHaveLength(1);
    expect((await getInbox(app, bidder)).conversations).toHaveLength(1);

    const blockResponse = await app.inject({
      method: "POST",
      url: `/v1/moderation/conversations/${conversationId}/block`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
    });
    expect(blockResponse.statusCode).toBe(201);
    collectionBlockConversationResponseSchema.parse(JSON.parse(blockResponse.body));

    for (const session of [owner, bidder]) {
      const inbox = await app.inject({
        method: "GET",
        url: "/v1/collection/conversations",
        headers: { authorization: `Bearer ${session.accessToken}` },
      });
      const body = collectionConversationsSchema.parse(JSON.parse(inbox.body));
      expect(body.conversations).toHaveLength(0);
      expect(body.waiting).toHaveLength(0);
      expect(body.unreadCount).toBe(0);

      const messageResponse = await app.inject({
        method: "POST",
        url: `/v1/collection/conversations/${conversationId}/messages`,
        headers: { authorization: `Bearer ${session.accessToken}` },
        payload: { text: "Hej" },
      });
      expect(messageResponse.statusCode).toBe(404);
    }

    const respondBidResponse = await app.inject({
      method: "PATCH",
      url: `/v1/collection/conversations/${conversationId}/messages/${messageId}/bid`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { decision: "accept" },
    });
    expect(respondBidResponse.statusCode).toBe(404);
  });

  it("returns peer stub with jersey count and optional city", async () => {
    const fixture = await insertClubSeasonFixture();
    const owner = await registerSession(app, "owner-peer@example.com");
    const bidder = await registerSession(app, "bidder-peer@example.com");
    const jersey = await saveJerseyForUser(app, owner, fixture);
    const { conversationId } = await createBidConversation(app, owner, bidder, jersey.id);

    const { db, pool } = createDb(DATABASE_URL);
    await db
      .update(user)
      .set({ city: "Aarhus", showCity: true })
      .where(eq(user.email, "bidder-peer@example.com"));
    await pool.end();

    const response = await app.inject({
      method: "GET",
      url: `/v1/collection/conversations/${conversationId}/peer`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const peer = collectionConversationPeerSchema.parse(JSON.parse(response.body));
    expect(peer.peerId).toBeTruthy();
    expect(peer.handle).toBeTruthy();
    expect(peer.jerseyCount).toBe(0);
    expect(peer.city).toBe("Aarhus");
  });

  it("reports a peer without a conversation thread", async () => {
    const fixture = await insertClubSeasonFixture();
    const owner = await registerSession(app, "owner-peer-report@example.com");
    const viewer = await registerSession(app, "viewer-peer-report@example.com");
    const jersey = await saveJerseyForUser(app, owner, fixture);

    const peerResponse = await app.inject({
      method: "GET",
      url: `/v1/collection/jerseys/${jersey.id}/peer`,
      headers: { authorization: `Bearer ${viewer.accessToken}`, "accept-language": "da" },
    });
    expect(peerResponse.statusCode).toBe(200);
    const peerBody = collectionPeerJerseySchema.parse(JSON.parse(peerResponse.body));

    const response = await app.inject({
      method: "POST",
      url: `/v1/moderation/peers/${peerBody.ownerId}/report`,
      headers: { authorization: `Bearer ${viewer.accessToken}` },
      payload: { reason: "Upassende profil" },
    });

    expect(response.statusCode).toBe(201);
    collectionReportPeerResponseSchema.parse(JSON.parse(response.body));
  });

  it("blocks a peer without a conversation thread", async () => {
    const fixture = await insertClubSeasonFixture();
    const owner = await registerSession(app, "owner-peer-block@example.com");
    const viewer = await registerSession(app, "viewer-peer-block@example.com");
    const jersey = await saveJerseyForUser(app, owner, fixture);

    const peerResponse = await app.inject({
      method: "GET",
      url: `/v1/collection/jerseys/${jersey.id}/peer`,
      headers: { authorization: `Bearer ${viewer.accessToken}`, "accept-language": "da" },
    });
    expect(peerResponse.statusCode).toBe(200);
    const peerBody = collectionPeerJerseySchema.parse(JSON.parse(peerResponse.body));

    const blockResponse = await app.inject({
      method: "POST",
      url: `/v1/moderation/peers/${peerBody.ownerId}/block`,
      headers: { authorization: `Bearer ${viewer.accessToken}` },
    });
    expect(blockResponse.statusCode).toBe(201);
    collectionBlockPeerResponseSchema.parse(JSON.parse(blockResponse.body));

    const hiddenPeerGet = await app.inject({
      method: "GET",
      url: `/v1/collection/jerseys/${jersey.id}/peer`,
      headers: { authorization: `Bearer ${viewer.accessToken}`, "accept-language": "da" },
    });
    expect(hiddenPeerGet.statusCode).toBe(404);
  });
});
