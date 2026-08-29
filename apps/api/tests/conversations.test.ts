import "reflect-metadata";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectionConversationDetailSchema,
  collectionConversationsSchema,
  collectionSaveResponseSchema,
  collectionSendBidResponseSchema,
  collectionSendMessageResponseSchema,
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
    expect(body).toEqual({ conversations: [], unreadCount: 0 });
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
    expect(detail.jerseyContext?.clubLabel).toBe("F.C. København");
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
    expect(inboxBody.conversations[0]?.snippet).toBe("Tak for buddet");
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
});
