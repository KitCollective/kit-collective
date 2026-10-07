/**
 * Lanes the device-flow test data may be written to. `test` is a disposable
 * local database.
 */
const ALLOWED_LANES = ["staging", "development", "test"] as const;

export type TestDataGuardInput = {
  databaseUrl: string;
  /** `E2E_TEST_DATA_LANE`: which lane the caller says this database is. */
  lane?: string;
  /** `PRODUCTION_DATABASE_URL`, when the caller's environment knows it. */
  productionDatabaseUrl?: string;
};

function target(connectionString: string): { host: string; port: string; database: string } {
  const url = new URL(connectionString.replace(/^postgres:/, "postgresql:"));
  return {
    host: url.hostname.toLowerCase(),
    port: url.port || "5432",
    database: url.pathname.replace(/^\//, "").toLowerCase(),
  };
}

/**
 * Lane database URLs carry no lane marker (an IP and one database name), so the
 * URL alone cannot prove it is not production. The command therefore runs only
 * when the caller declares a non-production lane, and still refuses a URL that
 * names production or equals `PRODUCTION_DATABASE_URL`.
 */
export function assertTestDataDatabaseAllowed(input: TestDataGuardInput): void {
  const lane = input.lane?.trim().toLowerCase();
  if (!lane) {
    throw new Error(
      `E2E_TEST_DATA_LANE is required (${ALLOWED_LANES.join(", ")}). The test data is never written without a declared lane.`,
    );
  }
  if (!ALLOWED_LANES.some((allowed) => allowed === lane)) {
    throw new Error(
      `Lane '${lane}' is refused: device-flow test data is never written to production. Allowed: ${ALLOWED_LANES.join(", ")}.`,
    );
  }
  const database = target(input.databaseUrl);
  if (/prod/.test(database.host) || /prod/.test(database.database)) {
    throw new Error(
      "Refused: DATABASE_URL names production in its host or database. Device-flow test data is never written to production.",
    );
  }
  if (input.productionDatabaseUrl) {
    const production = target(input.productionDatabaseUrl);
    if (
      production.host === database.host &&
      production.port === database.port &&
      production.database === database.database
    ) {
      throw new Error(
        "Refused: DATABASE_URL is the production database (matches PRODUCTION_DATABASE_URL). Device-flow test data is never written to production.",
      );
    }
  }
}
