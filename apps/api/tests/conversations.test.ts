import "reflect-metadata";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectionConversationsSchema, identitySessionSchema } from "@kit/api-contract";
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

describe("Collection conversations /v1", () => {
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

  it("rejects unauthenticated conversation list with 401", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/collection/conversations",
    });

    expect(response.statusCode).toBe(401);
  });

  it("returns an empty conversation list for an authenticated collector", async () => {
    const registerResponse = await app.inject({
      method: "POST",
      url: "/v1/identity/register",
      payload: {
        email: "inbox@example.com",
        password: "password123",
      },
    });
    const session = identitySessionSchema.parse(JSON.parse(registerResponse.body));

    const response = await app.inject({
      method: "GET",
      url: "/v1/collection/conversations",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = collectionConversationsSchema.parse(JSON.parse(response.body));
    expect(body).toEqual({ conversations: [] });
  });
});
