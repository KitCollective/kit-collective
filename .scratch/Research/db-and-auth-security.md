# Database connection and Identity security

Research for KitCollective. Primary sources only: this repo and official docs (Better Auth, NestJS, node-postgres, Drizzle, PostgreSQL, OWASP). Env **names** only — no secret values, cookies, or `Authorization` headers.

ADRs **0035–0039** are named in `.scratch/identity-better-auth/spec.md` and `.scratch/Architecture/tech-stack.md`. Those ADR files are **not** present under `docs/adr/` as of this write (accepted files stop at ADR-0034 plus untracked 0029/0030). Claims about Better Auth-in-Nest, Bearer sessions, and `User` as the Better Auth user are cited from the spec, tech-stack lock, and source — not from missing ADR files.

---

## Verdict

KitCollective opens Postgres with one `pg.Pool` whose only option is `connectionString` from `DATABASE_URL`. Nest Identity does **not** authenticate collectors through Better Auth’s public HTTP handler: `POST /v1/identity/login` and `register` run Nest + Drizzle `SELECT`/`INSERT` + bcryptjs, then call Better Auth’s **internal** adapter to mint a `session` row. The Bearer is that session token. That path has **no** application rate limit, **no** Nest Throttler, and **no** Better Auth `rateLimit` config. Official Better Auth docs state the built-in limiter applies to **client-initiated HTTP only**, not `auth.api` — so even production-default sign-in `3/10s` would not protect `/v1`.

What is already sound: bcrypt cost 12 (above OWASP’s bcrypt floor of 10), Zod-parsed credentials, Drizzle parameterized queries on Identity, revocable server-side sessions instead of a stateless JWT, CORS allow-list in production, clients never import `@kit/db`, and `resetDatabase` cannot DROP the shared development volume.

The holes that matter before production are unthrottled public Identity writes (credential stuffing, spraying, brute force, bcrypt/CPU and pool exhaustion), TLS to Postgres not enforced in code, one powerful DB role shared by Nest + seed + migrations, session tokens stored as lookup `text`, login/register enumeration, unused `verification` table with no reset HTTP yet, Auth events that log failures but do not brake them and do not store IP/UA, and no `@fastify/helmet` / `@nestjs/throttler`. A connection pool is not a rate limit. Auth events are not a control. Better Auth Infrastructure (`dash` / `sentinel`) is a **paid** overlay, not the database and not wired in `auth.ts`.

---

## How Nest opens Postgres

### Connection factory

`packages/db/src/migrate.ts` is the single product factory:

```ts
export function createDb(connectionString: string) {
  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });
  return { db, pool };
}
```

No `ssl`, no `max`, no `min`, no `connectionTimeoutMillis`, no `idleTimeoutMillis`, no `statement_timeout`, no `onConnect`. `migrate()` uses the same factory, runs Drizzle migrations, then `pool.end()`. `resetDatabase()` opens a **second** `new Pool({ connectionString })`, runs `DROP SCHEMA IF EXISTS drizzle CASCADE` / `public CASCADE` / `CREATE SCHEMA public`, ends that pool, then migrates.

### Nest load path (not ConfigModule)

There is no Nest `ConfigModule`. `apps/api/src/db/db.module.ts` reads `process.env.DATABASE_URL` at provider factory time, throws if unset, and injects **only** `createDb(url).db` as the global `DB` token. The `pool` handle is discarded; Drizzle still holds the pool internally. Nest never calls `pool.end()` on shutdown. `apps/api/package.json` does not depend on `@nestjs/config`.

`apps/api/src/main.ts` creates Fastify, `enableCors`, `setGlobalPrefix("v1")`, listens. No helmet plugin, no Throttler, no `ValidationPipe`. Body validation for Identity is Zod inside the service (`identityCredentialsSchema.parse`).

### Env names

| Name | Where | Role |
| --- | --- | --- |
| `DATABASE_URL` | `.env.example`, GitHub Environments `development` / `staging` / `production`, Nest `DbModule`, seed CLIs, Coolify compose, `wire-coolify-nest.yml` | Lane Postgres connection string |
| `STAGING_DATABASE_URL` | `.env.example` | Staging lane; seed falls back to `DATABASE_URL` |
| `SEED_STAGING_DATABASE_URL` | `.env.example`, seed MCP | Staging seed mapping |
| `API_TEST_DATABASE_URL` | CI / Nest tests | Ephemeral API test DB |
| `SEED_APIFY_TEST_DATABASE_URL` | CI / seed tests | Disposable seed test DB — must not be lane `DATABASE_URL` |
| `BETTER_AUTH_SECRET` | `.env.example`; required at Nest boot (`apps/api/src/config/better-auth-env.ts`) | Better Auth signing secret |
| `BETTER_AUTH_URL` | same | Public API origin for Better Auth |
| `BETTER_AUTH_API_KEY` | commented in `.env.example` | Documented for later dash/sentinel; **not** required to boot |
| `CORS_ALLOWED_ORIGINS` | `.env.example` | Comma-separated browser origins |
| `JWT_SECRET` | `.env.example` | Documented unused by Nest Identity after Auth session cutover |
| `HOST` / `PORT` | `listen-host.ts` / `main.ts` | Bind address |

`.env.example` states values live in GitHub Environments and that clients must not import these names. `CONTEXT.md` / tech-stack: secrets exist only in Nest env / matching Environment.

CI (`.github/workflows/ci.yml`) uses `postgresql://kit:kit@localhost:5432/kit_test` with `postgres:16` and `POSTGRES_USER=kit`. Deploy smoke (`.github/workflows/deploy-api.yml`) uses `postgresql://kit:kit@postgres:5432/kit_deploy_test`. Neither URL contains `sslmode`. Product Coolify `DATABASE_URL` is a GitHub Environment **secret** — the value is not in git; the **code** never appends `sslmode`.

### Pool defaults (official)

[node-postgres Pool](https://node-postgres.com/apis/pool): every `Pool` config field is optional. Defaults used here:

- `max`: **10**
- `min`: **0**
- `connectionTimeoutMillis`: **0** (wait forever for a client when the pool is full)
- `idleTimeoutMillis`: **10000**
- `maxLifetimeSeconds`: **0** (disabled)

A full pool **queues** (`pool.connect` FIFO). That is back-pressure, not HTTP `429`.

### SSL / sslmode

Repo grep: **no** `sslmode`, no `ssl:` Pool option, no `PGSSLMODE` in `.env.example`.

[node-postgres SSL](https://node-postgres.com/features/ssl): TLS is opt-in via `ssl` on the config object and/or URL params (`sslmode`, `sslcert`, `sslkey`, `sslrootcert`). If those URL params are present, they **replace** a separate `ssl` object. Context7 source of `pg-connection-string`: SSL object is created when `sslmode` / cert keys are in the string. `pg` `connection-parameters` also reads `PGSSLMODE`.

This client is **not** libpq unless `pg-native` is used (it is not in `apps/api` dependencies). Do not assume PostgreSQL’s libpq default `sslmode=prefer` applies to this Pool. [PostgreSQL libpq SSL](https://www.postgresql.org/docs/current/libpq-ssl.html): libpq default **is** `prefer` (encrypt if the server offers it; **no MITM protection**). `verify-full` is the mode that authenticates the server hostname. `require` encrypts but does not verify the certificate. Without `ssl` / `sslmode` / `PGSSLMODE`, this Nest Pool does not request TLS in code.

Coolify, compose jobs, and GitHub workflows do not set `sslmode` in committed strings. Whether the live Environment URL includes it is **not** visible in the repo.

### Who else opens Postgres

| Process | How | Same factory? |
| --- | --- | --- |
| Nest API (Identity, Catalog, Collection, Billing, Vision jobs in-process, Admin HTTP) | `DbModule` → `createDb(DATABASE_URL).db` | Yes |
| BullMQ workers | Same Nest process (tech-stack §9) | Same pool |
| Drizzle migrate / `resetDatabase` | `createDb` / extra `Pool` | Yes |
| `drizzle-kit` | `packages/db/drizzle.config.ts` `dbCredentials.url` = `DATABASE_URL` | Separate |
| Seed Apify CLI / Coolify apify job | `createDb(databaseUrl)` | Yes |
| Seed FK CLI / Coolify fk job | `new Pool({ connectionString })` in `seed/fkapi/src/mapper.ts` (ADR-0001: no `@kit/db`) | Same `pg.Pool` shape |
| Seed MCP verify scripts | `createDb(process.env.DATABASE_URL)` | Yes |
| Nest / db / seed **tests** | `createDb` or `Pool` against `*_TEST*` URLs | Yes |
| Expo / Astro / Admin SPA | HTTP `/v1` only | **No** Postgres (import boundary) |

ADR-0008: development Postgres is a **separate volume on the CX33**; development Nest still runs in agent VMs, not as a third app on the box. Staging/production Nest run on that host.

**pgbouncer:** no matches in repo source, compose, or workflows.

**Postgres roles / RLS:** no `GRANT`, `CREATE ROLE`, `ENABLE ROW LEVEL SECURITY`, or `BYPASSRLS` in `packages/db`. CI `POSTGRES_USER=kit` is the role the official `postgres` image creates as a superuser-equivalent owner of that instance. Product lane roles are not declared in git.

### Reset-database guard

`packages/db/src/reset-database-guard.ts`: `resetDatabase` refuses unless host is `localhost` / `127.0.0.1` **or** the database name contains `test`. Tests (`packages/db/tests/reset-database-guard.test.ts`) refuse a CX33-shaped `…/kit` URL. This is catalog/test safety, not Identity authorization.

---

## How Identity uses that connection

### Public HTTP (no `JwtAuthGuard`)

`apps/api/src/identity/identity.controller.ts`:

- `POST /v1/identity/register` → `IdentityService.register`
- `POST /v1/identity/login` → `IdentityService.login`

No password-reset or email-verify routes exist on this controller. Spec stories 3, 13–15 and CONTEXT **Email verification** / **Password reset** are not implemented as `/v1` yet.

### Register query path

1. Zod `identityCredentialsSchema`: email + password `min(8).max(128)` (`packages/api-contract/src/identity/session.ts`).
2. Normalize email to lowercase.
3. Drizzle `select({ id }).from(user).where(eq(user.email, normalizedEmail)).limit(1)`.
4. If row exists: `ConflictException("Email already registered")` (Nest **409**).
5. `bcryptjs.hash(password, 12)`; assign Handle; `insert(user)` with `passwordHash`, `name`, `handle`. Schema default `emailVerified: true` (`packages/db/src/schema/index.ts`) — insert does not set it false.
6. `createSessionToken` → Better Auth `internalAdapter.createSession(userId)` → return `accessToken` + user.

This is **not** Better Auth `signUp.email` HTTP.

### Login query path

```189:215:apps/api/src/identity/identity.service.ts
  async login(rawBody: unknown): Promise<IdentitySession> {
    const credentials = identityCredentialsSchema.parse(rawBody);
    const [found] = await this.db
      .select({
        ...USER_ME_SELECT,
        passwordHash: user.passwordHash,
      })
      .from(user)
      .where(eq(user.email, credentials.email.toLowerCase()))
      .limit(1);

    if (!found) {
      await this.recordAuthEvent({ kind: "failure", userId: null });
      throw new UnauthorizedException("Invalid email or password");
    }

    const valid = await compare(credentials.password, found.passwordHash);
    // ...
    const accessToken = await this.createSessionToken(found.id);
    await this.recordAuthEvent({ kind: "login", userId: found.id });
```

Unknown email: **no** bcrypt `compare`, Auth event `failure` with `userId` null, same 401 string. Known email, wrong password: bcrypt then 401. Success: session insert + `login` event.

Better Auth custom hasher in `auth.ts` (`hash`/`compare` cost 12) is for Better Auth’s own password APIs. Login does not call those APIs.

### Session and Bearer lookup

- Table `session`: `id`, `expiresAt`, `token` (unique), `ipAddress`, `userAgent`, `userId` FK cascade (`packages/db/src/schema/index.ts`).
- `createSessionToken` uses `ctx.internalAdapter.createSession(userId)` only — Identity does not pass IP/UA.
- Logout: `bearerTokenFromAuthorization` then `internalAdapter.deleteSession(token)`.
- `JwtAuthGuard`: `auth.api.getSession({ headers })` with **only** the `Authorization` header copied (`request-headers.ts`), then a second Drizzle `SELECT` of `user` by `session.user.id`.

Better Auth [Bearer plugin](https://www.better-auth.com/docs/plugins/bearer): server validates via `auth.api.getSession` when the Bearer header is present. `requireSignature` default **false**. [Session table](https://www.better-auth.com/docs/concepts/session-management): `token` is the session token (also used as the session cookie in Better Auth’s cookie model). Default `expiresIn` is **7 days** if unset — `createAuth` does not override `session.expiresIn`. KitCollective’s product contract stores the token as JSON `accessToken` (spec), not as a browser cookie.

Guard path **does** call `auth.api.getSession`. Better Auth rate-limit docs: **server-side `auth.api` is not rate-limited**.

### Better Auth adapter wiring

`apps/api/src/identity/auth.ts`: `betterAuth({ secret, baseURL, drizzleAdapter(db, { provider: "pg", schema: { user, session, account, verification } }), emailAndPassword + custom bcrypt, plugins: [bearer()] })`. No `rateLimit`, no `dash()`, no `sentinel()`, no public `/api/auth` mount. Spec: clients call `/v1/identity/…`, not `/api/auth/*`.

`account` holds provider tokens (`accessToken`, `refreshToken`, `idToken`, `password`). `verification` is `identifier` / `value` / `expiresAt`. No Identity HTTP writes those tables today except via Better Auth internals for `session`.

### Auth events

`auth_event`: `userId` nullable, `kind` (`login` | `logout` | `failure` | `reset` | `provider_link` in `packages/domain/src/identity.ts`), `provider`, **`ipAddress`**, **`userAgent`**, `createdAt`.

`recordAuthEvent` inserts **only** `kind` and `userId`. Own GET `/v1/identity/auth-events` returns id, kind, provider, createdAt — not IP/UA.

CONTEXT **Auth event**: persisted Identity fact (sign-in, sign-out, failure, reset, provider link). CONTEXT **Auth security**: Sentinel detections pulled into Admin — not implemented in `auth.ts`. Spec: dash/sentinel are Infrastructure Pro adapters; staff never opens `dash.better-auth.com`.

---

## What rate limiting actually protects

OWASP [Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html) and [Credential Stuffing Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Credential_Stuffing_Prevention_Cheat_Sheet.html) distinguish:

| Attack | Pattern | What HTTP rate limiting can do |
| --- | --- | --- |
| **Brute force** | Many passwords against **one** account | Per-account throttle / lockout (OWASP: counter on the **account**, not only IP) |
| **Password spraying** | One weak password against **many** accounts | Per-IP / subnet throttle; per-account lockout does **not** stop this |
| **Credential stuffing** | Leaked email+password pairs from **another** site | Per-IP **and** per-account buckets; IP block lists are weak because stuffing toolkits use proxy pools (OWASP stuffing sheet). MFA is the strong control (OWASP cites Microsoft analysis that MFA would have stopped 99.9% of compromises) |

Rate limiting also protects **availability**:

- bcrypt cost 12 is **intentionally slow**. Unthrottled `POST /v1/identity/login` is a CPU hash-oracle (OWASP Password Storage: a work factor that is too high can itself be used for DoS).
- Each attempt is `SELECT` + possible `INSERT auth_event` + possible `INSERT session`. That consumes pool clients. Pool `max` 10 with `connectionTimeoutMillis` 0 **queues** extra work instead of rejecting it ([Pool](https://node-postgres.com/apis/pool)). Postgres `max_connections` default is typically **100** ([PostgreSQL](https://www.postgresql.org/docs/current/runtime-config-connection.html)). Ten Nest clients will not exhaust 100 by themselves; **many Nest replicas × 10**, plus seed jobs, plus hung clients, can. Rate limiting is admission control **before** bcrypt and **before** checkout from the pool. The pool is not that control.

What rate limiting does **not** do: revoke a stolen Bearer, encrypt the wire to Postgres, stop SQL injection, or replace Sentinel detections (impossible travel, bots). It does not hash passwords.

### Why Auth events are not a control

CONTEXT and the spec define Auth events as a **persisted log** for collectors, Staff, and Auth ops. `recordAuthEvent` always inserts; it never returns 429, never lockouts, never delays. A stuffing run that 401s still writes a row per attempt (and burns a pool client to do it). Detection after the fact is not prevention. Spec story 5 wants failure events so Auth ops can **see** stuffing — that is observability.

### Why Better Auth’s built-in limiter does not apply to `/v1`

[Better Auth rate limit](https://www.better-auth.com/docs/concepts/rate-limit):

- Production default: window **60s**, max **100** requests; **`/sign-in/email` custom rule: 3 requests / 10 seconds**.
- **Disabled in development** unless `rateLimit.enabled: true`.
- **“Server-side requests made using `auth.api` aren't affected by rate limiting. Rate limits only apply to client-initiated requests.”**
- Storage default is **in-memory** (not shared across Nest replicas unless database/Redis storage is configured).

KitCollective login/register never hit Better Auth’s `/sign-in/email` HTTP route. They hit Nest `/v1/identity/login` / `register`. `createAuth` does not set `rateLimit`. `JwtAuthGuard` uses `auth.api.getSession`, which the same docs exclude from the limiter.

[Better Auth Infrastructure](https://better-auth.com/docs/infrastructure/introduction): `dash` and `sentinel` are a **paid** service (`@better-auth/infra`) for dashboard, abuse protection, messaging. They are **not** the Postgres `user` / `session` tables. `auth.ts` does not import them. `.env.example` comments `BETTER_AUTH_API_KEY` as “dash/sentinel — documented for later Auth ops; not required to boot.” Spec: Starter cannot satisfy Auth security; Sentinel is Infrastructure Pro.

Nest’s official control for brute-force on **Nest routes** is [`@nestjs/throttler`](https://docs.nestjs.com/security/rate-limiting) (`ThrottlerGuard` / `APP_GUARD`). It is not in `apps/api/package.json`. NestJS Throttler docs/integration-guide: apply stricter limits to authentication routes (example: auth window 15 minutes, limit 5). Behind a proxy, Fastify must trust forwarded headers or the tracker is wrong.

---

## Findings (security holes and missing 101)

Each finding separates **already-OK** from **missing**. “Set up” is the control, not a Linear ticket.

### 1. No app rate limit on login / register / reset

**Finding:** Public Identity writes are unthrottled. Password reset HTTP does not exist yet; when it lands, the same gap applies (OWASP Forgot Password: rate-limit reset requests or an attacker floods the user’s inbox).

**Evidence:** `identity.controller.ts` — `register` / `login` have no guard. `auth.ts` has no `rateLimit`. `apps/api/package.json` has no `@nestjs/throttler`. Grep: no `ThrottlerModule` / `ThrottlerGuard`. Official: Nest [rate limiting](https://docs.nestjs.com/security/rate-limiting); Better Auth limiter does not apply (above). OWASP Authentication: login throttling and account lockout; Credential Stuffing: IP-only limits are insufficient.

**Risk:** Credential stuffing, spraying, brute force, register enumeration at scale, future reset-mail flood, bcrypt CPU DoS, pool queueing.

**What "set up" means:** Persist counters (Postgres or Redis — in-memory fails with multiple Nest replicas). Separate buckets: per email, per IP (trusted proxy), coarse global on `/v1/identity/login|register` and future reset/verify. Over limit: **429**. Keep 401 body text identical. Do not use Better Auth `rateLimit` as the `/v1` door.

**Already-OK:** Failed login still 401 with a generic string (`Invalid email or password`). Auth event `failure` is written (log, not brake).

### 2. Pool is not a rate limit

**Finding:** `new Pool({ connectionString })` uses default `max` 10 and `connectionTimeoutMillis` 0.

**Evidence:** `packages/db/src/migrate.ts`. [Pool API](https://node-postgres.com/apis/pool): full pool queues; `connectionTimeoutMillis` 0 means no timeout.

**Risk:** Attackers keep submitting logins; work waits on the pool instead of being refused; legitimate `/v1` (including `GET /v1/health` `SELECT 1`) stalls. Health (`health.service.ts`) uses the same `DB` pool.

**What "set up" means:** Reject at HTTP first (finding 1). Then set `connectionTimeoutMillis` > 0, size `max` against instance count × Postgres `max_connections` (default typically 100), and add a pool `error` listener (Pool docs: unhandled pool `error` can crash Node).

**Already-OK:** A single Nest process will not open unbounded clients; default max 10 is a ceiling, not a DoS defense.

### 3. TLS to Postgres (`sslmode`)

**Finding:** Application code never requires TLS. Committed URLs have no `sslmode`.

**Evidence:** `createDb`; CI/deploy connection strings; grep empty for `sslmode`. [node-postgres SSL](https://node-postgres.com/features/ssl); [PostgreSQL libpq SSL table](https://www.postgresql.org/docs/current/libpq-ssl.html) (`disable` / `prefer` / `require` / `verify-ca` / `verify-full`).

**Risk:** Development Nest in cloud-agent VMs talks to CX33 Postgres (ADR-0008). Without TLS, the connection string password, `password_hash`, and `session.token` travel in the clear on that path. `require` without `verify-full` still allows MITM. Coolify host firewall is **not** visible in this repo.

**What "set up" means:** Non-localhost `DATABASE_URL` must use `sslmode=require` at minimum; `verify-full` + CA when the server has a real cert. Do not put `sslmode` in the URL **and** a conflicting `ssl` object (node-postgres warning). Confirm the Postgres port is not world-open. Localhost CI without TLS is acceptable.

**Already-OK:** Secrets stay in Environments, not git. Names only in `.env.example`.

### 4. DB role privilege (app vs superuser / migrations)

**Finding:** One `DATABASE_URL` for Nest, seed, and `DROP SCHEMA` migrations. No least-privilege roles in schema/migrations.

**Evidence:** `.env.example`; `resetDatabase` DDL; CI `POSTGRES_USER=kit`; no `GRANT`/`CREATE ROLE` in `packages/db`. OWASP [SQL Injection Prevention — Least Privilege](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html): do not assign DBA/admin to application accounts; different apps should not share the owner account.

**Risk:** Stolen Nest env = read/write/DROP everything (hashes, live sessions, provider tokens on `account`). Seed job = same. SQL injection (if introduced later) runs as that role.

**What "set up" means:** Migrator role for DDL; app role DML on needed tables only, **no** `DROP SCHEMA`. Seed role limited to stamdata tables if practical. Not superuser. `resetDatabase` stays test-only (guard already).

**Already-OK:** `resetDatabase` cannot wipe shared development `/kit` (guard). Seed tests must not use lane `DATABASE_URL` (isolation ratchet).

### 5. SQL injection surface (Drizzle vs raw)

**Finding:** Product Identity path is parameterized. Seed FK uses bound `$1`. No `sql.raw(` in the repo. Residual risk is future concat and `sql.raw`.

**Evidence:** Login/register use Drizzle `eq`. Catalog search uses `sql\`${catalogLabel.text} ilike ${pattern}\`` with `pattern = \`%${query}%\`` — Drizzle [sql template](https://orm.drizzle.team/docs/sql) binds `${pattern}` as `$1` (prevents SQLi; `%` / `_` in the search string are LIKE wildcards, not injection of SQL). Health: `sql\`SELECT 1\``. FK mapper: `pool.query(…, [params])`. `migrate.ts` DROP/CREATE are string **literals**. OWASP SQLi primary defense: prepared statements.

**Risk:** Low on current Identity. `sql.raw` or string-built SQL would reopen it. LIKE wildcards can over-match search, not dump tables.

**What "set up" means:** Keep Drizzle / `$1`. Ban `sql.raw` with user input. Do not concatenate into `pool.query` text.

**Already-OK:** Identity login SELECT is `eq(user.email, …)` after Zod email parse.

### 6. Password hashing (bcrypt cost)

**Finding:** bcryptjs cost **12** on register, login verify, change-password, and Better Auth custom hasher. OWASP [Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html): prefer Argon2id; **legacy bcrypt work factor 10 or more**; bcrypt **72-byte** input limit. Contract allows password `max(128)` — bcrypt implementations truncate at 72 bytes, so characters after byte 72 do not affect the hash.

**Evidence:** `hash(..., 12)` in `identity.service.ts` and `auth.ts`. Tests login a pre-inserted bcrypt-12 hash (`identity.test.ts`). No pepper. No HIBP / ASVS 2.1.7 breached-password check (Password Storage cheat sheet; spec Out of Scope: captcha, HIBP).

**Risk:** Cost 12 is a reasonable bcrypt floor. Stuffing still wins on reused leaked passwords. 72-byte truncation can surprise users with long passwords. High cost + no rate limit = CPU DoS (same cheat sheet).

**What "set up" means:** Keep 12; rate-limit first. Cap password length at 72 bytes **or** document bcrypt truncation. Argon2id / HIBP / MFA are later (spec: 2FA out of this increment).

**Already-OK:** Passwords are not stored plaintext. Cost 12 ≥ OWASP bcrypt minimum 10. Unique salt is bcrypt’s default.

### 7. Session token storage / lookup

**Finding:** `session.token` is `text` with a unique index. The Bearer **is** that value (`createSessionToken` returns `created.token`; guard looks it up via Better Auth). Identity does not hash the token before insert. Better Auth session docs describe `token` as the session token/cookie value — they do not document at-rest hashing in the page fetched.

**Evidence:** schema `session`; `identity.service.ts` `createSessionToken`; `jwt-auth.guard.ts`; [session management](https://www.better-auth.com/docs/concepts/session-management); [bearer](https://www.better-auth.com/docs/plugins/bearer). Logout deletes the row — tests: same Bearer then GET me is 401.

**Risk:** `SELECT` on `session` (stolen `DATABASE_URL`, SQL injection, backup leak) is impersonation until expiry/revoke. `account.access_token` / `refresh_token` are additional secrets at rest.

**What "set up" means:** Treat `DATABASE_URL` as session-equivalent. Hash tokens at rest if/when Better Auth supports it; until then, revoke-all (spec) and least-privilege DB role. Do not log `accessToken` or `Authorization`.

**Already-OK:** Session is **revocable** (not a 7-day JWT). Old JWT-shaped Bearer 401s (`identity.test.ts`). Clients send Bearer; spec: Expo SecureStore / Admin sessionStorage.

### 8. Timing / user enumeration on login

**Finding:** Login uses a quick-exit when the email is unknown (no dummy bcrypt). Register returns **409** `"Email already registered"`. OWASP Authentication: generic responses for wrong password, missing account, and lockout; registration should also avoid disclosing that the user exists; processing-time deltas are an enumeration channel. Spec story 15 requires generic reset responses — reset HTTP is not built yet.

**Evidence:** `identity.service.ts` login/register; OWASP Authentication “Authentication and Error Messages”. Same 401 **string** for unknown vs wrong password (good).

**Risk:** Attackers learn which emails are collectors (register 409; login timing). That list feeds stuffing/spraying.

**What "set up" means:** Dummy `compare` against a dummy hash on unknown email so timing matches. Register: generic success + mail, or the same response whether or not the email exists (OWASP). Reset: spec already requires identical 200.

**Already-OK:** Login 401 message is generic. Handle availability is behind `JwtAuthGuard` (not a public email oracle).

### 9. CORS / cookie vs Bearer

**Finding:** Session is Bearer, not a cookie. CORS is credentialed allow-list. Missing `Origin` is allowed (native / curl). Production without `CORS_ALLOWED_ORIGINS` refuses browser origins.

**Evidence:** `main.ts` `enableCors({ origin: isCorsOriginAllowed, credentials: true })`; `cors-origins.ts`. Spec / CONTEXT **Auth session**: clients send Bearer. Better Auth Bearer docs: intended for APIs that don’t use cookies; “improper implementation could easily lead to security vulnerabilities.” Cookie-consent columns are product cookies, not the Auth session.

**Risk:** CORS does not protect native clients. `credentials: true` matters if browsers send cookies; Auth session is not cookie-based, so classic cookie CSRF on login is not the current model. XSS on Admin/Expo that can read stored Bearer is session theft (client storage — spec).

**What "set up" means:** Keep Bearer as the product contract. Keep production origin env required. Do not add cookie sessions beside Bearer (CONTEXT avoid). If cookies are ever used for Auth, CSRF and `SameSite` become mandatory.

**Already-OK:** Allow-list; production fail-closed for browsers when env unset; no public `/api/auth`.

### 10. Secrets in env (names only)

**Finding:** Boot requires `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`. Lane secrets belong in GitHub Environments. `JWT_SECRET` is leftover and unused by Nest Identity.

**Evidence:** `.env.example`; `better-auth-env.ts`; `DbModule`; `docs/agents/error-ratcheting.md` (API image boot must pass `BETTER_AUTH_*`). Tech-stack: never put production secrets in staging/development Environments.

**Risk:** A leaked development `DATABASE_URL` is the CX33 development volume (ADR-0008) — hashes and sessions. Cloud agents and laptops share that name.

**What "set up" means:** Rotate on leak. Do not log connection strings or `BETTER_AUTH_SECRET`. Keep clients off these names. Do not mint product tokens with `JWT_SECRET`.

**Already-OK:** Names in git, values not. Import boundary forbids clients importing `packages/db`. Fail-fast if Better Auth env missing.

### 11. `statement_timeout` / idle timeout

**Finding:** Nest never `SET statement_timeout`. Pool idle timeout is node-postgres default 10s (client-side idle in the pool), which is **not** PostgreSQL `idle_in_transaction_session_timeout`.

**Evidence:** `createDb`; no `onConnect`. [PostgreSQL client config](https://www.postgresql.org/docs/current/runtime-config-client.html): `statement_timeout` default **0** (disabled); `idle_in_transaction_session_timeout` default 0; `idle_session_timeout` default 0. Docs recommend not setting `statement_timeout` globally in `postgresql.conf` for all sessions — prefer per-role or per-connection.

**Risk:** A pathological query holds a backend until the client disconnects. Open transactions can bloat tables (`idle_in_transaction_session_timeout` rationale).

**What "set up" means:** `onConnect` / startup `SET statement_timeout` for the Nest app role (seconds, not unlimited). Longer timeout for seed jobs. Consider `idle_in_transaction_session_timeout` on the app role. Beware `idle_session_timeout` with poolers (Postgres docs).

**Already-OK:** Pool `idleTimeoutMillis` 10s drops unused **clients**; it does not abort a running SQL statement.

### 12. Connection pool DoS

**Finding:** Related to (2) but about **exhaustion of Postgres slots** across processes.

**Evidence:** Every Nest replica, test, seed job, and `drizzle-kit` opens its own Pool (default 10). ADR-0008: cap memory/disk so a seed run cannot starve production — that is host memory, not `max_connections`. Postgres `max_connections` typically 100; `superuser_reserved_connections` default 3.

**Risk:** Seed job + Nest + leftover test pools + hung clients → new connections fail, including superuser emergency slots if those are also consumed. Unthrottled login amplifies checkout rate.

**What "set up" means:** HTTP admission (1). Cap Pool `max` per process. Do not point seed at production (seed CLIs already refuse production lane in product policy). Monitor `waitingCount` (Pool docs). No pgbouncer in repo — if added later, statement_timeout and pooling transaction mode must be designed; not present today.

**Already-OK:** Seed Coolify jobs are one-shot compose, not 24/7 (ADR-0003).

### 13. Auth event PII (IP, UA)

**Finding:** Schema has `ip_address` / `user_agent` on `auth_event` and `session`. Identity does not write them. Own events API does not return them.

**Evidence:** `recordAuthEvent`; `listOwnAuthEvents`; schema. Spec: “coarse IP/user-agent if Sentinel/request has them — no raw cookies, no Authorization values.” Better Auth rate-limit IP docs: default header `x-forwarded-for` is client-spoofable unless `trustedProxies` / a single proxy-set header is configured.

**Risk:** Auth ops cannot attribute stuffing by IP after the fact. If IP is stored later without proxy trust, attackers spoof `X-Forwarded-For`. IP/UA are personal data — store coarse, retain with a policy.

**What "set up" means:** On login/logout/failure, persist coarse IP + UA from a **trusted** hop. Do not log Bearer or cookies. Events remain a log unless paired with (1).

**Already-OK:** Events omit secrets. Peer Profil does not show Auth events (CONTEXT). Collector GET is owner-scoped.

### 14. Reset / verify token storage

**Finding:** `verification` table exists (`identifier`, `value` text, `expiresAt`). No Identity HTTP for reset or verify. Register sets accounts verified via schema default `emailVerified: true`, which **contradicts** CONTEXT Email verification (“Password sign-up must verify”) and spec stories 3 / 24.

**Evidence:** schema; `register` insert; no `identity/reset` routes. OWASP [Forgot Password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html): tokens cryptographically random, long, single-use, expired, **stored securely** (hash like passwords); identical response whether the email exists; rate-limit requests; do not auto-login after reset.

**Risk:** Until reset exists, forgotten-password is out of band. When it lands, storing `verification.value` in plaintext is a stolen-DB reset oracle. Current `emailVerified: true` means a typed email is trusted as verified.

**What "set up" means:** Default `emailVerified` false for password register; hash reset/verify tokens at rest; expiry; one-time use; generic responses; rate-limit; Notify/SES as spec. Do not implement reset without (1) and enumeration controls.

**Already-OK:** Table and Better Auth adapter mapping exist. Spec already requires non-enumerating reset.

### 15. Missing Nest helmet / throttler / ValidationPipe

**Finding:** `main.ts` is Fastify + CORS + prefix. No `@fastify/helmet`, no `@nestjs/throttler`, no global `ValidationPipe`.

**Evidence:** `apps/api/src/main.ts`; `apps/api/package.json` (`@fastify/cors` only among `@fastify/*`). Nest [Helmet](https://docs.nestjs.com/security/helmet): Fastify must `app.register(@fastify/helmet)`, not Express `helmet` middleware. Nest [Throttler](https://docs.nestjs.com/security/rate-limiting). Nest ValidationPipe is class-validator; this API uses **Zod in services** instead.

**Risk:** Missing security headers on browser-facing Admin/Expo Web (CSP/frame/XSS headers). Missing global HTTP throttle beyond Identity. ValidationPipe absence is **not** “no validation” on Identity — Zod parses bodies — but controllers type `@Body() body: unknown` and trust the service to parse; a new route that skips Zod would be unvalidated.

**What "set up" means:** Register `@fastify/helmet` before routes. Add Throttler (finding 1) as `APP_GUARD` with stricter `@Throttle` on Identity writes. Keep Zod as the contract parser; do not assume ValidationPipe.

**Already-OK:** Zod `identityCredentialsSchema` on login/register. CORS configured. Fastify adapter is the lock (spec: do not switch to Express for Better Auth).

---

## Already in good shape

- **One Identity, one User UUID.** CONTEXT Identity; tech-stack Auth; spec ADR-0037 intent; Drizzle `user` is the Better Auth user table mapping.
- **Revocable Bearer session**, not a stateless JWT. `session` row; logout deletes; tests 401 after logout; old JWT-shaped token 401 (`identity.test.ts`).
- **bcrypt cost 12**, not plaintext. Custom hasher shared with Better Auth config. Legacy bcrypt rows still log in (test).
- **Parameterized Identity SQL** (Drizzle `eq`) and Zod email/password parse. No `sql.raw` in repo.
- **Clients never open Postgres.** Tech-stack import rules; `apps/admin` / `apps/mobile` / `apps/web` must not import `packages/db`.
- **`resetDatabase` guard** blocks DROP of shared development `/kit`.
- **CORS allow-list**; production requires `CORS_ALLOWED_ORIGINS` or browsers are denied.
- **Handle availability is authenticated** (`JwtAuthGuard`).
- **Secrets names-only** in `.env.example`; `BETTER_AUTH_*` required at boot; `JWT_SECRET` documented unused.
- **Auth events exist as an audit log** (login / logout / failure) for the owner; kinds include future `reset` / `provider_link`.
- **FK seed raw SQL uses `$1` placeholders** (ADR-0001), not string concat of user input.
- **Health check** uses bound `sql\`SELECT 1\`` and maps failure to 503 without leaking the URL.

---

## Recommended lock (not tickets)

Minimum Nest + Postgres controls before production. Do not file Linear. Do not open a PR from this note.

1. **HTTP rate limit** on `/v1/identity/login`, `register`, and future reset/verify: persisted store; **separate** per-email and per-IP buckets plus a coarse global cap; `429`; dummy bcrypt on unknown email. Do not treat Better Auth `rateLimit`, Auth events, Sentinel, or Pool `max` as this control.
2. **TLS** on non-localhost `DATABASE_URL` (`sslmode=require` or `verify-full`). Confirm Postgres is not reachable on the public internet without a firewall.
3. **Roles:** migrator vs app vs seed. App cannot `DROP SCHEMA`. Not superuser.
4. **Pool:** `connectionTimeoutMillis` > 0; `max` sized to replicas × Postgres `max_connections`; `statement_timeout` on the Nest role; pool `error` handler.
5. **Tokens:** treat leaked `DATABASE_URL` as all live Bearers + all `password_hash` values. Hash reset/verify values when those routes land. Do not log secrets.
6. **`emailVerified` default false** for password register until verify completes (CONTEXT / spec).
7. **Auth events:** coarse IP/UA from a trusted proxy hop; still not a substitute for (1).
8. **Fastify helmet** for browser surfaces. Keep Bearer; keep CORS fail-closed in production.
9. **Better Auth Infrastructure** (`dash` / `sentinel`) is optional detections in Admin after the door is throttled — not a substitute for 1–3. Paid; not the DB.

---

## Sources

**Repo**

- `packages/db/src/migrate.ts`
- `packages/db/src/reset-database-guard.ts`
- `packages/db/src/schema/index.ts`
- `packages/db/drizzle.config.ts`
- `packages/db/tests/reset-database-guard.test.ts`
- `packages/api-contract/src/identity/session.ts`
- `packages/domain/src/identity.ts`
- `apps/api/src/db/db.module.ts`
- `apps/api/src/main.ts`
- `apps/api/src/app.module.ts`
- `apps/api/src/identity/auth.ts`
- `apps/api/src/identity/identity.module.ts`
- `apps/api/src/identity/identity.service.ts`
- `apps/api/src/identity/identity.controller.ts`
- `apps/api/src/identity/jwt-auth.guard.ts`
- `apps/api/src/identity/request-headers.ts`
- `apps/api/src/config/better-auth-env.ts`
- `apps/api/src/config/cors-origins.ts`
- `apps/api/src/config/listen-host.ts`
- `apps/api/src/health/health.service.ts`
- `apps/api/src/catalog/catalog.service.ts` (Drizzle `ilike` bind)
- `apps/api/package.json`
- `apps/api/tests/identity.test.ts`
- `seed/fkapi/src/mapper.ts`
- `seed/coolify/docker-compose.apify-job.yml`
- `.env.example`
- `.github/workflows/ci.yml`
- `.github/workflows/deploy-api.yml`
- `.github/workflows/wire-coolify-nest.yml`
- `CONTEXT.md` (Identity, Auth session, Email verification, Password reset, Auth event, Auth security)
- `.scratch/identity-better-auth/spec.md`
- `.scratch/Architecture/tech-stack.md`
- `.scratch/Architecture/data-model.md`
- `docs/adr/0001-interim-fk-seed-in-monorepo.md`
- `docs/adr/0003-seed-in-product-repo.md`
- `docs/adr/0008-development-postgres-on-cx33.md`
- `docs/adr/0018-staff-access-same-identity.md`

**Official**

- https://www.better-auth.com/docs/concepts/rate-limit
- https://www.better-auth.com/docs/concepts/session-management
- https://www.better-auth.com/docs/plugins/bearer
- https://better-auth.com/docs/infrastructure/introduction
- https://better-auth.com/docs/infrastructure/plugins/dash
- https://node-postgres.com/apis/pool
- https://node-postgres.com/features/ssl
- https://orm.drizzle.team/docs/sql
- https://docs.nestjs.com/security/rate-limiting
- https://docs.nestjs.com/security/helmet
- https://www.postgresql.org/docs/current/libpq-ssl.html
- https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- https://www.postgresql.org/docs/current/runtime-config-client.html
- https://www.postgresql.org/docs/current/runtime-config-connection.html
- https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Credential_Stuffing_Prevention_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html
