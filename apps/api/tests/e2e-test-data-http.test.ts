import "reflect-metadata";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDb, type Db, resetDatabase, user, userJersey } from "@kit/db";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../dist/app.module.js";
import { insertLocalFixtureCatalog } from "../dist/e2e/local-catalog.js";
import { TEST_COLLECTOR_ID } from "../dist/e2e/test-data.fixture.js";

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
    await insertLocalFixtureCatalog(db);

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

  it("does not exist without a test-data token", async () => {
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

describe("GET /v1/e2e/last-code", () => {
  let app: NestFastifyApplication;
  let closePool: () => Promise<void>;

  const lastCode = (token?: string, email = "flow@example.com") =>
    app.inject({
      method: "GET",
      url: `/v1/e2e/last-code?email=${encodeURIComponent(email)}`,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.BETTER_AUTH_SECRET = "test-better-auth-secret-not-for-production";
    process.env.BETTER_AUTH_URL = "http://127.0.0.1:3000";
    delete process.env.R2_ENDPOINT;
    await resetDatabase(DATABASE_URL, migrationsFolder);
    const created = createDb(DATABASE_URL);
    closePool = () => created.pool.end();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.setGlobalPrefix("v1");
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
    await closePool();
    delete process.env.E2E_TEST_DATA_TOKEN;
  });

  beforeEach(() => {
    process.env.E2E_TEST_DATA_TOKEN = TOKEN;
  });

  it("does not exist without a test-data token", async () => {
    delete process.env.E2E_TEST_DATA_TOKEN;
    expect((await lastCode(TOKEN)).statusCode).toBe(404);
  });

  it("rejects a missing or wrong token", async () => {
    expect((await lastCode()).statusCode).toBe(401);
    expect((await lastCode(`${TOKEN}x`)).statusCode).toBe(401);
  });

  it("does not exist on a production process", async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      expect((await lastCode(TOKEN)).statusCode).toBe(404);
    } finally {
      process.env.NODE_ENV = original;
    }
  });

  it("lets a mailed code expire on request, behind the same token", async () => {
    const expire = (token?: string) =>
      app.inject({
        method: "POST",
        url: "/v1/e2e/expire-code?email=flow-expire%40example.com",
        headers: token ? { authorization: `Bearer ${token}` } : {},
      });
    await app.inject({
      method: "POST",
      url: "/v1/identity/code",
      payload: { email: "flow-expire@example.com" },
    });
    const code = JSON.parse((await lastCode(TOKEN, "flow-expire@example.com")).body).code;

    expect((await expire()).statusCode).toBe(401);
    expect((await expire(TOKEN)).statusCode).toBe(204);
    const verify = await app.inject({
      method: "POST",
      url: "/v1/identity/code/verify",
      payload: { email: "flow-expire@example.com", code },
    });
    expect(verify.statusCode).toBe(410);
  });

  it("returns the code mailed to the address, and 404 for one that got none", async () => {
    expect((await lastCode(TOKEN)).statusCode).toBe(404);
    await app.inject({
      method: "POST",
      url: "/v1/identity/code",
      payload: { email: "flow@example.com" },
    });
    const response = await lastCode(TOKEN);
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).code).toMatch(/^\d{6}$/);
  });
});
