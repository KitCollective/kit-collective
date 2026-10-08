# Wishlist and premium — Ønske, Entitlement, Match

Feature spec for the KitCollective Linear project, milestone **Wishlist and premium**. Design lock: `docs/design-system.md` (Gap 2026-08-30 Ønske Sheet + IAP paywall Sheet + admin Offer). Domain nouns: `CONTEXT.md`. Architecture: `.scratch/Architecture/tech-stack.md` and `data-model.md`. Decisions: ADR-0018 (Staff access is `User.role`), ADR-0029 (Offer catalog; store owns IAP price), ADR-0030 (Comp is not Staff access).

This spec **does not** replace Collection home, Tilføj trøje, Indbakke, or Profil. It **supersedes** Collection home’s empty notification Sheet on the Samling header (that slot is Ønske). Ønske is not a tab. Favorit stays under Profil. Søg and Send bud stay available without Entitlement.

Throwaway prototypes are not the contract and must not be copied into product UI.

## Problem Statement

A collector who can already Save UserJerseys and Send bud still has no structured want-list and no reason to pay. Slot 4 is Indbakke. The Samling bell is an empty notification Sheet that is not a product. Agents will either invent a heart tab, stuff the plan into `User.role`, hardcode 29 kr, or paywall Søg. Without Nest-owned Entitlement and a match-job, Ønske is a dead list.

## Solution

The Samling header bookmark opens **Ønske** (Sheet over Samling). A Wishlist row is AND facets: club, season, type (at least one) and optional size. Creating or editing requires a live **Entitlement** (Nest-trial, IAP month/year, or Comp). First open/Tilføj without Entitlement starts Nest-trial when Offer allows; otherwise the paywall Sheet (StoreKit prices, Restore). A **Match** is another collector’s bidding-enabled UserJersey that fits. OS push deep-links to that copy; the row shows the hit. Own Saves never match. Aktivitet stays Bud. Lapse keeps rows (view/delete); match stops. Staff edits Offer and can Grant comp. Apple/Google remain merchant of record.

## User Stories

1. As a collector on Samling, I want the trailing header control to be Ønske (`bookmark-outline`), so that I am not opening an empty notification Sheet.
2. As a collector, I want that control named Ønske, so that VoiceOver is not Notifikationer.
3. As a collector, I want no notification bell on Samling, so that agents do not rebuild the placeholder.
4. As a collector, I want Ønske to open a Sheet over Samling, so that it is not a sixth tab and not a full-screen Favoritter clone.
5. As a collector, I want the Tab bar still visible behind that Sheet, so that Genveje and Ønske share one overlay family.
6. As a collector, I want the Sheet title Ønske, so that chrome matches the lock.
7. As a collector with zero Wishlist rows and a live Entitlement, I want Empty state collection anatomy (title, one sentence, primary Tilføj), so that I am not looking at a fake list.
8. As a collector with rows, I want List row manage (auto-name, AND meta in mono, edit, delete), so that we do not invent a wishlist-row primitive.
9. As a collector, I want a hit row on fill.secondary with “match” in the accessible name, so that colour is not the only signal.
10. As a collector tapping a hit row (not edit/delete), I want the foreign UserJersey detail, so that I can Send bud from a copy that exists.
11. As a collector, I want Tilføj / edit to swap the same Sheet body to Ny ønskerække, so that we do not nest two Ønske Sheets.
12. As a collector on Ny ønskerække, I want Select fields for club and season (existing facet picker), so that catalog truth is not free text.
13. As a collector, I want Chip single-select for type and optional size (same chips as Confirm), so that we do not invent a second chip language.
14. As a collector, I want helper copy that facets combine with AND, so that I am not surprised when a Match is narrow.
15. As a collector, I want Gem disabled until at least one of club, season, or type is set, so that an empty want cannot exist.
16. As a collector who skips a custom name, I want an auto-name from set CatalogLabels (and size label), so that I am not forced to type.
17. As a collector, I want never to set country, league, or player on a v1 Wishlist row, so that we do not match on data the copy may lack.
18. As a collector, I want never to type a free-text club as catalog truth, so that a want cannot create shadow stamdata.
19. As a collector without a live Entitlement, I want opening Ønske or tapping Tilføj to start Nest-trial when Offer.trial is on and I have not used trial, so that the first want can exist without IAP.
20. As a collector without a live Entitlement when trial is off or already used, I want the paywall Sheet, so that month, year, and Restore are the next step.
21. As a collector on the paywall, I want mono localized prices from the store SDK, so that chrome does not lie about kroner.
22. As a collector, I want primary month, secondary year, and tertiary Gendan køb, so that Restore is always available.
23. As a collector, I want no wash, illustration, or invented plan wordmark on the paywall, so that agents flag missing Danish title copy instead of inventing KitCollective+.
24. As a collector whose Nest-trial is running, I want create and edit to work until expires, so that trial is a real Entitlement.
25. As a collector after a successful IAP or Restore, I want a live Entitlement with source iap_apple or iap_google, so that Nest is billing truth.
26. As a collector on Lapse, I want my Wishlist rows still listed, so that the list is evidence to renew.
27. As a collector on Lapse, I want to view and delete rows, so that I can tidy without paying.
28. As a collector on Lapse, I want create and edit to open the paywall, so that working the paid product requires a live Entitlement.
29. As a collector on Lapse, I want match-job and match-push stopped, so that I am not billed in behaviour after expiry.
30. As a collector, I want Samling, Søg, and Send bud unchanged without Entitlement, so that this increment does not paywall Indbakke.
31. As a collector with Staff access and no Entitlement, I want Expo still to treat me as free until Comp or IAP, so that User.role is not the plan.
32. As a collector with Entitlement and no Staff access, I want Ønske to work, so that paid is not admin.
33. As a collector, I want Favoritter to stay under Profil with the heart icon, so that bookmark means Ønske and heart means Favorit.
34. As collector B who Saves a bidding-enabled UserJersey that fits collector A’s live Wishlist, I want A to get a Match, so that the want-list is not decoration.
35. As collector A, I want that Match only if B’s copy is åben for bud, so that I can act with Send bud.
36. As collector A, I want no Match when I Save my own copy, so that I do not ping myself.
37. As collector A, I want no Match on a closed copy, so that I am not sent to a shirt I cannot bid on.
38. As collector A, I want no Match on a seed Kit with no UserJersey, so that a catalog ingest is not a hit.
39. As collector A, I want AND: a UserJersey that fails any set facet is not a hit, so that “FCK + 23/24 + Hjemme” is narrower than any one facet.
40. As collector A, I want optional size to match UserJersey.size when set, so that L is not implied.
41. As collector A, I want an OS push on Match that deep-links to that UserJersey, so that I am not only looking at a grey row later.
42. As collector A, I want the OS push permission asked when I save my first Wishlist row, so that the ask has a concrete purpose.
43. As collector A, I do not want a push wall at register or at first Ønske open, so that we keep the existing permission story.
44. As collector A, I want Profil Notify prefs still to be the in-app switches, so that master-off can suppress send without deleting the row.
45. As collector A, I want Aktivitet to stay Bud cards, so that a Match is not a second inbox model.
46. As collector A, I want no unread badge on the bookmark, so that hits live on the row.
47. As Nest Billing, I want Offer rows for live month product id, year product id, trial on/off, and trial days, so that those values are not hardcoded.
48. As Nest Billing, I want display price never stored as IAP truth, so that Admin DKK cannot disagree with the store.
49. As Nest Billing, I want receipt validation server-side before writing source iap_apple or iap_google, so that Expo is not billing truth.
50. As Nest Billing, I want Restore to re-validate and upsert Entitlement, so that a reinstall does not lose the plan.
51. As Nest Billing, I want Nest-trial source trial once per User, so that toggling Offer.trial does not mint endless trials.
52. As Nest Billing, I want expires on every Entitlement, so that Lapse is a timestamp, not a client flag.
53. As Staff, I want a User Data Offers chip and one drill (English), so that I can change SKUs, trial, and days without a deploy.
54. As Staff, I want no DKK price field and no + New on Offers, so that we do not invent a store console.
55. As Staff on a User drill, I want mono Entitlement source · expires (or none) and Grant comp, so that demo and support accounts are not sandbox IAP.
56. As Staff, I want Grant comp to set source comp and an expires date, so that Comp is a Billing write, not User.role.
57. As Staff, I want unauthenticated Offer writes to 401 and non-admin to 403, so that Collectors cannot edit the catalog.
58. As a collector, I want unauthenticated Wishlist and Entitlement calls to 401, so that wants are owner-scoped.
59. As a collector, I want another person’s Wishlist GET to 404/403, so that wants are not public search.
60. As a collector, I want Danish chrome on Ønske and paywall, so that the first market can use it.
61. As a collector, I want hit targets ≥ 44 and reduced-motion Sheet present without required travel, so that the accessibility floor holds.
62. As a collector on dark appearance, I want the same semantic tokens, so that we do not invent a third palette.
63. As a collector on Expo Web, I want no promise that IAP or Camera is first-class, so that web stays degraded.
64. As Nicklas, I want this milestone demoable on a device build against staging: two Collectors; A gets Entitlement (trial, IAP sandbox, or Comp); A Gems a Wishlist; B Saves a matching bidding-enabled UserJersey; A’s row shows the hit; Offer is editable in Admin, so that Wishlist and premium can promote independently of Astro and a second SKU family.
65. As Nest Wishlist, I want a match-job in the same Nest process (BullMQ) when a bidding-enabled UserJersey is created or bidding is turned on, so that Save does not wait on fan-out.
66. As Nest Notify, I want match-push to use the existing prefs (master + category) and an Expo Push adapter, so that a missing token or master-off is fail-open for Save.
67. As a client app, I want to import only packages/api-contract and packages/domain, so that Expo and Admin never import packages/db or apps/api.
68. As an implementing agent, I want to follow docs/design-system.md and flag a missing paywall title word, so that I do not invent a primitive or KitCollective+.

## Implementation Decisions

- **Linear:** Feature on existing project KitCollective. Attach to existing milestone **Wishlist and premium**. No second project. No new milestone.
- **Visual lock:** `docs/design-system.md` Gap 2026-08-30 is authoritative for Ønske, paywall, and Offers. Patterns Ønske and Paywall compose List row, Sheet, Empty state, Button dock. Do not invent wishlist-row or paywall-card primitives. Throwaway prototypes are not the contract.
- **Modules (architecture lock):** Introduce Nest modules named in the stack lock: **Wishlist** (rows, match evaluation, enqueue) and **Billing** (Offer, Entitlement, receipt adapter, trial, Restore, Comp). **Notify** owns match-push send (prefs already persist under Identity). **Collection** Save and biddingEnabled stay as they are; they enqueue the match-job, they do not evaluate wants. **Identity** stays `User.role` only for Staff access. **Catalog** picker is reused. **Moderation** unused beyond existing block (blocked peers should not produce a visible Match — treat as no-hit if the foreign GET would already 403).
- **Seam (one):** `packages/api-contract` `/v1` as implemented by Nest (Fastify). Callers and tests cross this interface. Wishlist, Entitlement, Offer, IAP verify/restore, trial start, Comp, and match-hit fields are resources on this seam, not a second public interface.
- **Wishlist row:** Owner userId. Optional clubId, seasonId, type (`KIT_TYPES`), size (`JERSEY_SIZES`). At least one of club, season, type required. Auto-name from CatalogLabel (request locale → mul → en) plus size label. No country, league, player in v1. Not a Favorit. Not a Kit FK as the only shape.
- **Match:** Another collector’s UserJersey with biddingEnabled, not owned by the Wishlist owner, all set facets equal (clubId, seasonId, type, size when set). Persist the latest matching userJerseyId (or hit count + latest id) on the list payload so the row can navigate. Own Save and bidding toggle on own copies never enqueue hits for that owner.
- **Match-job:** BullMQ in the same Nest process. Trigger after Collection Save or PATCH biddingEnabled true. Do not await the job on the Save HTTP response (same fail-open idea as Vision). Redis per lane as already locked.
- **Entitlement:** One current fact per User: yes/no derived from expires > now, source `iap_apple` | `iap_google` | `trial` | `comp` (later `stripe` unused). Absence = free Collector. JWT must not be the only billing check — Nest re-reads Entitlement on Wishlist writes.
- **Nest-trial:** Starts on first Ønske open or Tilføj when no live Entitlement, Offer.trial is true, and this User has never had source `trial`. Duration = Offer.trialDays. One trial per User forever.
- **IAP:** Expo store binaries use StoreKit / Play Billing. Nest validates the receipt/token before upsert. Product ids come from Offer, not env literals. Display price is store SDK only. Restore is a verify path, not a new SKU.
- **Offer:** Singleton (or one row) Staff can PATCH: monthProductId, yearProductId, trialEnabled, trialDays. No price columns.
- **Comp:** Staff POST/PATCH on a User: source `comp` + expires. Orthogonal to role.
- **Lapse:** expires ≤ now. GET list still returns rows. POST/PATCH row = 402 or 403 with a contract code that Expo maps to the paywall. DELETE remains 204. Match-job skips lapsed owners. Push does not send.
- **Push:** Ask OS permission on first successful Wishlist create. Register Expo push token on an existing or new `/v1` Identity/Notify resource. Send uses master + a match category; if prefs block, skip send, keep the row hit. Missing APNs/FCM secrets in a lane: job no-ops send, still writes the hit — flag in Evidence.
- **GET me / session:** Expose enough Entitlement for chrome (live boolean, source, expires, trialUsed) so Expo does not guess. Do not put Staff role semantics on that object.
- **Expo chrome:** Pattern Ønske + Paywall. Header bookmark. Hide nothing extra on Samling except the old bell Sheet. Foreign detail is the existing Indbakke/Søg GET.
- **Admin:** User Data chip Offers. User drill Grant comp. English. Light only. Waffle stays two tiles.
- **Clients:** `apps/mobile` and `apps/admin` import only `packages/api-contract` and `packages/domain`.
- **Lanes:** Device demo against staging after promote. IAP sandbox on the staging EAS channel. Development Nest remains in VMs.
- **Glossary:** Already in `CONTEXT.md` (Entitlement, Wishlist, Ønske, Match, Offer, Nest-trial, Lapse, Comp, Match-push prompt). Do not invent Tier one.

Wishlist write (decision, not a host file):

```text
{
  clubId?: uuid
  seasonId?: uuid
  type?: KitType
  size?: JerseySize
}
# at least one of clubId, seasonId, type
```

Entitlement on GET (decision):

```text
{ live: boolean, source: "iap_apple" | "iap_google" | "trial" | "comp" | null, expires: string | null, trialUsed: boolean }
```

Offer (decision):

```text
{ monthProductId: string, yearProductId: string, trialEnabled: boolean, trialDays: int }
```

## Testing Decisions

Tests cover external behaviour at the highest public interface. They do not assert Drizzle column names, StoreKit UI, Sheet blur, bookmark glyph hashes, or Expo notification permission dialogs.

**Good test:** HTTP (contract parse + Nest) with two signed-in Collectors and fixture club/season. Offer.trial on, trialDays 3. A opens trial (POST entitlement/trial or first Wishlist create). A POSTs a Wishlist (club + type). B Saves a bidding-enabled matching UserJersey. A’s GET list shows hit + B’s jersey id. A Saves an identical own copy — still one hit, not self. B turns bidding off — new saves do not add hits for A. After expires, A GET list still has the row; A POST row is 4xx paywall code; A DELETE works. C without Entitlement and trialUsed cannot POST. Staff PATCHes Offer trial off; new user D gets paywall code, not trial. Staff Grants comp to D; D can POST. Non-admin PATCH Offer is 403. Unauthenticated Wishlist is 401. Søg/Send bud for a user with no Entitlement still 200.

**Seam (one):** `packages/api-contract` `/v1` as implemented by Nest. `/tdd` will not re-quiz this seam.

**Adapters behind the seam (not the test surface):** Postgres via `packages/db`; BullMQ (use the existing in-process / test Redis pattern); IAP verifier (fake adapter that accepts a test token); Expo Push (fake adapter that records sends). Two adapters (real vs fake) make those internal seams real; tests still enter through HTTP plus an explicit “run queued match-job” hook if the suite already drains Vision that way.

**Do not add a seam** for Expo UI. Design lock + import-boundary tests are enough. Pixel tests are out.

**Modules tested:** Wishlist (CRUD, AND match, own-copy exclusion, lapse write rules). Billing (trial once, Offer, Comp, IAP fake verify, expires). Notify send only insofar as the fake adapter was invoked or skipped by prefs. Collection Save still does not fail if the match-job throws.

**Prior art:** `apps/api/tests/identity.test.ts`, `apps/api/tests/collection.test.ts` (two users, Save, bidding). Shortcut/genveje contract tests for AND facets. Admin collector 403 tests. Schema migrate tests on ephemeral Postgres. Import-boundary tests stay. Mobile unit tests for paywall enablement / Ønske canSave (same style as capture `canSave` and genveje Gem).

## Out of Scope

- Paywalling Søg, Send bud, or Samling.
- Store introductory offers (Apple/Google trial metadata).
- Stripe web checkout (`Entitlement.source = stripe`).
- A second paid SKU family or Tier one/two/three.
- Admin DKK as IAP price.
- Wishlist country / league / player facets (v1).
- Matching seed Kits or closed copies.
- Match cards on Aktivitet.
- A sixth tab or heart in slot 4.
- Wishlist-row or paywall-card primitives.
- Ønske row reorder (drag-handle) — flag if requested.
- Invented paywall brand name (KitCollective+) — flag copy.
- Favorit behaviour change.
- Public Astro Ønske or OG for wants.
- Facebook OAuth, SMS login, live geocoding.
- Expo Web IAP.
- Changing Capture / Confirm / genveje / Indbakke conversation behaviour except removing the Samling bell Sheet.

## Linear

- **Project:** KitCollective
- **Mode:** feature
- **Lead:** Nicklas
- **Priority:** None (not named)
- **Milestones** (each is one staging increment — a handful of issues, not the whole product):
  1. Wishlist and premium — Signed-in Expo header opens Ønske. Collector with Entitlement (Nest-trial, IAP sandbox, or Comp) Gems a Wishlist; another collector’s bidding-enabled UserJersey produces a Match (row hit + push path). Offer is editable in Admin. Lapse keeps rows and blocks create/edit. Søg and Send bud stay free. Demoable on a device build against staging catalog. Ready to promote integration → staging when that works. No new primitives.

## Further Notes

- Glossary: `CONTEXT.md`. Visual lock: `docs/design-system.md`. If a ticket fights those, change the lock first.
- KIT-40 (first operator) remains Parked / ready-for-human. Offers UI is unusable without Staff; Comp can still be SQL in development if the operator is missing — say so in Evidence, do not skip the Admin slice.
- Next step: `/to-tickets` under milestone **Wishlist and premium**. Do not file tickets from this skill.
