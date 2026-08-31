# Collector browse — Søg, UserJersey detail, Peer Profil

Feature spec for the KitCollective Linear project. Design lock: `docs/design-system.md` (Gap 2026-08-31 — Patterns Søg, Søg catalog drill, UserJersey detail, Peer Profil; hi-fi `.scratch/soeg-browse/claude-design/KitCollective-soeg-og-troejer.html` frames 6a–6d). Domain nouns: `CONTEXT.md` (Private UserJersey, Søg, Søg catalog drill, UserJersey detail, Peer Profil). ADR-0035 (Søg browse stays free). Architecture: `.scratch/Architecture/tech-stack.md` and `data-model.md`.

This spec **does not** replace Indbakke conversation model, Wishlist/Ønske, own Profil settings, Tilføj trøje Confirm, or Astro public web. It **supersedes** Indbakke’s Detaljer stub as the only peer surface, Collection home’s thin foreign path that jumped straight to Send bud, and discover-limited-to-åben-for-bud as Søg’s only job.

Throwaway prototypes under `.scratch/soeg-browse/prototype/` are not the contract and must not be copied into product UI. Hi-fi is visual reference; `docs/design-system.md` wins on conflict.

## Problem Statement

A collector who can Save UserJerseys, Send bud, and open own Profil still cannot browse the social catalog: own copies lack a real manage/detail surface, other collectors are a Detaljer stub, and Søg is only a thin list of bidding-enabled shirts. Agents will keep inventing Discovery tabs, paywalling browse, or treating åben for bud as privacy. Without Nest-owned Private UserJersey rules and Peer Profil + magazine Søg, the product stays a capture app with a bid inbox.

## Solution

Default-visible UserJerseys can be marked **Privat** (clears åben for bud; never Match targets; hidden from Søg, Peer grids, and foreign GET). **UserJersey detail** is immersive photo pager + bottom sheet — own manage/edit/delete, foreign browse → Peer Profil / Favorit / Send bud CTA. **Peer Profil** is identity card + 2-col grid of non-private copies. **Søg** home is a magazine (Klubber → Åbne for bud → Samlere → Flere trøjer); typeahead replaces the magazine and opens Club / Kit / Player drills or Peer Profil. Browse stays free of Entitlement (ADR-0035). Blocked peers are omitted.

## User Stories

1. As a collector after Save, I want my UserJersey visible to other signed-in collectors by default, so that the social catalog fills without an extra publish step.
2. As an owner on UserJersey detail, I want a Privat switch, so that I can hide one copy from Søg, Peer Profil, and foreign GET.
3. As an owner, I want turning Privat on to clear åben for bud and keep it disabled with helper copy, so that private and Match never combine.
4. As an owner, I want åben for bud only while not private, so that bidding stays an explicit visible-copy opt-in.
5. As Nest Match, I want private copies never to be Match targets, so that Wishlist hits cannot leak hidden shirts.
6. As an owner, I want Privat off to restore browse visibility without inventing a second “publish” verb, so that language stays Privat / synlig.
7. As a collector, I want Take-down to remain Staff-only removal, so that Privat is not soft-delete.
8. As an owner opening a Samling tile, I want immersive UserJersey detail (photo stage + bottom sheet), so that I am not stuck on a thin bidding-toggle page.
9. As an owner on detail, I want pager dots when I have more than one photo, so that bagside/mærke are reachable.
10. As an owner on the sheet, I want club, season · type · size · condition, so that meta matches Confirm truth.
11. As an owner, I want Rediger to open Confirm UI as edit that patches the existing UserJersey, so that we do not invent a second form language.
12. As an owner, I want Slet with Sheet confirm, so that delete is deliberate.
13. As an owner, I want no Send bud and no Favorit on my own copy, so that those actions stay peer-facing.
14. As a collector on a foreign UserJersey detail, I want the same immersive chrome, so that own and foreign share one Pattern.
15. As a collector on foreign detail, I want Favorit in top chrome and/or sheet, so that I can save the copy without Send bud.
16. As a collector on foreign detail, I want an owner row to Peer Profil, so that identity is one tap away.
17. As a collector on foreign detail when åben for bud, I want primary Send bud that opens the existing Send bud stack screen, so that the amount field stays there.
18. As a collector on foreign detail when bud is closed, I want no Send bud CTA (honest helper — flag copy), so that we do not lie about bidding.
19. As a collector on foreign detail, I want overflow Rapportér / Blokér, so that Moderation works without an Indbakke thread first.
20. As a collector, I want Tab bar hidden on UserJersey detail, so that the immersive stage is not a tab place.
21. As a collector tapping a Handle on Søg or Detaljer, I want Peer Profil, so that the stub is not the product.
22. As a collector on Peer Profil, I want Avatar, handle, location per Vis by, and About when set, so that identity matches own Profil card anatomy without settings.
23. As a collector on Peer Profil, I want a 2-column grid of that collector’s non-private UserJerseys, so that I can browse their Samling.
24. As a collector, I want private copies omitted from Peer grids, so that Privat is honored.
25. As a collector on Peer Profil, I want no Rediger, Indstillinger, Cookie, or their Favoritter, so that we do not mirror own Profil.
26. As a collector on Peer Profil, I want overflow Rapportér / Blokér, so that safety matches Indbakke.
27. As a collector, I want Tab bar hidden on Peer Profil, so that it is a drill not a fifth place.
28. As a collector tapping a Peer jersey tile, I want foreign UserJersey detail, so that browse precedes Send bud.
29. As a collector on Indbakke Detaljer, I want the first navigate row to open Peer Profil, so that the stub is an entry not a dead end.
30. As a collector on Favoritter, I want tiles to open foreign UserJersey detail (not Send bud alone), so that browse is consistent.
31. As a collector on Søg with empty query, I want title Søg, Search field, and magazine shelves in order Klubber → Åbne for bud → Samlere → Flere trøjer, so that the place feels alive.
32. As a collector, I want empty shelves hidden (no fake rows), so that chrome stays honest.
33. As a collector on Klubber, I want horizontal Marks that open Club catalog drills, so that stamdata has a landing.
34. As a collector on Åbne for bud, I want horizontal 4:5 tiles of bidding-enabled non-private copies, so that bud entry is explicit.
35. As a collector, I want no Bud badge on Flere trøjer tiles, so that marketplace overlays stay off the grid.
36. As a collector on Samlere, I want horizontal avatars/handles to Peer Profil, so that people are findable.
37. As a collector on Flere trøjer, I want a 2-column grid of non-private foreign UserJerseys to foreign detail, so that browse is the default.
38. As a collector typing in Søg, I want the magazine body replaced (not overlaid) with typeahead sections Klubber, Kits, Spillere, Samlere and optional matching jerseys, so that structure matches prototype C / hi-fi 6a.
39. As a collector clearing the query, I want the magazine restored, so that home is stable.
40. As a collector choosing a Kit hit, I want a Kit catalog drill listing only copies with catalogKitId, so that null-Kit Saves stay on Club/Player/Søg home only.
41. As a collector on a Club or Player drill, I want title, Mark, mono count, and 2-col jersey grid, so that “hvem har den” is scannable.
42. As a collector on a catalog drill, I want Tab bar visible with compass active, so that Søg remains the place.
43. As a collector, I want no League / Season / NationalTeam landings in this feature, so that scope stays three drills.
44. As a collector blocked by or blocking a peer, I want their copies and Peer Profil omitted from Søg and drills, so that block is not a browse hole.
45. As a collector without Entitlement, I want Søg magazine, drills, Peer Profil, foreign detail, and Send bud still available, so that ADR-0035 holds.
46. As Nest Collection, I want private persisted on UserJersey, so that Expo is not privacy truth.
47. As Nest Collection, I want setting private to force biddingEnabled false in the same write, so that state cannot diverge.
48. As Nest Collection, I want foreign GET of a private or unknown/taken-down jersey to 404, so that existence is not leaked.
49. As Nest Collection, I want magazine and discover list endpoints to exclude private, own copies where appropriate, and blocked peers, so that Søg cannot show hidden shirts.
50. As Nest Identity, I want a signed-in Peer Profil GET by handle or user id with public fields only, so that settings prefs never leak.
51. As Nest Catalog, I want Club / Kit / Player drill payloads to resolve labels locale → mul → en, so that English seed is not the Danish UI.
52. As Nest Moderation, I want report/block from Peer Profil and foreign detail on the same contract as Indbakke, so that we do not invent a second moderation API.
53. As a client app, I want only packages/api-contract and packages/domain imports, so that Expo never pulls packages/db.
54. As an implementing agent, I want docs/design-system.md Gap 2026-08-31 and hi-fi 6a–6d as visual truth, so that I flag gaps instead of inventing Discovery tabs or hero+strip detail.
55. As Nicklas, I want three staging milestones demoable on device against staging catalog, so that browse can promote independently of Astro and Match-push.
56. As a collector on dark appearance, I want semantic tokens from the lock — not artifact hex from the hi-fi — so that we do not invent a third palette.
57. As a collector, I want Danish chrome on Søg, detail, and Peer Profil, so that the first market can use it.
58. As a collector, I want hit targets ≥ 44 and reduced-motion sheet present without required travel, so that the accessibility floor holds.

## Implementation Decisions

- **Linear:** Feature on existing project **KitCollective**. Three new milestones (below). No second project.
- **Visual lock:** `docs/design-system.md` Gap 2026-08-31 Patterns Søg, Søg catalog drill, UserJersey detail (immersive B), Peer Profil (card+grid A). Hi-fi `.scratch/soeg-browse/claude-design/KitCollective-soeg-og-troejer.html` frames 6a–6d. Design-system wins on conflict with hi-fi hex/icons. Throwaway `prototype/` is not the host API.
- **Modules:** **Collection** owns UserJersey private + bidding coupling, magazine/discover lists, foreign detail GET, Peer jersey grid, favorites navigation target. **Identity** owns Peer Profil public card fields (handle, avatar, about, location/showCity). **Catalog** owns Club/Kit/Player drill identity + label resolution (reuse picker/search). **Moderation** owns report/block from Peer/detail. **Match** skips private copies. **Wishlist/Billing** unchanged for Entitlement gates (browse free).
- **Seam (one):** `packages/api-contract` `/v1` as implemented by Nest (Fastify). Callers and tests cross this interface. Privacy, peer profile, magazine shelves, typeahead, catalog drills, and foreign detail are resources on this seam — not a second public interface.
- **Private UserJersey:** Boolean (or equivalent) on UserJersey; default false (visible). PATCH private true ⇒ biddingEnabled false atomically. Private ⇒ excluded from Søg shelves/typeahead jersey hits, Peer grids, foreign GET (404), Match evaluation.
- **Magazine:** Server may expose one composed Søg-home payload or discrete list endpoints; contract must support empty-shelf omission. Åbne for bud = biddingEnabled && !private && not self && not blocked.
- **Kit drill:** Only UserJerseys with non-null catalogKitId matching that Kit. Copies without Kit remain findable via Club/Player/Flere trøjer when visible.
- **Typeahead:** Query hits CatalogLabel (clubs/players), Kit identity labels, Handles; navigation opens drills/Peer — does not create free-text stamdata.
- **UserJersey detail UI:** Immersive stage + bottom sheet. Own Rediger = Confirm edit/patch. Foreign Send bud = existing stack screen under Søg.
- **Peer Profil:** Public fields only. Title **Profil** (flag Handle-as-title if both required).
- **Detaljer:** First navigate row → Peer Profil (Avatar preferred when available).
- **Clients:** Expo only for this feature’s UI. Admin unchanged except if Grant/comp tooling already exists.
- **Glossary:** Private UserJersey, Søg, Søg catalog drill, UserJersey detail, Peer Profil already in `CONTEXT.md`. ADR-0035 accepted.

Private write (decision shape, not a host file):

```text
PATCH UserJersey
{ private: boolean }
# when private=true → biddingEnabled forced false
```

## Testing Decisions

Tests cover external behaviour at the highest public interface. They do not assert Drizzle column names, Expo navigation stacks, or pixel layouts.

**Good test:** HTTP (contract parse + Nest) with two Collectors and fixture club/season. A Saves visible jersey; B sees it on discover/magazine and Peer grid. A sets private; B’s list omits it; B’s GET by id is 404; Match does not hit it. A sets private while bidding on → bidding false. Blocked peer omitted. Kit drill excludes null catalogKitId. Unauthenticated Peer/Søg → 401. Non-admin irrelevant. Entitlement-less user still GETs Søg/Peer/foreign detail 200.

**Seam:** `packages/api-contract` `/v1` as implemented by Nest. Prefer extending existing collection / identity / moderation contract tests over new seams.

**Modules tested:** Collection (private, lists, foreign GET, peer grid), Identity (Peer Profil), Catalog (drill labels insofar as on `/v1`), Moderation (report/block from new entries), Match (skip private).

**Do not add a seam** for Expo UI. Design lock + import-boundary tests are enough.

**Prior art:** `apps/api/tests/collection.test.ts`, `conversations.test.ts` (peer jersey, discover), `wishlist-match.test.ts` (bidding + two users), identity profile/prefs tests.

## Out of Scope

- League / Season / NationalTeam as own Søg catalog landings.
- Astro public collection / jersey pages (Public collection web milestone).
- Match-push (KIT-137) beyond ensuring private never matches.
- Paywalling Søg / Peer / Send bud.
- Profile-level “hide entire Samling” (per-jersey Privat only this feature).
- Real-time websocket magazine.
- Expo Web as first-class.
- Copying prototype HTML or inventing Discovery as product name.
- Serving KitPhoto on collector surfaces.
- Admin Offer / IAP changes.

## Linear

- **Project:** KitCollective
- **Mode:** feature
- **Lead:** Nicklas
- **Priority:** None (not named)
- **Milestones** (each is one staging increment — a handful of issues, not the whole product):
  1. **UserJersey detail and Private** — Complete when a signed-in owner opens immersive detail from Samling, toggles Privat (clears bud), edits via Confirm patch, deletes; a peer opens foreign immersive detail (Favorit, owner → later Peer or stub entry, Send bud CTA when åben for bud); private copies 404 for peers and never Match. Demoable on device against staging catalog. Ready to promote integration → staging when that works.
  2. **Peer Profil** — Complete when Detaljer / Handle / owner row open Peer Profil (identity card + non-private jersey grid); Rapportér/Blokér work; blocked peers hidden; Tab bar hidden. Demoable with two Collectors. Ready to promote when that works.
  3. **Søg magazine and catalog drills** — Complete when Søg home is magazine shelves (empty hidden); typeahead replaces body; Club/Kit/Player drills list visible copies (Kit requires catalogKitId); Flere trøjer has no Bud badge; browse free of Entitlement; blocked peers omitted. Demoable on device against staging. Ready to promote when that works.

## Further Notes

- Milestone order: (1) → (2) → (3). Peer can land after foreign detail exists; Søg magazine needs Peer + private rules.
- Seed catalogs must exist so magazine shelves and drills have labels; seed stays on Football Data Seed / KitCollective Seed.
- Tickets (Backlog + `ready-for-agent`): KIT-150 Private UserJersey → KIT-151 Immersive own UserJersey detail → KIT-152 Immersive foreign UserJersey detail → KIT-153 Peer profile → KIT-154 Søg magazine home → (KIT-155 Club/Player drills, KIT-156 typeahead) → KIT-157 Kit catalog drill.
- Testing Decisions seam is `/v1` only (confirmed at ticket publish).
