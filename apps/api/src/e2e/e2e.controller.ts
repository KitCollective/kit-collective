import { timingSafeEqual } from "node:crypto";
import type { Db } from "@kit/db";
import {
  Controller,
  ForbiddenException,
  Get,
  Header,
  Headers,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  StreamableFile,
  UnauthorizedException,
} from "@nestjs/common";
import { OBJECT_STORE } from "../collection/collection.service.js";
import type { ObjectStoreAdapter } from "../collection/object-store.js";
import { DB } from "../db/db.module.js";
import { applyTestData } from "./test-data.js";
import { readTestDataConfig, type TestDataConfig } from "./test-data-config.js";

const MIN_TOKEN_LENGTH = 24;
const EVIDENCE_SHA = /^[0-9a-f]{40}$/;
const EVIDENCE_NAME = /^[a-z0-9-]+$/;
const EVIDENCE_FILE = /^([a-z0-9-]+)\.(png|mp4)$/;
const EVIDENCE_CONTENT_TYPES = { png: "image/png", mp4: "video/mp4" } as const;

function evidenceIsPublic(): boolean {
  return process.env.E2E_EVIDENCE_PUBLIC?.trim().toLowerCase() === "on";
}

function laneToken(): string {
  const token = process.env.E2E_TEST_DATA_TOKEN?.trim() ?? "";
  return token.length < MIN_TOKEN_LENGTH ? "" : token;
}

function tokensMatch(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Device-flow support (KIT-267). Both routes answer 404 unless the lane switches
 * them on, and production never does:
 * - `E2E_TEST_DATA_TOKEN` switches on the reset of the two test Collectors.
 * - `E2E_EVIDENCE_PUBLIC=on` switches on serving stored screenshots and
 *   recordings, so a PR comment and a Linear issue can link them.
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
    const expected = laneToken();
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
      throw new ForbiddenException(error instanceof Error ? error.message : "Refused");
    }
    await applyTestData({
      db: this.db,
      objectStore: this.objectStore,
      credentials: config.credentials,
    });
  }

  /**
   * Public on purpose: GitHub and Linear fetch these without a session. Only
   * `e2e/<sha>/<flow>/<step>.png|video.mp4` is reachable, and those objects show
   * the test Collectors only.
   */
  @Get("evidence/:sha/:flow/:file")
  @Header("cache-control", "public, max-age=86400")
  async evidence(
    @Param("sha") sha: string,
    @Param("flow") flow: string,
    @Param("file") file: string,
  ): Promise<StreamableFile> {
    const name = EVIDENCE_FILE.exec(file);
    if (!evidenceIsPublic() || !EVIDENCE_SHA.test(sha) || !EVIDENCE_NAME.test(flow) || !name) {
      throw new NotFoundException();
    }
    const bytes = await this.objectStore.getObject(`e2e/${sha}/${flow}/${file}`);
    if (!bytes) {
      throw new NotFoundException();
    }
    const extension = name[2] === "mp4" ? "mp4" : "png";
    return new StreamableFile(bytes, { type: EVIDENCE_CONTENT_TYPES[extension] });
  }
}
