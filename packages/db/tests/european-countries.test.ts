import path from "node:path";
import { fileURLToPath } from "node:url";
import { EUROPEAN_COUNTRIES } from "@kit/domain";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { catalogLabel, country, createDb, seedEuropeanCountries } from "../src/index.js";
import { resetDatabase } from "../src/migrate.js";

const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), "../migrations");

const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://kit:kit@localhost:5432/kit_test";

describe("European country stamdata", () => {
  beforeAll(async () => {
    await resetDatabase(DATABASE_URL, migrationsFolder);
  });

  afterAll(async () => {
    const { pool } = createDb(DATABASE_URL);
    await pool.end();
  });

  it("catalog includes United Kingdom as GB with ISO 3166-1 encodings and reserved UK", () => {
    expect(EUROPEAN_COUNTRIES).toHaveLength(47);
    expect(new Set(EUROPEAN_COUNTRIES.map((entry) => entry.iso3166)).size).toBe(47);

    const uk = EUROPEAN_COUNTRIES.find((entry) => entry.iso3166 === "GB");
    expect(uk).toMatchObject({
      iso3166: "GB",
      iso3166Alpha3: "GBR",
      iso3166Numeric: "826",
      iso3166Reserved: "UK",
      fifa: null,
      ioc: "GBR",
      labelDa: "Storbritannien",
      labelEn: "United Kingdom",
    });
    expect(uk?.aliases).toEqual(expect.arrayContaining(["UK", "England"]));
  });

  it("stores ISO alpha-3 separately from FIFA where they differ", () => {
    const germany = EUROPEAN_COUNTRIES.find((entry) => entry.iso3166 === "DE");
    expect(germany).toMatchObject({
      iso3166Alpha3: "DEU",
      iso3166Numeric: "276",
      fifa: "GER",
      ioc: "GER",
    });
  });

  it("seeds every European country with da/en labels after migrate", async () => {
    const { db, pool } = createDb(DATABASE_URL);
    const rows = await db.select().from(country);
    const daLabels = await db
      .select({ text: catalogLabel.text, entityId: catalogLabel.entityId })
      .from(catalogLabel)
      .where(eq(catalogLabel.entityType, "country"));

    await pool.end();

    expect(rows.length).toBeGreaterThanOrEqual(EUROPEAN_COUNTRIES.length);
    const byIso = new Map(rows.map((row) => [row.iso3166, row]));
    expect(byIso.get("GB")).toMatchObject({
      iso3166: "GB",
      iso3166Alpha3: "GBR",
      iso3166Numeric: "826",
      iso3166Reserved: "UK",
      fifa: null,
      ioc: "GBR",
    });
    expect(byIso.get("DK")).toMatchObject({
      iso3166Alpha3: "DNK",
      iso3166Numeric: "208",
      fifa: "DEN",
      ioc: "DEN",
    });
    expect(daLabels.some((row) => row.text === "Storbritannien")).toBe(true);
    expect(daLabels.some((row) => row.text === "Danmark")).toBe(true);
    expect(daLabels.some((row) => row.text === "UK")).toBe(true);
  });

  it("seed is idempotent and does not duplicate GB", async () => {
    const { db, pool } = createDb(DATABASE_URL);
    await seedEuropeanCountries(db);
    await seedEuropeanCountries(db);
    const rows = await db.select({ iso3166: country.iso3166 }).from(country);
    await pool.end();

    expect(rows.filter((row) => row.iso3166 === "GB")).toHaveLength(1);
    expect(new Set(EUROPEAN_COUNTRIES.map((entry) => entry.iso3166)).size).toBe(
      EUROPEAN_COUNTRIES.length,
    );
  });
});
