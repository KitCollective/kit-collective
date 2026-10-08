import { UNSIGNED_VISION_SUGGEST_CAP } from "@kit/api-contract";
import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { InMemoryIpThrottle } from "./in-memory-ip-throttle.js";

@Injectable()
export class UnsignedVisionThrottleService {
  private readonly throttle = new InMemoryIpThrottle(UNSIGNED_VISION_SUGGEST_CAP);

  assertWithinCap(request: FastifyRequest): void {
    const ip = request.ip?.trim() || "unknown";
    if (!this.throttle.tryConsume(ip)) {
      throw new HttpException("Too many requests", HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}
