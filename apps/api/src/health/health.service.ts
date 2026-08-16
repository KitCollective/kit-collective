import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { Db } from "@kit/db";
import { DB } from "../db/db.module.js";

@Injectable()
export class HealthService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async check(): Promise<{ status: "ok"; database: "ok" }> {
    try {
      await this.db.execute(sql`SELECT 1`);
    } catch {
      throw new ServiceUnavailableException({
        status: "degraded",
        database: "down",
      });
    }

    return { status: "ok", database: "ok" };
  }
}
