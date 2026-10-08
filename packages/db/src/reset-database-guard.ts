const RESET_DATABASE_GUARD_MESSAGE =
  "resetDatabase refused: connection must use localhost/127.0.0.1 or a database name containing test (e.g. kit_test). Shared development Postgres must not be wiped by tests.";

export function isResetDatabaseAllowed(connectionString: string): boolean {
  let url: URL;
  try {
    url = new URL(connectionString.replace(/^postgres:/, "postgresql:"));
  } catch {
    return false;
  }

  const host = (url.hostname || "").toLowerCase();
  const database = (url.pathname || "").replace(/^\//, "").toLowerCase();

  const isLocalHost = host === "localhost" || host === "127.0.0.1";
  const isTestDatabase = database.includes("test") || database.endsWith("_test");

  return isLocalHost || isTestDatabase;
}

export function assertResetDatabaseAllowed(connectionString: string): void {
  if (!isResetDatabaseAllowed(connectionString)) {
    throw new Error(RESET_DATABASE_GUARD_MESSAGE);
  }
}

export { RESET_DATABASE_GUARD_MESSAGE };
