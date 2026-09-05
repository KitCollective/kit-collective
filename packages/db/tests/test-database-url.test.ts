import { afterEach, describe, expect, it } from "vitest";
import { isRecognizablyTestDatabase, resolveKitDbTestDatabaseUrl } from "./test-database-url.js";

describe("resolveKitDbTestDatabaseUrl", () => {
  const previous = process.env.KIT_DB_TEST_DATABASE_URL;

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.KIT_DB_TEST_DATABASE_URL;
    } else {
      process.env.KIT_DB_TEST_DATABASE_URL = previous;
    }
  });

  it("defaults to local kit_test when unset", () => {
    delete process.env.KIT_DB_TEST_DATABASE_URL;
    expect(resolveKitDbTestDatabaseUrl()).toBe("postgresql://kit:kit@localhost:5432/kit_test");
  });

  it("refuses a CX33-shaped lane URL", () => {
    process.env.KIT_DB_TEST_DATABASE_URL =
      "postgresql://kitcollective:secret@62.238.53.158:5432/kitcollective";
    expect(() => resolveKitDbTestDatabaseUrl()).toThrow(/disposable test database/);
  });

  it("accepts localhost kit_test", () => {
    expect(isRecognizablyTestDatabase("postgresql://kit:kit@localhost:5432/kit_test")).toBe(true);
  });
});
