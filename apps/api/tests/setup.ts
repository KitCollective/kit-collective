/**
 * Test-only Better Auth defaults so AppModule suites boot without a local .env.
 * Production code still fails fast via requireBetterAuthSecret / requireBetterAuthUrl.
 */
if (!process.env.BETTER_AUTH_SECRET?.trim()) {
  process.env.BETTER_AUTH_SECRET = "test-better-auth-secret-not-for-production";
}
if (!process.env.BETTER_AUTH_URL?.trim()) {
  process.env.BETTER_AUTH_URL = "http://127.0.0.1:3000";
}
if (!process.env.JWT_SECRET?.trim()) {
  process.env.JWT_SECRET = "test-jwt-secret";
}
