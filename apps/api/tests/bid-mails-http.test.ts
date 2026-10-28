import "reflect-metadata";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectionConversationDetailSchema,
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
  user,
} from "@kit/db";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../dist/app.module.js";
import type { OutboundMail } from "../dist/notify/mailer.adapter.js";
import { MAILER } from "../dist/notify/mailer.token.js";
import { saveNotificationPrefs } from "../dist/notify/notification-prefs.js";
import { recordedMails, resetRecordedMails } from "../dist/notify/recording-mailer.adapter.js";
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

const mailer = {
  failing: false,
  async send(mail: OutboundMail) {
    if (mailer.failing) {
      throw new Error("ses is down");
    }
    recordedMails.push(mail);
  },
};

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

describe("Bid mails (05, 06, 07) are sent by the bid actions /v1", () => {
  let app: NestFastifyApplication;
  let counter = 0;
  const env = { ...process.env };

  const register = async (name: string): Promise<Session & { email: string }> => {
    counter += 1;
    const email = `${name}-${counter}@example.com`;
    const response = await app.inject({
      method: "POST",
      url: "/v1/identity/register",
      payload: { email, password: "password123" },
    });
    return { ...identitySessionSchema.parse(JSON.parse(response.body)), email };
  };

  const auth = (session: Session) => ({ authorization: `Bearer ${session.accessToken}` });

  const saveJersey = async (owner: Session, fixture: Fixture) => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/collection/jerseys/save",
      headers: { ...auth(owner), "accept-language": "da" },
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

  const setBidding = (owner: Session, jerseyId: string) =>
    app.inject({
      method: "PATCH",
      url: `/v1/collection/jerseys/${jerseyId}/bidding`,
      headers: auth(owner),
      payload: { biddingEnabled: true },
    });

  const sendBid = (bidder: Session, jerseyId: string, amountDkk: number) =>
    app.inject({
      method: "POST",
      url: `/v1/collection/jerseys/${jerseyId}/bids`,
      headers: auth(bidder),
      payload: { amountDkk },
    });

  const sentBid = async (bidder: Session, jerseyId: string, amountDkk: number) => {
    const response = await sendBid(bidder, jerseyId, amountDkk);
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
      headers: auth(owner),
      payload: { decision },
    });

  const deleteJersey = (owner: Session, jerseyId: string) =>
    app.inject({
      method: "DELETE",
      url: `/v1/collection/jerseys/${jerseyId}`,
      headers: auth(owner),
    });

  const block = (blocker: Session, conversationId: string) =>
    app.inject({
      method: "POST",
      url: `/v1/moderation/conversations/${conversationId}/block`,
      headers: auth(blocker),
    });

  const mailsTo = (email: string) => recordedMails.filter((mail) => mail.to === email);

  /** One owner and a jersey open for Bud. */
  const openJersey = async (name: string) => {
    const fixture = await insertClubSeasonFixture();
    const owner = await register(`owner-${name}`);
    const jersey = await saveJersey(owner, fixture);
    expect((await setBidding(owner, jersey.id)).statusCode).toBe(200);
    resetRecordedMails();
    return { owner, jersey };
  };

  /** An open jersey and two Collectors who each sent a pending Bud on it. */
  const twoBidders = async (name: string) => {
    const { owner, jersey } = await openJersey(name);
    const first = await register(`first-${name}`);
    const second = await register(`second-${name}`);
    const firstBid = await sentBid(first, jersey.id, 350);
    const secondBid = await sentBid(second, jersey.id, 400);
    resetRecordedMails();
    return { owner, first, second, jersey, firstBid, secondBid };
  };

  const bidStatuses = async (session: Session, conversationId: string) => {
    const response = await app.inject({
      method: "GET",
      url: `/v1/collection/conversations/${conversationId}`,
      headers: { ...auth(session), "accept-language": "da" },
    });
    expect(response.statusCode).toBe(200);
    return collectionConversationDetailSchema
      .parse(JSON.parse(response.body))
      .messages.flatMap((message) => ("bidStatus" in message ? [message.bidStatus] : []));
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.JWT_SECRET = "test-jwt-secret";
    process.env.BETTER_AUTH_URL = "https://api.test";
    process.env.APP_LINK_BASE_URL = "https://app.test";
    delete process.env.R2_ENDPOINT;
    await resetDatabase(DATABASE_URL, migrationsFolder);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MAILER)
      .useValue(mailer)
      .compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.setGlobalPrefix("v1");
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    process.env = { ...env };
    await app.close();
  });

  beforeEach(async () => {
    mailer.failing = false;
    resetRecordedMails();
    await clearAuthThrottleHits();
  });

  it("a new bid mails the owner mail 05 with the amount, the bidder and a link to that bid", async () => {
    const { owner, jersey } = await openJersey("new");
    const bidder = await register("bidder-new");
    resetRecordedMails();
    const bid = await sentBid(bidder, jersey.id, 350);

    const [mail, ...rest] = mailsTo(owner.email);
    expect(rest).toHaveLength(0);
    expect(mail?.subject).toBe("Nyt bud på din trøje");
    expect(mail?.text).toContain("F.C. København");
    expect(mail?.text).toContain("350 kr");
    expect(mail?.text).toContain(
      `Se buddet: https://app.test/samtale/${bid.conversationId}/bud/${bid.messageId}`,
    );
    expect(mail?.html).toContain("https://api.test/v1/collection/showcase/photos/");
    expect(`${mail?.subject}${mail?.preheader}`).not.toContain("350");
    expect(mailsTo(bidder.email)).toHaveLength(0);
  });

  it("a new bid shows the bidder's city only when they share it", async () => {
    const { owner, jersey } = await openJersey("city");
    const bidder = await register("bidder-city");
    resetRecordedMails();
    const { db, pool } = createDb(DATABASE_URL);
    await db
      .update(user)
      .set({ city: "Aarhus", showCity: true })
      .where(eq(user.email, bidder.email));
    await sentBid(bidder, jersey.id, 300);
    expect(mailsTo(owner.email)[0]?.text).toMatch(/Fra: .+ · Aarhus/);

    resetRecordedMails();
    await db.update(user).set({ showCity: false }).where(eq(user.email, bidder.email));
    const other = await register("bidder-city-hidden");
    await db
      .update(user)
      .set({ city: "Odense", showCity: false })
      .where(eq(user.email, other.email));
    await sentBid(other, jersey.id, 310);
    await pool.end();
    expect(mailsTo(owner.email)[0]?.text).not.toContain("Odense");
  });

  it("accepting mails the bidder mail 06 and the other bidder mail 07 without a button", async () => {
    const { owner, first, second, secondBid } = await twoBidders("accept");

    expect((await respond(owner, secondBid, "accept")).statusCode).toBe(200);

    const accepted = mailsTo(second.email);
    expect(accepted.map((mail) => mail.subject)).toEqual(["Dit bud er accepteret"]);
    expect(accepted[0]?.text).toContain("400 kr");
    expect(accepted[0]?.text).toContain(
      `Åbn samtalen: https://app.test/samtale/${secondBid.conversationId}`,
    );

    const gone = mailsTo(first.email);
    expect(gone.map((mail) => mail.subject)).toEqual(["Dit bud er afvist"]);
    expect(gone[0]?.text).toContain("Trøjen er gået til en anden samler.");
    expect(gone[0]?.text).toContain("350 kr");
    expect(gone[0]?.text).not.toContain("400 kr");
    expect(gone[0]?.html).not.toContain(`class="btn-link"`);
    expect(mailsTo(owner.email)).toHaveLength(0);
  });

  it("declining mails the bidder mail 07 with a link to Send bud for that jersey", async () => {
    const { owner, first, second, jersey, firstBid } = await twoBidders("decline");

    expect((await respond(owner, firstBid, "decline")).statusCode).toBe(200);

    const [mail, ...rest] = mailsTo(first.email);
    expect(rest).toHaveLength(0);
    expect(mail?.subject).toBe("Dit bud er afvist");
    expect(mail?.text).toContain(`Send nyt bud: https://app.test/troeje/${jersey.id}/bud`);
    expect(mail?.text).not.toContain("anden samler");
    expect(mailsTo(second.email)).toHaveLength(0);
  });

  it("deleting the jersey mails each pending bidder the deleted variant, with no button and no photo", async () => {
    const { owner, first, second, jersey } = await twoBidders("delete");

    expect((await deleteJersey(owner, jersey.id)).statusCode).toBe(204);

    for (const [bidder, amount] of [
      [first, "350 kr"],
      [second, "400 kr"],
    ] as const) {
      const [mail, ...rest] = mailsTo(bidder.email);
      expect(rest).toHaveLength(0);
      expect(mail?.subject).toBe("Dit bud er afvist");
      expect(mail?.text).toContain(amount);
      expect(mail?.text).toContain("[MANGLER:");
      expect(mail?.text).not.toContain("anden samler");
      expect(mail?.html).not.toContain(`class="btn-link"`);
      expect(mail?.html).not.toContain("showcase/photos");
    }
  });

  it("deleting a jersey with no pending Bud sends no mail", async () => {
    const { owner, jersey } = await openJersey("delete-none");

    expect((await deleteJersey(owner, jersey.id)).statusCode).toBe(204);

    expect(recordedMails).toHaveLength(0);
  });

  it("sends no mail to an owner who turned Bud og beskeder off", async () => {
    const { owner, jersey } = await openJersey("pref-owner");
    const { db, pool } = createDb(DATABASE_URL);
    const [row] = await db.select({ id: user.id }).from(user).where(eq(user.email, owner.email));
    await saveNotificationPrefs(db, row!.id, { email: { bidsAndMessages: false } });
    await pool.end();

    const bidder = await register("bidder-pref-owner");
    resetRecordedMails();
    await sentBid(bidder, jersey.id, 350);

    expect(recordedMails).toHaveLength(0);
  });

  it("sends no auto-decline mail to a bidder who is blocked by the owner, and still mails the winner", async () => {
    const { owner, first, second, firstBid, secondBid } = await twoBidders("blocked");
    expect((await block(owner, firstBid.conversationId)).statusCode).toBe(201);

    expect((await respond(owner, secondBid, "accept")).statusCode).toBe(200);

    expect(mailsTo(first.email)).toHaveLength(0);
    expect(mailsTo(second.email).map((mail) => mail.subject)).toEqual(["Dit bud er accepteret"]);
  });

  it("sends no deleted-jersey mail to a bidder who blocked the owner", async () => {
    const { owner, first, second, jersey, firstBid } = await twoBidders("blocked-delete");
    expect((await block(first, firstBid.conversationId)).statusCode).toBe(201);

    expect((await deleteJersey(owner, jersey.id)).statusCode).toBe(204);

    expect(mailsTo(first.email)).toHaveLength(0);
    expect(mailsTo(second.email)).toHaveLength(1);
  });

  it("sends no mail to a bidder who turned Bud og beskeder off", async () => {
    const { owner, first, secondBid } = await twoBidders("pref-bidder");
    const { db, pool } = createDb(DATABASE_URL);
    const [row] = await db.select({ id: user.id }).from(user).where(eq(user.email, first.email));
    await saveNotificationPrefs(db, row!.id, { email: { bidsAndMessages: false } });
    await pool.end();

    expect((await respond(owner, secondBid, "accept")).statusCode).toBe(200);
    expect(mailsTo(first.email)).toHaveLength(0);
  });

  describe("when the mailer throws", () => {
    it("a bid is still sent", async () => {
      const { jersey } = await openJersey("fail-bid");
      const bidder = await register("bidder-fail-bid");
      resetRecordedMails();
      mailer.failing = true;

      const response = await sendBid(bidder, jersey.id, 350);

      expect(response.statusCode).toBe(201);
    });

    it("accept still answers the Bud and declines the others", async () => {
      const { owner, first, firstBid, secondBid } = await twoBidders("fail-accept");
      mailer.failing = true;

      expect((await respond(owner, secondBid, "accept")).statusCode).toBe(200);

      expect(await bidStatuses(owner, secondBid.conversationId)).toContain("accepted");
      expect(await bidStatuses(first, firstBid.conversationId)).toEqual(["declined"]);
    });

    it("decline still answers the Bud", async () => {
      const { owner, first, firstBid } = await twoBidders("fail-decline");
      mailer.failing = true;

      expect((await respond(owner, firstBid, "decline")).statusCode).toBe(200);

      expect(await bidStatuses(first, firstBid.conversationId)).toEqual(["declined"]);
    });

    it("delete still removes the jersey", async () => {
      const { owner, jersey } = await twoBidders("fail-delete");
      mailer.failing = true;

      expect((await deleteJersey(owner, jersey.id)).statusCode).toBe(204);

      const response = await app.inject({
        method: "GET",
        url: "/v1/collection/jerseys",
        headers: { ...auth(owner), "accept-language": "da" },
      });
      const body = collectionJerseysSchema.parse(JSON.parse(response.body));
      expect(body.jerseys.some((item) => item.id === jersey.id)).toBe(false);
    });
  });
});
