import "reflect-metadata";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NestFastifyApplication, FastifyAdapter } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import {
  collectionJerseysSchema,
  identityMeSchema,
  identitySessionSchema,
} from "@kit/api-contract";
import { resetDatabase } from "@kit/db";
import { AppModule } from "../dist/app.module.js";

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../packages/db/migrations",
);

const DATABASE_URL =
  process.env.API_TEST_DATABASE_URL ??
  "postgresql://kit:kit@localhost:5432/kit_api_test";

describe("Identity /v1", () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.JWT_SECRET = "test-jwt-secret";
    await resetDatabase(DATABASE_URL, migrationsFolder);

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
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
    expect(body.accessToken.length).toBeGreaterThan(10);
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
  });

  it("returns the current user with a valid bearer token", async () => {
    const registerResponse = await app.inject({
      method: "POST",
      url: "/v1/identity/register",
      payload: {
        email: "me@example.com",
        password: "password123",
      },
    });
    const session = identitySessionSchema.parse(JSON.parse(registerResponse.body));

    const response = await app.inject({
      method: "GET",
      url: "/v1/identity/me",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = identityMeSchema.parse(JSON.parse(response.body));
    expect(body).toEqual(session.user);
  });

  it("rejects unauthenticated collection requests with 401", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/collection/jerseys",
    });

    expect(response.statusCode).toBe(401);
  });

  it("returns an empty jersey list for an authenticated collector", async () => {
    const registerResponse = await app.inject({
      method: "POST",
      url: "/v1/identity/register",
      payload: {
        email: "empty@example.com",
        password: "password123",
      },
    });
    const session = identitySessionSchema.parse(JSON.parse(registerResponse.body));

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
