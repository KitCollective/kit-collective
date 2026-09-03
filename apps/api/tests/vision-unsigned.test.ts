import "reflect-metadata";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  UNSIGNED_VISION_SUGGEST_CAP,
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
} from "@kit/db";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../dist/app.module.js";
import { FailingVisionAdapter, StubVisionAdapter } from "../dist/vision/test-vision.adapters.js";
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

const JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFwABAQEBAAAAAAAAAAAAAAAAAAUGB//EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA//2Q==";

const THROTTLE_IP = "203.0.113.77";

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

async function insertCatalogFixture() {
  const { db, pool } = createDb(DATABASE_URL);

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

  await db.insert(teamSeason).values({
    clubId: CLUB_ID,
    seasonId: SEASON_ID,
  });

  await db.insert(catalogLabel).values({
    entityType: "club",
    entityId: CLUB_ID,
    locale: "da",
    kind: "label",
    text: "F.C. København",
    source: "seed",
  });

  await pool.end();
}

async function waitForVisionJob(
  app: NestFastifyApplication,
  jobId: string,
): Promise<ReturnType<typeof visionJobResponseSchema.parse>> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = await app.inject({
      method: "GET",
      url: `/v1/collection/vision/jobs/${jobId}/unsigned`,
      headers: { "accept-language": "da" },
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

function unsignedSuggestPayload() {
  return {
    photo: { role: "front" as const, contentBase64: JPEG_BASE64 },
  };
}

describe("Unsigned Vision /v1", () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.JWT_SECRET = "test-jwt-secret";
    process.env.BETTER_AUTH_SECRET = "test-better-auth-secret-not-for-production";
    process.env.BETTER_AUTH_URL = "http://127.0.0.1:3000";
    process.env.ANONYMOUS_VISION_USER_ID = ANONYMOUS_VISION_USER_ID;
    delete process.env.R2_ENDPOINT;

    await resetDatabase(DATABASE_URL, migrationsFolder);
    await insertAnonymousVisionUser();
    await insertCatalogFixture();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(VISION_ADAPTER)
      .useValue(
        new StubVisionAdapter({
          clubId: CLUB_ID,
          seasonId: SEASON_ID,
          type: "home",
          confidences: { overall: 80 },
        }),
      )
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.setGlobalPrefix("v1");
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("accepts unsigned suggest without Bearer and returns catalog UUID suggestions", async () => {
    const suggest = await app.inject({
      method: "POST",
      url: "/v1/collection/vision/suggest/unsigned",
      payload: unsignedSuggestPayload(),
    });

    expect(suggest.statusCode).toBe(202);
    const { jobId } = visionSuggestResponseSchema.parse(JSON.parse(suggest.body));

    const job = await waitForVisionJob(app, jobId);
    expect(job.status).toBe("ready");
    expect(job.suggestions?.clubId).toBe(CLUB_ID);
    expect(job.suggestions?.seasonId).toBe(SEASON_ID);
    expect(job.suggestions?.clubLabel).toBe("F.C. København");
    expect(job.suggestions?.seasonLabel).toBe("2023/24");
  });

  it("fail-opens when the Vision adapter throws", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(VISION_ADAPTER)
      .useValue(new FailingVisionAdapter())
      .compile();

    const failApp = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    failApp.setGlobalPrefix("v1");
    await failApp.init();
    await failApp.getHttpAdapter().getInstance().ready();

    const suggest = await failApp.inject({
      method: "POST",
      url: "/v1/collection/vision/suggest/unsigned",
      payload: unsignedSuggestPayload(),
    });
    expect(suggest.statusCode).toBe(202);

    const { jobId } = visionSuggestResponseSchema.parse(JSON.parse(suggest.body));
    const job = await waitForVisionJob(failApp, jobId);
    expect(job.status).toBe("failed");

    await failApp.close();
  });

  it("returns 429 when the unsigned suggest IP cap is exceeded", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(VISION_ADAPTER)
      .useValue(new StubVisionAdapter({ clubId: CLUB_ID, confidences: { overall: 80 } }))
      .compile();

    const throttleApp = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    throttleApp.setGlobalPrefix("v1");
    await throttleApp.init();
    await throttleApp.getHttpAdapter().getInstance().ready();

    for (let i = 0; i < UNSIGNED_VISION_SUGGEST_CAP; i += 1) {
      const response = await throttleApp.inject({
        method: "POST",
        url: "/v1/collection/vision/suggest/unsigned",
        remoteAddress: THROTTLE_IP,
        payload: unsignedSuggestPayload(),
      });
      expect(response.statusCode).toBe(202);
    }

    const blocked = await throttleApp.inject({
      method: "POST",
      url: "/v1/collection/vision/suggest/unsigned",
      remoteAddress: THROTTLE_IP,
      payload: unsignedSuggestPayload(),
    });
    expect(blocked.statusCode).toBe(429);

    await throttleApp.close();
  });

  it("keeps signed suggest and catalog search on auth", async () => {
    const signedSuggest = await app.inject({
      method: "POST",
      url: "/v1/collection/vision/suggest",
      payload: unsignedSuggestPayload(),
    });
    expect(signedSuggest.statusCode).toBe(401);

    const catalogSearch = await app.inject({
      method: "GET",
      url: "/v1/catalog/clubs/search?q=københavn",
      headers: { "accept-language": "da" },
    });
    expect(catalogSearch.statusCode).toBe(401);
  });
});
