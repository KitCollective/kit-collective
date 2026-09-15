import "reflect-metadata";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  adminVisionLabelListSchema,
  collectionSaveResponseSchema,
  identitySessionSchema,
  UNSIGNED_VISION_SUGGEST_CAP,
  VISION_MATCHER_JERSEY_CAP,
  visionJobResponseSchema,
  visionSuggestResponseSchema,
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
  visionLog,
} from "@kit/db";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../dist/app.module.js";
import type {
  VisionAdapter,
  VisionGroupingInferenceResult,
  VisionInferenceResult,
} from "../dist/vision/vision.adapter.js";
import { VISION_ADAPTER } from "../dist/vision/vision.adapter.js";
import { VisionService } from "../dist/vision/vision.service.js";

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../packages/db/migrations",
);

const DATABASE_URL =
  process.env.API_TEST_DATABASE_URL ?? "postgresql://kit:kit@localhost:5432/kit_api_test";

const ANONYMOUS_VISION_USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLUB_A = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CLUB_B = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const SEASON_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PHOTO_A = "11111111-1111-1111-1111-111111111111";
const PHOTO_B = "22222222-2222-2222-2222-222222222222";

const JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFwABAQEBAAAAAAAAAAAAAAAAAAUGB//EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA//2Q==";

class MutableVisionAdapter implements VisionAdapter {
  identity: VisionInferenceResult | null = {
    clubId: CLUB_B,
    seasonId: SEASON_ID,
    type: "home",
    confidences: { overall: 90, club: 90, season: 90, kitType: 90 },
  };
  grouping: VisionGroupingInferenceResult | null = {
    groups: [{ photoIds: [PHOTO_A, PHOTO_B], confidence: 85 }],
  };
  delayMs = 0;
  fail = false;

  async infer(): Promise<VisionInferenceResult | null> {
    if (this.fail) {
      throw new Error("Vision adapter failed");
    }
    if (this.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }
    return this.identity;
  }

  async inferGrouping(): Promise<VisionGroupingInferenceResult | null> {
    return this.grouping;
  }
}

class ThrowingLabelVisionService extends VisionService {
  override async persistVisionLabelAtSave(): Promise<void> {
    throw new Error("vision label write failed");
  }
}

const adapter = new MutableVisionAdapter();

async function registerSession(app: NestFastifyApplication, email: string) {
  const response = await app.inject({
    method: "POST",
    url: "/v1/identity/register",
    payload: { email, password: "password123" },
  });
  return identitySessionSchema.parse(JSON.parse(response.body));
}

async function promoteToAdmin(email: string) {
  const { db, pool } = createDb(DATABASE_URL);
  await db.update(user).set({ role: "admin" }).where(eq(user.email, email.toLowerCase()));
  await pool.end();
}

async function loginUser(app: NestFastifyApplication, email: string) {
  const response = await app.inject({
    method: "POST",
    url: "/v1/identity/login",
    payload: { email, password: "password123" },
  });
  return identitySessionSchema.parse(JSON.parse(response.body));
}

async function insertCatalog() {
  const { db, pool } = createDb(DATABASE_URL);
  const [insertedCountry] = await db
    .insert(country)
    .values({ iso3166: "DK" })
    .returning({ id: country.id });
  if (!insertedCountry) {
    throw new Error("expected country");
  }
  const [insertedLeague] = await db
    .insert(league)
    .values({ countryId: insertedCountry.id })
    .returning({ id: league.id });
  if (!insertedLeague) {
    throw new Error("expected league");
  }
  await db.insert(club).values([
    { id: CLUB_A, countryId: insertedCountry.id, kind: "club" },
    { id: CLUB_B, countryId: insertedCountry.id, kind: "club" },
  ]);
  await db.insert(season).values({
    id: SEASON_ID,
    leagueId: insertedLeague.id,
    label: "2023/24",
    startsOn: "2023-07-01",
    endsOn: "2024-06-30",
    calendarKind: "split_year",
  });
  await db.insert(teamSeason).values([
    { clubId: CLUB_A, seasonId: SEASON_ID },
    { clubId: CLUB_B, seasonId: SEASON_ID },
  ]);
  await db.insert(catalogLabel).values([
    {
      entityType: "club",
      entityId: CLUB_A,
      locale: "en",
      kind: "label",
      text: "Rangers FC",
      source: "seed",
    },
    {
      entityType: "club",
      entityId: CLUB_B,
      locale: "en",
      kind: "label",
      text: "F.C. Copenhagen",
      source: "seed",
    },
    {
      entityType: "club",
      entityId: CLUB_B,
      locale: "da",
      kind: "alias",
      text: "FCK",
      source: "seed",
    },
  ]);
  await pool.end();
}

async function insertAnonymousVisionUser() {
  const passwordHash = await bcrypt.hash("anonymous-vision-not-for-login", 12);
  const { db, pool } = createDb(DATABASE_URL);
  await db.insert(user).values({
    id: ANONYMOUS_VISION_USER_ID,
    email: "anonymous-vision@internal.kitcollective",
    passwordHash,
    name: "anonymous_vision",
    handle: "anonymous_vision",
  });
  await pool.end();
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

async function suggestIdentity(app: NestFastifyApplication, accessToken: string, draftId?: string) {
  return app.inject({
    method: "POST",
    url: "/v1/collection/vision/suggest",
    headers: { authorization: `Bearer ${accessToken}` },
    payload: {
      ...(draftId ? { draftId } : {}),
      photos: [{ role: "front", contentBase64: JPEG_BASE64 }],
    },
  });
}

async function saveJersey(
  app: NestFastifyApplication,
  accessToken: string,
  options: { clubId: string; visionJobId?: string; draftId?: string },
) {
  return app.inject({
    method: "POST",
    url: "/v1/collection/jerseys/save",
    headers: { authorization: `Bearer ${accessToken}` },
    payload: {
      clubId: options.clubId,
      seasonId: SEASON_ID,
      type: "home",
      size: "m",
      condition: "used",
      ...(options.visionJobId ? { visionJobId: options.visionJobId } : {}),
      ...(options.draftId ? { draftId: options.draftId } : {}),
      photos: [{ role: "front", source: "gallery", contentBase64: JPEG_BASE64 }],
    },
  });
}

function matchingIdentity(): VisionInferenceResult {
  return {
    clubId: CLUB_B,
    seasonId: SEASON_ID,
    type: "home",
    confidences: { overall: 90, club: 90, season: 90, kitType: 90 },
  };
}

describe("Vision labels /v1", () => {
  let app: NestFastifyApplication;
  let staffToken: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.JWT_SECRET = "test-jwt-secret";
    process.env.BETTER_AUTH_SECRET = "test-better-auth-secret-not-for-production";
    process.env.BETTER_AUTH_URL = "http://127.0.0.1:3000";
    process.env.ANONYMOUS_VISION_USER_ID = ANONYMOUS_VISION_USER_ID;
    process.env.SENTINEL_ADAPTER = "fake";
    delete process.env.R2_ENDPOINT;

    await resetDatabase(DATABASE_URL, migrationsFolder);
    await insertAnonymousVisionUser();
    await insertCatalog();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(VISION_ADAPTER)
      .useValue(adapter)
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.setGlobalPrefix("v1");
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    await registerSession(app, "vision-label-staff@example.com");
    await promoteToAdmin("vision-label-staff@example.com");
    const staff = await loginUser(app, "vision-label-staff@example.com");
    staffToken = staff.accessToken;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  async function staffLabels(query = "") {
    const response = await app.inject({
      method: "GET",
      url: `/v1/admin/vision/labels${query}`,
      headers: { authorization: `Bearer ${staffToken}` },
    });
    expect(response.statusCode).toBe(200);
    const body = adminVisionLabelListSchema.parse(JSON.parse(response.body));
    expect(body).not.toHaveProperty("visionRaw");
    for (const row of body.rows) {
      expect(row).not.toHaveProperty("visionRaw");
      expect(JSON.stringify(row)).not.toContain(JPEG_BASE64);
    }
    return body;
  }

  async function gemAndLabel(
    email: string,
    clubId: string,
    identity: VisionInferenceResult | null,
  ) {
    adapter.fail = false;
    adapter.delayMs = 0;
    adapter.identity = identity;
    const session = await registerSession(app, email);
    const suggest = await suggestIdentity(app, session.accessToken);
    expect(suggest.statusCode).toBe(202);
    const { jobId } = visionSuggestResponseSchema.parse(suggest.json());
    await waitForSignedJob(app, session.accessToken, jobId);
    const saved = await saveJersey(app, session.accessToken, { clubId, visionJobId: jobId });
    expect(saved.statusCode).toBe(201);
    collectionSaveResponseSchema.parse(JSON.parse(saved.body));
    const list = await staffLabels();
    const row = list.rows.find((entry) => entry.jobId === jobId);
    expect(row).toBeDefined();
    if (!row) {
      throw new Error(`expected Vision label for job ${jobId}`);
    }
    return { session, jobId, row, list, saved };
  }

  it("returns 401 for unauthenticated Vision labels", async () => {
    const response = await app.inject({ method: "GET", url: "/v1/admin/vision/labels" });
    expect(response.statusCode).toBe(401);
  });

  it("returns 403 when a collector lists Vision labels", async () => {
    const collector = await registerSession(app, "vision-label-collector@example.com");
    const response = await app.inject({
      method: "GET",
      url: "/v1/admin/vision/labels",
      headers: { authorization: `Bearer ${collector.accessToken}` },
    });
    expect(response.statusCode).toBe(403);
  });

  it("labels an accepted identity Save and lists it for Staff", async () => {
    const { row, list } = await gemAndLabel(
      "vision-label-accepted@example.com",
      CLUB_B,
      matchingIdentity(),
    );
    expect(row.class).toBe("accepted");
    expect(row.userAction).toBe("accepted");
    expect(row.selected.clubId).toBe(CLUB_B);
    expect(row.suggested.clubId).toBe(CLUB_B);
    expect(row.fieldHits.side).toBe(true);
    expect(row.photoKeys.length).toBeGreaterThan(0);
    expect(row.photoKeys[0]).toMatch(/^user\//);
    expect(list.hitRateCaption).toMatch(/^\d+ \/ \d+$/);
    expect(list.labelledCount).toBeGreaterThan(0);
  });

  it("labels alias when the hint compact-matches the selected CatalogLabel", async () => {
    const { row } = await gemAndLabel("vision-label-alias@example.com", CLUB_B, {
      clubHint: "FCK",
      visionRaw: JSON.stringify({ clubHint: "FCK" }),
      confidences: { overall: 80, club: 80 },
    });
    expect(row.class).toBe("alias");
    expect(row.selected.clubId).toBe(CLUB_B);
    expect(row.suggested.clubId).toBeUndefined();
  });

  it("labels coverage when catalogMiss does not match selected labels", async () => {
    const { row } = await gemAndLabel("vision-label-coverage@example.com", CLUB_B, {
      clubHint: "Zyx Unknown",
      visionRaw: JSON.stringify({ clubHint: "Zyx Unknown" }),
      confidences: { overall: 80, club: 80 },
    });
    expect(row.class).toBe("coverage");
    expect(row.selected.clubId).toBe(CLUB_B);
  });

  it("labels model when suggested club UUID differs from selected", async () => {
    const { row } = await gemAndLabel("vision-label-model@example.com", CLUB_B, {
      clubId: CLUB_A,
      seasonId: SEASON_ID,
      type: "home",
      visionRaw: JSON.stringify({ clubHint: "Rangers FC" }),
      confidences: { overall: 90, club: 90, season: 90, kitType: 90 },
    });
    expect(row.class).toBe("model");
    expect(row.suggested.clubId).toBe(CLUB_A);
    expect(row.selected.clubId).toBe(CLUB_B);
    expect(row.fieldHits.side).toBe(false);
  });

  it("labels transport when identity is still pending at Save", async () => {
    adapter.fail = false;
    adapter.delayMs = 3_000;
    adapter.identity = matchingIdentity();
    const session = await registerSession(app, "vision-label-transport@example.com");
    const suggest = await suggestIdentity(app, session.accessToken);
    expect(suggest.statusCode).toBe(202);
    const { jobId } = visionSuggestResponseSchema.parse(suggest.json());
    const saved = await saveJersey(app, session.accessToken, {
      clubId: CLUB_B,
      visionJobId: jobId,
    });
    expect(saved.statusCode).toBe(201);
    adapter.delayMs = 0;
    const list = await staffLabels();
    const row = list.rows.find((entry) => entry.jobId === jobId);
    expect(row?.class).toBe("transport");
    expect(row?.userAction).toBe("ignored");
  });

  it("does not label Save without an identity job", async () => {
    const session = await registerSession(app, "vision-label-nojob@example.com");
    const { db, pool } = createDb(DATABASE_URL);
    await db.insert(visionLog).values(
      Array.from({ length: VISION_MATCHER_JERSEY_CAP }, (_, index) => ({
        userId: session.user.id,
        kind: "identity" as const,
        status: "ready" as const,
        draftId: `11111111-1111-4111-8111-${String(index + 1).padStart(12, "0")}`,
      })),
    );
    await pool.end();

    const before = await staffLabels();
    const saved = await saveJersey(app, session.accessToken, { clubId: CLUB_B });
    expect(saved.statusCode).toBe(201);
    const body = collectionSaveResponseSchema.parse(JSON.parse(saved.body));
    expect(body.visionJobId).toBeUndefined();
    const after = await staffLabels();
    expect(after.labelledCount).toBe(before.labelledCount);
  });

  it("keeps the Vision label snapshot after a later UserJersey edit", async () => {
    const { session, jobId, row, saved } = await gemAndLabel(
      "vision-label-snapshot@example.com",
      CLUB_B,
      matchingIdentity(),
    );
    expect(row.selected.clubId).toBe(CLUB_B);
    const jerseyId = collectionSaveResponseSchema.parse(JSON.parse(saved.body)).jersey.id;
    const patched = await app.inject({
      method: "PATCH",
      url: `/v1/collection/jerseys/${jerseyId}`,
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: {
        clubId: CLUB_A,
        seasonId: SEASON_ID,
        type: "away",
        size: "xl",
        condition: "worn",
      },
    });
    expect(patched.statusCode).toBe(200);
    const list = await staffLabels();
    const after = list.rows.find((entry) => entry.jobId === jobId);
    expect(after?.selected.clubId).toBe(CLUB_B);
    expect(after?.selected.type).toBe("home");
    expect(after?.class).toBe("accepted");
  });

  it("does not label grouping jobs", async () => {
    adapter.fail = false;
    adapter.delayMs = 0;
    const session = await registerSession(app, "vision-label-grouping@example.com");
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
    const { jobId } = visionSuggestResponseSchema.parse(grouping.json());
    await waitForSignedJob(app, session.accessToken, jobId);
    const saved = await saveJersey(app, session.accessToken, {
      clubId: CLUB_B,
      visionJobId: jobId,
    });
    expect(saved.statusCode).toBe(201);
    const list = await staffLabels();
    expect(list.rows.some((entry) => entry.jobId === jobId)).toBe(false);
  });

  it("creates no Vision label on unsigned IP-cap 429", async () => {
    const before = await staffLabels();
    for (let index = 0; index < UNSIGNED_VISION_SUGGEST_CAP; index += 1) {
      const response = await app.inject({
        method: "POST",
        url: "/v1/collection/vision/suggest/unsigned",
        remoteAddress: "203.0.113.88",
        payload: { photos: [{ role: "front", contentBase64: JPEG_BASE64 }] },
      });
      expect(response.statusCode).toBe(202);
    }
    const blocked = await app.inject({
      method: "POST",
      url: "/v1/collection/vision/suggest/unsigned",
      remoteAddress: "203.0.113.88",
      payload: { photos: [{ role: "front", contentBase64: JPEG_BASE64 }] },
    });
    expect(blocked.statusCode).toBe(429);
    const after = await staffLabels();
    expect(after.labelledCount).toBe(before.labelledCount);
  });

  it("filters Vision labels by class and userAction", async () => {
    const alias = await staffLabels("?class=alias");
    expect(alias.rows.length).toBeGreaterThan(0);
    expect(alias.rows.every((row) => row.class === "alias")).toBe(true);
    const ignored = await staffLabels("?userAction=ignored");
    expect(ignored.rows.every((row) => row.userAction === "ignored")).toBe(true);
  });

  it("keeps Save successful when Vision label persist throws", async () => {
    adapter.fail = false;
    adapter.delayMs = 0;
    adapter.identity = matchingIdentity();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(VISION_ADAPTER)
      .useValue(adapter)
      .overrideProvider(VisionService)
      .useClass(ThrowingLabelVisionService)
      .compile();
    const failApp = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    failApp.setGlobalPrefix("v1");
    await failApp.init();
    await failApp.getHttpAdapter().getInstance().ready();

    const session = await registerSession(failApp, "vision-label-failopen@example.com");
    const suggest = await suggestIdentity(failApp, session.accessToken);
    expect(suggest.statusCode).toBe(202);
    const { jobId } = visionSuggestResponseSchema.parse(suggest.json());
    await waitForSignedJob(failApp, session.accessToken, jobId);
    const saved = await saveJersey(failApp, session.accessToken, {
      clubId: CLUB_B,
      visionJobId: jobId,
    });
    expect(saved.statusCode).toBe(201);
    collectionSaveResponseSchema.parse(JSON.parse(saved.body));

    const { db, pool } = createDb(DATABASE_URL);
    const [row] = await db
      .select({ evalClass: visionLog.evalClass, userAction: visionLog.userAction })
      .from(visionLog)
      .where(eq(visionLog.id, jobId))
      .limit(1);
    await pool.end();
    expect(row?.evalClass).toBeNull();
    expect(row?.userAction).toBe("accepted");
    await failApp.close();
  });
});
