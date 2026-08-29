import "reflect-metadata";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectionJerseysSchema,
  handleAvailabilityResponseSchema,
  identityMeSchema,
  identitySessionSchema,
} from "@kit/api-contract";
import { resetDatabase } from "@kit/db";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../dist/app.module.js";

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../packages/db/migrations",
);

const DATABASE_URL =
  process.env.API_TEST_DATABASE_URL ?? "postgresql://kit:kit@localhost:5432/kit_api_test";

const JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFwABAQEBAAAAAAAAAAAAAAAAAAUGB//EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA//2Q==";

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

describe("Identity /v1", () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.JWT_SECRET = "test-jwt-secret";
    delete process.env.R2_ENDPOINT;
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

  it("registers a collector and returns a session", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/identity/register",
      payload: {
        email: "collector@example.com",
        password: "password123",
      },
    });

    expect(response.statusCode).toBe(201);
    const body = identitySessionSchema.parse(JSON.parse(response.body));
    expect(body.user.email).toBe("collector@example.com");
    expect(body.user.role).toBe("user");
    expect(body.user.handle).toBe("collector");
    expect(body.accessToken.length).toBeGreaterThan(10);
  });

  it("assigns a unique handle when the email local-part collides", async () => {
    await registerSession(app, "taken@example.com");

    const response = await app.inject({
      method: "POST",
      url: "/v1/identity/register",
      payload: {
        email: "taken+alias@example.com",
        password: "password123",
      },
    });

    expect(response.statusCode).toBe(201);
    const body = identitySessionSchema.parse(JSON.parse(response.body));
    expect(body.user.handle).toBe("taken_alias");
  });

  it("logs in with email and password", async () => {
    await app.inject({
      method: "POST",
      url: "/v1/identity/register",
      payload: {
        email: "login@example.com",
        password: "password123",
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/identity/login",
      payload: {
        email: "login@example.com",
        password: "password123",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = identitySessionSchema.parse(JSON.parse(response.body));
    expect(body.user.email).toBe("login@example.com");
    expect(body.user.handle).toBe("login");
  });

  it("returns the current user with a valid bearer token", async () => {
    const session = await registerSession(app, "me@example.com");

    const response = await app.inject({
      method: "GET",
      url: "/v1/identity/me",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = identityMeSchema.parse(JSON.parse(response.body));
    expect(body.handle).toBe("me");
    expect(body.aboutMe).toBeNull();
    expect(body.avatarUrl).toBeNull();
  });

  it("rejects unauthenticated identity requests with 401", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/identity/me",
    });

    expect(response.statusCode).toBe(401);
  });

  it("reports handle availability for yours, available, and taken", async () => {
    const sessionA = await registerSession(app, "alpha@example.com");
    const sessionB = await registerSession(app, "beta@example.com");

    const yours = await app.inject({
      method: "GET",
      url: "/v1/identity/handle-availability?handle=alpha",
      headers: { authorization: `Bearer ${sessionA.accessToken}` },
    });
    expect(handleAvailabilityResponseSchema.parse(JSON.parse(yours.body))).toEqual({
      handle: "alpha",
      status: "yours",
    });

    const available = await app.inject({
      method: "GET",
      url: "/v1/identity/handle-availability?handle=freehandle",
      headers: { authorization: `Bearer ${sessionA.accessToken}` },
    });
    expect(handleAvailabilityResponseSchema.parse(JSON.parse(available.body))).toEqual({
      handle: "freehandle",
      status: "available",
    });

    const taken = await app.inject({
      method: "GET",
      url: "/v1/identity/handle-availability?handle=beta",
      headers: { authorization: `Bearer ${sessionA.accessToken}` },
    });
    expect(handleAvailabilityResponseSchema.parse(JSON.parse(taken.body))).toEqual({
      handle: "beta",
      status: "taken",
    });

    const emailTaken = await app.inject({
      method: "GET",
      url: "/v1/identity/handle-availability?handle=beta@example.com",
      headers: { authorization: `Bearer ${sessionB.accessToken}` },
    });
    expect(emailTaken.statusCode).toBe(400);
  });

  it("rejects profile save when the handle is taken", async () => {
    await registerSession(app, "owner@example.com");
    const session = await registerSession(app, "editor@example.com");

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/identity/me",
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: { handle: "owner" },
    });

    expect(response.statusCode).toBe(409);
  });

  it("uploads an avatar and returns a non-KitPhoto avatar URL", async () => {
    const session = await registerSession(app, "avatar@example.com");

    const upload = await app.inject({
      method: "POST",
      url: "/v1/identity/avatar",
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: { contentBase64: JPEG_BASE64 },
    });

    expect(upload.statusCode).toBe(200);
    const body = identityMeSchema.parse(JSON.parse(upload.body));
    expect(body.avatarUrl).toBe("/v1/identity/avatar");
    expect(body.avatarUrl).not.toContain("kit/");

    const avatarBytes = await app.inject({
      method: "GET",
      url: "/v1/identity/avatar",
      headers: { authorization: `Bearer ${session.accessToken}` },
    });

    expect(avatarBytes.statusCode).toBe(200);
    expect(avatarBytes.headers["content-type"]).toBe("image/jpeg");
  });

  it("rejects unauthenticated collection requests with 401", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/collection/jerseys",
    });

    expect(response.statusCode).toBe(401);
  });

  it("returns an empty jersey list for an authenticated collector", async () => {
    const session = await registerSession(app, "empty@example.com");

    const response = await app.inject({
      method: "GET",
      url: "/v1/collection/jerseys",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = collectionJerseysSchema.parse(JSON.parse(response.body));
    expect(body).toEqual({ jerseys: [] });
  });
});
