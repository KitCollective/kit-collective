# Auth session is a revocable Bearer, not a JWT

Expo, Admin SPA, and `/v1` already speak `Authorization: Bearer`. Better Auth keeps the session in our database so Nest can revoke it; clients still send one Bearer token (their Bearer plugin), not a stateless 7-day JWT and not cookie-only Admin beside a different Expo token. HttpOnly cookies are slightly stronger against XSS on Admin, but a second transport is less stable across Expo and Admin.

Status: accepted.
