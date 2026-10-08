import "reflect-metadata";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDb, type Db, resetDatabase, user, userJersey } from "@kit/db";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../dist/app.module.js";
import { TEST_COLLECTOR_ID } from "../dist/e2e/test-data.fixture.js";
import { insertFixtureCatalog } from "./helpers/e2e-fixture-catalog.js";

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../packages/db/migrations",
);

const DATABASE_URL =
  process.env.API_TEST_DATABASE_URL ?? "postgresql://kit:kit@localhost:5432/kit_api_test";

const TOKEN = "test-data-token-0123456789abcdef";

const TARGET_ENV = {
  E2E_TEST_DATA_TOKEN: TOKEN,
  E2E_TEST_DATA_TARGET: "local",
  E2E_COLLECTOR_EMAIL: "e2e-collector@test.kitcollective",
  E2E_COLLECTOR_PASSWORD: "collector-pass-1",
  E2E_PEER_EMAIL: "e2e-peer@test.kitcollective",
  E2E_PEER_PASSWORD: "peer-pass-1",
};

describe("POST /v1/e2e/test-data", () => {
  let app: NestFastifyApplication;
  let db: Db;
  let closePool: () => Promise<void>;

  const post = (token?: string) =>
    app.inject({
      method: "POST",
      url: "/v1/e2e/test-data",
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });

  const collectorJerseys = () =>
    db.select().from(userJersey).where(eq(userJersey.userId, TEST_COLLECTOR_ID));

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    delete process.env.R2_ENDPOINT;
    await resetDatabase(DATABASE_URL, migrationsFolder);
    const created = createDb(DATABASE_URL);
    db = created.db;
    closePool = () => created.pool.end();
    await insertFixtureCatalog(db);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.setGlobalPrefix("v1");
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
    await closePool();
    for (const name of [...Object.keys(TARGET_ENV), "PRODUCTION_DATABASE_URL"]) {
      delete process.env[name];
    }
  });

  beforeEach(() => {
    Object.assign(process.env, TARGET_ENV);
    delete process.env.PRODUCTION_DATABASE_URL;
  });

  it("does not exist on a lane without a test-data token", async () => {
    delete process.env.E2E_TEST_DATA_TOKEN;
    expect((await post(TOKEN)).statusCode).toBe(404);
    expect(await db.select({ id: user.id }).from(user)).toHaveLength(0);
  });

  it("rejects a missing or wrong token", async () => {
    expect((await post()).statusCode).toBe(401);
    expect((await post(`${TOKEN}x`)).statusCode).toBe(401);
    expect(await collectorJerseys()).toHaveLength(0);
  });

  it("refuses when the target is production", async () => {
    process.env.E2E_TEST_DATA_TARGET = "production";
    expect((await post(TOKEN)).statusCode).toBe(403);
    expect(await collectorJerseys()).toHaveLength(0);
  });

  it("does not exist on a production process, whatever else is set", async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      expect((await post(TOKEN)).statusCode).toBe(404);
      expect(await collectorJerseys()).toHaveLength(0);
    } finally {
      process.env.NODE_ENV = original;
    }
  });

  it("refuses when DATABASE_URL is the production database", async () => {
    process.env.PRODUCTION_DATABASE_URL = DATABASE_URL;
    expect((await post(TOKEN)).statusCode).toBe(403);
    expect(await collectorJerseys()).toHaveLength(0);
  });

  it("applies the test data with the right token, and again", async () => {
    expect((await post(TOKEN)).statusCode).toBe(204);
    expect(await collectorJerseys()).toHaveLength(4);
    expect((await post(TOKEN)).statusCode).toBe(204);
    expect(await collectorJerseys()).toHaveLength(4);
  });
});
