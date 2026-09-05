import { afterEach, describe, expect, it } from "vitest";
import {
  isRecognizablyTestDatabase,
  resolveSeedFkapiTestDatabaseUrl,
} from "./test-database-url.js";
import { resetTestDatabase } from "./test-db.js";

describe("resolveSeedFkapiTestDatabaseUrl", () => {
  const previous = process.env.SEED_FKAPI_TEST_DATABASE_URL;

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.SEED_FKAPI_TEST_DATABASE_URL;
    } else {
      process.env.SEED_FKAPI_TEST_DATABASE_URL = previous;
    }
  });

  it("defaults to local kit_test when unset", () => {
    delete process.env.SEED_FKAPI_TEST_DATABASE_URL;
    expect(resolveSeedFkapiTestDatabaseUrl()).toBe("postgresql://kit:kit@localhost:5432/kit_test");
  });

  it("refuses a CX33-shaped lane URL", () => {
    process.env.SEED_FKAPI_TEST_DATABASE_URL =
      "postgresql://kitcollective:secret@62.238.53.158:5432/kitcollective";
    expect(() => resolveSeedFkapiTestDatabaseUrl()).toThrow(/disposable test database/);
  });

  it("accepts localhost kit_test", () => {
    expect(isRecognizablyTestDatabase("postgresql://kit:kit@localhost:5432/kit_test")).toBe(true);
  });
});

describe("resetTestDatabase guard", () => {
  it("refuses a CX33-shaped URL before DROP SCHEMA", async () => {
    await expect(
      resetTestDatabase(
        "postgresql://kitcollective:secret@62.238.53.158:5432/kitcollective",
        "/unused",
      ),
    ).rejects.toThrow(/refused/);
  });
});
