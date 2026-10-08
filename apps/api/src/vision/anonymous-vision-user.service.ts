import { user } from "@kit/db";
import { Inject, Injectable, InternalServerErrorException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DB, type DbToken } from "../db/db.module.js";

@Injectable()
export class AnonymousVisionUserService {
  private resolvedUserId: string | null = null;

  constructor(@Inject(DB) private readonly db: DbToken) {}

  async getUserId(): Promise<string> {
    if (this.resolvedUserId) {
      return this.resolvedUserId;
    }

    const configured = process.env.ANONYMOUS_VISION_USER_ID?.trim();
    if (!configured) {
      throw new InternalServerErrorException("Unsigned Vision is not configured");
    }

    const [row] = await this.db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, configured))
      .limit(1);

    if (!row) {
      throw new InternalServerErrorException("Unsigned Vision user is missing");
    }

    this.resolvedUserId = row.id;
    return row.id;
  }
}
