import { UNSIGNED_VISION_SUGGEST_CAP } from "@kit/api-contract";
import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { InMemoryIpThrottle } from "./in-memory-ip-throttle.js";

/**
 * Runs allowed per IP and window for collectors without an account. The contract value is the
 * default; `UNSIGNED_VISION_SUGGEST_CAP` overrides it when it is a positive integer.
 */
export function unsignedVisionSuggestCap(raw: string | undefined): number {
  const parsed = Number(raw?.trim());
  return Number.isInteger(parsed) && parsed > 0 ? parsed : UNSIGNED_VISION_SUGGEST_CAP;
}

@Injectable()
export class UnsignedVisionThrottleService {
  private readonly throttle = new InMemoryIpThrottle(
    unsignedVisionSuggestCap(process.env.UNSIGNED_VISION_SUGGEST_CAP),
  );

  assertWithinCap(request: FastifyRequest): void {
    const ip = request.ip?.trim() || "unknown";
    if (!this.throttle.tryConsume(ip)) {
      throw new HttpException("Too many requests", HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}
