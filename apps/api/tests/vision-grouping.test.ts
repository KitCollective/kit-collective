import "reflect-metadata";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  identitySessionSchema,
  visionJobResponseSchema,
  visionSuggestResponseSchema,
} from "@kit/api-contract";
import { resetDatabase } from "@kit/db";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../dist/app.module.js";
import { StubGroupingVisionAdapter } from "../dist/vision/test-vision.adapters.js";
import { VISION_ADAPTER } from "../dist/vision/vision.adapter.js";

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../packages/db/migrations",
);

const DATABASE_URL =
  process.env.API_TEST_DATABASE_URL ?? "postgresql://kit:kit@localhost:5432/kit_api_test";

const PHOTO_A = "11111111-1111-1111-1111-111111111111";
const PHOTO_B = "22222222-2222-2222-2222-222222222222";
const PHOTO_C = "33333333-3333-3333-3333-333333333333";

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

describe("vision grouping API", () => {
  let app: NestFastifyApplication;
  let token: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.JWT_SECRET = "test-jwt-secret";
    process.env.BETTER_AUTH_SECRET = "test-better-auth-secret-not-for-production";
    process.env.BETTER_AUTH_URL = "http://127.0.0.1:3000";
    delete process.env.R2_ENDPOINT;

    await resetDatabase(DATABASE_URL, migrationsFolder);

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(VISION_ADAPTER)
      .useValue(
        new StubGroupingVisionAdapter({
          groups: [
            { photoIds: [PHOTO_A, PHOTO_B], confidence: 85 },
            { photoIds: [PHOTO_C], confidence: 80 },
          ],
        }),
      )
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.setGlobalPrefix("v1");
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const session = await registerSession(app, "vision-grouping@test.kitcollective");
    token = session.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns grouping job document with photoId groups", async () => {
    const suggest = await app.inject({
      method: "POST",
      url: "/v1/collection/vision/grouping/suggest",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        photos: [
          { photoId: PHOTO_A, contentBase64: JPEG_BASE64 },
          { photoId: PHOTO_B, contentBase64: JPEG_BASE64 },
          { photoId: PHOTO_C, contentBase64: JPEG_BASE64 },
        ],
      },
    });

    expect(suggest.statusCode).toBe(202);
    const { jobId } = visionSuggestResponseSchema.parse(suggest.json());

    await new Promise((resolve) => setTimeout(resolve, 50));

    const jobResponse = await app.inject({
      method: "GET",
      url: `/v1/collection/vision/jobs/${jobId}`,
      headers: { authorization: `Bearer ${token}` },
    });

    const job = visionJobResponseSchema.parse(jobResponse.json());
    expect(job.kind).toBe("grouping");
    expect(job.grouping?.groups).toHaveLength(2);
    expect(job.grouping?.groups[0]?.photoIds).toEqual([PHOTO_A, PHOTO_B]);
    expect(job.preselect).toBe(true);
  });
});
