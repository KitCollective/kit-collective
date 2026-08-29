import { user } from "@kit/db";
import { eq } from "drizzle-orm";
import type { DbToken } from "../db/db.module.js";

export function baseHandleFromEmail(email: string): string {
  const localPart = email.split("@")[0] ?? "user";
  const sanitized = localPart.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 30);
  return sanitized.length > 0 ? sanitized : "user";
}

export async function assignUniqueHandle(db: DbToken, email: string): Promise<string> {
  const base = baseHandleFromEmail(email);
  let candidate = base;
  let suffix = 2;

  while (true) {
    const [existing] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.handle, candidate))
      .limit(1);

    if (!existing) {
      return candidate;
    }

    candidate = `${base}${suffix}`;
    suffix += 1;
  }
}
