import "reflect-metadata";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  adminAuthEventsSchema,
  authEventsSchema,
  authSecurityDetectionsSchema,
  identitySessionSchema,
} from "@kit/api-contract";
import { createDb, resetDatabase, user } from "@kit/db";
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

describe("Admin Auth ops /v1", () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.JWT_SECRET = "test-jwt-secret";
    process.env.BETTER_AUTH_SECRET = "test-better-auth-secret-not-for-production";
    process.env.BETTER_AUTH_URL = "http://127.0.0.1:3000";
    process.env.SENTINEL_ADAPTER = "fake";
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

  it("returns 401 for unauthenticated Auth ops and revoke", async () => {
    const collector = await registerUser(app, "auth-ops-anon-target@example.com");

    const events = await app.inject({ method: "GET", url: "/v1/admin/auth/events" });
    expect(events.statusCode).toBe(401);

    const security = await app.inject({ method: "GET", url: "/v1/admin/auth/security" });
    expect(security.statusCode).toBe(401);

    const collectorEvents = await app.inject({
      method: "GET",
      url: `/v1/admin/collectors/${collector.user.id}/auth-events`,
    });
    expect(collectorEvents.statusCode).toBe(401);

    const collectorRevoke = await app.inject({
      method: "POST",
      url: `/v1/admin/collectors/${collector.user.id}/sessions/revoke`,
    });
    expect(collectorRevoke.statusCode).toBe(401);

    const ownEvents = await app.inject({ method: "GET", url: "/v1/identity/auth-events" });
    expect(ownEvents.statusCode).toBe(401);

    const revokeAll = await app.inject({
      method: "POST",
      url: "/v1/identity/sessions/revoke-all",
    });
    expect(revokeAll.statusCode).toBe(401);
  });

  it("returns 403 for role=user on Admin Auth ops and another User's revoke", async () => {
    const collector = await registerUser(app, "auth-ops-collector@example.com");
    const other = await registerUser(app, "auth-ops-other@example.com");

    const events = await app.inject({
      method: "GET",
      url: "/v1/admin/auth/events",
      headers: { authorization: `Bearer ${collector.accessToken}` },
    });
    expect(events.statusCode).toBe(403);

    const security = await app.inject({
      method: "GET",
      url: "/v1/admin/auth/security",
      headers: { authorization: `Bearer ${collector.accessToken}` },
    });
    expect(security.statusCode).toBe(403);

    const otherEvents = await app.inject({
      method: "GET",
      url: `/v1/admin/collectors/${other.user.id}/auth-events`,
      headers: { authorization: `Bearer ${collector.accessToken}` },
    });
    expect(otherEvents.statusCode).toBe(403);

    const otherRevoke = await app.inject({
      method: "POST",
      url: `/v1/admin/collectors/${other.user.id}/sessions/revoke`,
      headers: { authorization: `Bearer ${collector.accessToken}` },
    });
    expect(otherRevoke.statusCode).toBe(403);
  });

  it("lists Auth events for Staff and upserts a fake Sentinel detection on Auth ops", async () => {
    await registerUser(app, "auth-ops-listed@example.com");
    const staffRegister = await registerUser(app, "auth-ops-staff@example.com");
    await promoteToAdmin("auth-ops-staff@example.com");
    const staff = await loginUser(app, "auth-ops-staff@example.com");

    const failed = await app.inject({
      method: "POST",
      url: "/v1/identity/login",
      payload: {
        email: "auth-ops-listed@example.com",
        password: "wrong-password",
      },
    });
    expect(failed.statusCode).toBe(401);

    const eventsResponse = await app.inject({
      method: "GET",
      url: "/v1/admin/auth/events",
      headers: { authorization: `Bearer ${staff.accessToken}` },
    });
    expect(eventsResponse.statusCode).toBe(200);
    const events = adminAuthEventsSchema.parse(JSON.parse(eventsResponse.body));
    expect(events.events.map((event) => event.kind)).toEqual(
      expect.arrayContaining(["login", "failure"]),
    );
    expect(events.events.some((event) => event.userId === staffRegister.user.id)).toBe(true);

    const securityResponse = await app.inject({
      method: "GET",
      url: "/v1/admin/auth/security",
      headers: { authorization: `Bearer ${staff.accessToken}` },
    });
    expect(securityResponse.statusCode).toBe(200);
    const security = authSecurityDetectionsSchema.parse(JSON.parse(securityResponse.body));
    expect(security.detections).toHaveLength(1);
    expect(security.detections[0]?.kind).toBe("credential_stuffing");
    expect(security.detections[0]?.summary).toBe("Credential stuffing");
    expect(security.detections[0]?.userId).toBeNull();
    expect(security.detections[0]?.detectedAt).toBe("2026-09-01T12:00:00.000Z");
  });

  it("shows a collector's Auth events on the drill and revokes that collector's sessions", async () => {
    const collector = await registerUser(app, "auth-ops-drill@example.com");
    const secondDevice = await loginUser(app, "auth-ops-drill@example.com");
    await registerUser(app, "auth-ops-drill-staff@example.com");
    await promoteToAdmin("auth-ops-drill-staff@example.com");
    const staff = await loginUser(app, "auth-ops-drill-staff@example.com");

    const listed = await app.inject({
      method: "GET",
      url: `/v1/admin/collectors/${collector.user.id}/auth-events`,
      headers: { authorization: `Bearer ${staff.accessToken}` },
    });
    expect(listed.statusCode).toBe(200);
    const events = authEventsSchema.parse(JSON.parse(listed.body));
    expect(events.events.every((event) => event.userId === collector.user.id)).toBe(true);
    expect(events.events.map((event) => event.kind)).toEqual(expect.arrayContaining(["login"]));

    const revoke = await app.inject({
      method: "POST",
      url: `/v1/admin/collectors/${collector.user.id}/sessions/revoke`,
      headers: { authorization: `Bearer ${staff.accessToken}` },
    });
    expect(revoke.statusCode).toBe(204);

    const collectorMe = await app.inject({
      method: "GET",
      url: "/v1/identity/me",
      headers: { authorization: `Bearer ${collector.accessToken}` },
    });
    expect(collectorMe.statusCode).toBe(401);

    const secondMe = await app.inject({
      method: "GET",
      url: "/v1/identity/me",
      headers: { authorization: `Bearer ${secondDevice.accessToken}` },
    });
    expect(secondMe.statusCode).toBe(401);

    const staffMe = await app.inject({
      method: "GET",
      url: "/v1/identity/me",
      headers: { authorization: `Bearer ${staff.accessToken}` },
    });
    expect(staffMe.statusCode).toBe(200);
  });

  it("lets Staff revoke their own sessions and keeps Peer Auth events off the owner list", async () => {
    await registerUser(app, "auth-ops-self@example.com");
    await promoteToAdmin("auth-ops-self@example.com");
    const first = await loginUser(app, "auth-ops-self@example.com");
    const second = await loginUser(app, "auth-ops-self@example.com");
    const peer = await registerUser(app, "auth-ops-peer@example.com");

    const own = await app.inject({
      method: "GET",
      url: "/v1/identity/auth-events",
      headers: { authorization: `Bearer ${first.accessToken}` },
    });
    expect(own.statusCode).toBe(200);
    const ownEvents = authEventsSchema.parse(JSON.parse(own.body));
    expect(ownEvents.events.every((event) => event.userId === first.user.id)).toBe(true);
    expect(ownEvents.events.some((event) => event.userId === peer.user.id)).toBe(false);

    const revokeAll = await app.inject({
      method: "POST",
      url: "/v1/identity/sessions/revoke-all",
      headers: { authorization: `Bearer ${first.accessToken}` },
    });
    expect(revokeAll.statusCode).toBe(204);

    const firstMe = await app.inject({
      method: "GET",
      url: "/v1/identity/me",
      headers: { authorization: `Bearer ${first.accessToken}` },
    });
    expect(firstMe.statusCode).toBe(401);

    const secondMe = await app.inject({
      method: "GET",
      url: "/v1/identity/me",
      headers: { authorization: `Bearer ${second.accessToken}` },
    });
    expect(secondMe.statusCode).toBe(401);
  });
});
