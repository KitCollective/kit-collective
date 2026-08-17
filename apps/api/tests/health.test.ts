import "reflect-metadata";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NestFastifyApplication, FastifyAdapter } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { resetDatabase } from "@kit/db";
import { AppModule } from "../dist/app.module.js";

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../packages/db/migrations",
);

const DATABASE_URL =
  process.env.API_TEST_DATABASE_URL ??
  "postgresql://kit:kit@localhost:5432/kit_api_test";

describe("GET /v1/health", () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
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

  it("returns ok when Postgres is reachable", async () => {
    const response = await app.inject({ method: "GET", url: "/v1/health" });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ status: "ok", database: "ok" });
  });

  it("returns 503 when Postgres is down", async () => {
    const originalUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL =
      "postgresql://kit:kit@127.0.0.1:1/unreachable";

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const degradedApp = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    degradedApp.setGlobalPrefix("v1");
    await degradedApp.init();
    await degradedApp.getHttpAdapter().getInstance().ready();

    const response = await degradedApp.inject({
      method: "GET",
      url: "/v1/health",
    });
    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.body)).toMatchObject({
      status: "degraded",
      database: "down",
    });

    await degradedApp.close();
    process.env.DATABASE_URL = originalUrl;
  });
});
