const DEFAULT_TEST_DATABASE_URL = "postgresql://kit:kit@localhost:5432/kit_test";

/**
 * Recognizably disposable Postgres for FK seed integration tests.
 * Never falls back to DATABASE_URL — Cloud Agent VMs inject the shared development lane there.
 */
export function isRecognizablyTestDatabase(connectionString: string): boolean {
  try {
    const url = new URL(connectionString.replace(/^postgres:/, "postgresql:"));
    const host = (url.hostname || "").toLowerCase();
    const database = (url.pathname || "").replace(/^\//, "").toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.endsWith(".local") ||
      database.includes("test") ||
      database === "kit_test"
    );
  } catch {
    return false;
  }
}

export function resolveSeedFkapiTestDatabaseUrl(): string {
  const url = process.env.SEED_FKAPI_TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
  if (!isRecognizablyTestDatabase(url)) {
    throw new Error(
      "SEED_FKAPI_TEST_DATABASE_URL must point at a disposable test database (localhost, 127.0.0.1, or a *test* database name). Do not use the shared development DATABASE_URL for DROP SCHEMA.",
    );
  }
  return url;
}
