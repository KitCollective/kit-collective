import "reflect-metadata";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  adminCollectorUserSchema,
  entitlementSchema,
  grantCompResponseSchema,
  identitySessionSchema,
  offerSchema,
} from "@kit/api-contract";
import { createDb, entitlement, resetDatabase, user } from "@kit/db";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../dist/app.module.js";

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../packages/db/migrations",
);

const DATABASE_URL =
  process.env.API_TEST_DATABASE_URL ?? "postgresql://kit:kit@localhost:5432/kit_api_test";

async function registerUser(app: NestFastifyApplication, email: string) {
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

async function promoteToAdmin(email: string) {
  const { db, pool } = createDb(DATABASE_URL);
  await db.update(user).set({ role: "admin" }).where(eq(user.email, email.toLowerCase()));
  await pool.end();
}

async function loginUser(app: NestFastifyApplication, email: string) {
  const response = await app.inject({
    method: "POST",
    url: "/v1/identity/login",
    payload: {
      email,
      password: "password123",
    },
  });
  return identitySessionSchema.parse(JSON.parse(response.body));
}

describe("Admin billing /v1", () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.JWT_SECRET = "test-jwt-secret";
    await resetDatabase(DATABASE_URL, migrationsFolder);

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.setGlobalPrefix("v1");
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns 401 for unauthenticated offer PATCH", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: "/v1/admin/billing/offer",
      payload: {
        monthProductId: "com.kitcollective.premium.month",
        yearProductId: "com.kitcollective.premium.year",
        trialEnabled: true,
        trialDays: 7,
      },
    });
    expect(response.statusCode).toBe(401);
  });

  it("returns 403 for collector offer PATCH and grant comp", async () => {
    const collector = await registerUser(app, "billing-collector@example.com");
    await registerUser(app, "billing-target@example.com");

    const offerPatch = await app.inject({
      method: "PATCH",
      url: "/v1/admin/billing/offer",
      headers: { authorization: `Bearer ${collector.accessToken}` },
      payload: {
        monthProductId: "com.kitcollective.premium.month",
        yearProductId: "com.kitcollective.premium.year",
        trialEnabled: true,
        trialDays: 7,
      },
    });
    expect(offerPatch.statusCode).toBe(403);

    const { db, pool } = createDb(DATABASE_URL);
    const [target] = await db
      .select()
      .from(user)
      .where(eq(user.email, "billing-target@example.com"));
    await pool.end();

    const grantComp = await app.inject({
      method: "PATCH",
      url: `/v1/admin/collectors/${target?.id}/entitlement/comp`,
      headers: { authorization: `Bearer ${collector.accessToken}` },
      payload: { expires: "2026-12-31T23:59:59.000Z" },
    });
    expect(grantComp.statusCode).toBe(403);
  });

  it("PATCH offer as admin and grant comp sets source comp without changing role", async () => {
    await registerUser(app, "billing-admin@example.com");
    await promoteToAdmin("billing-admin@example.com");
    const adminSession = await loginUser(app, "billing-admin@example.com");

    const collector = await registerUser(app, "billing-comp-target@example.com");

    const offerResponse = await app.inject({
      method: "PATCH",
      url: "/v1/admin/billing/offer",
      headers: { authorization: `Bearer ${adminSession.accessToken}` },
      payload: {
        monthProductId: "com.example.month",
        yearProductId: "com.example.year",
        trialEnabled: false,
        trialDays: 0,
      },
    });
    expect(offerResponse.statusCode).toBe(200);
    expect(offerSchema.parse(JSON.parse(offerResponse.body))).toEqual({
      monthProductId: "com.example.month",
      yearProductId: "com.example.year",
      trialEnabled: false,
      trialDays: 0,
    });

    const expires = "2026-12-31T23:59:59.000Z";
    const grantResponse = await app.inject({
      method: "PATCH",
      url: `/v1/admin/collectors/${collector.user.id}/entitlement/comp`,
      headers: { authorization: `Bearer ${adminSession.accessToken}` },
      payload: { expires },
    });
    expect(grantResponse.statusCode).toBe(200);
    expect(grantCompResponseSchema.parse(JSON.parse(grantResponse.body))).toEqual(
      entitlementSchema.parse({
        live: true,
        source: "comp",
        expires,
        trialUsed: false,
      }),
    );

    const drillResponse = await app.inject({
      method: "GET",
      url: `/v1/admin/collectors/${collector.user.id}`,
      headers: { authorization: `Bearer ${adminSession.accessToken}` },
    });
    expect(drillResponse.statusCode).toBe(200);
    const drill = adminCollectorUserSchema.parse(JSON.parse(drillResponse.body));
    expect(drill.role).toBe("user");
    expect(drill.entitlement.source).toBe("comp");
    expect(drill.entitlement.expires).toBe(expires);

    const { db, pool } = createDb(DATABASE_URL);
    const [row] = await db
      .select()
      .from(entitlement)
      .where(eq(entitlement.userId, collector.user.id));
    await pool.end();
    expect(row?.source).toBe("comp");
  });

  it("returns 401 for unauthenticated grant comp", async () => {
    const collector = await registerUser(app, "billing-no-session@example.com");
    const response = await app.inject({
      method: "PATCH",
      url: `/v1/admin/collectors/${collector.user.id}/entitlement/comp`,
      payload: { expires: "2026-12-31T23:59:59.000Z" },
    });
    expect(response.statusCode).toBe(401);
  });
});
