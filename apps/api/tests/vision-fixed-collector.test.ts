import "reflect-metadata";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  identitySessionSchema,
  visionJobResponseSchema,
  visionSuggestResponseSchema,
} from "@kit/api-contract";
import { createDb, type Db, resetDatabase } from "@kit/db";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../dist/app.module.js";
import { createMemoryObjectStore } from "../dist/collection/object-store.js";
import { DB } from "../dist/db/db.module.js";
import { resolveCatalogSide } from "../dist/e2e/catalog-side.js";
import { FIXED_VISION_SUGGESTION, TEST_COLLECTOR_ID } from "../dist/e2e/test-data.fixture.js";
import { applyTestData } from "../dist/e2e/test-data.js";
import { CollectorScopedVisionAdapter } from "../dist/vision/collector-scoped-vision.adapter.js";
import { createVisionAdapter } from "../dist/vision/create-vision.adapter.js";
import { FixedVisionAdapter } from "../dist/vision/fixed-vision.adapter.js";
import { NoopVisionAdapter } from "../dist/vision/noop-vision.adapter.js";
import { StubVisionAdapter } from "../dist/vision/test-vision.adapters.js";
import { VISION_ADAPTER } from "../dist/vision/vision.adapter.js";
import { insertFixtureCatalog } from "./helpers/e2e-fixture-catalog.js";

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../packages/db/migrations",
);

const DATABASE_URL =
  process.env.API_TEST_DATABASE_URL ?? "postgresql://kit:kit@localhost:5432/kit_api_test";

const CREDENTIALS = {
  collector: { email: "e2e-collector@test.kitcollective", password: "collector-pass-1" },
  peer: { email: "e2e-peer@test.kitcollective", password: "peer-pass-1" },
};

const JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFwABAQEBAAAAAAAAAAAAAAAAAAUGB//EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA//2Q==";

async function identitySuggestion(app: NestFastifyApplication, accessToken: string) {
  const suggest = await app.inject({
    method: "POST",
    url: "/v1/collection/vision/suggest",
    headers: { authorization: `Bearer ${accessToken}` },
    payload: { photos: [{ role: "front", contentBase64: JPEG_BASE64 }] },
  });
  expect(suggest.statusCode).toBe(202);
  const { jobId } = visionSuggestResponseSchema.parse(JSON.parse(suggest.body));
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = await app.inject({
      method: "GET",
      url: `/v1/collection/vision/jobs/${jobId}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const job = visionJobResponseSchema.parse(JSON.parse(response.body));
    if (job.status !== "pending") {
      return { status: job.status, suggestions: job.suggestions };
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Vision job did not finish");
}

describe("fixed Vision for the test Collector", () => {
  let app: NestFastifyApplication;
  let db: Db;
  let closePool: () => Promise<void>;
  let liveClubId: string;
  let liveSeasonId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    delete process.env.R2_ENDPOINT;
    await resetDatabase(DATABASE_URL, migrationsFolder);
    const created = createDb(DATABASE_URL);
    db = created.db;
    closePool = () => created.pool.end();
    await insertFixtureCatalog(db);
    await applyTestData({ db, objectStore: createMemoryObjectStore(), credentials: CREDENTIALS });

    // What the live adapter would say: a different club than the fixed suggestion.
    const live = await resolveCatalogSide(db, { kind: "club", label: "OB" });
    liveClubId = live!.clubId!;
    liveSeasonId = live!.seasonId;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(VISION_ADAPTER)
      .useFactory({
        factory: (appDb: Db) =>
          new CollectorScopedVisionAdapter(
            new StubVisionAdapter({
              clubId: liveClubId,
              seasonId: liveSeasonId,
              type: "away",
              confidences: { overall: 90 },
            }),
            new FixedVisionAdapter(appDb),
            TEST_COLLECTOR_ID,
          ),
        inject: [DB],
      })
      .compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.setGlobalPrefix("v1");
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
    await closePool();
  });

  it("gives the test Collector identical suggestions on two consecutive runs", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/v1/identity/login",
      payload: CREDENTIALS.collector,
    });
    const { accessToken } = identitySessionSchema.parse(JSON.parse(login.body));
    const fixed = await resolveCatalogSide(db, FIXED_VISION_SUGGESTION.side);

    const first = await identitySuggestion(app, accessToken);
    const second = await identitySuggestion(app, accessToken);

    expect(first.status).toBe("ready");
    expect(first.suggestions).toMatchObject({
      clubId: fixed!.clubId,
      seasonId: fixed!.seasonId,
      type: FIXED_VISION_SUGGESTION.type,
    });
    expect(second).toEqual(first);
  });

  it("leaves another Collector on the live adapter", async () => {
    const register = await app.inject({
      method: "POST",
      url: "/v1/identity/register",
      payload: { email: "real-collector@test.kitcollective", password: "password123" },
    });
    const { accessToken } = identitySessionSchema.parse(JSON.parse(register.body));

    const job = await identitySuggestion(app, accessToken);

    expect(job.suggestions).toMatchObject({
      clubId: liveClubId,
      seasonId: liveSeasonId,
      type: "away",
    });
  });
});

describe("Vision adapter selection", () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it("is the live adapter alone unless fixed Vision is switched on", () => {
    delete process.env.VISION_FIXED_FOR_TEST_COLLECTOR;
    delete process.env.OPENROUTER_VISION_API_KEY;
    delete process.env.GEMINI_API_KEY;
    const { db, pool } = createDb(DATABASE_URL);
    expect(createVisionAdapter(db)).toBeInstanceOf(NoopVisionAdapter);
    void pool.end();
  });

  it("stays the live adapter on a production process even when switched on", () => {
    process.env.VISION_FIXED_FOR_TEST_COLLECTOR = "on";
    process.env.NODE_ENV = "production";
    delete process.env.OPENROUTER_VISION_API_KEY;
    delete process.env.GEMINI_API_KEY;
    const { db, pool } = createDb(DATABASE_URL);
    expect(createVisionAdapter(db)).toBeInstanceOf(NoopVisionAdapter);
    void pool.end();
  });

  it("scopes the fixed adapter to the test Collector when switched on", () => {
    process.env.VISION_FIXED_FOR_TEST_COLLECTOR = "on";
    const { db, pool } = createDb(DATABASE_URL);
    expect(createVisionAdapter(db)).toBeInstanceOf(CollectorScopedVisionAdapter);
    void pool.end();
  });
});
