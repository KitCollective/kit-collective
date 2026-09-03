import { isResetDatabaseAllowed } from "./reset-database-guard.js";

const DATABASE_URL_TLS_GUARD_MESSAGE =
  "DATABASE_URL refused: remote non-test connections must include sslmode=require or sslmode=verify-full.";

const ALLOWED_SSL_MODES = new Set(["require", "verify-full"]);

export function isDatabaseUrlTlsAllowed(connectionString: string): boolean {
  let url: URL;
  try {
    url = new URL(connectionString.replace(/^postgres:/, "postgresql:"));
  } catch {
    return false;
  }

  if (isResetDatabaseAllowed(connectionString)) {
    return true;
  }

  const sslmode = (url.searchParams.get("sslmode") ?? "").toLowerCase();
  return ALLOWED_SSL_MODES.has(sslmode);
}

export function assertDatabaseUrlTls(connectionString: string): void {
  if (!isDatabaseUrlTlsAllowed(connectionString)) {
    throw new Error(DATABASE_URL_TLS_GUARD_MESSAGE);
  }
}

export { DATABASE_URL_TLS_GUARD_MESSAGE };
