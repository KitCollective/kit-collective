import "reflect-metadata";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  type CollectionConversationDetail,
  collectionConversationDetailSchema,
  collectionConversationsSchema,
  collectionJerseysSchema,
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
} from "@kit/db";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
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

type Session = ReturnType<typeof identitySessionSchema.parse>;
type Fixture = { clubId: string; seasonId: string };

const SNAPSHOT = {
  clubLabel: "F.C. København",
  seasonLabel: "2023/24",
  type: "home",
  size: "m",
} as const;

async function insertClubSeasonFixture(): Promise<Fixture> {
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
  await db.insert(teamSeason).values({ clubId: insertedClub!.id, seasonId: insertedSeason!.id });
  const label = { locale: "da", kind: "label", source: "seed" } as const;
  await db.insert(catalogLabel).values([
    { ...label, entityType: "country", entityId: insertedCountry!.id, text: "Danmark" },
    { ...label, entityType: "league", entityId: insertedLeague!.id, text: "Superligaen" },
    { ...label, entityType: "club", entityId: insertedClub!.id, text: "F.C. København" },
  ]);

  await pool.end();
  return { clubId: insertedClub!.id, seasonId: insertedSeason!.id };
}

describe("Accepting a Bud closes the jersey /v1", () => {
  let app: NestFastifyApplication;

  const register = async (email: string): Promise<Session> => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/identity/register",
      payload: { email, password: "password123" },
    });
    return identitySessionSchema.parse(JSON.parse(response.body));
  };

  const saveJersey = async (owner: Session, fixture: Fixture) => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/collection/jerseys/save",
      headers: { authorization: `Bearer ${owner.accessToken}`, "accept-language": "da" },
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
  };

  const setBidding = (owner: Session, jerseyId: string, biddingEnabled: boolean) =>
    app.inject({
      method: "PATCH",
      url: `/v1/collection/jerseys/${jerseyId}/bidding`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { biddingEnabled },
    });

  const sendBid = async (bidder: Session, jerseyId: string, amountDkk: number) => {
    const response = await app.inject({
      method: "POST",
      url: `/v1/collection/jerseys/${jerseyId}/bids`,
      headers: { authorization: `Bearer ${bidder.accessToken}` },
      payload: { amountDkk },
    });
    expect(response.statusCode).toBe(201);
    return collectionSendBidResponseSchema.parse(JSON.parse(response.body));
  };

  const respond = (
    owner: Session,
    bid: { conversationId: string; messageId: string },
    decision: "accept" | "decline",
  ) =>
    app.inject({
      method: "PATCH",
      url: `/v1/collection/conversations/${bid.conversationId}/messages/${bid.messageId}/bid`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { decision },
    });

  const detail = async (
    session: Session,
    conversationId: string,
  ): Promise<CollectionConversationDetail> => {
    const response = await app.inject({
      method: "GET",
      url: `/v1/collection/conversations/${conversationId}`,
      headers: { authorization: `Bearer ${session.accessToken}`, "accept-language": "da" },
    });
    expect(response.statusCode).toBe(200);
    return collectionConversationDetailSchema.parse(JSON.parse(response.body));
  };

  const ownBiddingEnabled = async (owner: Session, jerseyId: string) => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/collection/jerseys",
      headers: { authorization: `Bearer ${owner.accessToken}`, "accept-language": "da" },
    });
    const body = collectionJerseysSchema.parse(JSON.parse(response.body));
    return body.jerseys.find((jersey) => jersey.id === jerseyId)?.biddingEnabled;
  };

  /** One owner, one jersey åben for bud, and two Collectors who each sent a pending Bud on it. */
  const twoBidders = async (name: string) => {
    const fixture = await insertClubSeasonFixture();
    const owner = await register(`owner-${name}@example.com`);
    const first = await register(`first-${name}@example.com`);
    const second = await register(`second-${name}@example.com`);
    const jersey = await saveJersey(owner, fixture);
    expect((await setBidding(owner, jersey.id, true)).statusCode).toBe(200);
    const firstBid = await sendBid(first, jersey.id, 350);
    const secondBid = await sendBid(second, jersey.id, 400);
    return { owner, first, second, jersey, firstBid, secondBid };
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.JWT_SECRET = "test-jwt-secret";
    delete process.env.R2_ENDPOINT;
    await resetDatabase(DATABASE_URL, migrationsFolder);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
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

  it("accepting a Bud closes the jersey, declines the other pending Bud and writes a system line in both threads", async () => {
    const { owner, first, second, jersey, firstBid, secondBid } = await twoBidders("accept");
    expect(secondBid.conversationId).not.toBe(firstBid.conversationId);

    const accept = await respond(owner, firstBid, "accept");
    expect(accept.statusCode).toBe(200);
    expect(JSON.parse(accept.body)).toEqual({ bidStatus: "accepted" });

    expect(await ownBiddingEnabled(owner, jersey.id)).toBe(false);

    const closedJersey = { userJerseyId: jersey.id, openForBid: false, ...SNAPSHOT };

    const acceptedForBidder = await detail(first, firstBid.conversationId);
    expect(acceptedForBidder.messages).toHaveLength(2);
    expect(acceptedForBidder.messages[0]).toMatchObject({
      id: firstBid.messageId,
      kind: "bid",
      bidStatus: "accepted",
    });
    expect(acceptedForBidder.messages[1]).toMatchObject({
      kind: "system",
      role: "incoming",
      systemReason: "bid_accepted",
      bidAmountDkk: 350,
      jersey: closedJersey,
    });
    expect(acceptedForBidder.messages[1]?.bidStatus).toBeUndefined();

    const acceptedForOwner = await detail(owner, firstBid.conversationId);
    expect(acceptedForOwner.messages[1]).toMatchObject({
      kind: "system",
      role: "outgoing",
      systemReason: "bid_accepted",
    });

    const goneForBidder = await detail(second, secondBid.conversationId);
    expect(goneForBidder.messages).toHaveLength(2);
    expect(goneForBidder.messages[0]).toMatchObject({
      id: secondBid.messageId,
      kind: "bid",
      bidStatus: "declined",
    });
    expect(goneForBidder.messages[1]).toMatchObject({
      kind: "system",
      role: "incoming",
      systemReason: "jersey_gone",
      // The declined bidder's own amount: the accepted amount is not theirs to see.
      bidAmountDkk: 400,
      jersey: closedJersey,
    });

    // The Indbakke still lists both threads with a system line as their latest message.
    for (const session of [owner, first, second]) {
      const inbox = await app.inject({
        method: "GET",
        url: "/v1/collection/conversations",
        headers: { authorization: `Bearer ${session.accessToken}` },
      });
      expect(inbox.statusCode).toBe(200);
      collectionConversationsSchema.parse(JSON.parse(inbox.body));
    }
  });

  it("a Bud that is already answered cannot be accepted", async () => {
    const { owner, firstBid, secondBid } = await twoBidders("answered");

    expect((await respond(owner, firstBid, "accept")).statusCode).toBe(200);

    const again = await respond(owner, firstBid, "accept");
    expect(again.statusCode).toBe(400);
    expect(JSON.parse(again.body).message).toBe("Bid is not pending");

    // The other Bud was declined by the accept.
    expect((await respond(owner, secondBid, "accept")).statusCode).toBe(400);
  });

  it("declining a Bud changes only that Bud", async () => {
    const { owner, first, second, jersey, firstBid, secondBid } = await twoBidders("decline");

    const decline = await respond(owner, firstBid, "decline");
    expect(decline.statusCode).toBe(200);
    expect(JSON.parse(decline.body)).toEqual({ bidStatus: "declined" });

    expect(await ownBiddingEnabled(owner, jersey.id)).toBe(true);

    const declined = await detail(first, firstBid.conversationId);
    expect(declined.messages.map((message) => [message.kind, message.bidStatus])).toEqual([
      ["bid", "declined"],
    ]);

    const untouched = await detail(second, secondBid.conversationId);
    expect(untouched.messages.map((message) => [message.kind, message.bidStatus])).toEqual([
      ["bid", "pending"],
    ]);
  });

  it("the owner can open the jersey for bids again, and a declined bidder's new Bud lands in the same thread", async () => {
    const { owner, second, jersey, firstBid, secondBid } = await twoBidders("reopen");
    expect((await respond(owner, firstBid, "accept")).statusCode).toBe(200);

    const reopen = await setBidding(owner, jersey.id, true);
    expect(reopen.statusCode).toBe(200);
    expect(await ownBiddingEnabled(owner, jersey.id)).toBe(true);

    const declinedCard = (await detail(second, secondBid.conversationId)).messages.find(
      (message) => message.id === secondBid.messageId,
    );
    expect(declinedCard?.bidStatus).toBe("declined");
    expect(declinedCard?.jersey?.openForBid).toBe(true);

    const newBid = await sendBid(second, jersey.id, 500);
    expect(newBid.conversationId).toBe(secondBid.conversationId);

    const thread = await detail(second, secondBid.conversationId);
    expect(thread.messages.map((message) => message.kind)).toEqual(["bid", "system", "bid"]);
    expect(thread.messages[2]).toMatchObject({
      id: newBid.messageId,
      bidStatus: "pending",
      bidAmountDkk: 500,
    });
  });

  it("a thread hidden by a declined bidder comes back when the jersey goes to another Collector", async () => {
    const { owner, second, firstBid, secondBid } = await twoBidders("hidden");

    const hide = await app.inject({
      method: "DELETE",
      url: `/v1/collection/conversations/${secondBid.conversationId}`,
      headers: { authorization: `Bearer ${second.accessToken}` },
    });
    expect(hide.statusCode).toBeLessThan(300);
    const listIds = async () => {
      const inbox = await app.inject({
        method: "GET",
        url: "/v1/collection/conversations",
        headers: { authorization: `Bearer ${second.accessToken}` },
      });
      return collectionConversationsSchema
        .parse(JSON.parse(inbox.body))
        .conversations.map((item) => item.id);
    };
    expect(await listIds()).toEqual([]);

    expect((await respond(owner, firstBid, "accept")).statusCode).toBe(200);

    expect(await listIds()).toEqual([secondBid.conversationId]);
  });

  it("a Bud card carries the jersey's showcase thumb and its live åben for bud", async () => {
    const { owner, first, jersey, firstBid } = await twoBidders("thumb");

    const before = (await detail(first, firstBid.conversationId)).messages[0]?.jersey;
    expect(before).toMatchObject({ userJerseyId: jersey.id, openForBid: true, ...SNAPSHOT });
    expect(before?.thumbUrl).toMatch(/^\/v1\/collection\/showcase\/photos\/[0-9a-f-]{36}$/);

    expect((await respond(owner, firstBid, "accept")).statusCode).toBe(200);

    const after = (await detail(first, firstBid.conversationId)).messages[0]?.jersey;
    expect(after?.openForBid).toBe(false);
    expect(after?.thumbUrl).toBe(before?.thumbUrl);

    const photo = await app.inject({
      method: "GET",
      url: after!.thumbUrl!,
      headers: { authorization: `Bearer ${first.accessToken}` },
    });
    expect(photo.statusCode).toBe(200);
    expect(photo.headers["content-type"]).toContain("image/jpeg");
  });

  it("a Bud card keeps its snapshot but no jersey once the jersey is private or deleted", async () => {
    const { owner, first, second, jersey, firstBid, secondBid } = await twoBidders("gone");
    const unavailable = { userJerseyId: null, thumbUrl: null, openForBid: false, ...SNAPSHOT };

    const makePrivate = await app.inject({
      method: "PATCH",
      url: `/v1/collection/jerseys/${jersey.id}/private`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { private: true },
    });
    expect(makePrivate.statusCode).toBe(200);
    expect((await detail(first, firstBid.conversationId)).messages[0]?.jersey).toEqual(unavailable);

    const remove = await app.inject({
      method: "DELETE",
      url: `/v1/collection/jerseys/${jersey.id}`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
    });
    expect(remove.statusCode).toBe(204);
    expect((await detail(second, secondBid.conversationId)).messages[0]?.jersey).toEqual(
      unavailable,
    );
  });
});
