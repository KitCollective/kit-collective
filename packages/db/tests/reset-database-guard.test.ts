import { describe, expect, it } from "vitest";
import {
  assertResetDatabaseAllowed,
  isResetDatabaseAllowed,
  RESET_DATABASE_GUARD_MESSAGE,
} from "../src/reset-database-guard.js";

describe("resetDatabase guard", () => {
  it("allows localhost kit_test (CI shape)", () => {
    expect(
      isResetDatabaseAllowed("postgresql://kit:kit@localhost:5432/kit_test"),
    ).toBe(true);
    expect(() =>
      assertResetDatabaseAllowed("postgresql://kit:kit@localhost:5432/kit_test"),
    ).not.toThrow();
  });

  it("allows 127.0.0.1 with kit_api_test", () => {
    expect(
      isResetDatabaseAllowed("postgresql://kit:kit@127.0.0.1:5432/kit_api_test"),
    ).toBe(true);
  });

  it("allows remote host when database name contains test", () => {
    expect(
      isResetDatabaseAllowed("postgresql://kit:kit@db.example.com:5432/kit_test"),
    ).toBe(true);
  });

  it("refuses CX33-shaped development Postgres before any DROP", () => {
    const devUrl = "postgresql://kit:secret@postgres.kitcollective.dev:5432/kit";
    expect(isResetDatabaseAllowed(devUrl)).toBe(false);
    expect(() => assertResetDatabaseAllowed(devUrl)).toThrow(RESET_DATABASE_GUARD_MESSAGE);
  });

  it("refuses remote non-test database names", () => {
    expect(
      isResetDatabaseAllowed("postgresql://kit:kit@10.0.0.5:5432/kit_development"),
    ).toBe(false);
  });
});
