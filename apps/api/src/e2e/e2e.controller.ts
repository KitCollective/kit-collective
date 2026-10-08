import { timingSafeEqual } from "node:crypto";
import type { Db } from "@kit/db";
import {
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  Inject,
  NotFoundException,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { OBJECT_STORE } from "../collection/collection.service.js";
import type { ObjectStoreAdapter } from "../collection/object-store.js";
import { isProductionProcess } from "../config/production-process.js";
import { DB } from "../db/db.module.js";
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
    const expected = testDataToken();
    if (!expected) {
      throw new NotFoundException();
    }
    const given = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!tokensMatch(given, expected)) {
      throw new UnauthorizedException();
    }
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
}
