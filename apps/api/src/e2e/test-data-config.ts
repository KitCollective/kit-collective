import type { TestDataCredentials } from "./test-data.js";
import { assertTestDataDatabaseAllowed } from "./test-data-guard.js";

const CREDENTIAL_ENV = [
  "E2E_COLLECTOR_EMAIL",
  "E2E_COLLECTOR_PASSWORD",
  "E2E_PEER_EMAIL",
  "E2E_PEER_PASSWORD",
] as const;

export type TestDataConfig = {
  databaseUrl: string;
  credentials: TestDataCredentials;
};

/**
 * Lane settings for the device-flow test data, from the environment (lane
 * secrets, never git). Throws before anything is written when the database is
 * refused or a credential is missing.
 */
export function readTestDataConfig(env: NodeJS.ProcessEnv): TestDataConfig {
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }
  assertTestDataDatabaseAllowed({
    databaseUrl,
    lane: env.E2E_TEST_DATA_LANE,
    productionDatabaseUrl: env.PRODUCTION_DATABASE_URL?.trim() || undefined,
  });
  const missing = CREDENTIAL_ENV.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing test Collector credentials: ${missing.join(", ")}`);
  }
  const value = (name: (typeof CREDENTIAL_ENV)[number]) => env[name]?.trim() ?? "";
  return {
    databaseUrl,
    credentials: {
      collector: { email: value("E2E_COLLECTOR_EMAIL"), password: value("E2E_COLLECTOR_PASSWORD") },
      peer: { email: value("E2E_PEER_EMAIL"), password: value("E2E_PEER_PASSWORD") },
    },
  };
}
