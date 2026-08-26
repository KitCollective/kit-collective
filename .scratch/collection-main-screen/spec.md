# Collection home — Samling and genveje

Feature spec for the KitCollective Linear project, milestone **Collection home**. Design lock: `docs/design-system.md` (Gap 2026-08-23 collection chrome + brand type). Domain nouns: `CONTEXT.md`. Architecture: `.scratch/Architecture/tech-stack.md` and `data-model.md`. Visual evidence: `.scratch/collection-main-screen/claude-design/` (3a artifact; brand book for type/logo construction only). Throwaway Expo prototype is not the contract and must not be copied into product UI.

This spec **supersedes** collector-registration stories that locked a two-item labeled tab bar, search in the collection header, kit-type chips on Samling, and “no Wishlist tab”. Capture/Save, Identity, and UserJersey rows stay as in **Collector registration**.

## Problem Statement

A collector who can already Save a UserJersey still opens a collection home that does not match the product: search in the header, two equal tabs, kit-type chips, system UI type. They cannot scan their own shirts as the app’s home, cannot save AND-filters as genveje, and agents will keep inventing chrome because the old registration spec fights the design lock.

## Solution

After sign-in, the Expo app’s home is **Samling**: title + count + notification bell, two-column 4:5 Jersey tiles, user genveje chips (Alle default), and a five-slot icon-only glass tab bar. Tilpas opens a **Sheet** to create, reorder, edit, and delete genveje (country / league / club / player AND). Plus remains capture. Søg, Ønske, and Profil exist as places with honest empty or search chrome; their deep content is later milestones. Type is Archivo + IBM Plex. The KC mark and wordmark do not appear on Samling.

## User Stories

1. As a collector after login, I want the first screen to be my own Samling, so that I am not dropped on a feed, catalog, or marketplace.
2. As a collector, I want Samling’s header to show the title “Samling”, my UserJersey count, and a notification Icon button, so that I know whose collection this is without a wordmark or profile in the header.
3. As a collector, I want no search field in the Samling header, so that search is a place (Søg) and the grid stays photo-first.
4. As a collector, I want no KC mark or wordmark on Samling, in the tab bar, or on a Jersey tile, so that jersey photos are not competing with a lockup.
5. As a collector, I want the KC mark or wordmark on splash, login, onboarding, share/OG, favicon, and store icons, so that the product is still recognisable at entry and share.
6. As a collector, I want a two-column 4:5 photo grid of my UserJerseys, so that I can scan what I own.
7. As a collector, I want each tile to show club as a heading and season · kit type as mono, so that metadata stays secondary to the photo.
8. As a collector, I want tapping a tile to open my UserJersey detail (my photos, not archive KitPhoto), so that the product image stays mine.
9. As a collector with zero UserJerseys, I want the empty collection state and its primary add action, so that I am not looking at an empty chip row.
10. As a collector with zero UserJerseys, I want the genveje chip row (Alle, shortcuts, Tilpas) hidden, so that filters do not appear before there is anything to filter.
11. As a collector with at least one UserJersey, I want a chip row under the header starting with **Alle**, so that I can return to the full collection in one tap.
12. As a collector, I want Alle to be selected by default and to stay selected after I Gem a new genvej, so that creating a shortcut does not hijack the grid.
13. As a collector, I want additional chips to be my saved genveje (not Hjemme/Ude/Tredje), so that Samling filters how I think about the collection, not kit type.
14. As a collector, I want kit type, size, and condition chips to remain on Confirm and Save only, so that capture speed is unchanged.
15. As a collector, I want exactly one shortcut chip selected at a time (radio), so that the grid has one active filter.
16. As a collector, I want **Tilpas** as trailing text, never a plus, so that plus stays capture.
17. As a collector, I want Tilpas to open a Sheet titled Genveje over Samling, so that genveje is not a sixth tab and not a full-screen place.
18. As a collector in that Sheet, I want a list of genveje with a drag-handle, name, matching count, edit, and delete, so that I can manage shortcuts without leaving Samling’s context.
19. As a collector, I want a primary **Tilføj** in that Sheet, so that creating a shortcut is obvious.
20. As a collector tapping Tilføj or edit, I want the **same** Sheet body to become **Ny genvej** (or edit title), so that we do not nest two Sheets.
21. As a collector on Ny genvej, I want Select fields for country, league, club, and player, so that a genvej is catalog identity, not free text.
22. As a collector, I want those facets to combine with **AND**, so that “Danmark + Superliga + FCK” is narrower than any one facet.
23. As a collector, I want helper copy that states AND, so that I am not surprised when the grid shrinks.
24. As a collector, I want an optional custom name field, so that I can call a shortcut something I recognise.
25. As a collector who skips a custom name, I want an auto-name from the set facet CatalogLabels, so that I am not forced to type.
26. As a collector, I want Gem disabled until at least one facet is set, so that an empty shortcut cannot exist.
27. As a collector, I want each Select field to open a full-screen searchable picker (back + close) on top of the Sheet, so that I can find stamdata without a native spinner.
28. As a collector in that picker, I want Search field + List rows with Mark/monogram, so that missing crests stay data, not emoji.
29. As a collector in that picker, I want a “Mest brugte” group derived from my own UserJerseys when that kind appears in my collection, so that I am not scrolling the whole catalog first.
30. As a collector, I want picker rows to be CatalogLabel in my UI locale (da → mul → en), so that the English seed string is not shown as the Danish name.
31. As a collector, I want country / league / club / player pickers to search CatalogLabel aliases in every locale, so that “FCK” and “København” hit the same Club.
32. As a collector, I want never to type a free-text club, country, league, or player as catalog truth, so that a genvej cannot create shadow stamdata.
33. As a collector, I want a country facet to match UserJerseys whose Club.countryId equals that Country, so that “Danmark” is all my Danish-club copies.
34. As a collector, I want a league facet to match UserJerseys whose Season.leagueId equals that League, so that “Superliga” is shirts in Superliga seasons.
35. As a collector, I want a club facet to match UserJerseys whose clubId equals that Club, so that “F.C. København” is that club’s copies.
36. As a collector, I want a player facet to match UserJerseys whose club + season has that Player on PlayerClubSeason, so that player genveje work before a nameset FK exists on the copy.
37. As a collector, I want a UserJersey that fails any set facet to be hidden, so that AND is enforced on the server list, not only in the client.
38. As a collector, I want GET of my jerseys without a shortcut to return the full collection (Alle), so that the default chip is honest.
39. As a collector, I want each genvej’s count in the manager to equal how many of my UserJerseys currently match, so that I can delete empty shortcuts.
40. As a collector, I want to reorder genveje with the drag-handle and have that order persist, so that the chip row matches my list.
41. As a collector, I want to delete a genvej I own, so that stale filters go away.
42. As a collector, I want deleting or editing someone else’s shortcut to 404/403, so that genveje are owner-scoped like UserJerseys.
43. As a collector, I want unauthenticated shortcut and filtered-list calls to 401, so that anonymous clients cannot read another person’s filters.
44. As a collector, I want five tab slots: house (Samling), compass (Søg), raised plus (Tilføj trøje), heart (Ønske), person (Profil), so that the app’s primary places match the lock.
45. As a collector, I want those tabs icon-only with Danish accessible names (Samling, Søg, Tilføj trøje, Ønske, Profil), so that VoiceOver is not English Discovery and sighted chrome stays quiet.
46. As a collector, I want the compass to mean Søg, not a product rename to Discovery, so that copy stays Danish.
47. As a collector, I want the raised plus inside the pill to start capture (gallery-first first session, CameraView on repeat), so that plus is never “ny genvej”.
48. As a collector, I want plus not to remain a selected tab after capture dismisses, so that I return to Samling (or the place I came from) without a fake Add screen.
49. As a collector, I want the tab bar as a floating glass pill above the home indicator, so that photos can show through and the dock is not two labeled items.
50. As a collector, I want the last grid row to clear the pill, so that tiles are not hidden behind chrome.
51. As a collector, I want no FAB, sell bubble, logo, or visible tab labels, so that agents do not rebuild Vinted marketplace chrome.
52. As a collector, I want the notification badge on the header bell, not on a tab, so that Ønske is not overloaded with unread meaning.
53. As a collector tapping the bell in this increment, I want a honest empty or “ingen notifikationer” state — not a fake inbox — so that we do not invent a notifications product.
54. As a collector on Søg, I want to search my owned UserJerseys by club/season CatalogLabel text, so that Søg is find-in-collection, not a kit store.
55. As a collector on Ønske, I want an empty place that does not invent a wishlist-row primitive, so that the tab exists without shipping IAP.
56. As a collector on Profil, I want an empty or minimal profile place without a KC mark in the header (flag if needed), so that we do not invent settings.
57. As a collector, I want screen titles Søg / Ønske / Profil / Genveje / Ny genvej in Archivo title 24, so that Samling’s display 28 stays special.
58. As a collector, I want Archivo for headings, IBM Plex Sans for body/labels/chips, and IBM Plex Mono for season, counts, and IDs, so that type matches the brand book without UberMove.
59. As a collector, I want system-ui only if a webfont fails, so that missing fonts do not invent a fourth family.
60. As a collector, I want primary actions to stay black (not brand-book `#1F5EFF`), so that colour still comes from jersey photos.
61. As a collector, I want Danish UI copy, so that the first market can use the chrome.
62. As a collector, I want hit targets ≥ 44×44 and Select fields 52px tall, so that the accessibility floor holds.
63. As a collector with Dynamic Type, I want body and label to scale without breaking the two-column grid or tab bar, so that type is not a pixel-locked poster.
64. As a collector with reduced motion, I want Sheet present/dismiss without required travel, so that motion is not the only way to Tilpas.
65. As a collector on dark system appearance, I want the existing dark token mode on this chrome, so that we do not invent a second palette.
66. As a collector, I want Marks on picker rows only when a licensed asset exists, otherwise a monogram, so that emoji and archive KitPhoto never appear as crests.
67. As a collector, I want never to see archive KitPhoto bytes on Samling, Søg, or tiles, so that unresolved rights do not leak.
68. As a collector who just Saved a UserJersey, I want Samling count, grid, and genvej match counts to refresh, so that Alle and shortcuts stay true.
69. As a collector, I want “Ny trøje” / “Samme klub” after Save to still work as in Collector registration, so that cellar sessions stay fast.
70. As Nest Collection, I want genveje rows owned by userId with optional countryId, leagueId, clubId, playerId, so that filters are catalog UUIDs, not copied names.
71. As Nest Collection, I want at least one facet required at write time, so that the database cannot hold an empty AND.
72. As Nest Catalog, I want country, league, and player search (same picker item shape as clubs: id + resolved label, no archive URLs), so that Ny genvej pickers are not Expo-only hardcoding.
73. As a client app, I want to import only `packages/api-contract` and `packages/domain`, so that Expo never imports `packages/db` or `apps/api`.
74. As an implementing agent, I want to follow `docs/design-system.md` and flag gaps, so that I do not copy `apps/mobile/src/prototype/` or the brand book’s Hjemme/Ude mock.
75. As Nicklas, I want this milestone demoable on a device build against staging: signed-in user lands on Samling, sees 3a chrome, filters with a genvej, plus still captures, so that Collection home can promote independently of Astro and Admin.

## Implementation Decisions

- **Linear:** Feature on existing project KitCollective. New milestone **Collection home** (own staging increment). Collector registration stays closed. No second project.
- **Visual lock:** `docs/design-system.md` wins. 3a HTML is visual reference **except** Genveje is a Sheet, not a full-screen place. Brand book v1.0 is type families, scale, and logo construction only. Root `DESIGN.md` is the token snapshot; design-system wins on conflict. `apps/mobile/src/prototype/` is throwaway; do not `/land` that branch as product UI.
- **Modules:** Collection (list filter, genveje CRUD, match counts). Catalog (picker search for country, league, player — same item shape as existing club search). Identity unchanged. Vision and Save unchanged.
- **Seam (one):** `packages/api-contract` `/v1` as implemented by Nest (Fastify). Callers and tests cross this interface. Collection list, Collection genveje, and Catalog facet pickers are resources on this seam, not three competing seams. Expo talks only to that contract.
- **List filter:** Authenticated `GET` collection jerseys accepts optional `shortcutId` (owner’s genvej). Server applies AND of that row’s set facets. Omitting `shortcutId` is Alle. Do not filter kit type on this resource. Response shape stays the existing UserJersey list (ids, resolved labels, user photo URLs) plus whatever the contract already returns.
- **Genveje persistence:** New Collection table (owner `userId`, `name`, `sortOrder`, nullable `countryId` / `leagueId` / `clubId` / `playerId`, timestamps). FKs to stamdata UUIDs. Unique-enough ordering per user. Delete is hard delete. Name is stored string (custom or server-generated from current CatalogLabels at write); do not copy facet names into extra columns.
- **AND match rules:** Country → `Club.countryId`. League → `Season.leagueId`. Club → `UserJersey.clubId`. Player → exists `PlayerClubSeason` for that `playerId` + UserJersey `clubId` + `seasonId`. Nameset/player print on the copy is out of this spec. A missing `Season.leagueId` never matches a league facet.
- **Counts:** Manager count is computed at read time from the owner’s UserJerseys using the same AND rules. Do not store a stale counter as source of truth.
- **Reorder:** Authenticated write of sortOrder for the owner’s rows (patch list or per-row). Chip row order follows sortOrder after Alle.
- **Catalog pickers:** Extend Catalog picker contract with country, league, and player search: `q` + locale, response `{ items: { id, label }[] }` (or named keys consistent with `clubs`). No KitPhoto URLs. Search matches labels and aliases across locales. Club search stays. “Mest brugte” may be computed in Expo from the already-fetched owner list for that facet kind; do not add a global popularity ranking.
- **Auto-name:** Server or client may propose; persisted name is what Gem sends. If client omits name, server builds it from resolved labels of set facets in request locale.
- **Expo chrome:** Follow design-system patterns Collection grid, Collection shortcuts (genveje), Tab bar, Sheet, Select field, Chip `shortcut`. Load Archivo, IBM Plex Sans, IBM Plex Mono. Hide native stack/tab chrome that fights the floating pill. Plus → existing capture flow. Do not implement kit-type chips on Samling.
- **Places:** Søg = search owned UserJerseys (label text). Ønske / Profil = empty states, no wishlist row, no IAP, no invented settings IA. Bell = empty notifications, not a feed.
- **Logo:** Do not add wordmark to Samling. Login/splash may use existing or add the lockup per Logo foundation.
- **Clients:** `apps/mobile` must not import `apps/api` or `packages/db`.
- **Lanes:** Demo against staging catalog after promote. Development Nest remains in VMs.

Shortcut write shape (decision, not a host file). At least one facet required:

```text
{
  name?: string
  countryId?: uuid
  leagueId?: uuid
  clubId?: uuid
  playerId?: uuid
  sortOrder?: number
}
```

## Testing Decisions

Tests cover external behaviour at the highest public interface. They do not assert Drizzle column names, Expo component trees, blur pixel values, or font file hashes.

**Good test:** HTTP (contract parse + Nest) with a signed-in User, known stamdata (Country, League, Club, Season, TeamSeason, Player, PlayerClubSeason), and UserJerseys. Assert 401 without session; owner isolation; Alle vs shortcutId AND; player match via squad not via a fake nameset column; Gem rejected with zero facets; counts; reorder; Catalog picker returns id+label only.

**Seam (one):** `packages/api-contract` `/v1` as implemented by Nest. `/tdd` will not re-quiz this seam.

**Adapters behind the seam (not the test surface):** Postgres via `packages/db`. Two adapters (real vs test DB) make that internal seam real; tests still enter through HTTP.

**Do not add a seam** for Expo UI. Design lock + import-boundary tests are enough. Pixel tests are out. Do not test the throwaway prototype.

**Modules tested:** Collection (list filter + genveje). Catalog (new picker kinds) insofar as the contract is the same `/v1` seam. Identity only as 401/owner.

**Prior art:** `apps/api/tests/collection.test.ts` (register, fixture club/season, Save, list). Catalog club search tests. Schema migrate tests on ephemeral Postgres. Collection tests should insert Country/League/Club/Season/Player/PlayerClubSeason via the schema helper pattern those tests already use, then call the new contract.

## Out of Scope

- Public Astro collection / OG (milestone Public collection web), except logo/OG rules already in the design lock if that milestone reads them.
- Wishlist **content**, IAP, premium entitlement, match push (milestone Wishlist and premium). Ønske tab chrome only.
- Notifications inbox, push, badge counts with real events.
- Profil settings, account delete, KC mark on Profil header.
- Nameset / player print on UserJersey as the player-facet match (squad membership is this spec).
- Kit type as a Samling chip; kit type remains Confirm.
- Admin SPA (KitCollective Admin milestone).
- Serving KitPhoto to Expo.
- Apple / Google login.
- Landing the prototype branch; copying prototype components as shipped UI.
- Brand-book accent as primary CTA; Hjemme/Ude collection mock; labeled tab bar.
- Nested Sheets; a sixth Genveje tab; plus-as-new-shortcut.
- Expo Web as a first-class camera product.

## Linear

- **Project:** KitCollective
- **Mode:** feature
- **Lead:** Nicklas
- **Priority:** None (not named)
- **Milestones** (each is one staging increment — a handful of issues, not the whole product):
  1. Collection home — Signed-in Expo home is Samling with locked chrome (header, 4:5 grid, genveje chips + Sheet, five icon-only tabs). Plus still captures. Demoable: device build against staging catalog; Alle + one AND genvej filters owned UserJerseys. Ready to promote integration → staging when that works for an owner who already has UserJerseys.

## Further Notes

- Glossary: `CONTEXT.md`. Visual: `docs/design-system.md`. Tokens snapshot: `DESIGN.md`.
- Collector registration spec remains `.scratch/collector-registration/spec.md`. Where tab bar / header search / Samling chips disagree, **this document and the design lock win**.
- Foundation spec remains `.scratch/product-foundation/spec.md`.
- Seed catalogs must exist so player/league/country pickers have rows; seed work stays on KitCollective Seed.
- Next slash: `/to-tickets` for vertical slices under Collection home. Do not invent issues from this skill.
