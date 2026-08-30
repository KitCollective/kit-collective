# Football Data Seed

Kickoff spec for the Linear project that succeeds KitCollective Seed. Code stays in the product git repo (`seed/` trees, reshaped). Product host and collector surfaces stay on **KitCollective**.

## Problem Statement

Nicklas can already run Transfermarkt and Football Kit Archive ingest, but the path is too complex and too thin: one sentence walks everything, fetch hops stay internal, and a club or player landing in Postgres is little more than id, name, and squad number. He cannot see what each vendor actually offers, so a later UI or backend flow forces a second vendor hop. Coolify MCP and seed chat got tangled. He needs a seed board that starts with Vendor research, then proves Hierarchy grains (Club and NationalTeam as siblings), then kits with sponsor and colours, then a Join workflow, then Seed MCP on its own URL — all human-only, never Nest scraping, never production from chat.

## Solution

A new Linear project, **Football Data Seed**, with four staging increments. The first issue is Vendor research for both Transfermarkt and Football Kit Archive; it blocks every later issue. Each milestone still opens with a focused research slice. Public interface is the Hierarchy grain (fetch → normalize → map + Seed reference), writing a Rich grain: take every usable fact while on that page. Club and NationalTeam are siblings. Hierarchy proof is Superliga 2010/11 and Denmark men at World Cup 2010. FK after facts writes Kit identity, sponsor, colours, and admin_only bytes. Join workflow composes a named season. Cross MCP is Seed MCP on its own hostname with a Seed MCP token. Coolify may host the container; Coolify MCP stays Docker and host only. Issues stay `ready-for-human`. Reshape the existing seed trees; do not start a third scraper folder.

## User Stories

1. As Nicklas, I want a Linear project named Football Data Seed, so that seed work has one board and KitCollective Seed can close as the predecessor.
2. As Nicklas, I want every issue on that board labelled `ready-for-human` only, so that planner and PI never dispatch this work.
3. As Nicklas, I want the first issue to be Vendor research for Transfermarkt and Football Kit Archive, so that no grain is implemented before we know what data exists and what we will keep.
4. As Nicklas, I want that Vendor research issue to block every other Football Data Seed issue, so that later slices cannot start on a guessed field catalog.
5. As Nicklas, I want Vendor research to list fields we can pull per Hierarchy grain, so that I can see club depth, player honours and registration, kit sponsor and colours, and what we still drop (market value, agent PII, vendor branding).
6. As Nicklas, I want Vendor research to say which fields are stamdata now versus later UI or backend leverage, so that we do not invent columns in the dark.
7. As Nicklas, I want each later milestone to open with a focused research slice, so that Transfermarkt, FK, Join workflow, and Seed MCP each start from a named catalog, not from memory.
8. As Nicklas, I want breadth to stay small (Hierarchy proof seasons, not every league), so that research and proof stay demoable.
9. As Nicklas, I want depth on a Club grain: when we are on that club, take every usable fact Vendor research named, so that a later frontend does not need a second Transfermarkt run for the same club.
10. As Nicklas, I want the same Rich grain for a Player (honours, registration / parent club vs loan, and other facts research keeps), so that player UI and backend flows can use what was already on the page.
11. As Nicklas, I want the same Rich grain for League, League season, NationalTeam, and NationalTeam season, so that no grain is a thin id+name stub.
12. As the mapper, I want market value, agent PII, and Transfermarkt branding still dropped, so that Rich grain does not undo ADR-0002.
13. As Nicklas, I want a Seed reference per Hierarchy grain, so that inputs, output fields, ExternalId, and forbidden fields are documented next to the seed tree — not as Nest OpenAPI.
14. As Nicklas, I want to fetch one League grain and write League + CatalogLabel + ExternalId, so that I can prove that grain alone.
15. As Nicklas, I want to fetch one League season grain (Competition season page), so that the club or NationalTeam list for that season is source-driven.
16. As Nicklas, I want to fetch one Club grain with Rich grain facts, so that I do not only store name and country.
17. As Nicklas, I want to fetch one Club season grain (squad and numbers plus research-kept facts), so that Player and PlayerClubSeason rows exist for that pair.
18. As Nicklas, I want to fetch one NationalTeam grain as a sibling of Club, so that Denmark is never a Club row.
19. As Nicklas, I want to fetch one NationalTeam season grain, so that a tournament squad writes to our UUIDs without stuffing kits onto a Club.
20. As Nicklas, I want to fetch one Player grain when the squad row lacks identity, so that Player profile fetch stays the extra hop, not the default.
21. As Nicklas, I want Hierarchy proof for Superliga 2010/11: every Club grain that season, facts in development, so that Club path is accepted before a multi-year range.
22. As Nicklas, I want Hierarchy proof for Denmark men at World Cup 2010, so that NationalTeam path is accepted in the same milestone.
23. As Nicklas, I want women’s national sides to use the same loop, so that the men’s World Cup 2010 proof is not a forever ceiling.
24. As Nicklas, I want Already seeded to skip a club-season or national-team-season that already has a squad with numbers, so that a second proof does not re-crawl.
25. As the mapper, I want upsert on ExternalId, so that a second map of the same vendor id updates rather than duplicates.
26. As Nicklas, I want our UUID as primary key, so that Transfermarkt integers never become PKs.
27. As Nest, I want zero seed imports and no `/v1` seed endpoints, so that the request path never fetches Transfermarkt or FK.
28. As Nicklas, I want Catalog peek to keep showing counts after a grain or Join workflow, so that I can eyeball results without a product admin.
29. As Nicklas, I want milestone 2 to open with FK Vendor research (sponsor, colours, kit types, national vs club kits), so that Kit columns are named before fetch.
30. As Nicklas, I want FK after facts: no kit fetch until Club or NationalTeam plus Season rows exist for that scope, so that Kit points at our UUIDs.
31. As Nicklas, I want a Club on Transfermarkt to yield that club’s kits on Football Kit Archive without searching from scratch, so that mapping is identity-join, not a new hunt.
32. As Nicklas, I want the same for a NationalTeam side, so that Denmark kits are not stored on a Club.
33. As Nicklas, I want Kit identity to include type, manufacturer, sponsor, and colours when Vendor research keeps them, so that later UI and backend flows can use shirt context without a second FK hop.
34. As Nicklas, I want archive bytes in the lane R2 bucket as KitPhoto `admin_only` with rights unresolved, so that operators can verify fetches without Expo, Astro, or OG showing them.
35. As Nicklas, I want FK to refuse a scope whose sides and seasons are missing, so that we never write Kit against vendor ids as PKs.
36. As Nicklas, I want milestone 3 to open with Join workflow research (what “complete season” means in Postgres and R2), so that compose is specified before the walk.
37. As Nicklas, I want a Join workflow for Superliga 2010/11 that fills every club, squads, and then FK kits on those clubs, so that one named season is talt and joined.
38. As Nicklas, I want a Join workflow for Denmark men World Cup 2010 that fills the side, squad, and then FK kits, so that national compose is proven too.
39. As Nicklas, I want Join workflow to prove stamdata rows and image bytes in the development lane, so that “correctly in the database” is demoable.
40. As Nicklas, I want the one-sentence Seed run to be the Join workflow accept (ADR-0014), so that humans do not @ grain by grain for a season walk — grains stay the first public interface, the sentence comes third.
41. As Nicklas, I want milestone 4 to open with Seed MCP research (URL, token, tool shapes over grains and Join workflow), so that the server is specified before it is hosted.
42. As Nicklas, I want Seed MCP on its own unique hostname, so that ingest is never Coolify’s MCP URL.
43. As Nicklas, I want Coolify to host the Seed MCP container if we choose, so that Docker management stays Coolify’s job.
44. As Nicklas, I want ingest chat to call only the Seed MCP URL, so that Coolify `control` never starts a Seed scope.
45. As Nicklas, I want long jobs to run inside the Seed MCP service, so that a Superliga walk does not die when a laptop sleeps and does not go through Coolify MCP.
46. As Nicklas, I want a Seed MCP token (bearer, fail closed) on every request, so that the URL is not an anonymous public MCP.
47. As Nicklas, I want the token env name documented and the value never in git, so that Coolify’s API token stays a different secret.
48. As Nicklas, I want Seed MCP to speak Hierarchy grains and Join workflow, so that a human sentence in milestone 4 composes what milestones 1–3 already proved.
49. As Nicklas, I want `kc_seed_mcp` stdio treated as the predecessor, so that Cross MCP accept is the URL server, not the old wrapper.
50. As Nicklas, I want default lane development, staging only when named, production rejected, so that casual ingest cannot hit live users.
51. As tests, I want hermetic fixtures and a fake FetchAdapter, so that CI never calls Transfermarkt, FK, or Apify.
52. As tests, I want a second map of the same Rich grain fixture to be idempotent, so that upsert and depth survive a re-run.
53. As Nicklas, I want Opt-in Apify to stay opt-in, so that Kader fetch remains the live Transfermarkt path unless I choose otherwise.
54. As Nicklas, I want no human-facing seed UI and no `/to-design` on this project, so that we do not wait on collector chrome.
55. As a later operator, I want Bundesliga or another named competition to use the same grain and Join workflow loop, so that Superliga is the proof, not the ceiling.
56. As Nicklas, I want dissolved or renamed clubs to keep their UUID, so that B 1903 does not become a second FCK.

## Implementation Decisions

- Linear: create Football Data Seed (`planned`, `craft:backend`, lead Nicklas). Close KitCollective Seed as predecessor (ADR-0031). Still two projects, not three (ADR-0004).
- Human-only ingest: `/to-tickets` labels every issue `ready-for-human` only. Never `ready-for-agent`. Planner does not claim.
- Vendor research is the first issue and `blockedBy`-blocks all other Football Data Seed issues. It covers both Transfermarkt and Football Kit Archive. Each later milestone still opens with a focused research slice (FK depth, Join compose, Seed MCP URL/token/tools).
- Breadth stays Hierarchy proof (Superliga 2010/11 and Denmark men World Cup 2010). Depth is Rich grain: while on an entity, persist every field Vendor research accepted.
- Facts-only remains (ADR-0002): drop market value, agent PII, vendor branding. Rich grain is more facts, not those fields.
- Public interface of milestone 1 is the Hierarchy grain, not the one-sentence Seed run (ADR-0032). Club and NationalTeam are sibling grains (own tables, own kit FKs).
- Reshape the existing Transfermarkt seed tree, FK seed tree, and seed-shared module. Do not add a third scraper tree. Do not put fetch in Nest.
- Existing FetchAdapter seam stays: live Kader fetch (Seed proxy), Opt-in Apify, fixture adapter. Grain run injects the adapter. Normalize then map. Upsert on ExternalId. Our UUID is PK.
- Schema may grow after Vendor research (club depth, player honours/registration, kit colours). `Kit.sponsorName` already exists; colours and other kept fields get columns or CatalogLabel only when research names them. Migrations stay reversible. Seed tickets do not land schema on the product board unless a product slice must consume a new column — then that is a product issue, not a silent Nest scrape.
- Seed reference: markdown beside each seed tree (inputs, outputs, ExternalId, forbidden fields). Catalog peek stays counts. Not Nest OpenAPI. Not `/to-design`.
- FK after facts: Club or NationalTeam + Season must exist. Club kits and NationalTeam kits are sibling grains in milestone 2. Bytes to lane R2, KitPhoto admin_only, rights unresolved. Never Expo/Astro/OG.
- Join workflow (milestone 3) composes grains: named competition season → sides → squads → FK kits. ADR-0014 sentence is this milestone’s operator protocol. Seed run is not the first accept.
- Seed MCP (milestone 4, ADR-0033, ADR-0034): own hostname, bearer Seed MCP token, fail closed. Coolify may host the container. Coolify MCP is Docker/host only. Long jobs run in the Seed MCP service. `kc_seed_mcp` stdio is predecessor.
- Lane rule unchanged (ADR-0009): default development; staging if named; production rejected.
- NationalTeam gender stays on the existing table. First NationalTeam proof is men. Women’s sides are the same loop later.

## Testing Decisions

Tests cover external behaviour at the highest public interface. They do not call Transfermarkt, Football Kit Archive, or Apify. They do not assert MCP JSON-RPC framing. They do not snapshot private hop names.

**Good test:** one grain or one Join workflow, injected adapters, real test Postgres (and fake object store for kits). Assert row counts, ExternalId upsert, forbidden fields absent, Rich grain fields present when the fixture includes them, isolation (out-of-scope seasons unchanged), Already seeded skip. Second run is idempotent.

**Seams** (`/tdd` will not re-quiz these):

1. **Hierarchy grain run (highest).** Module: reshaped Transfermarkt seed tree and FK seed tree. Interface: grain kind + identity + lane + injected FetchAdapter (and object-store adapter for kits) + lane database. Behaviour: fetch → normalize → map, Rich grain fields from the accepted catalog, refuse FK when sides/seasons missing, refuse lane `production`, drop forbidden fields. Adapters: fixture fetch, fake object store, test Postgres. This is the existing `runSeed` / FK run seam, per grain, not a new Nest interface.
2. **FetchAdapter (existing).** Two live adapters plus fixture already prove the seam. Grain tests inject a fake; live adapters stay out of CI.
3. **Join workflow.** Module: compose grain runs for a named competition season (Club path or NationalTeam path, then FK). Interface: Seed scope + lane + same injected adapters. Behaviour: Superliga 2010/11 or Denmark World Cup 2010 shaped fixtures produce complete sides, squads, kits, and photo writes. Not a second public HTTP surface.
4. **Seed MCP** is a thin HTTP adapter over grain run and Join workflow. Do not unit-test the MCP SDK. Review tool schemas against those interfaces on the ticket. `/tdd` tests the modules the server calls, plus fail-closed missing token at the server’s auth adapter if one exists.

**Prior art:** Transfermarkt CLI/mapper/skip/scope-isolation tests; FK seed tests with fixture scope and fake object store; seed-shared scope and lane tests.

Vendor research itself is not a `/tdd` seam. Its accept is a written field catalog in the Seed reference (and CONTEXT terms if new nouns appear). Implement issues that follow treat that catalog as given.

## Out of Scope

- Collector UI, Expo, Astro, OG, or serving archive JPEGs on a public URL.
- Nest `/v1` seed endpoints or Nest fetching vendors.
- `/to-design` and Admin SPA work (Catalog peek stays unstyled counts).
- PI dispatch, `ready-for-agent`, planner claim on this board.
- A third Linear project, a third scraper tree, or keeping KitCollective Seed alive beside this board.
- Full Season range 1995/96–2025/26 as the first accept.
- Women’s NationalTeam as the first NationalTeam proof.
- Market value, agent PII, Transfermarkt branding stored as stamdata.
- Fusing TM and FK into one MCP tool before Join workflow is proven.
- Coolify MCP as the ingest interface; sharing Coolify’s MCP URL with Seed MCP.
- Installing Seed MCP on the PI worker as factory dispatch.
- Product Vision, Wishlist, Entitlement, or other collector features.

## Linear

- **Project:** Football Data Seed
- **Mode:** kickoff
- **Craft labels:** `craft:backend`
- **Lead:** Nicklas
- **Priority:** None (not named)
- **Milestones** (each is one staging increment — a handful of issues, not the whole product):
  1. Transfermarkt hierarchy — Vendor research (both vendors) accepted and blocking; Hierarchy grains fetchable with Rich grain + Seed reference; Superliga 2010/11 Club proof and Denmark men World Cup 2010 NationalTeam proof in development. Ready to promote when the same grains can target staging if named.
  2. Football Kit Archive hierarchy — Focused FK research accepted; given a TM Club or NationalTeam, kits (sponsor, colours, identity) and admin_only bytes land without a fresh search; FK after facts enforced. Ready to promote when the same kits can target staging if named.
  3. Join workflow — Focused compose research accepted; Superliga 2010/11 and Denmark World Cup 2010 walks produce joined stamdata and image bytes in the lane; one-sentence Seed run is this accept. Ready to promote when the same walk can target staging if named.
  4. Cross MCP — Seed MCP research accepted; own URL, Seed MCP token fail closed; Coolify hosts the container if we choose; ingest chat never uses Coolify MCP; `kc_seed_mcp` is predecessor. Ready to promote when the same URL can target staging if named.

## Further Notes

- Vendor research field catalog (KIT-138): [field-catalog.md](./field-catalog.md). Seed references: `seed/apify/reference.md`, `seed/fkapi/reference.md`. Postgres landing: [schema-gap.md](./schema-gap.md).
- `/to-tickets` must create the Vendor research issue first, on milestone 1, `ready-for-human` only, and relate `blockedBy` from every other issue on this project to that issue (or to a completed predecessor in the same chain). Do not publish those issues from this skill.
- Speech-to-text “owners” on the player page is treated as honours and registration (parent club vs loan) until Vendor research names the exact fields.
- Kit already has `sponsorName`. Colours and other kept kit facts are research output, then schema if needed.
- Existing locks that still hold: Seed proxy, Kader fetch, Opt-in Apify, ExternalId, Already seeded, Catalog peek, lane rules, facts-only.
