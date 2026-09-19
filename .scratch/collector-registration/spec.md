# Collector registration — Expo Save

Feature spec for the KitCollective Linear project, milestone **Collector registration**. Design lock: `docs/design-system.md` and root `DESIGN.md`. Domain nouns: `CONTEXT.md`. Architecture: `.scratch/Architecture/tech-stack.md` and `data-model.md`.

## Problem Statement

A Nordic collector cannot register an owned shirt in KitCollective. Stamdata and a User row exist, but there is no sign-in, no UserJersey, and no Expo app. The collector is still stuck in Facebook groups and spreadsheets. Agents must not invent taste: the visual lock exists; this spec is the vertical slice that uses it.

## Solution

The collector creates an account with email and password in Expo, adds jersey photos (gallery-first on the first session, in-app camera on repeat), confirms club + season + chips on one screen, and Save succeeds without waiting on Vision, kit completeness, or manufacturer. The collection is a 4:5 photo grid. Jersey #2 is possible in under 45 seconds on a device build against a seeded staging catalog.

## User Stories

1. As a collector, I want to create an account with email and password, so that my UserJerseys have an owner before any social login exists.
2. As a collector, I want to sign in with that email and password, so that I can continue on a second device or after reinstall.
3. As a collector, I want a JWT (or equivalent session) on every Collection and Catalog picker call, so that another person’s jerseys are never listed as mine.
4. As a collector, I want unauthenticated Save to fail, so that anonymous writes cannot pollute the catalog of copies.
5. As a collector opening the app for the first time after sign-in, I want an empty collection state with one primary action to add a jersey, so that I am not looking at a blank marketplace.
6. As a collector on my first add in a session, I want the system photo picker (multi-select) as the primary path, so that shirts already in my camera roll become UserJerseyPhotos without a camera permission at launch.
7. As a collector adding another jersey in the same session with the shirt in hand, I want an in-app CameraView with three Photo slots (front, back, label), so that I am not bounced through the system camera one shot at a time.
8. As a collector, I want a tertiary gallery escape on the camera session, so that a mixed roll-and-hand session still works.
9. As a collector, I want each photo stored with a role (`front` | `back` | `label`) and a source (`gallery` | `camera`), so that later OCR can attach to the label shot without a migration.
10. As a collector, I want a local draft persisted after every pick or shot, so that killing the app does not lose the 45-second session.
11. As a collector, I want Save to succeed with only one photo, so that two empty slots never block jersey #2.
12. As a collector, I want all three slots recommended but not required, so that a cellar session can still be complete when I have front, back, and label.
13. As a collector, I want Vision to start from the first photo without blocking the confirm screen, so that inference is a shortcut, not a gate.
14. As a collector, I want Save to return even if Vision is slow or down, so that a model outage does not recreate the spreadsheet.
15. As a collector, I want a single confirm screen after photos, so that I am not in a Shirt Squad-style wizard.
16. As a collector, I want to search clubs by typed query against CatalogLabel labels and aliases, so that I do not walk land → league → club.
17. As a collector requesting Danish UI, I want club names resolved request locale → `mul` → `en`, so that the English seed string is not shown as the Danish name when a `da` label exists.
18. As a collector, I want seasons scoped to the selected club (TeamSeason), so that I do not pick a Superliga year for a club that was not in that season.
19. As a collector, I want chips for kit type, size, and condition, so that those fields are thumb-reachable and not free text.
20. As a collector, I want Save to require club, season, type, size, condition, and at least one photo, so that a UserJersey always points at catalog identity for the copy.
21. As a collector, I want `catalogKitId` to be optional on Save, so that a missing Kit row does not fail the 45-second path.
22. As a collector, I want manufacturer, nameset, patches, purchase, and authenticity behind “More details”, so that optional fields stay off the 45-second clock.
23. As a collector, I want authenticity to default to unknown, so that I am not forced to claim a shirt is genuine.
24. As a collector, I want “Ny trøje” to start with empty club identity, so that Inter 23/24 does not become Barça 25/26.
25. As a collector, I want “Samme klub” to prefill club only, so that a cellar session of one club is fast without sticky season/type/condition.
26. As a collector, I want a catalog miss on club or season to keep the draft and show a Banner plus upgrade CTA, so that a thin catalog does not delete my photos.
27. As a collector, I want never to type a free-text club as catalog truth, so that Save cannot create a shadow Club.
28. As a collector, I want my collection as a two-column 4:5 Jersey tile grid with club + season captions, so that I can scan what I own.
29. As a collector, I want to search and chip-filter that grid, so that a large collection is still findable.
30. As a collector, I want tapping a tile to open my UserJersey detail (my photos, not archive KitPhoto), so that the product image is mine.
31. As a collector, I want a tab bar with Collection and Add of equal weight, so that Add is capture, not a Vinted sell compose.
32. As a collector, I do not want a Wishlist tab in this increment, so that agents do not invent premium chrome.
33. As a collector, I want camera permission only when I intend to shoot, so that first launch is not a permission wall.
34. As a collector, I want photo-library permission only when I tap gallery, so that camera-only repeat sessions stay narrow.
35. As a collector, I want no push prompt in this increment, so that we do not burn the wishlist retention ask.
36. As a collector, I want UI copy in Danish, so that the first market can use the app.
37. As a collector, I want Marks (crest/flag) only when a licensed asset exists, otherwise a monogram from CatalogLabel, so that emoji and invented shields never appear.
38. As a collector, I want never to see archive KitPhoto bytes, so that unresolved rights do not leak into Expo.
39. As a collector, I want Dynamic Type and 44×44 targets on primary controls, so that the accessibility floor in the design lock holds.
40. As a collector with reduced motion, I want sheets and fades to have a still equivalent, so that motion is not required to Save.
41. As a collector on a dark system appearance, I want the dark token mode, so that light is default but not the only canvas.
42. As a collector on Expo Web, I want gallery-first add and no 45-second camera promise, so that a degraded web target does not fake CameraView.
43. As Nicklas, I want Save on a device build against the staging catalog after promote, so that jersey #2 is demoable on the milestone’s staging increment.
44. As the Collection module, I want UserJerseyPhoto object keys in R2 under `user/{userId}/{jerseyId}/…`, so that user JPEGs never land as Postgres bytea or as `kit/` archive keys.
45. As the Collection module, I want a server-side draft id that can round-trip the local sqlite draft, so that upload can finish after Save’s local-complete response.
46. As the Vision module, I want suggestions to be catalog UUIDs (club, season, optional kit) logged with accept/edit/ignore, so that raw model names are never foreign keys.
47. As the Catalog module, I want club search to match labels and aliases in all locales, so that “FCK” and “København” hit the same Club.
48. As an implementing agent, I want to follow `docs/design-system.md` and flag gaps, so that I do not invent a teal CTA, a FAB, or a wash behind the jersey photo.
49. As Nest, I want Collection to be the only module that writes UserJersey rows, so that Catalog never owns copies.
50. As a client app, I want to import only `packages/api-contract` and `packages/domain`, so that Expo never imports `packages/db` or `apps/api`.

## Implementation Decisions

- **Linear:** Feature on existing project KitCollective. Attaches to existing milestone Collector registration. No second project. No new milestone.
- **Visual lock:** `docs/design-system.md` is authoritative for UI. Root `DESIGN.md` is the Google Labs token snapshot; the design-system file wins on conflict. Agents flag missing tokens/components; they do not invent them.
- **Modules:** Identity (email + password session), Catalog (picker: club search + club-scoped seasons; existing stats stay), Collection (UserJersey, UserJerseyPhoto, draft sync, list), Vision (optional worker; Save must not await).
- **Seam:** The public interface is `packages/api-contract` for `/v1`, implemented by Nest. Expo talks only to that contract. Object storage and Vision are adapters behind Collection, not new public interfaces.
- **Identity:** Passport JWT on Nest. Email + password register and login. User table already exists. Apple/Google social is out of this spec (still required by tech-stack before store social; not required to demo jersey #2). Email verification may ship as send + confirm routes; Save in this increment may accept a session after register so the 45-second demo is not blocked on SES in development — if verify is gated, development must have a test-safe confirm path.
- **Collection Save contract:** Authenticated POST that accepts clubId, seasonId, type, size, condition, optional kitId, photo roles, and photo bytes or upload keys. Response is the UserJersey (ids + resolved labels + user photo URLs). Missing kitId is success. Missing clubId or seasonId is 4xx. Vision status is not a precondition.
- **Photos:** At least one. Roles `front` | `back` | `label`. Source `gallery` | `camera`. Bytes in R2 `user/{userId}/{jerseyId}/…`. Response photo URLs are user objects, never KitPhoto keys. Vacant OCR envelope (`ocrStatus: none`) on the photo row.
- **Catalog picker:** Authenticated GET search for clubs (and national teams if the picker includes them) returning `id` + resolved `label` for the request locale (fallback request → `mul` → `en`). GET seasons for a club via TeamSeason. Search matches labels and aliases across locales. No free-text Club insert.
- **Domain enums:** Add size and condition closed sets to `packages/domain` (not free text). Kit type reuses existing `KIT_TYPES`. Chip labels in the UI are Danish; stored values are the enum.
- **Schema:** Migrate UserJersey (userId, clubId, seasonId, optional kitId, type, size, condition, optional fields for more-details may be nullable), UserJerseyPhoto, JerseyDraft, VisionLog. No Patch / UserJerseyPatch / Entitlement / Wishlist in this spec. UserJersey does not copy CatalogLabel text.
- **Drafts:** Local expo-sqlite draft with stable id; Nest upserts JerseyDraft. Save can complete locally while photo PUT to R2 finishes; the contract must make retry idempotent on that draft id.
- **Vision:** BullMQ job in the same Nest process. Fired on first photo. Suggests catalog UUIDs only. Persist after user confirm or explicit accept — never raw model club names as FKs. A missing or slow worker does not fail Save. If Gemini secrets are absent in a lane, the adapter no-ops.
- **Expo:** Scaffold `apps/mobile` against the existing EAS project `ddddf92b-e7cd-4ec5-b07c-643106041550` (`eas init --id` that UUID; do not create a second Expo project). Gallery-first first session; `CameraView` + `takePictureAsync` on repeat; do not use `ImagePicker.launchCameraAsync` as the repeat primary path. System picker for gallery; no broad `READ_MEDIA_IMAGES`. Unmount CameraView on blur. Tab bar: Collection + Add only. Follow design-system patterns: Collection grid, Capture session, Confirm and Save. Expo dashboard “build --profile production” is onboarding copy — first device demo uses the `staging` (or `development`) EAS channel, not a store production binary.
- **“Ny trøje” / “Samme klub”:** After successful Save, two actions. New clears club identity. Same club prefills clubId only.
- **Catalog miss:** Do not insert a Club. Keep draft. Banner + upgrade CTA (copy may be a placeholder pointing at premium; do not build IAP).
- **Locales:** Expo default request locale `da`. Catalog resolve request → `mul` → `en`.
- **Clients:** `apps/mobile` must not import `apps/api` or `packages/db`.
- **Lanes:** Device demo against staging catalog after the milestone promotes. Development Nest remains in VMs; API base URL per EAS channel.

## Testing Decisions

Tests cover external behaviour at the highest public interface. They do not assert Drizzle column names, R2 SDK calls, Gemini payloads, or Expo component trees.

**Good test:** HTTP (or contract parse + Nest test) with known stamdata + a User, assert status codes, JSON shape, and invariants (kitId nullable; Save returns while Vision adapter is delayed; photos are user keys; 401 without session; club search does not return archive image URLs).

**Seam (one):** `packages/api-contract` `/v1` as implemented by Nest (Fastify). Callers and tests cross this interface. Identity, Catalog picker, and Collection Save are resources on this seam, not three competing seams.

**Adapters behind the seam (not the test surface):** Postgres via `packages/db`; R2 (fake in tests); Vision worker (fake that sleeps or fails). Two adapters (real vs fake) make those internal seams real; tests still enter through HTTP.

**Do not add a seam** for Expo UI. Design lock + import-boundary tests are enough. Pixel tests are out.

**Modules tested:** Identity, Catalog (picker), Collection. Vision only insofar as Collection Save does not wait.

**Prior art:** `GET /v1/catalog/stats` contract tests; schema migrate tests on ephemeral Postgres; `apps/api` import-boundary tests. Collection tests should insert Club/Season/CatalogLabel via the schema (or the same helper stats tests use), then call the new contract.

`/tdd` will not re-quiz this seam.

## Out of Scope

- Public Astro collection / OG (milestone Public collection web).
- Wishlist tab, IAP, premium entitlement, match push.
- Apple / Google / Facebook login.
- Admin catalog browser; catalog peek remains Nest HTML.
- Serving KitPhoto to Expo or OG.
- UserJerseyPatch, Patch as truth, manufacturer required on Save.
- Price, buy, boost, marketplace listing UI.
- Logo, wash variants 2–3, licensed crest asset pipeline (monogram fallback ships).
- Machine-translating CatalogLabel into `da` / `sv` / `no`.
- Production seed from chat; Nest fetching Transfermarkt.
- Expo Web as a first-class 45-second camera product (gallery-only degraded target is enough if it ships).

## Linear

- **Project:** KitCollective
- **Mode:** feature
- **Lead:** Nicklas
- **Priority:** None (not named)
- **Milestones** (each is one staging increment — a handful of issues, not the whole product):
  1. Collector registration — Expo Save of a UserJersey (club + season + photo) against the visual lock. Demoable: jersey #2 in 45s on a device build. Ready to promote when Save works against staging catalog.

## Further Notes

- Glossary: `CONTEXT.md`. Visual: `docs/design-system.md`. Tokens snapshot: `DESIGN.md`.
- Foundation spec remains `.scratch/product-foundation/spec.md`. This document does not replace it.
- Seed catalogs must exist in the target lane for the 45-second demo; seed work stays on the KitCollective Seed project.
- Next slash: `/to-tickets` for vertical slices under Collector registration. Do not invent issues from this skill.
