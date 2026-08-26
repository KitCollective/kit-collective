/**
 * Test-only JWT default so AppModule suites boot without a local .env.
 * Production code still fails fast via requireJwtSecret() when unset at runtime.
 */
if (!process.env.JWT_SECRET?.trim()) {
  process.env.JWT_SECRET = "test-jwt-secret";
}
