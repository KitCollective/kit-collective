import { timingSafeEqual } from "node:crypto";
import { type Db, verification } from "@kit/db";
import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Inject,
  NotFoundException,
  Post,
  Query,
  UnauthorizedException,
} from "@nestjs/common";
import { eq } from "drizzle-orm";
import { OBJECT_STORE } from "../collection/collection.service.js";
import type { ObjectStoreAdapter } from "../collection/object-store.js";
import { isProductionProcess } from "../config/production-process.js";
import { DB } from "../db/db.module.js";
import { recordedMails } from "../notify/recording-mailer.adapter.js";
import { applyTestData } from "./test-data.js";
import { readTestDataConfig, type TestDataConfig } from "./test-data-config.js";

const MIN_TOKEN_LENGTH = 24;

function testDataToken(): string {
  if (isProductionProcess(process.env.NODE_ENV)) {
    return "";
  }
  const token = process.env.E2E_TEST_DATA_TOKEN?.trim() ?? "";
  return token.length < MIN_TOKEN_LENGTH ? "" : token;
}

function tokensMatch(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function requireTestDataToken(authorization: string | undefined): void {
  const expected = testDataToken();
  if (!expected) {
    throw new NotFoundException();
  }
  const given = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!tokensMatch(given, expected)) {
    throw new UnauthorizedException();
  }
}

/**
 * Device-flow support (KIT-267): the reset of the two test Collectors. Answers
 * 404 unless `E2E_TEST_DATA_TOKEN` switches it on, and always on a production
 * process.
 */
@Controller("e2e")
export class E2eController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(OBJECT_STORE) private readonly objectStore: ObjectStoreAdapter,
  ) {}

  @Post("test-data")
  @HttpCode(204)
  async resetTestData(@Headers("authorization") authorization?: string): Promise<void> {
    requireTestDataToken(authorization);
    let config: TestDataConfig;
    try {
      config = readTestDataConfig(process.env);
    } catch (error) {
      throw new ForbiddenException(error instanceof Error ? error.message : String(error));
    }
    await applyTestData({
      db: this.db,
      objectStore: this.objectStore,
      credentials: config.credentials,
    });
  }

  /** The newest sign-in code the recording mailer holds for an address, for a flow to type. */
  @Get("last-code")
  lastCode(
    @Headers("authorization") authorization?: string,
    @Query("email") email?: string,
  ): { code: string } {
    requireTestDataToken(authorization);
    const wanted = email?.trim().toLowerCase();
    const mail = [...recordedMails]
      .reverse()
      .find((item) => item.kind === "code" && item.to === wanted);
    if (!mail || !("code" in mail)) {
      throw new NotFoundException();
    }
    return { code: mail.code };
  }

  /** Lets the code a flow holds expire now, so the expired state can be shown without waiting. */
  @Post("expire-code")
  @HttpCode(204)
  async expireCode(
    @Headers("authorization") authorization?: string,
    @Query("email") email?: string,
  ): Promise<void> {
    requireTestDataToken(authorization);
    const wanted = email?.trim().toLowerCase();
    if (!wanted) {
      throw new NotFoundException();
    }
    await this.db
      .update(verification)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(verification.identifier, `code:${wanted}`));
  }
}
