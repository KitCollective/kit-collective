/**
 * Where the device-flow test data may be written: a non-production lane, or
 * `local` for a disposable database on the machine that runs the flows.
 */
const ALLOWED_TARGETS = ["staging", "development", "local"] as const;

/**
 * A production process never touches device-flow test data or fixed Vision,
 * whatever its environment says, so a copied env block cannot open the lane.
 */
export function isProductionProcess(nodeEnv: string | undefined): boolean {
  return nodeEnv?.trim().toLowerCase() === "production";
}

export type TestDataGuardInput = {
  databaseUrl: string;
  /** `E2E_TEST_DATA_TARGET`: where the caller says this database is. */
  target?: string;
  /** `NODE_ENV` of the calling process. */
  nodeEnv?: string;
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
 * when the caller declares a non-production target, never on a production
 * process, and still refuses a URL that names production or equals
 * `PRODUCTION_DATABASE_URL`.
 */
export function assertTestDataDatabaseAllowed(input: TestDataGuardInput): void {
  if (isProductionProcess(input.nodeEnv)) {
    throw new Error(
      "Refused: NODE_ENV is production. Device-flow test data is never written to production.",
    );
  }
  const declared = input.target?.trim().toLowerCase();
  if (!declared) {
    throw new Error(
      `E2E_TEST_DATA_TARGET is required (${ALLOWED_TARGETS.join(", ")}). The test data is never written without a declared target.`,
    );
  }
  if (!ALLOWED_TARGETS.some((allowed) => allowed === declared)) {
    throw new Error(
      `Target '${declared}' is refused: device-flow test data is never written to production. Allowed: ${ALLOWED_TARGETS.join(", ")}.`,
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
