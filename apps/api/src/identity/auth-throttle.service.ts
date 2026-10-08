import { authThrottleHit } from "@kit/db";
import { HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import { and, count, eq, gt } from "drizzle-orm";
import { DB, type DbToken } from "../db/db.module.js";

const EMAIL_FAILURE_LIMIT = 5;
const EMAIL_FAILURE_WINDOW_MS = 15 * 60 * 1000;
const IP_FAMILY_LIMIT = 20;
const IP_FAMILY_WINDOW_MS = 15 * 60 * 1000;
const GLOBAL_FAMILY_LIMIT = 100;
const GLOBAL_FAMILY_WINDOW_MS = 60 * 1000;

const EMAIL_FAILURE_BUCKET = "email_failure";
const EMAIL_REQUEST_BUCKET = "email_request";
const EMAIL_REQUEST_LIMIT = 5;
const EMAIL_REQUEST_WINDOW_MS = 15 * 60 * 1000;
const IP_FAMILY_BUCKET = "ip_family";
const GLOBAL_FAMILY_BUCKET = "global_family";
const GLOBAL_BUCKET_KEY = "global";

@Injectable()
export class AuthThrottleService {
  constructor(@Inject(DB) private readonly db: DbToken) {}

  async consumeLoginFamily(ipAddress: string | null): Promise<boolean> {
    return this.consumeIpGlobalFamily(ipAddress);
  }

  async consumePublicWriteFamily(ipAddress: string | null, email: string): Promise<boolean> {
    const normalizedEmail = email.toLowerCase();
    if (!(await this.consumeIpGlobalFamily(ipAddress))) {
      return false;
    }
    return this.consumeEmailRequestFamily(normalizedEmail);
  }

  async consumeEmailRequestFamily(email: string): Promise<boolean> {
    const normalizedEmail = email.toLowerCase();
    const emailRequestHits = await this.countHits(
      EMAIL_REQUEST_BUCKET,
      normalizedEmail,
      EMAIL_REQUEST_WINDOW_MS,
    );
    if (emailRequestHits >= EMAIL_REQUEST_LIMIT) {
      return false;
    }
    await this.db.insert(authThrottleHit).values({
      bucket: EMAIL_REQUEST_BUCKET,
      bucketKey: normalizedEmail,
    });
    return true;
  }

  private async consumeIpGlobalFamily(ipAddress: string | null): Promise<boolean> {
    const globalHits = await this.countHits(
      GLOBAL_FAMILY_BUCKET,
      GLOBAL_BUCKET_KEY,
      GLOBAL_FAMILY_WINDOW_MS,
    );
    if (globalHits >= GLOBAL_FAMILY_LIMIT) {
      return false;
    }

    if (ipAddress) {
      const ipHits = await this.countHits(IP_FAMILY_BUCKET, ipAddress, IP_FAMILY_WINDOW_MS);
      if (ipHits >= IP_FAMILY_LIMIT) {
        return false;
      }
    }

    const hits = [{ bucket: GLOBAL_FAMILY_BUCKET, bucketKey: GLOBAL_BUCKET_KEY }];
    if (ipAddress) {
      hits.push({ bucket: IP_FAMILY_BUCKET, bucketKey: ipAddress });
    }
    await this.db.insert(authThrottleHit).values(hits);
    return true;
  }

  async isEmailLocked(email: string): Promise<boolean> {
    const hits = await this.countHits(EMAIL_FAILURE_BUCKET, email, EMAIL_FAILURE_WINDOW_MS);
    return hits >= EMAIL_FAILURE_LIMIT;
  }

  async recordEmailFailure(email: string): Promise<void> {
    await this.db.insert(authThrottleHit).values({
      bucket: EMAIL_FAILURE_BUCKET,
      bucketKey: email,
    });
  }

  private async countHits(bucket: string, bucketKey: string, windowMs: number): Promise<number> {
    const since = new Date(Date.now() - windowMs);
    const [row] = await this.db
      .select({ n: count() })
      .from(authThrottleHit)
      .where(
        and(
          eq(authThrottleHit.bucket, bucket),
          eq(authThrottleHit.bucketKey, bucketKey),
          gt(authThrottleHit.createdAt, since),
        ),
      );
    return Number(row?.n ?? 0);
  }
}

export function tooManyLoginAttempts(): HttpException {
  return new HttpException("Too many requests", HttpStatus.TOO_MANY_REQUESTS);
}
