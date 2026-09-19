# Foto-derivater, Vision grouping og identitet

Feature spec on the **KitCollective v1** Linear project. Design lock: `docs/design-system.md` (Confirm and Save, Capture session, Jersey tile, Photo lightbox). Domain nouns: `CONTEXT.md`. Architecture: `.scratch/Architecture/tech-stack.md` §6 Vision and §9 Files; `data-model.md`. Research: `.scratch/Research/jersey-bulk-grouping.md`, `jersey-vision-providers.md`, `jersey-registration-speed.md`.

This spec **supersedes** Tilføj trøje stories that keep Vision as a one-photo stamdata job that must not group photos, and the tech-stack Files line that stores a single `user/{userId}/{jerseyId}/{photoId}.jpg` (~1600 / ~2400). Capture spine (chooser, OS picker, human bind, Confirm hub, Save-never-waits) stays. OpenRouter stays forbidden for collector photos (ADR-0021).

**Build order inside this document:** named photo files first (milestone **Foto-derivater**), then Vision **grouping**, then Vision **identity**. Grouping is the bulk shortcut; identity is the Data-fill shortcut. Both write into the existing capture session so Confirm chrome (donuts, kapsler, faner, sandbox, Gem) stays derived from draft fields.

## Problem Statement

A collector who dumps a camera-roll of shirts still binds every photo by hand and types club, season, and player even when the pictures already show them. Confirm and Samling also load the same mid-size JPEG for a 4:5 tile and for zoom, while the iPhone original is thrown away — so the grid is heavier than it needs to be, the lightbox cannot show more detail than the tile, and Vision cannot be given a cheap 384 px grouping thumb or a ~1500 px identity crop without re-uploading. Jersey #2 stays slow for the wrong reasons: bytes and bind, not Save rules.

## Solution

Keep one R2 **bucket per lane**. Under each UserJerseyPhoto, store a GPS-stripped **original** plus named JPEG **variants** (`grid` 4:5 for Samling, `strip` for Confirm, `lightbox` uncropped for zoom). The collector never sees the original; Gem does not wait for every file. On device, prepare those sizes before any Vision payload leaves the phone.

Vision then has two jobs, both suggestions, both catalog-UUID outputs, both fail-open:

1. **Grouping** (bulk first): thumbs of the whole dump → proposed UserJersey drafts (photoIds together). Confirm stays full control — accept, edit, or ignore; human bind remains.
2. **Identity** (per bound jersey): ~1500 px photos on that copy → club, season, kit type, player, and sleeve patch mapped to existing stamdata. High confidence pre-fills the field; low confidence is Brug / Luk; the collector can always type.

Save still does not wait. Raw model names are never foreign keys.

## User Stories

1. As a collector, I want my iPhone original stored after Save, so that KitCollective can rebuild sizes later without asking me to re-upload.
2. As a collector, I want that original never shown as a Samling tile, so that a 12 MP file does not make the grid slow.
3. As a collector, I want GPS / location EXIF stripped from the original in object storage, so that a cellar dump does not leak where I photographed the shirt.
4. As a collector, I want Samling tiles to load a small 4:5 **grid** JPEG, so that two-column scroll stays fast.
5. As a collector on Favoritter, I want the same grid variant as Samling, so that those tiles are not a second full-size fetch.
6. As a collector on public Astro collection, I want grid (or an OG letterbox derived from it), never archive KitPhoto, so that share cards stay user photos.
7. As a collector on Confirm, I want the hub photo strip to load a **strip** variant, so that the session is not pulling lightbox bytes.
8. As a collector, I want tapping a filled photo to open the Photo lightbox on a large **uncropped** variant, so that pinch-zoom shows nameset, badge, and stitching.
9. As a collector, I want lightbox zoom to show more detail than the Samling tile, so that grid compression is not the only file I have.
10. As an admin operator, I want UserJersey table thumbs to use a tiny derivative (grid or smaller), so that a 32×32 cell does not download lightbox.
11. As a collector, I want Gem to succeed when at least a display variant exists, so that a slow original PUT does not recreate the spreadsheet.
12. As a collector, I want leftover variants to finish in the background after Gem, so that lightbox can catch up without blocking jersey #2.
13. As a collector, I want deleting a UserJersey to delete the whole photo prefix, so that originals and variants do not orphan in R2.
14. As a collector, I want one UserJerseyPhoto row per shot, so that variants are files under one photo id, not extra catalog rows.
15. As a collector, I want Expo to request `variant=grid|strip|lightbox` on the existing photo URL, so that the client never guesses R2 keys.
16. As a collector picking from Photos, I want max-edge resize and JPEG compress on device before upload, so that Save JSON is not a 12 MP base64 blob.
17. As a collector shooting CameraView, I want the same prepare step after shutter without blocking the next shot, so that the 45-second path stays shutter-first.
18. As a collector using Files, I want Nest to clamp oversized bytes as a guard, so that a skipped client prepare cannot explode Vision or R2.
19. As a collector, I want HEIC converted to JPEG for variants and Vision, so that Gemini and browsers see a format they accept.
20. As a collector, I want universal-role display around 1600 px and Andet around 2400 px for lightbox/source quality, so that a vaskemærke stays readable.
21. As a collector, I want Vision identity bytes capped at ~1500 / 1536 px on the long edge, so that Gemini stays in the 2×768 tile bucket instead of 1600’s 3×3.
22. As a collector in bulk, I want grouping thumbs at ≤384 px, so that a 17-photo dump fits the 8–12 s fail-open.
23. As a collector, I do not want PNG “for quality” on this path, so that tokens and RTT stay JPEG-cheap.
24. As a collector, I want Confirm to show local URIs immediately, so that prepare and Vision never blank the hub.
25. As a collector who picked 17 photos of three shirts, I want Vision grouping to propose three UserJersey drafts, so that I am not binding every thumb by hand.
26. As a collector, I want grouping to use stable photoIds, so that a sandbox delete does not scramble index-based groups.
27. As a collector, I want pick order to remain the prior, so that sequential front/back of one shirt still groups when the model is unsure.
28. As a collector, I do not want every ten (or every three) photos auto-chunked into a jersey, so that a shirt with only a front is not merged with the next shirt.
29. As a collector, I want unbound photos to stay unbound if grouping fails or times out, so that human bind is the fail-open.
30. As a collector, I want high-confidence grouping (≥70%) to pre-bind via the same bind reducers as a tap, so that Confirm faner and counts update without a special Vision tree.
31. As a collector, I want 50–69% grouping to wait for an explicit accept, so that two white home shirts are not silently merged.
32. As a collector, I want to unbind or re-bind after a grouping suggestion, so that Confirm stays full control.
33. As a collector on a single dump (one shirt’s shots already bound), I want grouping skipped, so that I do not wait on a useless session job.
34. As a collector, I want Vision never to treat a role guess as truth until preselect or Brug, so that Forside/Bagside/Venstre/Højre/Andet stay collector-owned (`CONTEXT.md` Avoid: Vision assigning roles).
35. As a collector, I want an Andet guess such as ærmebadge to fill Beskrivelse only after accept, so that a closed enum does not return.
36. As a collector, once a draft has at least one photo, I want identity Vision on **all** photos of that copy, so that bagside nameset and ærme badge are in the same suggestion.
37. As a collector, I want identity to suggest club, season, and kit type as catalog UUIDs, so that Confirm Data donut `n/3` fills without typing.
38. As a collector, I want identity to suggest a Player UUID (and number when known) scoped to that club season, so that the Spiller capsule can fill without blocking Gem.
39. As a collector, I want identity to suggest a sleeve patch UUID as UserJerseyPatch after I accept, so that a badge photo is not only an Andet thumb.
40. As a collector, I want per-field confidence, so that a sure club can preselect while a weak player stays Brug / Luk.
41. As a collector, I want ≥70% **and** a catalog hit to pre-fill that field, so that jersey #2 stays under 45 seconds.
42. As a collector, I want 50–69% to show the existing quiet strip with Brug + Luk, so that a weak guess is not silent.
43. As a collector, I want below-threshold or catalog miss to leave the field empty (and catalogMiss banner when club misses), so that I search myself.
44. As a collector, I want typing a field to win over a late Vision apply, so that a skeleton never overwrites my club.
45. As a collector, I want Save to succeed if Vision is pending, noop, or failed, so that Gemini unset does not block the dump.
46. As a collector, I want identity to run again (debounced) when I bind another photo onto that jersey, so that a late bagside can still find the player.
47. As a collector, I want grouping not to re-run on every bind, so that the hub does not thrash.
48. As a collector, I want Gem enablement unchanged (photo + club + season + type + size + condition), so that Vision never gates the dock.
49. As a collector, I want size and condition to stay my chips, so that Vision does not invent stand or XS–XXL.
50. As a collector, I want player and patch to persist on Save, so that a filled Spiller capsule is not theatre when I open the UserJersey later.
51. As a collector, I want Vision never to create Club, Season, Player, Kit, or Patch rows, so that stamdata stays seed + admin.
52. As a collector, I want first-session **Læser trøjen** to consume the same identity job document as Confirm, so that unsigned and signed paths are not two contracts.
53. As a collector, I want unsigned Vision to keep the existing IP cap, so that first-session cannot burn Gemini unbounded.
54. As a collector, I want analyzer chrome (inactive / analyzing / success) derived from the job view, so that Confirm does not invent Gemini flags beside the draft.
55. As a collector, I want the Brug strip and the status banner never to stack, so that one banner at a time still holds.
56. As a collector with reduced motion, I want Vision fades and variant swaps to have a still equivalent, so that motion is not required to Save.
57. As Nicklas, I want `GEMINI_API_KEY` on the lane for live inference, so that noop is an unset secret, not a product off-switch in code.
58. As Nicklas, I do not want collector photos sent through OpenRouter, so that an extra subprocessor never sees the cellar dump.
59. As the Collection module, I want one Save still one UserJersey, so that bulk remains a client session of N Saves.
60. As a client app, I want to import only `packages/api-contract` and `packages/domain`, so that Expo never imports `packages/db` or `apps/api`.
61. As an implementing agent, I want `docs/design-system.md` updated so Vision **may suggest** groups and roles but must not auto-commit them, so that the old “Vision does not group” line is not a checker fail.
62. As an implementing agent, I want grouping-accept chrome flagged to `/to-design` if Brug/Luk-on-one-jersey is not enough for “3 trøjer foreslået”, so that Confirm does not invent a third banner.
63. As a collector, I want VisionLog to record accepted / edited / ignored for grouping and per identity field, so that we can learn without storing raw names as FKs.

## Implementation Decisions

- **Linear:** Feature on existing project **KitCollective v1**. Two new milestones (each one staging increment). No second project. Grouping before identity inside the Vision milestone.
- **Lock edits (this feature, not silent):** `docs/design-system.md` Confirm Vision slot — grouping suggestion allowed; roles still not silently assigned. `CONTEXT.md` Vision suggestion — UUID groups + identity; Avoid stays “Vision assigning roles” as truth. Tech-stack Files — original + named variants; Vision identity max-edge ~1536; grouping thumbs ≤384. Paid Gemini 2.5 Flash-Lite; OpenAI nano still the locked fallback (not required to ship in the first Vision slice if Gemini is the adapter); **OpenRouter remains forbidden** for photos.
- **Storage model A (chosen):** one R2 bucket per lane. Key prefix:

```text
user/{userId}/{jerseyId}/{photoId}/original
user/{userId}/{jerseyId}/{photoId}/grid.jpg
user/{userId}/{jerseyId}/{photoId}/strip.jpg
user/{userId}/{jerseyId}/{photoId}/lightbox.jpg
```

  Rejected: Cloudflare Image Resizing on-the-fly from original only; one `{photoId}.jpg` for all surfaces; a bucket per jersey (Supabase-style).

- **Photo HTTP seam:** extend Collection photo GET with `variant=grid|strip|lightbox` (default `grid` for list surfaces). Do not expose `original` on collector clients. Admin may use grid. Visibility checks unchanged (owner / showcase / private).
- **Save / upload:** do not put the iPhone original in Save `contentBase64`. Display/grid JPEG may still ride Save; original uses a separate object PUT (presigned or equivalent Nest-owned upload) keyed by the same `photoId`. Save succeeds when a renderable variant exists; original/lightbox jobs fail-open in-process (BullMQ / `setImmediate` as today).
- **Postgres:** `user_jersey_photo` stays one row (`objectKey` may become a prefix or stay the original key with variants by convention). Do not store bytes. Add player + `UserJerseyPatch` persistence so identity fill survives Save (data-model already names the patch; the table is missing today). Dummy catalog ids must not be what Nest maps — identity UUIDs are Postgres stamdata.
- **Device prepare module (Expo):** given a local URI, produce display + vision-identity (max-edge 1536 JPEG) + vision-group thumb (max-edge 384). `expo-image-manipulator` is the adapter. Never block shutter or Confirm paint. Nest clamps as a guard.
- **Vision jobs (two kinds, one contract family):** `kind: grouping | identity`. Photos addressed by client `photoId` + bytes (or server-side GET of a stored variant — identity may read lightbox/original after Save; during Confirm, client sends prepared identity/group bytes). Grouping input = session thumbs; identity input = all photos on one draft. Timeouts 8–12 s, fail-open. Noop adapter when `GEMINI_API_KEY` is unset.
- **Catalog mapper (Nest, behind Vision):** model returns hints; mapper resolves club → season-scoped-to-club → kit type → player via `playerClubSeason` / number → patch candidates for that season. ILIKE-only club match is not the mapper. Miss omits the field.
- **Capture session:** add stable `photoId` on each session photo. New pure applies: `applyGroupingSuggestion`, `applyIdentitySuggestion` (per-field mask), optional role-guess apply. They call existing bind / add jersey / set club / season / type / player / badge reducers. Extend manual-edit guards to player, badge, and roles.
- **Confirm UI:** no Gemini shapes in screens. `useConfirmVision` (or successor) polls job documents and calls applies. Donuts, kapsler, faner, sandbox, `canSave` read the draft only. Analyzer banner reads the job view. Grouping-accept chrome: reuse Brug/Luk if one strip can list “n trøjer”; if not, flag design gap — do not invent a wizard.
- **First session:** same identity document; analysing chrome may stay “Læser trøjen” but must not be a second HTTP shape.
- **Clients:** `apps/mobile` (and later `apps/web`) import only `packages/api-contract` and `packages/domain`.
- **Ops (not a product ticket to invent):** lane `GEMINI_API_KEY` and `REDIS_URL` as already named in `.env.example`. Missing Gemini → noop jobs; UI fail-open.

## Testing Decisions

Tests cover external behaviour at the highest public interface. They do not assert R2 SDK calls, Gemini JSON payloads, sqlite column names, ImageManipulator internals, or Expo component trees.

**Good tests**

- Collection photo GET with `variant=grid` returns the small JPEG; `lightbox` is larger / uncropped relative to grid; collector clients cannot fetch `original`; delete jersey removes all keys under the photo prefix (memory object store).
- Save does not 4xx when original is still missing; Save still 4xx without club / season / type / size / condition / photo.
- Vision grouping job: given photoIds and a fake adapter returning groups, the job document lists those photoIds; timeout/noop leaves unbound; Save still 2xx.
- Vision identity job: fake adapter hints + catalog fixtures yield UUIDs; per-field `preselect`; club miss omits `clubId`; delayed adapter still yields 2xx Save.
- Capture-session: `applyGroupingSuggestion` in preselect mode binds via existing bind rules and does not exceed 10 photos per draft; pending mode does not move unbound; `applyIdentitySuggestion` skips a field the collector already edited; `canSave` ignores Vision job status.

**Seams `/tdd` will use (three, all at the highest existing points):**

1. **`packages/api-contract` `/v1` Collection** as implemented by Nest — Save, photo GET variants, delete. Adapters: memory object store, test Postgres. Prior art: `apps/api/tests/collection.test.ts`, showcase photo URLs.
2. **`packages/api-contract` `/v1` Vision** as implemented by Nest — grouping and identity job documents, unsigned cap unchanged, log actions. Adapters: fake Vision inference, test catalog rows for the mapper. Prior art: `packages/api-contract/tests/vision.test.ts`, `apps/api/tests/vision-unsigned.test.ts`, `vision-save-action.test.ts`.
3. **Expo capture-session module** — `photoId`, apply grouping/identity, `canSave` unchanged. Tests import the module; they do not render Confirm. Prior art: `apps/mobile/tests/capture-session.test.ts`.

Do not add a seam that requires Expo to import `apps/api` or `packages/db`. Do not test Gemini live in CI. Do not treat Cloudflare Image Resizing as a seam.

`/tdd` will not re-quiz these seams.

## Out of Scope

- Cloudflare on-the-fly image resizing (model B).
- OpenRouter (or any router) for collector photos.
- On-device Feature Print / ML Kit as grouping or club ID.
- Vision creating stamdata rows.
- Size / condition from Vision (label OCR stays the vacant `ocrStatus: none` envelope).
- Freemium Vision quota / Entitlement wiring (analyzer `outOfQuota` may stay stubbed until Billing owns it).
- Auto-chunk every n photos.
- Blocking analysing screen on repeat Confirm (first-session door-over-analysing chrome may remain).
- Public CDN on `user/` prefixes; serving `KitPhoto` to Expo.
- A Nest bulk-Save resource (still N Collection Saves).
- Changing chooser, Tab bar, or Gem enablement rules.
- Expo Web as a first-class camera/Vision product.

## Linear

- **Project:** KitCollective v1
- **Mode:** feature
- **Craft labels:** — (feature mode; not set on the project)
- **Lead:** Nicklas
- **Priority:** None (not named)
- **Milestones** (each is one staging increment — a handful of issues, not the whole product):
  1. Foto-derivater — Complete when Save stores a GPS-stripped original plus named JPEG variants (grid 4:5, strip, lightbox uncropped) under `user/{userId}/{jerseyId}/{photoId}/`; Samling and Favoritter fetch `variant=grid`; Photo lightbox fetches `variant=lightbox`; Gem does not wait on original or lightbox. Device prepare resizes before Vision bytes. Demoable on a device build against staging: a 12MP iPhone pick paints a fast 4:5 grid tile and a zoomable lightbox, while R2 still holds the original. Ready to promote integration → staging when that works. Cloudflare on-the-fly resize is not this milestone.
  2. Vision grouping og identitet — Complete when bulk dumps get a grouping suggestion (photoIds → UserJersey drafts) that the collector can accept or override on Confirm, then per-jersey identity maps club, season, kit type, player, and patch to catalog UUIDs (per-field preselect). Save never waits. OpenRouter is not used for photos. Grouping ships before identity fill. Demoable on a device build against staging: ~17 photos across three shirts group into three drafts with human bind as fail-open; Data fields fill from catalog. Ready to promote integration → staging when that works. One-photo Vision remains the fallback when Gemini is unset (noop).

## Further Notes

- Glossary: `CONTEXT.md`. Visual: `docs/design-system.md`. Tokens: `DESIGN.md`.
- Tilføj trøje remains `.scratch/tilfoej-troeje/spec.md` for chooser / bind / Confirm spine. Where Vision grouping or Files disagree, **this document wins** after the lock files are updated in the matching slice.
- Grouping-accept chrome is a design gap if one Brug strip cannot represent several proposed jerseys — `/to-design` before that ticket, not invented Confirm tabs.
- Player and patch must persist in the identity slice or the fill is Confirm-only; dummy catalog is not the mapper’s target.
- Lane secrets (`GEMINI_API_KEY`) are ops; the product fail-open is already specified.
- Next slash: `/to-tickets` for vertical slices under the two milestones. Do not invent issues from this skill.
