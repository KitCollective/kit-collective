import "reflect-metadata";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  billingPaywallErrorSchema,
  identitySessionSchema,
  VISION_MATCHER_JERSEY_CAP,
  visionSuggestResponseSchema,
} from "@kit/api-contract";
import { createDb, resetDatabase, visionLog } from "@kit/db";
import { Logger } from "@nestjs/common";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AppModule } from "../dist/app.module.js";
import { FailingVisionAdapter } from "../dist/vision/test-vision.adapters.js";
import { VISION_ADAPTER } from "../dist/vision/vision.adapter.js";

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../packages/db/migrations",
);

const DATABASE_URL =
  process.env.API_TEST_DATABASE_URL ?? "postgresql://kit:kit@localhost:5432/kit_api_test";

const JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFwABAQEBAAAAAAAAAAAAAAAAAAUGB//EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA//2Q==";

function draftId(index: number): string {
  return `22222222-2222-4222-8222-${String(index).padStart(12, "0")}`;
}

async function registerSession(app: NestFastifyApplication, email: string) {
  const response = await app.inject({
    method: "POST",
    url: "/v1/identity/register",
    payload: { email, password: "password123" },
  });
  return identitySessionSchema.parse(JSON.parse(response.body));
}

function suggestIdentity(app: NestFastifyApplication, accessToken: string, payload: unknown) {
  return app.inject({
    method: "POST",
    url: "/v1/collection/vision/suggest",
    headers: { authorization: `Bearer ${accessToken}` },
    payload: payload as Record<string, unknown>,
  });
}

/** Lines the suggest route wrote, in order, with the level they went out at. */
function suggestLines(
  log: ReturnType<typeof vi.spyOn>,
  warn: ReturnType<typeof vi.spyOn>,
  error: ReturnType<typeof vi.spyOn>,
): Array<{ level: string; line: string }> {
  const lines: Array<{ level: string; line: string; order: number }> = [];
  for (const [level, spy] of [
    ["log", log],
    ["warn", warn],
    ["error", error],
  ] as const) {
    spy.mock.calls.forEach((call, index) => {
      const line = String(call[0]);
      if (line.startsWith("identity suggest")) {
        lines.push({ level, line, order: spy.mock.invocationCallOrder[index] ?? 0 });
      }
    });
  }
  return lines.sort((a, b) => a.order - b.order).map(({ level, line }) => ({ level, line }));
}

describe("Identity suggest logs each outcome (KIT-421)", () => {
  let app: NestFastifyApplication;
  let log: ReturnType<typeof vi.spyOn>;
  let warn: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    delete process.env.R2_ENDPOINT;
    await resetDatabase(DATABASE_URL, migrationsFolder);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(VISION_ADAPTER)
      .useValue(new FailingVisionAdapter())
      .compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.setGlobalPrefix("v1");
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  function spyOnLogger() {
    log = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    error = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
  }

  it("logs received and then the started job id for an allowed suggest", async () => {
    const session = await registerSession(app, "suggest-log-allowed@example.com");
    spyOnLogger();

    const response = await suggestIdentity(app, session.accessToken, {
      draftId: draftId(1),
      photos: [
        { role: "front", contentBase64: JPEG_BASE64 },
        { role: "back", contentBase64: JPEG_BASE64 },
      ],
    });

    expect(response.statusCode).toBe(202);
    const { jobId } = visionSuggestResponseSchema.parse(JSON.parse(response.body));
    expect(suggestLines(log, warn, error)).toEqual([
      {
        level: "log",
        line: `identity suggest received, draft ${draftId(1)}, user ${session.user.id}, 2 photo(s)`,
      },
      { level: "log", line: `identity suggest job ${jobId} started, draft ${draftId(1)}` },
    ]);
  });

  it("logs a PREMIUM_REQUIRED refusal with the draft for a collector at the cap", async () => {
    const session = await registerSession(app, "suggest-log-cap@example.com");
    const { db, pool } = createDb(DATABASE_URL);
    await db.insert(visionLog).values(
      Array.from({ length: VISION_MATCHER_JERSEY_CAP }, (_, index) => ({
        userId: session.user.id,
        draftId: draftId(100 + index),
        kind: "identity" as const,
        status: "ready" as const,
      })),
    );
    await pool.end();
    spyOnLogger();

    const blockedDraft = draftId(200);
    const response = await suggestIdentity(app, session.accessToken, {
      draftId: blockedDraft,
      photos: [{ role: "front", contentBase64: JPEG_BASE64 }],
    });

    expect(response.statusCode).toBe(402);
    expect(billingPaywallErrorSchema.parse(JSON.parse(response.body)).code).toBe(
      "PREMIUM_REQUIRED",
    );
    expect(suggestLines(log, warn, error)).toEqual([
      {
        level: "log",
        line: `identity suggest received, draft ${blockedDraft}, user ${session.user.id}, 1 photo(s)`,
      },
      {
        level: "warn",
        line: `identity suggest refused PREMIUM_REQUIRED, draft ${blockedDraft}, user ${session.user.id}`,
      },
    ]);
  });

  it("logs an invalid request as failed and answers as before", async () => {
    const session = await registerSession(app, "suggest-log-invalid@example.com");
    spyOnLogger();

    const response = await suggestIdentity(app, session.accessToken, { photos: [] });

    expect(response.statusCode).toBe(500);
    expect(suggestLines(log, warn, error)).toEqual([
      { level: "warn", line: "identity suggest failed, draft unknown: invalid request" },
    ]);
  });

  it("never logs photo bytes or the session token", async () => {
    const session = await registerSession(app, "suggest-log-secret@example.com");
    spyOnLogger();

    await suggestIdentity(app, session.accessToken, {
      draftId: draftId(300),
      photos: [{ role: "front", contentBase64: JPEG_BASE64 }],
    });

    const written = suggestLines(log, warn, error)
      .map(({ line }) => line)
      .join("\n");
    expect(written).not.toContain(JPEG_BASE64.slice(0, 24));
    expect(written).not.toContain(session.accessToken);
  });
});
