import "reflect-metadata";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  identityExportSchema,
  identitySessionSchema,
  NOTIFICATION_PREFS_DEFAULTS,
  notificationPrefsSchema,
} from "@kit/api-contract";
import { createDb, notificationPreference, resetDatabase } from "@kit/db";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../dist/app.module.js";
import { clearAuthThrottleHits } from "./helpers/auth-throttle.js";

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../packages/db/migrations",
);

const DATABASE_URL =
  process.env.API_TEST_DATABASE_URL ?? "postgresql://kit:kit@localhost:5432/kit_api_test";

describe("Identity /v1 notification preferences", () => {
  let app: NestFastifyApplication;
  let helperDb: ReturnType<typeof createDb>;

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.JWT_SECRET = "test-jwt-secret";
    process.env.BETTER_AUTH_SECRET = "test-better-auth-secret-not-for-production";
    process.env.BETTER_AUTH_URL = "http://127.0.0.1:3000";
    delete process.env.R2_ENDPOINT;
    await resetDatabase(DATABASE_URL, migrationsFolder);
    helperDb = createDb(DATABASE_URL);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.setGlobalPrefix("v1");
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await helperDb.pool.end();
    await app.close();
  });

  beforeEach(async () => {
    await clearAuthThrottleHits();
  });

  async function register(email: string) {
    const response = await app.inject({
      method: "POST",
      url: "/v1/identity/register",
      payload: { email, password: "password123" },
    });
    return identitySessionSchema.parse(JSON.parse(response.body));
  }

  function getPrefs(token: string | null) {
    return app.inject({
      method: "GET",
      url: "/v1/identity/notification-prefs",
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
  }

  /** Takes any body, valid or not: the invalid cases are the point of some tests. */
  function patchPrefs(token: string | null, body: unknown) {
    return app.inject({
      method: "PATCH",
      url: "/v1/identity/notification-prefs",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      payload: JSON.stringify(body),
    });
  }

  it("gives a new Collector the defaults", async () => {
    const session = await register("np-defaults@example.com");

    const response = await getPrefs(session.accessToken);

    expect(response.statusCode).toBe(200);
    expect(notificationPrefsSchema.parse(JSON.parse(response.body))).toEqual(
      NOTIFICATION_PREFS_DEFAULTS,
    );
  });

  it("returns the merged object from a partial update and keeps it on the next read", async () => {
    const session = await register("np-partial@example.com");

    const patch = await patchPrefs(session.accessToken, { email: { news: true } });

    expect(patch.statusCode).toBe(200);
    expect(notificationPrefsSchema.parse(JSON.parse(patch.body))).toEqual({
      ...NOTIFICATION_PREFS_DEFAULTS,
      email: { ...NOTIFICATION_PREFS_DEFAULTS.email, news: true },
    });
    const read = notificationPrefsSchema.parse(
      JSON.parse((await getPrefs(session.accessToken)).body),
    );
    expect(read.email.news).toBe(true);
    expect(read.email.bidsAndMessages).toBe(true);
  });

  it("keeps an earlier change when a later update touches another switch", async () => {
    const session = await register("np-twice@example.com");
    await patchPrefs(session.accessToken, { email: { bidsAndMessages: false } });

    const second = await patchPrefs(session.accessToken, { push: { messages: false } });

    expect(notificationPrefsSchema.parse(JSON.parse(second.body))).toEqual({
      email: { bidsAndMessages: false, wishMatches: true, news: false },
      push: { bids: true, messages: false, wishMatches: true },
    });
  });

  it("never lets one Collector's update reach another's preferences", async () => {
    const alice = await register("np-alice@example.com");
    const bob = await register("np-bob@example.com");

    await patchPrefs(alice.accessToken, {
      email: { bidsAndMessages: false, wishMatches: false, news: true },
      push: { bids: false, messages: false, wishMatches: false },
    });

    const bobRead = notificationPrefsSchema.parse(
      JSON.parse((await getPrefs(bob.accessToken)).body),
    );
    expect(bobRead).toEqual(NOTIFICATION_PREFS_DEFAULTS);
  });

  it("answers 401 without a session on both verbs", async () => {
    expect((await getPrefs(null)).statusCode).toBe(401);
    expect((await patchPrefs(null, { email: { news: true } })).statusCode).toBe(401);
  });

  it("answers 400 on an unknown key, an empty body and a non-boolean switch", async () => {
    const session = await register("np-invalid@example.com");

    expect((await patchPrefs(session.accessToken, { email: { sms: true } })).statusCode).toBe(400);
    expect((await patchPrefs(session.accessToken, { sms: { news: true } })).statusCode).toBe(400);
    expect((await patchPrefs(session.accessToken, {})).statusCode).toBe(400);
    expect((await patchPrefs(session.accessToken, { push: { bids: "yes" } })).statusCode).toBe(400);
  });

  it("includes the preferences in the data export", async () => {
    const session = await register("np-export@example.com");
    await patchPrefs(session.accessToken, { email: { news: true }, push: { bids: false } });

    const response = await app.inject({
      method: "GET",
      url: "/v1/identity/export",
      headers: { authorization: `Bearer ${session.accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const exported = identityExportSchema.parse(JSON.parse(response.body));
    expect(exported.notificationPrefs).toEqual({
      email: { bidsAndMessages: true, wishMatches: true, news: true },
      push: { bids: false, messages: true, wishMatches: true },
    });
  });

  it("exports the defaults for a Collector with no stored record", async () => {
    const session = await register("np-export-default@example.com");

    const response = await app.inject({
      method: "GET",
      url: "/v1/identity/export",
      headers: { authorization: `Bearer ${session.accessToken}` },
    });

    expect(identityExportSchema.parse(JSON.parse(response.body)).notificationPrefs).toEqual(
      NOTIFICATION_PREFS_DEFAULTS,
    );
  });

  it("removes the stored record when the account is deleted", async () => {
    const session = await register("np-delete@example.com");
    await patchPrefs(session.accessToken, { email: { news: true } });
    const before = await helperDb.db
      .select()
      .from(notificationPreference)
      .where(eq(notificationPreference.userId, session.user.id));
    expect(before).toHaveLength(1);

    const del = await app.inject({
      method: "DELETE",
      url: "/v1/identity/me",
      headers: { authorization: `Bearer ${session.accessToken}` },
    });

    expect(del.statusCode).toBe(204);
    const after = await helperDb.db
      .select()
      .from(notificationPreference)
      .where(eq(notificationPreference.userId, session.user.id));
    expect(after).toHaveLength(0);
  });
});
