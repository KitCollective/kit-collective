import "reflect-metadata";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  billingPaywallErrorSchema,
  billingStartTrialResponseSchema,
  collectionDiscoverJerseysSchema,
  collectionSaveResponseSchema,
  identityMeSchema,
  identitySessionSchema,
  VISION_MATCHER_JERSEY_CAP,
  visionJobResponseSchema,
  visionSuggestResponseSchema,
} from "@kit/api-contract";
import {
  catalogLabel,
  club,
  country,
  createDb,
  entitlement,
  league,
  resetDatabase,
  season,
  teamSeason,
  user,
  visionLog,
} from "@kit/db";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../dist/app.module.js";
import { ReadyIdentityAndGroupingAdapter } from "../dist/vision/test-vision.adapters.js";
import { VISION_ADAPTER } from "../dist/vision/vision.adapter.js";

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../packages/db/migrations",
);

const DATABASE_URL =
  process.env.API_TEST_DATABASE_URL ?? "postgresql://kit:kit@localhost:5432/kit_api_test";

const ANONYMOUS_VISION_USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLUB_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SEASON_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PHOTO_A = "11111111-1111-1111-1111-111111111111";
const PHOTO_B = "22222222-2222-2222-2222-222222222222";

const JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFwABAQEBAAAAAAAAAAAAAAAAAAUGB//EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA//2Q==";

function draftId(index: number): string {
  return `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`;
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

async function waitForSignedJob(app: NestFastifyApplication, accessToken: string, jobId: string) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = await app.inject({
      method: "GET",
      url: `/v1/collection/vision/jobs/${jobId}`,
      headers: { authorization: `Bearer ${accessToken}`, "accept-language": "da" },
    });
    if (response.statusCode === 200) {
      const body = visionJobResponseSchema.parse(JSON.parse(response.body));
      if (body.status !== "pending") {
        return body;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Vision job did not finish");
}

async function suggestIdentity(
  app: NestFastifyApplication,
  accessToken: string,
  nextDraftId?: string,
) {
  return app.inject({
    method: "POST",
    url: "/v1/collection/vision/suggest",
    headers: { authorization: `Bearer ${accessToken}` },
    payload: {
      ...(nextDraftId ? { draftId: nextDraftId } : {}),
      photos: [{ role: "front", contentBase64: JPEG_BASE64 }],
    },
  });
}

async function suggestAndWait(
  app: NestFastifyApplication,
  accessToken: string,
  nextDraftId?: string,
) {
  const response = await suggestIdentity(app, accessToken, nextDraftId);
  expect(response.statusCode).toBe(202);
  const { jobId } = visionSuggestResponseSchema.parse(JSON.parse(response.body));
  return waitForSignedJob(app, accessToken, jobId);
}

async function seedReadyIdentityJobs(userId: string, count: number, startIndex = 1) {
  const { db, pool } = createDb(DATABASE_URL);
  await db.insert(visionLog).values(
    Array.from({ length: count }, (_, index) => ({
      userId,
      draftId: draftId(startIndex + index),
      kind: "identity" as const,
      status: "ready" as const,
    })),
  );
  await pool.end();
}

async function fetchMe(app: NestFastifyApplication, accessToken: string) {
  const response = await app.inject({
    method: "GET",
    url: "/v1/identity/me",
    headers: { authorization: `Bearer ${accessToken}` },
  });
  expect(response.statusCode).toBe(200);
  return identityMeSchema.parse(JSON.parse(response.body));
}

describe("Vision Matcher jersey cap", () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.JWT_SECRET = "test-jwt-secret";
    process.env.BETTER_AUTH_SECRET = "test-better-auth-secret-not-for-production";
    process.env.BETTER_AUTH_URL = "http://127.0.0.1:3000";
    process.env.ANONYMOUS_VISION_USER_ID = ANONYMOUS_VISION_USER_ID;
    delete process.env.R2_ENDPOINT;

    await resetDatabase(DATABASE_URL, migrationsFolder);

    const passwordHash = await bcrypt.hash("anonymous-vision-not-for-login", 12);
    const { db, pool } = createDb(DATABASE_URL);
    await db.insert(user).values({
      id: ANONYMOUS_VISION_USER_ID,
      email: "anonymous-vision@internal.kitcollective",
      passwordHash,
      name: "anonymous_vision",
      handle: "anonymous_vision",
    });

    const [insertedCountry] = await db
      .insert(country)
      .values({ iso3166: "DK" })
      .returning({ id: country.id });
    if (!insertedCountry) {
      throw new Error("expected country row");
    }
    const [insertedLeague] = await db
      .insert(league)
      .values({ countryId: insertedCountry.id })
      .returning({ id: league.id });
    if (!insertedLeague) {
      throw new Error("expected league row");
    }
    await db.insert(club).values({
      id: CLUB_ID,
      countryId: insertedCountry.id,
      kind: "club",
    });
    await db.insert(season).values({
      id: SEASON_ID,
      leagueId: insertedLeague.id,
      label: "2023/24",
      startsOn: "2023-07-01",
      endsOn: "2024-06-30",
      calendarKind: "split_year",
    });
    await db.insert(teamSeason).values({ clubId: CLUB_ID, seasonId: SEASON_ID });
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
        entityId: CLUB_ID,
        locale: "da",
        kind: "label",
        text: "F.C. København",
        source: "seed",
      },
      {
        entityType: "club",
        entityId: CLUB_ID,
        locale: "en",
        kind: "label",
        text: "F.C. Copenhagen",
        source: "seed",
      },
    ]);
    await pool.end();

    const readyModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(VISION_ADAPTER)
      .useValue(
        new ReadyIdentityAndGroupingAdapter(
          {
            clubId: CLUB_ID,
            seasonId: SEASON_ID,
            confidences: { overall: 90, club: 90, season: 90 },
          },
          { groups: [{ photoIds: [PHOTO_A, PHOTO_B], confidence: 85 }] },
        ),
      )
      .compile();

    app = readyModule.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.setGlobalPrefix("v1");
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns 401 for identity suggest without session", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/collection/vision/suggest",
      payload: {
        draftId: draftId(1),
        photos: [{ role: "front", contentBase64: JPEG_BASE64 }],
      },
    });
    expect(response.statusCode).toBe(401);
  });

  it("allows 10 distinct-draft identity suggests then 402 on the 11th", async () => {
    const session = await registerSession(app, "cap-ten@example.com");

    for (let index = 1; index <= VISION_MATCHER_JERSEY_CAP; index += 1) {
      const job = await suggestAndWait(app, session.accessToken, draftId(index));
      expect(job.status).toBe("ready");
    }

    const eleventh = await suggestIdentity(app, session.accessToken, draftId(11));
    expect(eleventh.statusCode).toBe(402);
    expect(billingPaywallErrorSchema.parse(JSON.parse(eleventh.body)).code).toBe(
      "PREMIUM_REQUIRED",
    );

    const me = await fetchMe(app, session.accessToken);
    expect(me.entitlement.visionMatcher).toEqual({
      used: 10,
      cap: 10,
      remaining: 0,
      unlimited: false,
    });
  });

  it("does not increment the jersey cap for grouping suggest", async () => {
    const session = await registerSession(app, "cap-grouping@example.com");
    await seedReadyIdentityJobs(session.user.id, 9);

    const grouping = await app.inject({
      method: "POST",
      url: "/v1/collection/vision/grouping/suggest",
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: {
        photos: [
          { photoId: PHOTO_A, contentBase64: JPEG_BASE64 },
          { photoId: PHOTO_B, contentBase64: JPEG_BASE64 },
        ],
      },
    });
    expect(grouping.statusCode).toBe(202);

    const tenth = await suggestAndWait(app, session.accessToken, draftId(10));
    expect(tenth.status).toBe("ready");
    const eleventh = await suggestIdentity(app, session.accessToken, draftId(11));
    expect(eleventh.statusCode).toBe(402);
  });

  it("does not increment again when retrying the same draftId", async () => {
    const session = await registerSession(app, "cap-retry@example.com");
    await suggestAndWait(app, session.accessToken, draftId(1));
    await suggestAndWait(app, session.accessToken, draftId(1));

    const me = await fetchMe(app, session.accessToken);
    expect(me.entitlement.visionMatcher?.used).toBe(1);

    await seedReadyIdentityJobs(session.user.id, 9, 2);
    const retryAtCap = await suggestIdentity(app, session.accessToken, draftId(1));
    expect(retryAtCap.statusCode).toBe(202);
    const eleventh = await suggestIdentity(app, session.accessToken, draftId(20));
    expect(eleventh.statusCode).toBe(402);
  });

  it("does not increment failed or noop identity jobs", async () => {
    const session = await registerSession(app, "cap-noop@example.com");
    const { db, pool } = createDb(DATABASE_URL);
    await db.insert(visionLog).values([
      ...Array.from({ length: 5 }, (_, index) => ({
        userId: session.user.id,
        draftId: draftId(index + 1),
        kind: "identity" as const,
        status: "noop" as const,
      })),
      ...Array.from({ length: 5 }, (_, index) => ({
        userId: session.user.id,
        draftId: draftId(index + 6),
        kind: "identity" as const,
        status: "failed" as const,
      })),
    ]);
    await pool.end();

    const first = await suggestAndWait(app, session.accessToken, draftId(30));
    expect(first.status).toBe("ready");
    const me = await fetchMe(app, session.accessToken);
    expect(me.entitlement.visionMatcher?.used).toBe(1);
  });

  it("counts identity jobs without draftId as one jersey each", async () => {
    const session = await registerSession(app, "cap-null-draft@example.com");
    for (let index = 0; index < VISION_MATCHER_JERSEY_CAP; index += 1) {
      await suggestAndWait(app, session.accessToken);
    }
    const eleventh = await suggestIdentity(app, session.accessToken);
    expect(eleventh.statusCode).toBe(402);
  });

  it("skips the cap for live trial and Comp, then applies it after Lapse", async () => {
    const session = await registerSession(app, "cap-live@example.com");
    await seedReadyIdentityJobs(session.user.id, 10);

    const blocked = await suggestIdentity(app, session.accessToken, draftId(11));
    expect(blocked.statusCode).toBe(402);

    const trial = await app.inject({
      method: "POST",
      url: "/v1/billing/trial",
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    expect(trial.statusCode).toBe(200);
    const trialBody = billingStartTrialResponseSchema.parse(JSON.parse(trial.body));
    expect(trialBody.source).toBe("trial");
    expect(trialBody.expires).toBeTruthy();

    const duringTrial = await suggestAndWait(app, session.accessToken, draftId(11));
    expect(duringTrial.status).toBe("ready");
    const meLive = await fetchMe(app, session.accessToken);
    expect(meLive.entitlement.visionMatcher?.unlimited).toBe(true);

    const { db, pool } = createDb(DATABASE_URL);
    await db
      .update(entitlement)
      .set({ expires: new Date(Date.now() - 60_000) })
      .where(eq(entitlement.userId, session.user.id));
    await pool.end();

    const afterLapse = await suggestIdentity(app, session.accessToken, draftId(12));
    expect(afterLapse.statusCode).toBe(402);

    const compUser = await registerSession(app, "cap-comp@example.com");
    const { db: db2, pool: pool2 } = createDb(DATABASE_URL);
    await db2.insert(entitlement).values({
      userId: compUser.user.id,
      source: "comp",
      expires: new Date(Date.now() + 86_400_000),
      trialUsed: false,
    });
    await seedReadyIdentityJobs(compUser.user.id, 10);
    await pool2.end();
    const compEleventh = await suggestAndWait(app, compUser.accessToken, draftId(11));
    expect(compEleventh.status).toBe("ready");
  });

  it("does not skip the cap for Staff access without Entitlement", async () => {
    const session = await registerSession(app, "cap-staff@example.com");
    const { db, pool } = createDb(DATABASE_URL);
    await db.update(user).set({ role: "admin" }).where(eq(user.email, "cap-staff@example.com"));
    await pool.end();
    await seedReadyIdentityJobs(session.user.id, 10);

    const me = await fetchMe(app, session.accessToken);
    expect(me.role).toBe("admin");
    expect(me.entitlement.live).toBe(false);

    const eleventh = await suggestIdentity(app, session.accessToken, draftId(11));
    expect(eleventh.statusCode).toBe(402);
  });

  it("keeps unsigned IP jobs off a later User jersey cap", async () => {
    const unsigned = await app.inject({
      method: "POST",
      url: "/v1/collection/vision/suggest/unsigned",
      payload: {
        photos: [{ role: "front", contentBase64: JPEG_BASE64 }],
      },
    });
    expect(unsigned.statusCode).toBe(202);

    const session = await registerSession(app, "cap-after-unsigned@example.com");
    const me = await fetchMe(app, session.accessToken);
    expect(me.entitlement.visionMatcher?.used).toBe(0);

    const first = await suggestAndWait(app, session.accessToken, draftId(1));
    expect(first.status).toBe("ready");
  });

  it("saves a UserJersey at the cap without requiring Vision", async () => {
    const session = await registerSession(app, "cap-save@example.com");
    await seedReadyIdentityJobs(session.user.id, 10);

    const response = await app.inject({
      method: "POST",
      url: "/v1/collection/jerseys/save",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        "accept-language": "da",
      },
      payload: {
        clubId: CLUB_ID,
        seasonId: SEASON_ID,
        type: "home",
        size: "m",
        condition: "used",
        photos: [{ role: "front", source: "gallery", contentBase64: JPEG_BASE64 }],
      },
    });

    expect(response.statusCode).toBe(201);
    const body = collectionSaveResponseSchema.parse(JSON.parse(response.body));
    expect(body.visionJobId).toBeUndefined();
  });

  it("keeps Søg and Send bud available without Entitlement at the cap", async () => {
    const owner = await registerSession(app, "cap-bid-owner@example.com");
    const bidder = await registerSession(app, "cap-bid-bidder@example.com");
    await seedReadyIdentityJobs(bidder.user.id, 10);

    const saved = await app.inject({
      method: "POST",
      url: "/v1/collection/jerseys/save",
      headers: {
        authorization: `Bearer ${owner.accessToken}`,
        "accept-language": "da",
      },
      payload: {
        clubId: CLUB_ID,
        seasonId: SEASON_ID,
        type: "home",
        size: "m",
        condition: "used",
        photos: [{ role: "front", source: "gallery", contentBase64: JPEG_BASE64 }],
      },
    });
    expect(saved.statusCode).toBe(201);
    const jersey = collectionSaveResponseSchema.parse(JSON.parse(saved.body)).jersey;

    const enable = await app.inject({
      method: "PATCH",
      url: `/v1/collection/jerseys/${jersey.id}/bidding`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { biddingEnabled: true },
    });
    expect(enable.statusCode).toBe(200);

    const search = await app.inject({
      method: "GET",
      url: "/v1/collection/discover/jerseys",
      headers: { authorization: `Bearer ${bidder.accessToken}` },
    });
    expect(search.statusCode).toBe(200);
    collectionDiscoverJerseysSchema.parse(JSON.parse(search.body));

    const bid = await app.inject({
      method: "POST",
      url: `/v1/collection/jerseys/${jersey.id}/bids`,
      headers: { authorization: `Bearer ${bidder.accessToken}` },
      payload: { amountDkk: 100 },
    });
    expect(bid.statusCode).toBe(201);
  });
});
