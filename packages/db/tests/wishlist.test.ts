import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, user, wishlistEntry } from "../src/index.js";
import { resetDatabase } from "../src/migrate.js";

const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), "../migrations");

const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://kit:kit@localhost:5432/kit_test";

describe("wishlist_entry schema", () => {
  beforeAll(async () => {
    await resetDatabase(DATABASE_URL, migrationsFolder);
  });

  afterAll(async () => {
    const { pool } = createDb(DATABASE_URL);
    await pool.end();
  });

  it("persists nullable criteria columns on wishlist_entry", async () => {
    const { db, pool } = createDb(DATABASE_URL);

    const [insertedUser] = await db
      .insert(user)
      .values({
        email: "wishlist@example.com",
        passwordHash: "hash",
        handle: "wishlist-user",
      })
      .returning({ id: user.id });

    const [inserted] = await db
      .insert(wishlistEntry)
      .values({
        userId: insertedUser!.id,
        type: "home",
      })
      .returning();

    await pool.end();

    expect(inserted).toMatchObject({
      userId: insertedUser!.id,
      clubId: null,
      seasonId: null,
      type: "home",
      size: null,
    });
  });
});
