import "reflect-metadata";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  billingIapResponseSchema,
  billingStartTrialResponseSchema,
  entitlementSchema,
  identityMeSchema,
  identitySessionSchema,
} from "@kit/api-contract";
import { createDb, resetDatabase, user } from "@kit/db";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../dist/app.module.js";
import { FakeIapVerifierAdapter } from "../dist/billing/fake-iap.adapter.js";
import { IAP_VERIFIER } from "../dist/billing/iap-verifier.adapter.js";

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../packages/db/migrations",
);

const DATABASE_URL =
  process.env.API_TEST_DATABASE_URL ?? "postgresql://kit:kit@localhost:5432/kit_api_test";

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

describe("entitlement and Nest-trial", () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    await resetDatabase(DATABASE_URL, migrationsFolder);

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(IAP_VERIFIER)
      .useValue(new FakeIapVerifierAdapter())
      .compile();

    app = moduleRef.createNestApplication(new FastifyAdapter());
    app.setGlobalPrefix("v1");
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
    const { pool } = createDb(DATABASE_URL);
    await pool.end();
  });

  it("returns inactive entitlement on session GET /identity/me", async () => {
    const session = await registerSession(app, "entitlement-me@example.com");

    const response = await app.inject({
      method: "GET",
      url: "/v1/identity/me",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const me = identityMeSchema.parse(JSON.parse(response.body));
    expect(me.entitlement).toEqual(
      entitlementSchema.parse({
        live: false,
        source: null,
        expires: null,
        trialUsed: false,
      }),
    );
  });

  it("starts Nest-trial once when Offer.trial is enabled", async () => {
    const session = await registerSession(app, "entitlement-trial@example.com");

    const response = await app.inject({
      method: "POST",
      url: "/v1/billing/trial",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const entitlement = billingStartTrialResponseSchema.parse(JSON.parse(response.body));
    expect(entitlement.live).toBe(true);
    expect(entitlement.source).toBe("trial");
    expect(entitlement.trialUsed).toBe(true);
    expect(entitlement.expires).not.toBeNull();
  });

  it("blocks a second Nest-trial when trialUsed is true", async () => {
    const session = await registerSession(app, "entitlement-trial-twice@example.com");

    const first = await app.inject({
      method: "POST",
      url: "/v1/billing/trial",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: "POST",
      url: "/v1/billing/trial",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
    });

    expect(second.statusCode).toBe(409);
  });

  it("returns 401 for trial start without session", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/billing/trial",
    });

    expect(response.statusCode).toBe(401);
  });

  it("does not grant live entitlement for role=admin", async () => {
    const session = await registerSession(app, "entitlement-admin@example.com");
    const { db, pool } = createDb(DATABASE_URL);
    await db
      .update(user)
      .set({ role: "admin" })
      .where(eq(user.email, "entitlement-admin@example.com"));
    await pool.end();

    const response = await app.inject({
      method: "GET",
      url: "/v1/identity/me",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const me = identityMeSchema.parse(JSON.parse(response.body));
    expect(me.role).toBe("admin");
    expect(me.entitlement.live).toBe(false);
    expect(me.entitlement.source).toBeNull();
  });

  it("verifies IAP purchase with fake adapter and returns live entitlement", async () => {
    const session = await registerSession(app, "iap-verify@example.com");

    const response = await app.inject({
      method: "POST",
      url: "/v1/billing/verify",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      payload: {
        platform: "apple",
        productId: "com.kitcollective.premium.month",
        token: "valid-store-token",
      },
    });

    expect(response.statusCode).toBe(200);
    const entitlement = billingIapResponseSchema.parse(JSON.parse(response.body));
    expect(entitlement.live).toBe(true);
    expect(entitlement.source).toBe("iap_apple");
    expect(entitlement.expires).not.toBeNull();
  });

  it("rejects invalid IAP token", async () => {
    const session = await registerSession(app, "iap-invalid@example.com");

    const response = await app.inject({
      method: "POST",
      url: "/v1/billing/verify",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      payload: {
        platform: "google",
        productId: "com.kitcollective.premium.year",
        token: "invalid-token",
      },
    });

    expect(response.statusCode).toBe(422);
  });

  it("restores IAP purchase and upserts entitlement", async () => {
    const session = await registerSession(app, "iap-restore@example.com");

    const response = await app.inject({
      method: "POST",
      url: "/v1/billing/restore",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      payload: {
        platform: "apple",
        token: "restore-token",
      },
    });

    expect(response.statusCode).toBe(200);
    const entitlement = billingIapResponseSchema.parse(JSON.parse(response.body));
    expect(entitlement.live).toBe(true);
    expect(entitlement.source).toBe("iap_apple");
  });

  it("returns 401 for IAP verify without session", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/billing/verify",
      payload: {
        platform: "apple",
        productId: "com.kitcollective.premium.month",
        token: "valid-store-token",
      },
    });

    expect(response.statusCode).toBe(401);
  });

  it("returns 401 for IAP restore without session", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/billing/restore",
      payload: {
        platform: "apple",
        token: "restore-token",
      },
    });

    expect(response.statusCode).toBe(401);
  });
});
