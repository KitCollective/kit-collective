# Tilføj trøje — capture, bind, Confirm

Feature spec for the KitCollective Linear project, milestone **Tilføj trøje**. Design lock: `docs/design-system.md` (Gap 2026-08-23 Tilføj trøje Confirm). Domain nouns: `CONTEXT.md`. Architecture: `.scratch/Architecture/tech-stack.md` and `data-model.md`. Visual evidence: `.scratch/jersey-upload/claude-design/` for capture spine (chooser, OS picker, bind, Gemt) only. Confirm body is the design lock, not Stamdata | Detaljer tabs in that artifact. Throwaway Expo prototype (`apps/mobile/src/prototype/upload/`, gate `EXPO_PUBLIC_PROTOTYPE=upload`) is not the contract and must not be copied into product UI.

This spec **supersedes** collector-registration capture stories that auto-open the gallery without a chooser, cap multi-select at three Photo slots, and treat type / size / condition as silent sqlite defaults (`home` / `m` / `used`) so Gem can fire after club + season only. Identity, Collection Save HTTP, Vision’s one-photo job, and UserJersey rows stay as in **Collector registration**. Samling chrome stays as in **Collection home**.

## Problem Statement

A collector who can already Save one UserJersey still cannot dump a camera-roll of shirts. Plus jumps into a three-slot gallery, Confirm looks like a form with hidden defaults, and there is no honest way to bind many photos onto several copies. Agents will copy the throwaway prototype (including Vision-as-grouping and two Confirm tabs) unless this slice is specified against the lock.

## Solution

Plus opens a capture session with the Tab bar hidden. The collector chooses **Upload filer** (system picker: Photos and Files) or **Tag billede** (CameraView on repeat; gallery-first still true on the first session). Three photos or fewer become one UserJersey on a **single Confirm screen**. More than three land as an **Uredigerede** row the collector binds onto jersey tabs. Vision suggests club / season / kit type on the jersey being filled — it does not group photos. **Gem** stays disabled until photo + club + season + type + size + condition are chosen; the same rule applies in bulk (**Gem og næste** when more unsaved jerseys remain). Save does not wait on Vision. Optional nameset, patches, purchase, and authenticity stay behind **Flere detaljer**.

## User Stories

1. As a collector, I want plus to open a chooser titled Tilføj trøje, so that I am not dropped into a camera or a fake in-app roll.
2. As a collector, I want a close control on the chooser, so that I can return without creating a UserJersey.
3. As a collector, I want the Tab bar hidden from chooser through Confirm and post-Save Ny trøje / Samme klub, so that plus is not a selected tab.
4. As a collector, I want the Tab bar back when I land on Samling, so that the five places are available again.
5. As a collector, I want primary **Upload filer**, so that a camera-roll dump is the default path.
6. As a collector, I want secondary **Tag billede**, so that a shirt in hand still uses the in-app CameraView on repeat sessions.
7. As a collector on my first add in a session, I want gallery-first to remain true, so that camera permission is not asked at launch.
8. As a collector on Expo Web, I want gallery-first add and no 45-second camera promise, so that web stays a degraded target.
9. As a collector, I want Upload filer to open the **OS** picker (iOS Photos and Files / Android gallery and documents), so that KitCollective does not ship a product camera roll.
10. As a collector on iOS, I want numbered ordered selection when the OS shows it, so that tap order is the sequence.
11. As a collector on Android, I want the system’s own selection chrome (often checkboxes, no numbers), so that Confirm and bind never assume I saw 1, 2, 3.
12. As a collector, I want picker order (iOS `orderedSelection` when available; otherwise the returned asset array) to be the sequence, so that roles and bind have a stable order.
13. As a collector, I want a Files / documents path as well as Photos, so that shirts sitting in Downloads still upload.
14. As a collector, I want photo-library permission only when I use the library picker, so that a Files-only dump does not demand broad media access.
15. As a collector, I want Android gallery to use the system photo picker without `READ_MEDIA_IMAGES`, so that access stays limited to what I picked.
16. As a collector, I want the picker confirm **Brug *n* billeder**, so that I know how many assets enter the session.
17. As a collector who picked three photos or fewer, I want one Confirm screen, so that a single shirt is not a bulk workspace.
18. As a collector who picked three photos or fewer, I want picker order to fill Photo slots front, then back, then label when those assets exist, so that roles match domain `PHOTO_ROLES`.
19. As a collector who picked more than three photos, I want bulk bind first (Uredigerede + jersey tabs), so that I decide which photos belong to which UserJersey.
20. As a collector, I do not want every three photos auto-chunked into a jersey, so that a shirt with only a front is not merged with the next shirt’s back.
21. As a collector in bulk, I want a thin Uredigerede row with a count, so that unbound photos are visible without an essay.
22. As a collector, I want jersey tabs (Trøje *n* · count) and **+ trøje**, so that I can add another copy in the same dump.
23. As a collector, I want the active tab to be the bind target, so that a tap (and drag where the host supports it) on an unbound photo attaches it to that jersey.
24. As a collector, I want a bound thumb to return to Uredigerede when I tap it, so that a mis-bind is reversible without re-picking.
25. As a collector, I want Photo roles on the active jersey to stay Forside / Bagside / Mærke, so that left / right / other never become required slots.
26. As a collector, I want the Uredigerede row hidden when it is empty, so that the screen becomes the same Confirm body as a single jersey.
27. As a collector, I want the Confirm body to be one scrolling column (photo strip, Vision, club, season, type / size / condition chips, Flere detaljer, Gem), so that I am not in Stamdata | Detaljer tabs.
28. As a collector, I want kit type chips Hjemme / Ude / Tredje / Keeper / Special on Confirm, so that Keeper and Special are not hidden behind a Mere chip.
29. As a collector, I want size chips XS–XXL on Confirm, so that size is thumb-reachable on the 45-second path.
30. As a collector, I want condition chips Ny / Brugt / Slidt on Confirm, so that I am not rating stars named God.
31. As a collector on a new jersey, I want type, size, and condition to start **unselected**, so that Gem cannot fire on a silent `home` / `m` / `used`.
32. As a collector, I want Gem disabled until at least one photo, club, season, type, size, and condition are set, so that a black button does not 4xx.
33. As a collector, I want helper text under a disabled Gem that names what is missing, so that disable is not the only explanation.
34. As a collector with more than one unsaved jersey in the session, I want the primary label **Gem og næste**, so that the cellar dump continues without changing the enablement rule.
35. As a collector, I want the same enablement rule in single and bulk, so that bulk is not a thinner form that drops size or condition.
36. As a collector, I want tertiary **Flere detaljer** to open Sheet `form`, so that optional fields stay off the 45-second clock.
37. As a collector in this increment, I want Flere detaljer to accept notes (and nothing invented for player badges), so that nameset / patch controls can wait for their slice.
38. As a collector, I want authenticity to stay `unknown` unless I later pick it in Flere detaljer, so that I am not forced to claim genuine.
39. As a collector on a single Confirm, I want tertiary **Flere trøjer i denne upload** to enter bulk bind without re-picking, so that an accidental three-photo dump can still become two jerseys.
40. As a collector, I do not want that link to mean “split this jersey’s photos automatically”, so that bind stays a human action.
41. As a collector, I want Vision to start from a photo on the jersey I am filling, so that inference is a shortcut, not a grouping worker.
42. As a collector, I want Vision to suggest only club, season, and kit type as catalog UUIDs, so that raw model names are never foreign keys.
43. As a collector, I want high-confidence catalog hits (≥70% and a catalog match, existing Vision contract `preselect`) to fill club / season / type without an extra Brug tap, so that jersey #2 stays under 45 seconds.
44. As a collector, I want 50–69% confidence to show a quiet strip with Brug + dismiss, so that a weak guess is not silently applied.
45. As a collector, I want a failed or timed-out Vision job to drop the strip and leave fields empty, so that Save still works.
46. As a collector, I want to type club and season while Vision is in flight, so that a skeleton never blocks the form.
47. As a collector, I want Save to succeed even if Vision is slow or down, so that a model outage does not recreate the spreadsheet.
48. As a collector, I want Vision never to assign Photo slot roles or move photos between jerseys, so that grouping stays human bind + pick order.
49. As a collector, I want each bound jersey to fire its own existing Vision job, so that a dump does not wait on one multi-image grouping call.
50. As a collector, I want club search against CatalogLabel labels and aliases, so that I do not walk land → league → club.
51. As a collector requesting Danish UI, I want club names resolved request locale → `mul` → `en`, so that the English seed string is not shown as the Danish name.
52. As a collector, I want seasons scoped to the selected club (TeamSeason), so that I cannot pick a season the club was not in.
53. As a collector, I want never to type a free-text club as catalog truth, so that Save cannot create a shadow Club.
54. As a collector, I want a catalog miss to keep the draft and show a Banner plus upgrade CTA, so that a thin catalog does not delete my photos.
55. As a collector, I want Save to succeed with `catalogKitId` null, so that a missing Kit row does not fail the dump.
56. As a collector, I want Save to require club, season, type, size, condition, and at least one photo, so that every UserJersey points at catalog identity.
57. As a collector, I want manufacturer, nameset, patches, and purchase off this increment’s critical path, so that Shirt Squad completeness does not return.
58. As a collector, I want a local draft persisted after every pick, bind, unbind, and chip tap, so that killing the app does not lose the session.
59. As a collector, I want more than one jersey draft in one capture session, so that Gem og næste Saves one UserJersey at a time through the existing Collection Save contract.
60. As a collector, I want “Ny trøje” after Save to start with empty club identity, so that Inter 23/24 does not become Barça 25/26.
61. As a collector, I want “Samme klub” to prefill club only, so that season / type / condition are not sticky.
62. As a collector after Samme klub, I still want type, size, and condition unselected, so that a cellar session does not inherit Hjemme / L / Brugt.
63. As a collector, I want a quiet Gemt (Sheet or screen) with Ny trøje, Samme klub, and a way back to Samling, so that there is no confetti and no toast on top of Gemt.
64. As a collector on repeat with the shirt in hand, I want CameraView with three overlay Photo slots and a tertiary gallery escape, so that I am not bounced through the system camera one shot at a time.
65. As a collector, I want Save to succeed with only one photo, so that two empty slots never block jersey #2.
66. As a collector, I want all three slots recommended but not required, so that a cellar session can still complete with only a front.
67. As a collector, I want UI copy in Danish, so that the first market can use the flow.
68. As a collector, I want Dynamic Type and 44×44 targets on primary controls, so that the accessibility floor holds.
69. As a collector with reduced motion, I want sheets and Vision fades to have a still equivalent, so that motion is not required to Save.
70. As a collector on a dark system appearance, I want the dark token mode, so that Confirm chrome follows the lock.
71. As a collector, I want Marks only when a licensed asset exists, otherwise a monogram, so that emoji and invented shields never appear.
72. As a collector, I want never to see archive KitPhoto bytes, so that unresolved rights do not leak into Expo.
73. As Nicklas, I want this milestone demoable on a device build against the staging catalog after promote, so that a 6-photo bind + two Saves is real, not prototype-gated.
74. As an implementing agent, I want to follow `docs/design-system.md` Confirm and Save + Capture session, so that I do not ship Stamdata | Detaljer, star condition, or a Mere type chip.
75. As an implementing agent, I want the throwaway upload prototype left off staging and production channels, so that `EXPO_PUBLIC_PROTOTYPE=upload` is not the shipped plus path.
76. As the Collection module, I want each Save to remain one UserJersey on the existing `/v1` contract, so that bulk is a client session, not a new Nest bulk resource.
77. As the Vision module, I want the existing one-photo suggest job unchanged, so that grouping is not a silent adapter change.
78. As a client app, I want to import only `packages/api-contract` and `packages/domain`, so that Expo never imports `packages/db` or `apps/api`.

## Implementation Decisions

- **Linear:** Feature on existing project KitCollective. New milestone **Tilføj trøje**. No second project.
- **Visual lock:** `docs/design-system.md` Confirm and Save + Capture session + Fast capture. Hi-fi HTML/PNGs under `.scratch/jersey-upload/claude-design/` are capture-spine evidence. Do not copy Stamdata | Detaljer, star ratings, Mere, or prototype banners.
- **Modules:** Collection (existing Save; Expo session holds N drafts). Catalog picker (existing club search + club-scoped seasons). Vision (existing one-photo job; Save must not await). Identity unchanged. No new Nest grouping module.
- **Existing HTTP seam (unchanged):** `packages/api-contract` `/v1` Collection Save, Vision suggest/job/log, Catalog picker. One Save = one UserJersey. `visionSuggestRequestSchema` still takes **one** photo. Do not add a grouping job or a bulk Save body in this milestone.
- **New Expo module (this feature’s depth):** a capture-session module behind a small interface: ordered URIs in; branch `single` | `bulk`; unbound photo list; jersey drafts; bind / unbind / add jersey; `canSave(draft)` matching the lock (photo + clubId + seasonId + type + size + condition). Screens call this module; they do not own bind rules. Local sqlite may gain session/unbound tables; that is an adapter behind the module, not a `packages/db` migration.
- **Branch rule** (from the locked steal, not from prototype variant B):

```ts
function branchFromPhotoCount(count: number): "single" | "bulk" {
  return count > 3 ? "bulk" : "single";
}
```

Three or fewer: one draft; picker order fills `front`, `back`, `label` in that sequence. More than three: all photos start unbound; the collector binds onto tabs. **Flere trøjer i denne upload** switches a single session into bulk without re-picking.

- **Picker:** `expo-image-picker` system library with `allowsMultipleSelection` and iOS ordered selection when the host supports it. Files / documents via the platform document picker (images only). Do not use a custom grid as the product picker. Do not keep `selectionLimit: PHOTO_ROLES.length` as the session cap. If a host-imposed max is required, flag it — do not invent 99. A ~12-photo cellar dump is the demo shape.
- **Android:** system photo picker; do not request `READ_MEDIA_IMAGES` for gallery. Bind logic uses returned array order, not visible badge numbers.
- **Confirm chips:** type / size / condition start unselected on Ny trøje and on Samme klub. Current sqlite defaults `home` / `m` / `used` must not appear as selected chips until the collector taps. POST Save only after `canSave`. Server contract still requires those enums — the client does not send a guess.
- **Vision UX:** reuse `preselect` on `visionJobResponseSchema` (≥70% + catalog hit). Pre-select fills fields. 50–69%: strip + Brug. Else ignore. In-flight skeleton uses existing surface tokens. Log `accepted` / `edited` / `ignored` via the existing vision log contract. Fire suggest per jersey that has at least one photo, fail-open 8–12 s as in tech-stack §6.
- **Flere detaljer:** Sheet `form`. Notes Text field is in-scope if it already maps to `UserJersey.notes`. Player print, badges/patches, purchase, authenticity picker: out of this milestone’s field UI (authenticity column stays default `unknown`). Do not invent Superliga/CL chips.
- **Post-Save:** keep Ny trøje / Samme klub; add a path back to Samling. Quiet Gemt; no confetti. Tab bar returns on Samling.
- **Camera repeat:** existing CameraView + three overlay slots; gallery tertiary. Unmount CameraView on blur.
- **Drafts:** local expo-sqlite; Nest JerseyDraft / Save draftId round-trip stays as today, one jersey per Save. Session state (unbound URIs, which draft is active) is local until each Save.
- **Prototype:** do not land `prototype/jersey-upload` into `development` as product UI. Staging/production EAS must not set `EXPO_PUBLIC_PROTOTYPE=upload`. Product plus follows this spec.
- **Clients:** `apps/mobile` must not import `apps/api` or `packages/db`.
- **Lanes:** device demo against staging catalog after the milestone promotes.

## Testing Decisions

Tests cover external behaviour at the highest public interface. They do not assert sqlite column names, R2 SDK calls, Gemini payloads, or Expo component trees.

**Good test (HTTP, existing):** Collection Save still 4xx without club/season/type/size/condition/photo; Save returns while Vision is delayed; Vision suggest still accepts one photo; 401 without session. A bulk dump is N of these calls, not a new resource.

**Good test (Expo capture-session module):** given ordered URIs, `branchFromPhotoCount` is `single` at 1–3 and `bulk` at 4+; single assigns roles front/back/label in order and leaves extra roles empty; bulk starts with all photos unbound; bind/unbind/add jersey update counts; `canSave` is false until photo + club + season + type + size + condition; `canSave` does not become true from sqlite defaults the collector never selected; switching to bulk via the escape keeps the same URIs.

**Seams `/tdd` will use (two, both existing-or-new at the highest point):**

1. **`packages/api-contract` `/v1` as implemented by Nest** — Save, Vision, Catalog picker. Unchanged. Callers and tests cross this interface. Adapters behind it (Postgres, R2, Vision worker) stay fakes in Nest tests.
2. **Expo capture-session module** — the new depth for bind, branch, and `canSave`. Tests import the module; they do not render chooser/Confirm screens. Pixel tests are out.

Do not add a Nest grouping seam. Do not add a seam that requires Expo to import `apps/api` or `packages/db`.

**Modules tested:** Collection Save (regression). Vision only insofar as Save does not wait and suggest remains one photo. Capture-session module (new). Catalog picker unchanged unless this slice touches it.

**Prior art:** `apps/api/tests/collection.test.ts` (Save + slow/fail Vision). `packages/api-contract/tests/vision.test.ts` and `vision-save-action.test.ts`. `apps/mobile/tests/button-layout.test.ts` for Expo unit shape (pure module, not screens). Do not test `src/prototype/upload/`.

`/tdd` will not re-quiz these seams.

## Out of Scope

- A Nest / Gemini job that groups photos into UserJerseys.
- Auto-chunk every three photos.
- Stamdata | Detaljer Confirm tabs; star condition; Mere as a type bucket.
- Nameset, player-print picker, patch/badge chips, purchase fields, authenticity UI (column default remains).
- Sticky last-used size (deferred until telemetry).
- Left / right / other Photo roles.
- Landing or copying `apps/mobile/src/prototype/upload/` as shipped UI.
- Changing Collection Save or Vision suggest HTTP shapes except if a contract test proves today’s Save rejects a legal payload this UI must send (then fix the class, do not invent bulk Save).
- Public Astro, Admin SPA, Wishlist content, IAP, push.
- Serving KitPhoto to Expo.
- Apple / Google login.
- OCR / on-device Feature Print grouping.
- Expo Web as a first-class camera product.

## Linear

- **Project:** KitCollective
- **Mode:** feature
- **Lead:** Nicklas
- **Priority:** None (not named)
- **Milestones** (each is one staging increment — a handful of issues, not the whole product):
  1. Tilføj trøje — Signed-in Expo plus opens the locked capture session: chooser, OS picker, one Confirm screen or human bind for more than three photos, Vision stamdata only, Save never waits. Demoable: ≤3 photos Save on one screen with Gem disabled until club, season, type, size, and condition; a 6-photo dump binds into two UserJerseys with Gem og næste; staging catalog. Ready to promote integration → staging when that works for an owner who already can Save. Throwaway upload prototype is not this milestone.

## Further Notes

- Glossary: `CONTEXT.md`. Visual: `docs/design-system.md`. Tokens snapshot: `DESIGN.md`.
- Collector registration remains `.scratch/collector-registration/spec.md`. Collection home remains `.scratch/collection-main-screen/spec.md`. Where capture/Confirm disagrees, **this document and the design lock win**.
- Grouping research: `.scratch/Research/jersey-bulk-grouping.md`. Speed research: `.scratch/Research/jersey-registration-speed.md`.
- Seed catalogs must exist in the target lane; seed work stays on the KitCollective Seed project.
- Next slash: `/to-tickets` for vertical slices under Tilføj trøje. Do not invent issues from this skill.
