import "reflect-metadata";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  adminVisionImproveListSchema,
  adminVisionImproveRowSchema,
  collectionSaveResponseSchema,
  identitySessionSchema,
  visionJobResponseSchema,
  visionSuggestResponseSchema,
} from "@kit/api-contract";
import {
  catalogLabel,
  club,
  country,
  createDb,
  kit,
  league,
  player,
  playerClubSeason,
  resetDatabase,
  season,
  teamSeason,
  user,
  visionLog,
} from "@kit/db";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import bcrypt from "bcryptjs";
import { and, count, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../dist/app.module.js";
import type {
  VisionAdapter,
  VisionGroupingInferenceResult,
  VisionInferenceResult,
} from "../dist/vision/vision.adapter.js";
import { VISION_ADAPTER } from "../dist/vision/vision.adapter.js";
import { VisionCatalogMapper } from "../dist/vision/vision-catalog-mapper.js";

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
const PLAYER_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const ALIAS_FINGERPRINT = `alias:club:${CLUB_B}:side:fck`;
const MISSING_IMPROVE_ID = "550e8400-e29b-41d4-a716-446655440099";

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
    groups: [{ photoIds: ["11111111-1111-1111-1111-111111111111"], confidence: 85 }],
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
  await db.insert(player).values({ id: PLAYER_ID });
  await db.insert(playerClubSeason).values({
    playerId: PLAYER_ID,
    clubId: CLUB_B,
    seasonId: SEASON_ID,
    squadNumber: 10,
  });
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
      entityId: CLUB_A,
      locale: "da",
      kind: "label",
      text: "Rangers FC",
      source: "seed",
    },
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
      locale: "da",
      kind: "label",
      text: "F.C. København",
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

async function suggestIdentity(app: NestFastifyApplication, accessToken: string) {
  return app.inject({
    method: "POST",
    url: "/v1/collection/vision/suggest",
    headers: { authorization: `Bearer ${accessToken}` },
    payload: {
      photos: [{ role: "front", contentBase64: JPEG_BASE64 }],
    },
  });
}

async function saveJersey(
  app: NestFastifyApplication,
  accessToken: string,
  options: { clubId: string; visionJobId?: string },
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

describe("Vision improve /v1", () => {
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

    await registerSession(app, "vision-improve-staff@example.com");
    await promoteToAdmin("vision-improve-staff@example.com");
    const staff = await loginUser(app, "vision-improve-staff@example.com");
    staffToken = staff.accessToken;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  async function staffImprove(query = "") {
    const response = await app.inject({
      method: "GET",
      url: `/v1/admin/vision/improve${query}`,
      headers: { authorization: `Bearer ${staffToken}` },
    });
    expect(response.statusCode).toBe(200);
    const body = adminVisionImproveListSchema.parse(JSON.parse(response.body));
    expect(JSON.stringify(body)).not.toContain("visionRaw");
    expect(JSON.stringify(body)).not.toContain(JPEG_BASE64);
    return body;
  }

  async function gemAndSave(email: string, clubId: string, identity: VisionInferenceResult | null) {
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
    return { session, jobId, saved };
  }

  it("returns clubHint on GET job when catalogMiss has no catalog ids", async () => {
    adapter.identity = {
      clubHint: "FC Barcelona",
      visionRaw: JSON.stringify({ clubHint: "FC Barcelona", kitType: "third" }),
      confidences: { overall: 80, club: 80 },
    };
    const session = await registerSession(app, "vision-catalog-miss-hint@example.com");
    const suggest = await suggestIdentity(app, session.accessToken);
    expect(suggest.statusCode).toBe(202);
    const { jobId } = visionSuggestResponseSchema.parse(suggest.json());
    const job = await waitForSignedJob(app, session.accessToken, jobId);
    expect(job.status).toBe("ready");
    expect(job.catalogMiss).toBe(true);
    expect(job.clubHint).toBe("FC Barcelona");
    expect(job.suggestions).toBeUndefined();
  });

  it("returns type and playerId on GET job when per-field confidence is below suggest", async () => {
    adapter.identity = {
      clubId: CLUB_B,
      seasonId: SEASON_ID,
      type: "away",
      playerId: PLAYER_ID,
      playerNumber: "10",
      confidences: { overall: 80, club: 80, season: 55, kitType: 45, player: 30 },
    };
    const session = await registerSession(app, "vision-type-gate-fallback@example.com");
    const suggest = await suggestIdentity(app, session.accessToken);
    expect(suggest.statusCode).toBe(202);
    const { jobId } = visionSuggestResponseSchema.parse(suggest.json());
    const job = await waitForSignedJob(app, session.accessToken, jobId);
    expect(job.status).toBe("ready");
    expect(job.suggestions?.type).toBe("away");
    expect(job.suggestions?.clubId).toBe(CLUB_B);
    expect(job.suggestions?.seasonId).toBe(SEASON_ID);
    expect(job.suggestions?.playerId).toBe(PLAYER_ID);
    expect(job.suggestions?.playerNumber).toBe("10");
  });

  it("omits player on GET job when adapter returns no playerId (blank back)", async () => {
    adapter.identity = {
      clubId: CLUB_B,
      seasonId: SEASON_ID,
      type: "home",
      confidences: { overall: 90, club: 90, season: 90, kitType: 90 },
    };
    const session = await registerSession(app, "vision-blank-back@example.com");
    const suggest = await suggestIdentity(app, session.accessToken);
    expect(suggest.statusCode).toBe(202);
    const { jobId } = visionSuggestResponseSchema.parse(suggest.json());
    const job = await waitForSignedJob(app, session.accessToken, jobId);
    expect(job.status).toBe("ready");
    expect(job.suggestions?.playerId).toBeUndefined();
  });

  it("returns 401 without a session and 403 for a collector", async () => {
    const unauthGet = await app.inject({ method: "GET", url: "/v1/admin/vision/improve" });
    expect(unauthGet.statusCode).toBe(401);
    const unauthApply = await app.inject({
      method: "POST",
      url: `/v1/admin/vision/improve/${MISSING_IMPROVE_ID}/apply`,
    });
    expect(unauthApply.statusCode).toBe(401);
    const unauthDismiss = await app.inject({
      method: "POST",
      url: `/v1/admin/vision/improve/${MISSING_IMPROVE_ID}/dismiss`,
    });
    expect(unauthDismiss.statusCode).toBe(401);

    const collector = await registerSession(app, "vision-improve-collector@example.com");
    const collectorGet = await app.inject({
      method: "GET",
      url: "/v1/admin/vision/improve",
      headers: { authorization: `Bearer ${collector.accessToken}` },
    });
    expect(collectorGet.statusCode).toBe(403);
    const collectorApply = await app.inject({
      method: "POST",
      url: `/v1/admin/vision/improve/${MISSING_IMPROVE_ID}/apply`,
      headers: { authorization: `Bearer ${collector.accessToken}` },
    });
    expect(collectorApply.statusCode).toBe(403);
    const collectorDismiss = await app.inject({
      method: "POST",
      url: `/v1/admin/vision/improve/${MISSING_IMPROVE_ID}/dismiss`,
      headers: { authorization: `Bearer ${collector.accessToken}` },
    });
    expect(collectorDismiss.statusCode).toBe(403);
  });

  it("lists an empty proposed queue for Staff", async () => {
    const list = await staffImprove();
    expect(list.total).toBe(0);
    expect(list.rows).toEqual([]);
  });

  it("upserts one alias row and increments count on identical Saves", async () => {
    await gemAndSave("vision-improve-alias-1@example.com", CLUB_B, {
      clubHint: "FCK",
      visionRaw: JSON.stringify({ clubHint: "FCK" }),
      confidences: { overall: 80, club: 80 },
    });
    const first = await staffImprove();
    const aliasRow = first.rows.find((row) => row.fingerprint === ALIAS_FINGERPRINT);
    expect(aliasRow?.kind).toBe("alias");
    expect(aliasRow?.status).toBe("proposed");
    expect(aliasRow?.count).toBe(1);
    expect(aliasRow?.text).toBe("FCK");
    expect(aliasRow?.selected.clubId).toBe(CLUB_B);
    expect(aliasRow?.suggested.clubLabel).toBe("FCK");

    await gemAndSave("vision-improve-alias-2@example.com", CLUB_B, {
      clubHint: "FCK",
      visionRaw: JSON.stringify({ clubHint: "FCK" }),
      confidences: { overall: 80, club: 80 },
    });
    const second = await staffImprove();
    const same = second.rows.filter((row) => row.fingerprint === ALIAS_FINGERPRINT);
    expect(same).toHaveLength(1);
    expect(same[0]?.count).toBe(2);
  });

  it("upserts coverage as seed and model as prompt", async () => {
    await gemAndSave("vision-improve-coverage@example.com", CLUB_B, {
      clubHint: "Zyx Unknown",
      visionRaw: JSON.stringify({ clubHint: "Zyx Unknown" }),
      confidences: { overall: 80, club: 80 },
    });
    const coverage = (await staffImprove()).rows.find((row) => row.kind === "seed");
    expect(coverage?.text).toBe("Zyx Unknown");
    expect(coverage?.status).toBe("proposed");
    expect(coverage?.entityId).toBe(CLUB_B);

    await gemAndSave("vision-improve-model@example.com", CLUB_B, {
      clubId: CLUB_A,
      seasonId: SEASON_ID,
      type: "home",
      visionRaw: JSON.stringify({ clubHint: "Rangers FC" }),
      confidences: { overall: 90, club: 90, season: 90, kitType: 90 },
    });
    const prompt = (await staffImprove()).rows.find((row) => row.kind === "prompt");
    expect(prompt?.status).toBe("proposed");
    expect(prompt?.field).toBe("side");
    expect(prompt?.text).toBe(`${CLUB_A}->${CLUB_B}`);
  });

  it("creates no improve row for accepted or transport Saves", async () => {
    const before = await staffImprove();
    await gemAndSave("vision-improve-accepted@example.com", CLUB_B, matchingIdentity());
    adapter.fail = false;
    adapter.delayMs = 3_000;
    adapter.identity = matchingIdentity();
    const session = await registerSession(app, "vision-improve-transport@example.com");
    const suggest = await suggestIdentity(app, session.accessToken);
    expect(suggest.statusCode).toBe(202);
    const { jobId } = visionSuggestResponseSchema.parse(suggest.json());
    const saved = await saveJersey(app, session.accessToken, {
      clubId: CLUB_B,
      visionJobId: jobId,
    });
    expect(saved.statusCode).toBe(201);
    adapter.delayMs = 0;
    const after = await staffImprove();
    expect(after.total).toBe(before.total);
  });

  it("notes seed and prompt Apply without mutating Club, Kit, or CatalogLabel", async () => {
    const { db, pool } = createDb(DATABASE_URL);
    const [labelsBefore] = await db.select({ value: count() }).from(catalogLabel);
    const [clubsBefore] = await db.select({ value: count() }).from(club);
    const [kitsBefore] = await db.select({ value: count() }).from(kit);
    await pool.end();

    const proposed = await staffImprove();
    const seed = proposed.rows.find((row) => row.kind === "seed");
    const prompt = proposed.rows.find((row) => row.kind === "prompt");
    expect(seed).toBeDefined();
    expect(prompt).toBeDefined();
    if (!seed || !prompt) {
      throw new Error("expected seed and prompt rows");
    }

    const seedApply = await app.inject({
      method: "POST",
      url: `/v1/admin/vision/improve/${seed.id}/apply`,
      headers: { authorization: `Bearer ${staffToken}` },
    });
    expect(seedApply.statusCode).toBe(200);
    expect(adminVisionImproveRowSchema.parse(JSON.parse(seedApply.body)).status).toBe("noted");

    const promptApply = await app.inject({
      method: "POST",
      url: `/v1/admin/vision/improve/${prompt.id}/apply`,
      headers: { authorization: `Bearer ${staffToken}` },
    });
    expect(promptApply.statusCode).toBe(200);
    expect(adminVisionImproveRowSchema.parse(JSON.parse(promptApply.body)).status).toBe("noted");

    const { db: afterDb, pool: afterPool } = createDb(DATABASE_URL);
    const [labelsAfter] = await afterDb.select({ value: count() }).from(catalogLabel);
    const [clubsAfter] = await afterDb.select({ value: count() }).from(club);
    const [kitsAfter] = await afterDb.select({ value: count() }).from(kit);
    await afterPool.end();
    expect(Number(labelsAfter?.value ?? 0)).toBe(Number(labelsBefore?.value ?? 0));
    expect(Number(clubsAfter?.value ?? 0)).toBe(Number(clubsBefore?.value ?? 0));
    expect(Number(kitsAfter?.value ?? 0)).toBe(Number(kitsBefore?.value ?? 0));
  });

  it("dismisses a proposed alias-shaped coverage leftover as dismissed", async () => {
    await gemAndSave("vision-improve-dismiss@example.com", CLUB_B, {
      clubHint: "Qyx Miss",
      visionRaw: JSON.stringify({ clubHint: "Qyx Miss" }),
      confidences: { overall: 80, club: 80 },
    });
    const proposed = await staffImprove();
    const row = proposed.rows.find((entry) => entry.text === "Qyx Miss");
    expect(row?.kind).toBe("seed");
    if (!row) {
      throw new Error("expected dismiss row");
    }
    const response = await app.inject({
      method: "POST",
      url: `/v1/admin/vision/improve/${row.id}/dismiss`,
      headers: { authorization: `Bearer ${staffToken}` },
    });
    expect(response.statusCode).toBe(200);
    expect(adminVisionImproveRowSchema.parse(JSON.parse(response.body)).status).toBe("dismissed");
    const stillProposed = await staffImprove();
    expect(stillProposed.rows.some((entry) => entry.id === row.id)).toBe(false);
  });

  it("applies an FCK alias onto club B and maps the hint through CatalogLabel", async () => {
    const { db, pool } = createDb(DATABASE_URL);
    const aliasesBefore = await db
      .select({ id: catalogLabel.id, locale: catalogLabel.locale, source: catalogLabel.source })
      .from(catalogLabel)
      .where(
        and(
          eq(catalogLabel.entityType, "club"),
          eq(catalogLabel.entityId, CLUB_B),
          eq(catalogLabel.kind, "alias"),
          eq(catalogLabel.text, "FCK"),
        ),
      );
    await pool.end();
    const aliasCountBefore = aliasesBefore.length;

    const proposed = await staffImprove();
    const aliasRow = proposed.rows.find((row) => row.fingerprint === ALIAS_FINGERPRINT);
    expect(aliasRow).toBeDefined();
    if (!aliasRow) {
      throw new Error("expected FCK alias improve");
    }
    const applied = await app.inject({
      method: "POST",
      url: `/v1/admin/vision/improve/${aliasRow.id}/apply`,
      headers: { authorization: `Bearer ${staffToken}` },
    });
    expect(applied.statusCode).toBe(200);
    const body = adminVisionImproveRowSchema.parse(JSON.parse(applied.body));
    expect(body.status).toBe("applied");

    const { db: afterDb, pool: afterPool } = createDb(DATABASE_URL);
    const aliasesAfter = await afterDb
      .select({ id: catalogLabel.id })
      .from(catalogLabel)
      .where(
        and(
          eq(catalogLabel.entityType, "club"),
          eq(catalogLabel.entityId, CLUB_B),
          eq(catalogLabel.kind, "alias"),
          eq(catalogLabel.text, "FCK"),
        ),
      );
    const mapped = await new VisionCatalogMapper(afterDb).mapHints({ clubHint: "FCK" });
    await afterPool.end();
    expect(aliasesAfter.length).toBe(aliasCountBefore);
    expect(mapped?.clubId).toBe(CLUB_B);
  });

  it("keeps the improve row when UserJersey take-down deletes vision_log", async () => {
    const { session, jobId, saved } = await gemAndSave(
      "vision-improve-takedown@example.com",
      CLUB_B,
      {
        clubHint: "FC Copenhagen",
        visionRaw: JSON.stringify({ clubHint: "FC Copenhagen" }),
        confidences: { overall: 80, club: 80 },
      },
    );
    const jerseyId = collectionSaveResponseSchema.parse(JSON.parse(saved.body)).jersey.id;
    const before = await staffImprove();
    const improveRow = before.rows.find((row) => row.text === "FC Copenhagen");
    expect(improveRow).toBeDefined();

    const deleted = await app.inject({
      method: "DELETE",
      url: `/v1/collection/jerseys/${jerseyId}`,
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    expect(deleted.statusCode).toBe(204);

    const { db, pool } = createDb(DATABASE_URL);
    const logs = await db
      .select({ id: visionLog.id })
      .from(visionLog)
      .where(eq(visionLog.id, jobId));
    await pool.end();
    expect(logs).toHaveLength(0);

    const after = await staffImprove();
    expect(after.rows.some((row) => row.id === improveRow?.id)).toBe(true);
  });
});
