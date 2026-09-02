# Identity door and database TLS

Feature spec for the KitCollective Linear project (**KitCollective v1**), milestone **Identity door and database TLS**. Design lock: existing Expo/Admin login error chrome (`docs/design-system.md`) — Banner or field error, not a new Auth screen. Domain nouns: `CONTEXT.md` (Identity, Auth session, Auth event, Auth throttle). Architecture: `.scratch/Architecture/tech-stack.md`. Research: `.scratch/Research/db-and-auth-security.md`. This spec **does not** replace Identity and Better Auth (sessions, social, verify, reset, Auth ops, Sentinel). It **adds** the door those public writes are missing, plus the Postgres connection 101 Nest does not enforce today.

Throwaway prototypes are not the contract.

## Problem Statement

Public Identity writes (`login`, `register`, and reset/social when those routes exist) have no application brake. Nest does its own bcrypt + `User` `SELECT`; Better Auth’s built-in limiter never runs on `/v1`. Auth events log a failed login; they do not stop the next one. The `pg.Pool` default of 10 connections queues work — it is not a `429`. A script can stuff leaked passwords, spray one password across emails, or burn bcrypt and the pool until legitimate `/v1` waits.

Separately, `createDb` opens Postgres with only `DATABASE_URL`. There is no TLS requirement in code, no statement timeout, and no connect timeout. Development Postgres lives on the CX33 so cloud agents can reach it. One powerful DB role serves Nest, seed, and `DROP SCHEMA`. That is not Sentinel and not `dash.better-auth.com`. It is developer-101, and without it the product is open on the password door and soft on the database wire.

## Solution

Nest **Identity** owns an **Auth throttle**: persisted counters in our Postgres, checked **before** bcrypt on public Identity writes. Two independent buckets (OWASP): per **email** and per **IP**. A coarse global cap sits on the same family of routes so one flood cannot fill the pool. Over the limit: **429**, Auth event kind `lockout`, no diagnostic which bucket fired. Failed login stays the same **401** text. Unknown-email login does the same minimum work as a known-email miss (dummy bcrypt) so timing is not an oracle.

**Identity** writes coarse IP and user-agent on Auth events (failure, lockout, login) — no cookies, no `Authorization`. Expo and Admin show the existing error chrome for 429; they do not grow a CAPTCHA or a second login layout.

`createDb` fail-closes TLS on non-localhost, non-test `DATABASE_URL` (`sslmode=require` or `verify-full`). Nest pool sets a connect timeout and a `statement_timeout` on new clients. App vs migrator roles are documented env **names**; Coolify grants are human (`/wizard`) when the agent cannot apply them. Staff never opens `dash.better-auth.com` for this. Clients never import `packages/db`.

## User Stories

1. As a collector, I want a wrong password to still 401 with the same “Invalid email or password” text, so that the throttle does not teach me whether the email exists.
2. As a collector typing a wrong password a few times, I want to still be able to succeed with the right password inside the window, so that a typo is not a lockout.
3. As a collector who has failed login enough times on one email, I want the next attempts to 429, so that a brute-force script cannot keep guessing that User.
4. As Nest Identity, I want that email bucket to be independent of IP, so that a distributed guess against one account still hits the limit.
5. As Nest Identity, I want an IP that hammers many emails to 429 even when no single email is over its limit, so that stuffing and spraying cannot walk the directory.
6. As Nest Identity, I want those two buckets checked separately (not one key `IP+email`), so that one IP cannot take the threshold against unlimited emails.
7. As Nest Identity, I want a coarse global cap on the public Identity write family, so that bcrypt and the ten-connection pool cannot be filled by one flood.
8. As Nest Identity, I want the throttle to persist in Postgres, so that two API instances share the same door.
9. As Nest Identity, I want the throttle to run before bcrypt on login, so that a 429 is cheaper than a hash.
10. As a collector logging in with an email that is not a User, I want the response status, body, and roughly the same work as a wrong password on a real User, so that timing is not an email oracle.
11. As Nest Identity, I want a successful login not to count as a failure on the email bucket, so that a collector who typed wrong then right is not punished for succeeding.
12. As Nest Identity, I want register to share the IP and global buckets (and a per-email request bucket), so that a script cannot create Users or collide emails without a brake.
13. As Nest Identity, I want password reset to share that family when the route exists, so that reset-mail flood is the same door, not a side door.
14. As Nest Identity, I want Social login to share that family when the route exists, so that idToken stuffing is not unlimited.
15. As Nest Identity, I want signed-in change-password and logout not to use the public write throttle, so that a Bearer holder is not locked out of their own session by the login door.
16. As Nest Identity, I want a lockout to write an Auth event kind `lockout` (userId set when the email is a User, null otherwise), so that Auth ops can see the door close.
17. As Nest Identity, I want failed login to keep writing Auth event `failure`, so that the existing list does not go quiet.
18. As Nest Identity, I want Auth events for login, failure, and lockout to store coarse IP and user-agent when the request has them, so that Staff can attribute stuffing without raw cookies or Authorization values.
19. As a collector, I want my own Auth events list to include `lockout` if I was the User, so that I can see why login stopped.
20. As Staff, I want Auth ops and the collector drill to list `lockout` in the same Data table as other Auth events, so that we do not invent a second security chrome for the door.
21. As Expo, I want a 429 on login/register/reset to show the existing error Banner (Danish), so that we do not invent a CAPTCHA sheet.
22. As Admin SPA, I want a 429 on the Sign in card to show the existing Banner or field error (English), so that we do not stack toasts.
23. As Nest, I want 429 bodies to stay generic (no bucket name, no remaining count, no precise `Retry-After` that schedules retries), so that attackers cannot tune the window.
24. As Nest, I want Better Auth `rateLimit` not to be the product door, so that we do not pretend their HTTP limiter covers `/v1`.
25. As Nest, I want Sentinel and `BETTER_AUTH_API_KEY` unused for this increment, so that the door does not wait on Infrastructure Pro.
26. As Nest, I want `createDb` to refuse a non-localhost, non-test `DATABASE_URL` that has no `sslmode=require` or `sslmode=verify-full`, so that lane Postgres is not opened in cleartext from code.
27. As Nest, I want localhost, `127.0.0.1`, and database names that contain `test` to stay allowed without SSL, so that CI and local vitest keep using the existing URLs.
28. As Nest in production, I want boot to fail if `DATABASE_URL` is remote and lacks that `sslmode`, so that a missing Environment query string cannot silently go cleartext.
29. As Nest, I want the pool to set `connectionTimeoutMillis` greater than zero, so that a full pool fails instead of waiting forever.
30. As Nest, I want each new pool client to `SET statement_timeout`, so that a runaway query cannot hold a backend indefinitely.
31. As Nicklas, I want those pool and SSL rules documented as env **names** on `DATABASE_URL` only (query string), so that secrets stay in GitHub Environments.
32. As a seed job, I want a longer statement timeout than Nest (or its own pool options), so that a kader upsert is not killed by the API’s short ceiling.
33. As Nest, I want the runtime `DATABASE_URL` documented as the **app** role (DML, no `DROP SCHEMA`), so that a stolen API env is not a superuser.
34. As migrate, I want an optional `MIGRATOR_DATABASE_URL` for DDL; if unset, fall back to `DATABASE_URL` for local/CI, so that development does not require two roles on day one.
35. As Nicklas, I want Coolify role grants to be human (`/wizard`) when the agent cannot apply them, so that Evidence says so instead of skipping the throttle.
36. As Nest, I want `resetDatabase` to keep refusing non-test, non-localhost URLs, so that the TLS change does not reopen catalog wipe.
37. As a client app, I want to keep calling `/v1/identity/…` only, so that Expo and Admin never import Better Auth server or `packages/db`.
38. As Nest, I want Fastify to stay the HTTP adapter, so that we do not add Express for a limiter.
39. As Nest, I want trusted-proxy IP extraction (`X-Forwarded-For` only when the hop is trusted), so that a client cannot spoof the IP bucket with a header.
40. As Nicklas, I want this milestone demoable against ephemeral Postgres and then staging: five failed logins on one email then 429; one IP spraying many emails then 429; unknown-email login same 401 and not instant; lockout Auth event; Nest refuses a remote URL without `sslmode`; pool connect timeout and statement_timeout are set — so that the door and the wire can promote independently of Sentinel, Apple, and 2FA.

## Implementation Decisions

- **Linear:** Feature on existing project **KitCollective v1**. New milestone **Identity door and database TLS**. No second project. Do not fold this into Identity and Better Auth — that milestone is sessions, social, verify, reset chrome, Auth ops, Sentinel. This milestone is the door and the wire.
- **Visual lock:** Existing Expo/Admin login error chrome. Danish Banner on Expo, English Banner or field error on Admin. Do not invent CAPTCHA, a lockout countdown screen, or Auth waffle chrome. Flag copy gaps.
- **Modules:** **Identity** owns the Auth throttle, Auth event writes (`failure`, `lockout`, IP/UA), and the public write family check. **`packages/db` `createDb`** owns TLS fail-closed, connect timeout, and `statement_timeout` for the Nest pool. Seed CLIs may set a longer statement timeout on their own pool. **Admin** / **Notify** / **Billing** unchanged except listing the new Auth event kind where events already render.
- **Seam (one, product):** `packages/api-contract` `/v1` as implemented by Nest (Fastify). Throttle, bcrypt dummy-compare, and Auth event writes sit behind that interface. Callers and tests do not import `better-auth` server. Clients do not import `packages/db`.
- **Internal factory (not a second public contract):** TLS and pool options live on `createDb`. Tests that cannot go through HTTP (boot refuse, sslmode parse, statement_timeout on connect) use that factory’s interface. That is not a client-facing seam.
- **Auth throttle:** Persist counters in our Postgres (table beside Auth event / Identity — implement picks the row shape). Two independent buckets plus a coarse global cap. Not Better Auth `rateLimit`. Not memory-only. Not the `pg.Pool` queue.
- **Routes in the family:** `POST /v1/identity/login`, `POST /v1/identity/register`, and when present `password-reset` request and `POST /v1/identity/social`. Signed-in change-password, logout, revoke, and GET me are out of this door.
- **Thresholds (lock):** Email bucket: **5** failed **logins** per **15 minutes** → 429. IP bucket: **20** family requests per **15 minutes** → 429. Global: **100** family requests per **1 minute** per process-shared counter in Postgres → 429. Register/reset increment IP + global + a per-email **request** bucket of **5** per **15 minutes** (mail/create flood). Implement may store windows as integer seconds; do not silently change the counts.
- **Responses:** Failed login/unknown email: **401**, same body as today. Over throttle: **429**, generic body, no bucket name, no remaining, no precise `Retry-After`. Register collision stays **409** this increment (scale enumeration is the IP/email request buckets). Reset stays same **200** whether the email exists (Identity and Better Auth).
- **Dummy work:** Unknown-email login runs a bcrypt compare against a dummy hash so the 401 is not instant relative to a known-email miss.
- **Auth event kind:** Add `lockout` to `AUTH_EVENT_KINDS`. Contract and Admin/Expo lists that already switch on kind must accept it. IP and user-agent columns already on `auth_event` — write them for `login`, `failure`, and `lockout`.
- **IP:** Trust `X-Forwarded-For` only from the configured proxy hop (Coolify). If IP cannot be determined, still apply the email bucket and the global cap; do not skip the door.
- **TLS:** Parse `DATABASE_URL`. Exempt host `localhost` / `127.0.0.1` **or** database name containing `test` (same spirit as `resetDatabase` guard). Otherwise require `sslmode=require` or `sslmode=verify-full`. Do not also pass a conflicting `ssl` object that URL params would overwrite (node-postgres). Document the query string on the env **name** `DATABASE_URL`.
- **Pool:** `connectionTimeoutMillis` **2000**. `onConnect` (or equivalent) `SET statement_timeout = 5000` for Nest. Seed jobs that share `createDb` must not inherit 5s if a long upsert would die — seed passes its own timeout or its own Pool options. `max` may stay 10.
- **Roles:** Document `DATABASE_URL` = app role (DML). Optional `MIGRATOR_DATABASE_URL` for migrate. Unset → migrate uses `DATABASE_URL`. Coolify `GRANT` / role create is human when needed. Do not enable RLS in this increment.
- **Env names (document only):** `DATABASE_URL` (may gain `sslmode`), `MIGRATOR_DATABASE_URL` (optional), existing `BETTER_AUTH_*` unchanged. No `BETTER_AUTH_API_KEY` required. Values in GitHub Environments `development` / `staging` / `production`.
- **Clients:** Expo and Admin map 429 through existing error chrome. No new route, no Better Auth client limiter.
- **Lanes:** Demo throttle on ephemeral Postgres in CI; TLS refuse as a unit at `createDb`. Staging Environment `DATABASE_URL` must include `sslmode` before promote, or Nest will not boot — human `/wizard` if the Coolify URL is still cleartext.

## Testing Decisions

Tests cover external behaviour at the highest public interface. They do not assert Better Auth rate-limit internals, Sentinel, helmet, pool `max`, or Banner blur.

**Good test:** HTTP (contract parse + Nest) on ephemeral Postgres. Register User A. Fail login on A five times → 401 and Auth event `failure`. Sixth → **429**, Auth event `lockout` for that userId. Seventh still 429. Correct password after lockout still 429 until the stored window is advanced **inside Identity** (not a second public route). One IP fails login once each against 20 distinct emails → later family request 429 even though no email has 5 failures. Unknown-email 401 body matches known-email wrong password. Successful login after 2 failures still 200. A different IP still 200 while another IP is 429. GET `/v1/identity/me` with a valid Bearer is not 429 from this door. Auth event rows for failure/lockout/login include ip or user-agent when inject headers send them; never store Authorization.

**TLS / pool (factory interface, not `/v1`):** `createDb` or the URL guard throws on `postgresql://kit:kit@db.example:5432/kit` without `sslmode`. Same URL with `sslmode=require` is accepted by the guard (do not require a live TLS server in CI). `postgresql://kit:kit@localhost:5432/kit_test` without sslmode is accepted. `resetDatabase` still refuses a CX33-shaped URL. A connected test client has `statement_timeout` 5000 (query `SHOW statement_timeout` on the Nest pool).

**Seam (one):** `packages/api-contract` `/v1` as implemented by Nest. `/tdd` will not re-quiz this seam. Factory tests for TLS/timeout are additional, not a second product contract.

**Adapters behind the seam:** Postgres via `packages/db` (real, ephemeral). No fake throttle adapter — the door is the product. Do not mock Better Auth. Do not add a public `/api/auth` test surface.

**Do not add a seam** for Expo/Admin UI. Import-boundary tests stay. Pixel tests are out.

**Modules tested:** Identity (login/register throttle, dummy-compare contract, lockout Auth event, IP/UA on events). `createDb` / URL guard (sslmode, localhost exempt, statement_timeout). One existing identity login still 200 under the limit (no regression). Collection GET with Bearer still 401/200 as today.

**Prior art:** `apps/api/tests/identity.test.ts` (failed login Auth events, registerSession). `packages/db` reset-database-guard tests. Import-boundary tests.

## Out of Scope

- Better Auth Infrastructure: `dash`, `sentinel`, `BETTER_AUTH_API_KEY`, `dash.better-auth.com`.
- MFA, passkeys, CAPTCHA, HIBP / breached-password check, Apple.
- Postgres RLS, pgbouncer, changing `pool.max` as the product door.
- Hashing `session.token` at rest, rotating Better Auth secrets.
- Changing register from 409 to a generic 200 (this increment).
- `emailVerified` default (Identity and Better Auth / KIT-175).
- Helmet, Nest Throttler on all `/v1`, CDN/WAF.
- A third waffle tile, Auth ops redesign, Expo lockout history chrome beyond the existing Auth event list.
- Seed proxy TLS (`rejectUnauthorized: false` on Transfermarkt) — not this Postgres wire.
- Public Astro login.

## Linear

- **Project:** KitCollective v1
- **Mode:** feature
- **Lead:** Nicklas
- **Priority:** None (not named)
- **Milestones** (each is one staging increment — a handful of issues, not the whole product):
  1. Identity door and database TLS — Public Identity writes 429 after locked per-email and per-IP buckets; unknown-email login is not an oracle; lockout is an Auth event with coarse IP/UA. Nest refuses remote `DATABASE_URL` without `sslmode=require|verify-full`; pool connect timeout and statement_timeout are set. Demoable on ephemeral Postgres and against staging once the Environment URL has `sslmode`. Ready to promote integration → staging when that works. No Sentinel, CAPTCHA, or RLS. Coolify role grants may be `/wizard` — say so in Evidence; do not skip the throttle.

## Further Notes

- Glossary: **Auth throttle** is in `CONTEXT.md` (persisted Identity door; not the pool; not Sentinel). Visual lock: `docs/design-system.md`. Research: `.scratch/Research/db-and-auth-security.md`.
- If a ticket fights this door to “just enable Better Auth rateLimit”, change this spec first — their limiter does not cover `/v1`.
- Staging/production `DATABASE_URL` query string is human if Coolify still serves cleartext Postgres. Throttle tickets are not blocked on that wizard.
- Next step: `/to-tickets` under milestone **Identity door and database TLS**. Do not file tickets from this skill.
