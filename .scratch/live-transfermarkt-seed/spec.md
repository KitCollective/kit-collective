# Live Transfermarkt Seed runs from one sentence

Feature spec on **KitCollective Seed**. Kickoff (`stamdata-seed`) delivered the fixture CLI, mapper, Seed MCP wrapper, and Coolify compose stubs. This slice wires **live** Transfermarkt facts so a human sentence fills Postgres.

## Problem Statement

Nicklas can already talk to a Cursor agent about seed, but live fetch is unwired: the Apify CLI only runs a tiny fixture, Coolify jobs are not deployed, and a second run cannot skip a club-season that already has a squad with numbers. He needs to write one sentence — a club and season, or a league and range — and have Transfermarkt facts (clubs, seasons, players, jersey numbers) land in the development database under our UUIDs, without Nest scraping and without pasting CLI flags.

## Solution

One Seed sentence starts one Seed run for a Seed scope. The agent maps the sentence onto Seed MCP; the job walks Fetch steps internally (club → season → Competition season page or named club → squad; Player profile fetch only if the squad row lacks identity or number). Already seeded club-seasons skip the Transfermarkt hop. A Proof run is one Superliga season, every club, squads and numbers, into development. The same loop then covers Superliga 1995/96–2025/26 or Bundesliga 05/06–19/20. Short club-season runs may execute from Cursor MCP; hours-long Season ranges run as Coolify jobs the chat starts. Nest never fetches. Production stays impossible from chat.

## User Stories

1. As Nicklas, I want to write “Seed FC København 2015/16 including squad and numbers” in Cursor, so that one sentence fills that club-season without CLI flags.
2. As Nicklas, I want to write “Seed Bundesliga from 05/06 to 19/20 including clubs, squads, and numbers”, so that one sentence fills that competition Season range.
3. As Nicklas, I want “Seed Superliga 1995/96 to 2025/26 including clubs, squads, and numbers” to mean every Superliga season in that span, so that I do not list years by hand.
4. As Nicklas, I want the first live accept to be a Proof run (one Superliga season, every club, squads and numbers, development), so that MCP and Postgres are proven before a multi-hour job.
5. As Nicklas, I want the Proof run and a later full Season range to use the same loop, so that the proof is not a different product.
6. As a Cursor agent, I want to resolve a Seed sentence into structured Seed MCP arguments, so that I do not ask Nicklas to SSH or paste flags.
7. As Nicklas, I do not want to @ club then season then squad myself, so that chat stays one sentence.
8. As the job, I want Fetch steps to stay internal, so that the operator protocol is the Seed sentence, not hop-by-hop tools.
9. As the job, I want to resolve the club (FC København / FCK) via Transfermarkt identity, so that nicknames still hit the same ExternalId.
10. As the job, I want to resolve the season label (2015/16, 2015/2016, 05/06), so that split-year aliases mean the same season.
11. As the job, I want the squad list for that club-season, so that players and jersey numbers land in PlayerClubSeason.
12. As the job, I want a Player profile fetch only when a squad row lacks Transfermarkt id or jersey number, so that we do not pay for a fourth hop when the kader is complete.
13. As Nicklas, I want a Seed MCP response that is a short summary (fetched vs skipped vs mapped counts), so that chat is not a nested dump of club plus the entire roster.
14. As Nest, I want zero seed or Apify imports, so that `/v1` never becomes the Transfermarkt client.
15. As Nicklas, I want clubs for a competition season to come from the Competition season page, so that promotion and relegation are included without a hardcoded roster.
16. As Nicklas, I want a Proof run to include every club on that Superliga season’s page, so that “all clubs” is source-driven.
17. As Nicklas, I want FCK 2010/11 skipped on a later run if that club-season already has a squad with numbers, so that we do not re-crawl or insert duplicates.
18. As the job, I want skip to mean skip the Transfermarkt fetch for that pair, not “still scrape and only skip insert”, so that Apify cost and time drop.
19. As the mapper, I want upsert on ExternalId `(transfermarkt, value)`, so that the same vendor id finds the same Club, Player, and Season UUID.
20. As Nicklas, I want our UUID as primary key, so that I can look up catalog rows without using Transfermarkt integers as PKs.
21. As Nicklas, I want a club that already exists to still ingest a later season, so that “club exists” is not “never fetch 2011/12”.
22. As Nicklas, I want an operator-forced refetch later (out of the default path), so that skip is the default not a forever lock.
23. As Nicklas, I want market value, agent PII, and Transfermarkt branding dropped before map, so that facts-only stays locked (ADR-0002).
24. As Nicklas, I want the default lane to be development, so that a casual sentence cannot hit live users (ADR-0009).
25. As Nicklas, I want staging only when I name staging, so that TestFlight catalog fill is deliberate.
26. As Nicklas, I want production rejected from Seed MCP and CLI, so that a misread sentence cannot fill the live catalog.
27. As Nicklas, I want a short club-season Seed run to be allowed from Cursor MCP on a laptop, so that the Proof run and “just FCK 2015/16” do not require Coolify first.
28. As Nicklas, I want a hours-long Season range to run as a Coolify job the chat starts, so that the walk does not die when the Mac sleeps (ADR-0012).
29. As a Cursor agent, I want Coolify MCP to start that job once the resource exists, so that I am not SSHing the CX33.
30. As Coolify, I want the same CLI the Seed MCP wraps, so that local and remote runs are one interface.
31. As Coolify, I want job logs for a failed range, so that a dead Bundesliga walk is diagnosable.
32. As CI, I want hermetic fixtures (nested facts and recorded actor datasets), so that PRs never call Apify or Transfermarkt.
33. As tests, I want a fake FetchAdapter that records which club-seasons were requested, so that skip is proven without the network.
34. As tests, I want a second run of an already mapped club-season not to call fetch for that pair, so that Already seeded is an observable behaviour.
35. As Nicklas, I want CatalogLabel English (or `mul`) from seed strings, so that Danish UI names stay a later fill.
36. As Nicklas, I want FK seed left for after this scope’s facts exist, so that Kit still joins on our UUIDs (ADR-0006).
37. As Nicklas, I want env names `APIFY_TOKEN` and lane `DATABASE_URL` documented without values, so that Cloud Agents and local MCP can be wired without committing secrets.
38. As Nicklas, I want Seed MCP example config to pass those names (not values) into the seed server, so that live fetch is not fixture-only by omission.
39. As the live adapter, I want a pinned Apify Store actor that already returned historical FCK squads with shirt numbers, so that we do not re-shop the Store each run.
40. As the live adapter, I want `superligaen` / Superliga mapped to Transfermarkt `DK1`, and Bundesliga to that competition’s TM code, so that chat names are not Store codes.
41. As Nicklas, I want other competitions to use the same Seed run loop, so that Superliga is the Proof run, not the product ceiling.
42. As Nicklas, I want a missing historical kader (Transfermarkt no longer publishes that season’s squad) to fail that club-season clearly and continue the walk, so that one hole does not abort a thirty-season job.
43. As Nicklas, I want to inspect upserted rows in Drizzle Studio or Coolify Postgres after a Proof run, so that counts in chat are not the only proof.
44. As a Cursor agent, I want product catalog stats after a run when they exist, so that I can report club/season/player/PlayerClubSeason counts.
45. As Nicklas, I want no human-facing seed UI, so that this slice does not wait on `/to-design`.
46. As later operators, I want `0001` on the CLI to mean that competition’s first Transfermarkt season (Superliga 1991/92), so that shorthand still works when someone does not type a label — knowing Nicklas’s sentences use labels like 1995/96, not `0001`.
47. As Nicklas, I want dissolved or renamed clubs to keep their UUID, so that B 1903 does not become a second FCK.
48. As CI, I want forbidden-field stripping still covered, so that a live payload change cannot sneak market value into Postgres.

## Implementation Decisions

- This is a feature on the existing KitCollective Seed project. Do not create a second Linear project. Do not add Nest HTTP seed endpoints.
- Public interface stays the Apify seed CLI / `runSeed` module: a Seed scope plus lane, injected FetchAdapter, lane `DATABASE_URL`. Seed MCP is a thin adapter over that CLI. Coolify jobs invoke the same CLI (ADR-0003, ADR-0007, ADR-0014).
- Seed scope is either (a) club identity + one season label, or (b) competition identity + inclusive Season range. MCP tool input must accept both; the human never chains Fetch steps.
- Internally the live FetchAdapter performs Fetch steps: resolve club, resolve season, list clubs from the Competition season page when the scope is a competition, fetch each club-season squad, Player profile fetch only when a squad row lacks id or jersey number (ADR-0013).
- Pin the live Apify actor to `automation-lab/transfermarkt-scraper` (community Store). Live probe (2026-08-19) returned FCK historical squads with `shirtNumber` on the named `squads` dataset, not the default dataset. Do not re-select an actor per run. Map chat names: Superliga / `superligaen` → TM `DK1`. Bundesliga → that competition’s TM code. Actor input `season` is the start year (2015 means 2015/16).
- Club list for a competition season comes from Transfermarkt’s competition season page for that year, not a hardcoded Superliga twelve (ADR-0011).
- Already seeded: if Postgres already has a squad with jersey numbers for that club + season (PlayerClubSeason rows for that pair), skip the Transfermarkt fetch for that pair and continue (ADR-0010). Upsert on ExternalId still applies when a fetch does run. Default is skip; a forced refetch is a later operator switch, not this slice’s default path.
- `runSeed` orchestrates the walk and skip; it must not require one nested Apify payload for an entire league history. The existing nested Transfermarkt raw shape remains the mapper’s per-batch input after Fetch steps assemble one club-season (or a small season batch).
- Normalize still strips market value, agent PII, and TM branding before map (ADR-0002). Mapper upserts Club, League, Season, TeamSeason, Player, PlayerClubSeason, CatalogLabel, ExternalId. Our UUID is PK.
- Lane rules unchanged: default development; staging only when named; production rejected (ADR-0009).
- Proof run may run from Cursor MCP. A Season range expected to take hours is started via Coolify MCP against a deployed one-shot job (ADR-0012). Compose stubs already exist; this slice must actually deploy the Apify job on the CX33 development environment and document env **names**: `APIFY_TOKEN`, `DATABASE_URL`, `SEED_COMPETITION` / scope args, `SEED_LANE`. Names only in `.env.example` and Seed MCP example config. Values never in git.
- Fixture FetchAdapter remains for hermetic CLI tests. Live adapter is the second adapter at the same FetchAdapter seam. CI never calls Apify.
- `0001` on CLI/MCP means the competition’s first season in Transfermarkt ordering (Superliga inaugural 1991), not “index 0 of whatever was already fetched”. Operator sentences in this feature use labels (1995/96, 05/06). Align Apify season-range resolution with that meaning; do not send `0001` when Nicklas said 1995/96.
- FK seed is not this slice. After facts exist for a scope, existing `seed_fk` remains the kit path (ADR-0005, ADR-0006).
- Failure isolation: a single club-season that Transfermarkt no longer publishes should be reported and skipped; the rest of the Seed run continues.
- Seed MCP chat output is counts and skip/fetch summary, not club-plus-full-roster JSON.

## Testing Decisions

Tests cover external behaviour at the CLI / `runSeed` seam. They do not call Transfermarkt, Apify cloud, or Coolify. They do not assert MCP JSON-RPC framing. They do not inspect private Fetch-step helpers except via the live adapter’s fixture of recorded actor JSON.

A good test: given a Seed scope, an injected FetchAdapter (or recorded actor datasets behind the live adapter), and Postgres, assert which club-seasons were requested, which rows and ExternalIds exist, which jersey numbers landed, and that a second run skips fetch for an Already seeded pair. Do not assert Store actor HTTP details.

**Seams** (`/tdd` and `/implement` will not re-quiz these):

1. **`runSeed` / Apify seed CLI (highest, existing).** Module: Apify seed tree. Interface: Seed scope + lane + injected FetchAdapter + `DATABASE_URL`. Behaviour: walk club-seasons in scope; skip Transfermarkt fetch when that pair is Already seeded; map squad numbers; refuse `production`; drop forbidden fields; continue after a single club-season fetch failure. Adapters: fake fetch that records requested pairs; existing fixture JSON; real test Postgres. Prior art: Apify seed CLI tests with `superliga-mini` fixture and mapper idempotency.
2. **FetchAdapter (existing seam, second adapter).** Interface: `fetch` (or the same module’s public fetch methods) given competition/club/season params. Live adapter maps recorded `automation-lab` dataset items (competition clubs + `squads` with `shirtNumber`; optional player profile only when jersey/id missing) into the mapper’s raw shape, then existing normalize. Behaviour: complete squad list ⇒ no profile hop; missing number ⇒ profile hop used. Adapters: recorded actor JSON fixtures in the seed tree; not live Apify. Prior art: fixture FetchAdapter that returns nested JSON.
3. **Seed MCP** remains configuration over the CLI. Do not unit-test the MCP SDK. Tool schema must accept both Seed scopes (club + one season, or competition + range) and lane rules. Prior art: MCP CLI invocation tests (competition, from, to, lane, production rejected). Review schema in the ticket; `/tdd` still tests the CLI.
4. **Coolify job** is ops wiring, not a unit seam. Contract: same CLI args/env names as Seed MCP. Prove with a deployed development job in the Proof run ticket’s evidence, not CI.

Mapper idempotency stays part of seam 1: second map of the same facts → same UUIDs, no duplicate ExternalId.

## Out of Scope

- FK seed, kit photos, R2, Football Kit Archive.
- Career / national-team jersey tables (`rueckennummern`); only club-season squad numbers.
- Nest catalog HTTP, Expo, Astro, admin UI, Vision, UserJersey, `/to-design`.
- Production seed from chat.
- Choosing a new Apify actor per run; self-hosted felipeall; dcaribou dump as the live source (research notes remain background).
- Hardcoded “Denmark first” world dump.
- Forced refetch CLI flag as a polished operator product (default skip is in; force is a later switch).
- Licensed Sportmonks / API-Football as the Transfermarkt replacement.
- Changing product schema PKs away from UUID.
- Guaranteeing Transfermarkt still publishes every Superliga kader back to 1995/96; holes are reported and skipped.

## Linear

- **Project:** KitCollective Seed
- **Mode:** feature
- **Craft labels:** (unchanged on the project; do not replace) `craft:backend`
- **Lead:** Nicklas
- **Priority:** None (not named)
- **Milestones** (each is one staging increment — a handful of issues, not the whole product):
  1. Apify seed machine — already complete (fixture CLI + MCP + compose stubs).
  2. FK seed machine — already complete (kit path after facts).
  3. Live Transfermarkt from chat — live FetchAdapter + one-sentence Seed scopes + skip Already seeded + Proof run into development Postgres + Coolify job for long Season ranges. Demoable: Nicklas writes a Proof-run sentence; development catalog shows every club that Superliga season with squad numbers; a second sentence for an already seeded club-season skips fetch; a range sentence can be started on Coolify. Ready to promote when the same job can target staging if named.

## Further Notes

- Glossary: Seed run, Seed scope, Fetch step, Player profile fetch, Proof run, Already seeded, Competition season page, ExternalId, Season range, Lane (`CONTEXT.md`).
- ADRs: 0002 (facts only), 0003 (seed in product repo), 0006/0014 (scoped run + one sentence), 0007 (chat + MCP), 0009 (no production), 0010 (skip fetch), 0011 (clubs from season page), 0012 (long runs on Coolify), 0013 (internal Fetch steps).
- Research that fed this feature (not tickets): `.scratch/Research/apify-transfermarkt-actors.md`, `superliga-seed-standup.md`. Live probe used named dataset `run.output.squads`; default dataset was empty.
- Kickoff spec `stamdata-seed` still holds for mapper tables, locale, forbidden fields, and FK ordering. This document adds live fetch, skip, Seed scope, and Coolify execution.
- Next step: `/to-tickets` under milestone **Live Transfermarkt from chat**. Do not file tickets from this skill.
