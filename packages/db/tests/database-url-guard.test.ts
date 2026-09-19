import { describe, expect, it } from "vitest";
import {
  assertDatabaseUrlTls,
  createDb,
  DATABASE_URL_TLS_GUARD_MESSAGE,
  isDatabaseUrlTlsAllowed,
  RESET_DATABASE_GUARD_MESSAGE,
  resetDatabase,
} from "../src/index.js";

describe("database URL TLS guard", () => {
  it("refuses a remote non-test URL without sslmode", () => {
    const url = "postgresql://kit:kit@db.example:5432/kit";
    expect(isDatabaseUrlTlsAllowed(url)).toBe(false);
    expect(() => createDb(url)).toThrow(DATABASE_URL_TLS_GUARD_MESSAGE);
    expect(() => assertDatabaseUrlTls(url)).toThrow(DATABASE_URL_TLS_GUARD_MESSAGE);
  });

  it("accepts a remote URL with sslmode=require without connecting", async () => {
    const url = "postgresql://kit:kit@db.example:5432/kit?sslmode=require";
    expect(isDatabaseUrlTlsAllowed(url)).toBe(true);
    expect(() => assertDatabaseUrlTls(url)).not.toThrow();
    const { pool } = createDb(url);
    expect(pool.options.ssl).toBeUndefined();
    await pool.end();
  });

  it("accepts localhost kit_test without sslmode", () => {
    const url = "postgresql://kit:kit@localhost:5432/kit_test";
    expect(isDatabaseUrlTlsAllowed(url)).toBe(true);
    expect(() => assertDatabaseUrlTls(url)).not.toThrow();
  });

  it("accepts 127.0.0.1 without sslmode", () => {
    expect(isDatabaseUrlTlsAllowed("postgresql://kit:kit@127.0.0.1:5432/kit")).toBe(true);
  });

  it("accepts a remote host when the database name contains test", () => {
    expect(isDatabaseUrlTlsAllowed("postgresql://kit:kit@db.example:5432/kit_test")).toBe(true);
  });

  it("accepts sslmode=verify-full on a remote non-test URL", () => {
    expect(
      isDatabaseUrlTlsAllowed("postgresql://kit:kit@db.example:5432/kit?sslmode=verify-full"),
    ).toBe(true);
  });

  it("refuses sslmode=prefer on a remote non-test URL", () => {
    expect(isDatabaseUrlTlsAllowed("postgresql://kit:kit@db.example:5432/kit?sslmode=prefer")).toBe(
      false,
    );
    expect(() =>
      assertDatabaseUrlTls("postgresql://kit:kit@db.example:5432/kit?sslmode=prefer"),
    ).toThrow(DATABASE_URL_TLS_GUARD_MESSAGE);
  });

  it("resetDatabase still refuses a CX33-shaped URL", async () => {
    await expect(
      resetDatabase("postgresql://kit:secret@postgres.kitcollective.dev:5432/kit", "/unused"),
    ).rejects.toThrow(RESET_DATABASE_GUARD_MESSAGE);
  });
});
