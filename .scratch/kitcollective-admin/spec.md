# KitCollective Admin

Feature spec for the KitCollective Linear project, milestone **KitCollective Admin**. Design lock: `docs/design-system.md` (Gap 2026-08-23, `admin` in scope). Domain nouns: `CONTEXT.md`. Architecture: `.scratch/Architecture/tech-stack.md` and `data-model.md`. Decisions: ADR-0016 (peek is not admin), ADR-0018 (Staff access is `User.role` on the same Identity), ADR-0019 (Admin SPA chrome is English).

## Problem Statement

Nicklas can seed Transfermarkt facts and Football Kit Archive kits into a lane, but the only human view is Catalog peek: unstyled Nest HTML, no photos, no collectors. Expo Save already creates UserJerseys. There is no Admin SPA to search and filter stamdata, see `KitPhoto` evidence, list collectors, or take down an uploaded jersey. Agents would invent a dashboard if this slice has no spec.

## Solution

Staff access (`User.role` `admin`) opens Admin SPA (`apps/admin`, Vite + React, English, light only). The operator signs in with the same Identity as Expo, scans stamdata and collectors in a Base dashboard (search, Filters, hairline Data table, 32px thumbs), drills a row, and can take down one UserJersey or promote/demote another User — never themselves, never the last admin. Seed remains the stamdata writer. Peek stays as seed-debug. KitPhoto never appears on Expo, Astro, or OG.

## User Stories

1. As Nicklas, I want to sign in to Admin SPA with the same email and password as Expo, so that Staff access is not a second login product.
2. As a collector with `role=user`, I want Admin SPA and `/v1/admin/*` to refuse me (403 with a session, 401 without), so that the operator surface is not a second Expo.
3. As Nicklas, I want register to keep creating `role=user`, so that Expo sign-up cannot self-grant Staff access.
4. As Nicklas, I want the first operator promoted out of band (`/wizard` or SQL on that User), so that the chicken-and-egg grant exists before anyone can promote in the SPA.
5. As an admin in Admin SPA, I want to set another User’s `role` to `admin`, so that Staff access is grantable from the collectors table.
6. As an admin, I want to set another User’s `role` back to `user`, so that a grant can be removed.
7. As an admin, I want demote of myself to fail, so that I cannot lock myself out in one click.
8. As an admin, I want demote of the last remaining admin to fail, so that the product cannot have zero Staff access.
9. As an admin who also collects, I want Expo Collection to keep working with my `admin` JWT, so that Staff access is not “cannot use the app”.
10. As Nicklas, I want Admin SPA chrome in English, so that the operator surface matches the Base dashboard lock (ADR-0019).
11. As Nicklas, I want CatalogLabel on this surface requested as `en` (fallback `mul` → `en`), so that English seed names are the admin display names.
12. As Nicklas, I want typed search to match CatalogLabel labels and aliases in every locale, so that “FCK” and “København” still hit the same Club.
13. As Nicklas, I want two underline tabs Stamdata and Collectors, so that catalog truth and copies are not one spreadsheet.
14. As Nicklas, I want a Search field and a Filters control on Stamdata, so that I do not scroll the whole catalog.
15. As Nicklas, I want Filters for country, league, season, kit type, and has-photo, so that Transfermarkt geography and FK kit identity are first-class facets.
16. As Nicklas, I want Stamdata as a hairline Data table (not a 4:5 grid), so that Rows first holds.
17. As Nicklas, I want Kit rows to show a 32px square `KitPhoto` thumb, so that archive bytes are evidence in the table.
18. As Nicklas, I want a missing KitPhoto to be an empty 32px slot, so that agents do not invent a crest or stretch an archive JPEG as a club mark.
19. As Nicklas, I want club, season, and user identity rows to use Mark/monogram, not a KitPhoto thumb, so that Marks from data still holds.
20. As Nicklas, I want click on a Stamdata row to open a full-page drill with back, so that evidence is not a split pane we did not lock.
21. As Nicklas, I want the kit drill to show KitPhoto bytes (auth’d Nest fetch), so that peek’s “no JPEG” rule does not apply here.
22. As Nicklas, I want club–season drill to show squad as a count plus expand, so that Transfermarkt landing is visible without a Players table.
23. As Nicklas, I do not want “+ New” or any Kit/CatalogLabel write in this increment, so that Seed stays the stamdata writer.
24. As Nicklas, I want Collectors as a Data table of Users (email, role, jersey count, createdAt), so that I can find who uploaded.
25. As Nicklas, I want click on a User to list their UserJerseys with 32px thumbs of *their* photos, so that I moderate copies, not archive kits.
26. As Nicklas, I want a UserJersey drill with those photos, so that take-down is an informed action.
27. As Nicklas, I want Take-down to delete that UserJersey and its UserJerseyPhoto bytes in R2, so that the copy is gone from the product.
28. As Nicklas, I want Take-down to confirm in a Sheet before it runs, so that a misclick is not data loss.
29. As Nicklas, I want the User to remain after Take-down, so that we do not delete collectors by default.
30. As Nicklas, I do not want bulk checkboxes or mass-delete, so that this increment stays one row at a time.
31. As Nicklas, I want Take-down not to delete Kit or KitPhoto rows, so that stamdata is not collateral.
32. As a collector, I want never to receive KitPhoto on Expo, Astro, or OG, so that `admin_only` / `rights: unresolved` still holds.
33. As Nicklas, I want Catalog peek to keep working as unstyled HTML without photos, so that seed agents still have a no-design evidence page (ADR-0016).
34. As Nicklas, I want Admin SPA light-only, so that agents do not invent a dark admin canvas.
35. As Nicklas, I want `prefers-reduced-motion` to skip underline travel and sheet transform, so that the motion floor matches the lock.
36. As Nicklas, I want keyboard access to Top tabs and table rows (arrows + Enter to drill), so that the dashboard is not pointer-only.
37. As Nicklas, I want the SPA never indexed (`noindex`, not a public catalog), so that `admin.kitcollective.app` is not a search result.
38. As Nicklas, I want CORS to allow the Admin SPA origin (local Vite in development; the lane admin host in staging/production), so that the browser can call `/v1`.
39. As Nest, I want `/v1/admin/*` to require JWT and `role=admin`, so that collector tokens cannot list all users or fetch KitPhoto.
40. As Nest, I want existing `/v1/collection/*` to keep listing only the caller’s jerseys, so that Staff access is not a silent widening of the collector contract.
41. As Nest, I want Collection to remain the only module that writes or deletes UserJersey rows, so that Catalog never owns copies.
42. As Nest, I want Catalog to remain the only module that reads stamdata for admin list/drill/KitPhoto, so that Collection never owns Kit.
43. As Identity, I want Staff access stored only as `User.role` `admin`, so that we do not add a parallel grant column (ADR-0018).
44. As Identity, I want promote/demote to refuse self-demote and last-admin demote with a 4xx, so that the guards are in the contract, not only in the UI.
45. As the Admin SPA, I want to import only `packages/api-contract` and `packages/domain`, so that Vite never imports `packages/db` or `apps/api`.
46. As an implementing agent, I want to follow `docs/design-system.md` Admin shell and Admin drill, so that I do not invent zebra, pills, a FAB, Base Web, or a 4:5 admin home.
47. As an implementing agent, I want to flag a missing token or primitive rather than invent one, so that Gap coverage stays the lock.
48. As Nicklas, I want a record count in the toolbar (`caption`), so that I know whether Filters hid everything.
49. As Nicklas, I want Empty state `table` with optional “Clear filters”, not a primary Add, so that an empty result is not a create affordance.
50. As Nicklas, I want table horizontal scroll below 1024px rather than a phone admin layout, so that we do not invent a third density.
51. As Nicklas, I want login as a centered 400px card (email, password, Sign in), so that unauthenticated chrome is not the dashboard shell.
52. As Nicklas, I want failed login to show a Banner or field error, not a stack of toasts, so that feedback matches the lock.
53. As Nicklas, I want Take-down failure to keep the jersey and show a Banner, so that a 5xx is not a silent miss.
54. As the ObjectStore adapter, I want Take-down to delete `user/{userId}/{jerseyId}/…` keys, so that bytes do not linger after the row is gone.
55. As KitPhoto serving, I want bytes only on admin photo routes with Staff access, so that a guessed object key is not a public JPEG.
56. As Nicklas, I want this milestone demoable against the development (then staging) catalog after promote, so that a seeded Superliga season is visible with thumbs in Admin SPA.

## Implementation Decisions

- **Linear:** Feature on existing project **KitCollective**. Spec title and new milestone: **KitCollective Admin**. Not a third Linear project (ADR-0004). Not on KitCollective Seed. Ships after Collector registration, before Public collection web.
- **Visual lock:** `docs/design-system.md` is authoritative (admin Gap). Root `DESIGN.md` is the token snapshot; the design-system file wins on conflict. Compose Admin shell and Admin drill. Flag gaps; do not invent tokens, variants, or primitives.
- **Modules:** Identity (session + Staff access guards + promote/demote), Catalog (admin stamdata list/search/filter + KitPhoto bytes), Collection (admin user/jersey list + Take-down). No Admin domain module that owns Kit or UserJersey rows. Vite Admin SPA is a client.
- **Seam:** The public interface is `packages/api-contract` for `/v1`, implemented by Nest (Fastify). Admin SPA talks only to that contract. Object storage is an adapter behind Catalog/Collection, not a new public interface. Prefer `/v1/admin/…` resources so collector routes do not widen.
- **Identity:** Reuse `POST /v1/identity/login` and `GET /v1/identity/me`. Register stays `role=user`. Admin HTTP uses JWT + `role=admin` (401 missing/invalid token, 403 session with `user`). Promote/demote is an admin mutation on another User’s `role`. Self-demote and last-admin demote are 4xx with a stable contract error. First operator: human `/wizard` or SQL — not a Nest “bootstrap admin” endpoint that anyone can hit.
- **Catalog admin reads:** Authenticated admin list/search of clubs/seasons/kits with resolved `en` labels, filter query params (country, league, season, kit type, has photo). Search matches aliases in all locales. Response includes ids, labels, counts, and auth’d photo URLs for Kit thumbs — never public R2 URLs, never Expo picker payloads. Squad: count on club–season; expand payload or nested list, not a Players primary resource.
- **KitPhoto:** Nest GET under `/v1/admin/` that streams bytes (same idea as collector photo GET). `visibility` stays `admin_only`. Do not flip `rights` to public. Do not put `kit/` on a CDN.
- **Collection admin:** List Users (id, email, role, createdAt, jersey count — never `passwordHash`). List a user’s UserJerseys with user photo thumbs. Take-down: delete UserJersey + UserJerseyPhoto rows and object-store keys. 404 if missing. Collector `GET /v1/collection/jerseys` remains owner-scoped.
- **Schema:** No new Staff access column. No hide flag. No bulk table. Existing `user.role`, KitPhoto, UserJersey are enough.
- **Admin SPA:** Scaffold `apps/admin` (Vite + React) in the pnpm workspace. Patterns: login card, Admin shell, Data table, Top tabs, Filters Sheet, Admin drill. English copy. Light tokens only. `noindex`. Local Vite origin allowed in non-production CORS defaults alongside Expo localhost origins; lane admin hosts via `CORS_ALLOWED_ORIGINS`. Host lock remains `admin.kitcollective.app` (Pages/Workers), never indexed.
- **Clients:** `apps/admin` must not import `apps/api` or `packages/db`. Import-boundary tests already name `apps/admin`.
- **Peek:** `GET /v1/catalog/peek` unchanged. Not wired into the SPA.
- **Lanes:** Demo against development API + seeded catalog first; milestone promote when the same SPA talks to staging.

## Testing Decisions

Tests cover external behaviour at the highest public interface. They do not assert Drizzle column names, R2 SDK calls, Vite component trees, or CSS class names.

**Good test:** HTTP with a User `role=admin` and a User `role=user`, known stamdata (Club/Season/Kit/KitPhoto in the test store) and a UserJersey with photos. Assert 401/403, JSON shape, `en` labels on admin list, KitPhoto bytes on admin photo GET, 403 on that GET with a collector token, Take-down removes the jersey for that user and does not remove Kit, promote/demote guards, collector collection list still owner-scoped.

**Seam (one):** `packages/api-contract` `/v1` as implemented by Nest (Fastify). Callers and tests cross this interface. Identity Staff access, Catalog admin reads, and Collection Take-down are resources on this seam, not three competing seams. Admin SPA is not a second test seam.

**Adapters behind the seam (not the test surface):** Postgres via `packages/db`; object store (memory fake vs R2). Two adapters make the store seam real; tests still enter through HTTP.

**Do not add a seam** for Vite UI. Design lock + import-boundary tests are enough. Pixel tests are out.

**Modules tested:** Identity (guard + promote/demote), Catalog (admin list/filter + KitPhoto GET), Collection (admin list + Take-down). CORS allows an admin origin. Import boundary includes `apps/admin`.

**Prior art:** `apps/api/tests/identity.test.ts`, `collection.test.ts`, `catalog-peek.test.ts`, `catalog-picker.test.ts`, `cors-origins.test.ts`, `import-boundary.test.ts`. Insert stamdata the same way picker/collection tests do; put KitPhoto bytes in the memory object store.

`/tdd` will not re-quiz this seam.

## Out of Scope

- A third Linear project; Seed-project tickets; retiring Catalog peek.
- Catalog writes (Kit create/edit, CatalogLabel, `rights: public`, Patch confirmation).
- “+ New”, bulk actions, zebra tables, Base Web as a dependency, Danish admin chrome.
- Admin dark mode; scoped staff roles (moderator who cannot see everything).
- Players as a primary table; phone-first admin layout.
- Public Astro collection / OG (Public collection web).
- Wishlist, IAP, Apple/Google login, disable/ban User field.
- Serving KitPhoto to Expo, Astro, or OG.
- Nest fetching Transfermarkt or FK; fused seed MCP tools.
- Logo, wash variants 2–3, licensed crest files (monogram/Mark still apply).

## Linear

- **Project:** KitCollective
- **Mode:** feature
- **Lead:** Nicklas
- **Priority:** None (not named)
- **Milestones** (each is one staging increment — a handful of issues, not the whole product):
  1. KitCollective Admin — Admin SPA with Staff access: stamdata table (search, filters, KitPhoto thumbs) and collector Take-down. Demoable: Nicklas signs in, finds a seeded kit with a thumb, take-down one UserJersey. Ready to promote when that works against staging API + staging catalog.

## Further Notes

- Glossary: `CONTEXT.md`. Visual: `docs/design-system.md`. Tokens snapshot: `DESIGN.md`.
- Collector registration spec remains `.scratch/collector-registration/spec.md`. This document does not replace it.
- Seed catalogs must exist in the target lane for thumbs to be interesting; seed work stays on the KitCollective Seed project.
- First operator grant is human (`/wizard` or SQL). `/to-tickets` may mark that slice `ready-for-human`.
- Next slash: `/to-tickets` for vertical slices under KitCollective Admin. Do not invent issues from this skill.
