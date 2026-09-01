# Identity and Better Auth

Feature spec for the KitCollective Linear project, milestone **Identity and Better Auth**. Design lock: `docs/design-system.md` (existing Admin Data table + waffle Master Data | User Data; Expo Profil settings list). Domain nouns: `CONTEXT.md` (Identity, Auth session, Social login, Email verification, Password reset, Auth event, Auth security, Auth ops). Architecture: `.scratch/Architecture/tech-stack.md` and `data-model.md` (Auth row updated to match this spec). Decisions: ADR-0018 (same Identity), ADR-0019 (Admin English), ADR-0035 (Better Auth in Nest; ops in Admin SPA), ADR-0036 (revocable Bearer), ADR-0037 (`User` is the Better Auth user), ADR-0038 (verified social email auto-links), ADR-0039 (staff can revoke collector sessions).

This spec **does not** replace Profil, Staff access, Entitlement, or Admin Take-down. It **replaces** the stateless JWT Identity session with Better Auth behind the existing `/v1` Identity seam. Fastify stays. Clients never call `dash.better-auth.com`.

Throwaway prototypes are not the contract.

## Problem Statement

Identity is a home-rolled JWT: email/password works, logout does not revoke, Social login is a stub, there is no reset or verify, and Staff cannot see login or abuse. Agents will either stand up `dash.better-auth.com` as a second operator UI, keep a 7-day JWT, or invent a third waffle tile. Without Better Auth in Nest and Auth ops in Admin SPA, Google/Facebook and “log out everywhere” stay unshippable.

## Solution

Nest **Identity** embeds Better Auth against the existing `User` (same UUID). Email/password stays the default. **Auth session** is a server-side session sent as Bearer. **Social login** is Google and Facebook (Expo native idToken and Admin). Verified provider email auto-links. Password sign-up verifies; signed-out **Password reset** uses email via Notify (SES). **Auth events** and **Auth security** (Sentinel) land in our Postgres; Staff reads them on **Auth ops** under User Data, on the collector drill, and on their own Admin account. Collectors see own events and “log out everywhere” under Expo Profil settings. Staff can revoke a collector’s sessions. Apple, 2FA, and `dash.better-auth.com` as chrome are out.

## User Stories

1. As a collector, I want to register with email and password, so that Identity still works without a social provider.
2. As a collector, I want that register to create one User with a Handle from the email local-part (suffix on collision), so that Social login does not change the Handle rule.
3. As a collector after password register, I want Email verification before the account is treated as verified, so that a typed email is not trusted raw.
4. As a collector, I want to log in with email and password and receive an Auth session Bearer, so that Expo and Admin keep one token shape.
5. As a collector, I want a wrong password to 401 and write an Auth event failure, so that Auth ops can see stuffing attempts.
6. As a collector, I want GET `/v1/identity/me` and every existing owner `/v1` call to accept that Bearer, so that Collection, Indbakke, and Wishlist do not learn a second token.
7. As a collector, I want POST logout to revoke *this* Auth session, so that the Bearer stops working.
8. As a collector, I want “log out everywhere” under Profil settings to revoke all of my Auth sessions, so that a stolen phone is not a 7-day JWT.
9. As a collector, I want my own Auth events under Profil settings (sign-in, sign-out, failure, reset, provider link), so that I can see how I got in.
10. As a collector, I want that list in Danish settings chrome, so that we do not invent a second Profil tab.
11. As a collector, I want Peer Profil never to show Auth events, so that login history is not public.
12. As a collector, I want signed-in change-password to keep working, so that reset is not the only way to rotate.
13. As a collector who forgot the password, I want a signed-out reset email that sets a new password on the same User, so that I am not locked out.
14. As a collector, I want that reset to revoke other Auth sessions, so that the forgotten password cannot stay live on another device.
15. As a collector, I want reset not to reveal whether the email exists (same response either way), so that we do not leak accounts.
16. As a collector, I want Google Social login on Expo via native idToken, so that I am not sent through a browser OAuth sheet as the primary path.
17. As a collector, I want Facebook Social login on Expo via native idToken, so that both locked providers work on device.
18. As a collector on Admin SPA, I want Google and Facebook on the English Sign in card, so that Staff uses the same Identity.
19. As a collector whose Google/Facebook email is verified and already on a User, I want auto-link to that User, so that I do not get a second Collector.
20. As a collector whose provider email is not verified, I want no auto-link, so that an unverified social email cannot steal a User.
21. As a collector signing in with Google the first time, I want Handle from the email local-part, not the Google display name, so that Handle stays a public name rule.
22. As a collector, I want `linkedAccounts` on me to show google/facebook linked true after a successful Social login, so that Konto is not a stub.
23. As a collector, I want Apple Social login not to appear in this increment, so that we do not pretend App Store “Sign in with Apple” is done.
24. As a collector, I want a Social login that creates a User to count as Email verification, so that I am not asked to verify a Google email again.
25. As a collector after cutover, I want an old JWT to 401, so that the 7-day token is dead.
26. As a collector with an existing bcrypt password, I want email/password login still to work after migrate, so that I am not force-reset.
27. As Staff, I want Auth ops under User Data (not a third waffle tile), so that Master Data | User Data stays the lock.
28. As Staff, I want Auth ops to list Auth events for the product in an Admin Data table (English), so that I can scan login, logout, failure, reset, and link.
29. As Staff, I want Auth ops to list Auth security detections from Sentinel (credential stuffing, bots, impossible travel, and the rest they emit), so that I can monitor abuse in our panel.
30. As Staff, I want never to open `dash.better-auth.com` to do that job, so that we do not grow a second operator login.
31. As Staff on a collector drill, I want that collector’s Auth events, so that support can see how they signed in.
32. As Staff on a collector drill, I want to revoke that collector’s Auth sessions, so that a stolen phone is a Staff action (ADR-0039).
33. As Staff, I want my own Auth events on the Admin account place, so that Q4 “det hele” includes the operator.
34. As Staff, I want to revoke my own Auth sessions from that account place, so that I can kick my other browsers.
35. As Staff, I want unauthenticated Auth ops and revoke to 401, so that Auth events are not public.
36. As Staff, I want a collector (role=user) hitting Auth ops or another User’s revoke to 403, so that Staff access stays `User.role`.
37. As Staff, I want Auth security never to be the Expo console, so that collectors do not see Sentinel.
38. As Nest Identity, I want Better Auth to use our `User` UUID, so that we do not create a parallel auth user (ADR-0037).
39. As Nest Identity, I want Better Auth `session` and `account` tables beside `User`, so that revoke and Social login have a place to live.
40. As Nest Identity, I want the public contract to stay `accessToken` + `user` on register/login/social, so that Expo/Admin session parse does not become cookies.
41. As Nest Identity, I want logout to stop being a no-op, so that ADR-0036 is product behaviour.
42. As Nest Identity, I want Fastify to stay the HTTP adapter, so that we do not switch to Express for Better Auth.
43. As Nest Identity, I want clients to call `/v1/identity/…` and `/v1/admin/…`, not `/api/auth/*`, so that Better Auth is not a second public interface.
44. As Nest Notify, I want verify and reset mail to go through the existing SES path, so that Identity does not grow a second mailer.
45. As Nest, I want `dash` and `sentinel` configured with env **names** only (`BETTER_AUTH_API_KEY` and the URL names they require), so that secrets stay in GitHub Environments.
46. As Nest, I want Sentinel detections upserted into our Postgres, so that Auth ops still lists them if their dashboard is down later that day.
47. As Nest, I want Identity to write Auth events on sign-in, sign-out, failure, reset, and provider link, so that we do not depend on dash for the collector-visible list.
48. As a client app, I want to import only `packages/api-contract` and `packages/domain`, so that Expo and Admin never import Better Auth server or `packages/db`.
49. As Expo, I want `@better-auth/expo` only if it talks to our `/v1` Identity (or we skip the client package and POST idToken ourselves), so that we do not point the mobile app at `dash.better-auth.com`.
50. As Admin SPA, I want the Sign in card to keep lockup-black + English, with Google/Facebook as extra actions, so that we do not invent a second login layout.
51. As an implementing agent, I want to flag missing Danish/English copy rather than invent Auth ops chrome, so that we reuse Data table and settings List row.
52. As Nicklas, I want this milestone demoable on a device build and Admin against staging: password register + verify + login; Google and Facebook; auto-link; reset mail; log out everywhere; Auth ops shows events and at least one security detection (or a recorded fixture if Sentinel is quiet); collector drill revoke; staff account history, so that Identity and Better Auth can promote independently of Astro and 2FA.

## Implementation Decisions

- **Linear:** Feature on existing project KitCollective. New milestone **Identity and Better Auth**. No second project.
- **Visual lock:** Existing Admin Data table, User Data waffle, collector drill, English login card. Expo Profil settings List row + Sheet confirm for “log out everywhere”. Do not invent an Auth waffle tile, a Profil history tab, or Better Auth dashboard chrome. Flag copy gaps.
- **Modules:** **Identity** owns User, Auth session, Social login, Email verification, Password reset, Auth event writes, session revoke. **Notify** owns SES send for verify/reset (Identity asks Notify; it does not speak SES). **Admin** (`apps/admin` + Nest admin collectors) owns Auth ops pages and drill/account revoke chrome. **Billing** / Entitlement unchanged — Auth session is not billing truth.
- **Seam (one):** `packages/api-contract` `/v1` as implemented by Nest (Fastify). Better Auth, Sentinel, SES, and Google/Facebook token verify sit behind that interface as adapters. Callers and tests do not import `better-auth` server.
- **Better Auth:** Library in the Nest process. Drizzle adapter mapped onto our `User` (ADR-0037). Bearer plugin. `dash` + `sentinel` plugins for Infrastructure (Pro). Do not mount a public `/api/auth/*` as the product contract. If Better Auth requires an internal handler path, Identity translates it; Expo/Admin still use `/v1`.
- **Auth session:** Opaque Bearer in `identitySessionSchema.accessToken`. Store in Expo SecureStore / Admin sessionStorage as today. Nest looks up the session row; revoke deletes/invalidates it. Cutover: existing JWTs 401.
- **Password:** Keep offering email/password. Migrate existing `passwordHash` (bcryptjs) via Better Auth custom hasher or a one-shot verify-then-rehash. Do not force-reset every Collector.
- **Social login:** Providers `google` and `facebook` only. Expo: native SDK → `POST /v1/identity/social` with `{ provider, idToken }`. Admin: same resource (idToken or authorization code — pick one in implement, keep one contract). Auto-link when provider email_verified and email matches (ADR-0038). Handle from email local-part. Update `linkedAccounts`.
- **Email verification / Password reset:** Token links. Notify SES. Unverified password User cannot be treated as `emailVerified: true`. Social verified email sets it. Reset success revokes other sessions.
- **Auth event:** Our table (or equivalent) written by Identity: kind, userId nullable for failure, provider nullable, createdAt, coarse IP/user-agent if Sentinel/request has them — no raw cookies, no Authorization values. GET own list for collector; GET by userId for Staff; GET product list for Auth ops.
- **Auth security:** Adapter pulls Sentinel detections into our table. Auth ops lists them. Not on Expo. Not an iframe.
- **Auth ops routes (decision, not a host file):** `GET /v1/admin/auth/events`, `GET /v1/admin/auth/security` — own controller prefix so they never collide with `GET /v1/admin/collectors/:userId`. Collector: `GET /v1/admin/collectors/:userId/auth-events`, `POST /v1/admin/collectors/:userId/sessions/revoke`. Staff self: `GET /v1/identity/auth-events`, `POST /v1/identity/sessions/revoke-all`. Logout remains `POST /v1/identity/logout` (this session only).
- **Env names (document only):** `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `BETTER_AUTH_API_KEY`, plus Google/Facebook client id/secret **names**, plus existing SES names. Values in GitHub Environments `development` / `staging` / `production`.
- **Clients:** `apps/mobile` and `apps/admin` import only `packages/api-contract` and `packages/domain`. Optional `@better-auth/expo` only as a helper that still hits our `/v1` base; if it forces `/api/auth`, do not use it — POST idToken on the contract.
- **Lanes:** Device + Admin demo against staging after promote. Infrastructure API key per lane. Development Nest remains in VMs.

Session payload (decision — `accessToken` is now the Auth session, not a JWT):

```text
{ accessToken: string, user: IdentityMe }
```

Social body (decision):

```text
{ provider: "google" | "facebook", idToken: string }
```

## Testing Decisions

Tests cover external behaviour at the highest public interface. They do not assert Better Auth table names, Sentinel HTTP payloads, JWT library leftovers, Sheet blur, or Google/Facebook SDK UI.

**Good test:** HTTP (contract parse + Nest) on ephemeral Postgres. Register password User → verify via recorded email adapter (read the token the adapter captured) → login returns `identitySessionSchema` → GET me 200 → logout 204 → same Bearer GET me 401. Second device login → revoke-all → both Bearers 401. Failed login writes an Auth event the owner and Staff can GET; Peer GET does not include it. Existing bcrypt fixture User logs in without reset. Social POST with fake verified idToken (email matches existing User) auto-links and does not create a second User; unverified fake token does not link. Reset: same 200 whether email exists; existing User can set a new password from the captured token; old sessions 401. Staff GET `/v1/admin/auth/events` 200; collector 403; anonymous 401. Staff revoke on collector drill invalidates that collector’s Bearer. Sentinel fake adapter upserts one detection; Auth ops security GET returns it. Unauthenticated `/v1` Collection still 401 with the new Bearer scheme.

**Seam (one):** `packages/api-contract` `/v1` as implemented by Nest. `/tdd` will not re-quiz this seam.

**Adapters behind the seam (not the test surface):** Postgres via `packages/db`; Better Auth (real library in-process against test Postgres — do not mock the library); email/Notify (fake adapter that records to/subject/url); social idToken verify (fake adapter that accepts fixture tokens with `email`, `emailVerified`, `provider`); Sentinel (fake adapter that returns/records detections). Two adapters (real vs fake) make email/social/Sentinel seams real. Tests still enter through HTTP.

**Do not add a seam** for Expo/Admin UI. Design lock + import-boundary tests are enough. Pixel tests are out. Do not add a public `/api/auth` test surface.

**Modules tested:** Identity (register, login, session revoke, social auto-link, verify, reset, Auth event writes, Handle rule). Admin Auth ops and collector revoke (401/403/200). Notify send only insofar as the fake adapter was invoked. Billing/Collection regression: one existing identity test still GETs a jersey with the new Bearer.

**Prior art:** `apps/api/tests/identity.test.ts` (registerSession, me, prefs, linkedAccounts stub). Admin collector 403 tests. Schema migrate tests on ephemeral Postgres. Import-boundary tests stay. Mobile unit tests for settings list enablement (same style as Profil prefs), not Google SDK.

## Out of Scope

- Apple Social login, Sign in with Apple App Store rule work, passkeys, 2FA, magic link, email OTP, phone/SMS login.
- `dash.better-auth.com` as Staff chrome, iframe, or a second operator login.
- A third waffle tile “Auth”.
- Auth events on Peer Profil or on the Expo identity card.
- Stateless JWT, cookie-only Admin beside a different Expo token.
- A parallel Better Auth `user` table.
- Clerk, Auth0, or a second IdP.
- Changing Entitlement, Offer, IAP, Staff access rules, Take-down, or Handle availability chrome.
- SMS reset, captcha, HIBP, organization/SSO/SCIM plugins.
- Public Astro login.
- Expo Web as first-class Google/Facebook (device + Admin are the accept).
- Rewriting Collection, Indbakke, Wishlist, or Vision except Bearer validation.

## Linear

- **Project:** KitCollective
- **Mode:** feature
- **Lead:** Nicklas
- **Priority:** None (not named)
- **Milestones** (each is one staging increment — a handful of issues, not the whole product):
  1. Identity and Better Auth — Signed-in Expo and Admin use a revocable Auth session Bearer from Nest Identity (Better Auth behind `/v1`). Password register verifies; reset mail works; Google and Facebook Social login auto-link on verified email. Auth ops under User Data lists Auth events and Auth security. Collector drill and staff account show history; staff can revoke; collector can log out everywhere from Profil settings. Demoable on a device build and Admin against staging. Ready to promote integration → staging when that works. No Apple, 2FA, or hosted Better Auth dashboard as UI.

## Further Notes

- Glossary: `CONTEXT.md`. Visual lock: `docs/design-system.md`. Architecture Auth row now matches ADR-0035–0039; if a ticket fights those, change the lock first.
- Sentinel is Better Auth Infrastructure Pro (~$20/month). Starter cannot satisfy Auth security. Lane secrets are human (`/wizard` if the key is not in the Environment yet) — say so in Evidence; do not skip the Admin list.
- Existing JWT holders must sign in again at cutover. Say that on the ticket, do not write a JWT compatibility window.
- Next step: `/to-tickets` under milestone **Identity and Better Auth**. Do not file tickets from this skill.
