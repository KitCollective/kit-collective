# KitCollective Seed — scoped stamdata ingest

Kickoff spec for the seed Linear project. Code lives in the product git repo at `seed/apify` and `seed/fkapi`. Product host and schema live on **KitCollective** (`.scratch/product-foundation/spec.md`).

## Problem Statement

Nicklas needs football stamdata in KitCollective Postgres — clubs, seasons, players, numbers, then kit identity and archive bytes — without putting scrapers inside Nest or clicking CLI flags. Cloud agents should take a human sentence (“seed Superligaen from the first season to today”) and run the whole pipeline, upserting when a club already exists. Football Kit Archive mapping is useless until Transfermarkt facts for the same scope exist. A wrong default must not write production.

## Solution

A seed CLI behind Seed MCP: the human talks in Cursor; the agent calls tools with a competition and season range. Default lane is the development database on the CX33. Staging only when named. Never production from chat. Apify seed writes facts via Transfermarkt; FK seed then writes Kit + KitPhoto (admin_only, rights unresolved) to R2. Coolify runs the same CLI as jobs, not 24/7 services. Nest never fetches.

## User Stories

1. As Nicklas, I want to write a seed request in Cursor in natural language, so that I never type CLI flags.
2. As Nicklas, I want MCP configured once in Cursor, so that every later chat can drive ingest.
3. As a Cursor agent, I want Seed MCP tools whose descriptions explain competition identity, “0001” = that competition’s first season, and Apify-before-FK, so that I can compose a run without asking Nicklas to SSH.
4. As Nicklas, I want “seed Superligaen from 0001 to today” to run fetch → normalize → map end-to-end, so that I am not stitching steps by hand.
5. As Nicklas, I want the same for Championship or any named competition and range, so that there is no baked-in Denmark dump.
6. As Nicklas, I want a second run for the same club to update, so that I can say “update” when rows already exist.
7. As the mapper, I want upsert on ExternalId `(system, value)`, so that we never insert a duplicate Club or Kit.
8. As Nicklas, I want the default database to be development (CX33 volume), so that casual chats cannot hit live users.
9. As Nicklas, I want staging ingest only when I name staging, so that TestFlight catalog can be filled on purpose.
10. As Nicklas, I want production to be impossible from seed chat, so that a misread sentence cannot fill the live catalog.
11. As a Cursor agent, I want Coolify MCP to start the job on the CX33, so that long fetches do not depend on my laptop staying open.
12. As Nicklas, I want seed to run as Coolify jobs (one-shot / cron), so that we do not pay for two extra daemons beside Nest.
13. As Nest, I want zero imports of `seed/`, so that request-path never calls Apify or FKApi.
14. As Nicklas, I want Apify seed to learn club, league, season, team-season, player, and squad-number facts from Transfermarkt, so that pickers have club-scoped seasons.
15. As Nicklas, I do not want market value, agent PII, or Transfermarkt branding stored, so that we keep facts only (ADR-0002).
16. As the Catalog module, I want English seed strings on CatalogLabel `en` (or `mul` when invariant), so that Danish UI names stay a later fill.
17. As FK seed, I want kit identity (club, season, type, manufacturer) written to Kit, so that stamdata-trøjen exists.
18. As FK seed, I want archive bytes in R2 as KitPhoto with `admin_only` and `rights: unresolved`, so that agents can verify what was fetched without serving renders to Expo, Astro, or OG.
19. As FK seed, I want to refuse a scope whose clubs and seasons are missing, so that Kit always points at our UUIDs, not Transfermarkt ids as PKs.
20. As Nicklas, I want Apify for a scope to complete before FK for that scope, so that mapping can join on ExternalId.
21. As a Cursor agent, I want catalog stats (product API) after a run, so that I can report counts without opening a browser.
22. As Nicklas, I want to inspect upserted rows in Drizzle Studio or Coolify Postgres UI, so that stats are not the only proof.
23. As the CLI, I want a fixture in `seed/*/fixtures/` for a tiny club+season+labels+external ids, so that the mapper can be tested without the network.
24. As the CLI, I want fetch behind an internal adapter, so that tests can fake Apify/FK JSON.
25. As Nicklas, I want forbidden fields dropped in normalize, so that a payload change cannot sneak market value into Postgres.
26. As Coolify, I want job logs for a seed run, so that a failed championship range is diagnosable.
27. As Nicklas, I want R2 writes only to the lane’s bucket, so that development credentials cannot open production objects.
28. As the product schema, I want seed tickets not filed on the KitCollective product board, so that fetch work stays on this project.
29. As a later operator, I want the same CLI to accept a tighter season window, so that we can backfill one year without re-pulling history.
30. As Nicklas, I want NationalTeam facts in scope when the competition is a national-team tournament, so that we do not only model clubs.
31. As the mapper, I want dissolved and renamed clubs to keep their UUID and gain labels/aliases, so that B 1903 does not become a second FCK.
32. As tests, I want a second map of the same fixture to be idempotent, so that upsert is proven.
33. As Nicklas, I want no human-facing seed UI, so that we do not wait on `/to-design`.
34. As CI, I want mapper tests to run without Apify tokens, so that PRs stay hermetic.

## Implementation Decisions

- Location: `seed/apify` and `seed/fkapi` at repo root. Not under `apps/` or `packages/`. Not named `scraper/`. ADR-0003.
- Pipeline per tree: fetch → normalize (our field names + ExternalId) → map into KitCollective Postgres (`DATABASE_URL` for the chosen lane).
- Public interface: one CLI invocation per tree: competition + from-season + to-season + lane. “0001” resolves to that competition’s first season. ADR-0006.
- Seed MCP is a thin adapter over that CLI. Coolify MCP owns host/jobs. Human path is chat, not flags. ADR-0007.
- Lane rule: default `development`; staging if named; production rejected. ADR-0009.
- Apify/Transfermarkt: facts only. ADR-0002. FK bulk identity + bytes. ADR-0005.
- Mapper never uses TM/FK ids as our PK. Upsert key is ExternalId.
- FK map requires existing Club + Season rows for the scope (from Apify). Ordering is an invariant of the MCP tool descriptions and the CLI, not a Nest saga.
- KitPhoto: R2 `kit/{kitId}/…`, never public CDN, never OG.
- Coolify: jobs, not 24/7 seed services. CX33 already runs staging+production Nest; seed jobs must be resource-limited.
- Handoff file `seed/{apify|fkapi}/spec/handoff.md` must be enough for an agent in that tree to run without the PRD (target tables, locale rules, forbidden fields, season label rules, env names, success fixture). Copy from this spec + data-model.
- Product Foundation milestone must have migrated schema before a real Apify run. Ticket-level `blockedBy`, created in `/to-tickets`, not here.
- Do not add a Nest HTTP seed endpoint.

## Testing Decisions

Tests cover external behaviour at the CLI seam. They do not call Transfermarkt, Football Kit Archive, or Apify cloud. They do not assert MCP JSON-RPC framing.

**Seams** (`/tdd` will not re-quiz these):

1. **Seed CLI (highest).** Module: each seed tree. Interface: run with competition + season range + lane + injected fetch adapter + `DATABASE_URL`. Behaviour: normalize, map, upsert, refuse FK when club/season missing, refuse lane `production`, drop forbidden fields. Adapters: fake fetch (fixture JSON), real test Postgres.
2. **Mapper idempotency.** Same CLI twice on the same fixture → same UUIDs, updated labels, no duplicate ExternalId. This is part of seam 1, not a second public interface.
3. **MCP** is configuration over the CLI. Do not unit-test the MCP SDK. Tool schemas must match the CLI interface (competition, from, to, lane). Review that in the ticket; `/tdd` tests the CLI.

Prior art: none in-repo. Fixture shape is specified under `seed/*/fixtures/`.

## Out of Scope

- Coolify install, Drizzle schema, Nest catalog stats (product project).
- Expo, Astro, admin browser, login, Vision, UserJersey.
- Serving archive kit renders to users.
- Licensed Sportmonks/API-Football as the Apify source (explicitly rejected this kickoff).
- World dump; a fixed country list as M1 default.
- Production seed from chat.
- Nest calling Apify/FKApi at request time.
- Patch catalog as truth (propose/backfill later).

## Linear

- **Project:** KitCollective Seed
- **Mode:** kickoff
- **Craft labels:** `craft:backend`
- **Lead:** Nicklas
- **Priority:** None (not named)
- **Milestones** (each is one staging increment — a handful of issues, not the whole product):
  1. Apify seed machine — CLI + Seed MCP + Coolify job path; scoped Transfermarkt facts upsert into the development database; fixtures prove mapper + upsert; production lane rejected. Demoable: Nicklas chats a Superliga range; Catalog stats (product) show clubs/seasons/players; second chat updates rather than duplicates. Ready to promote when the job can also target staging if named.
  2. FK seed machine — same CLI/MCP shape; kit identity + R2 bytes after Apify for that scope; KitPhoto admin_only / rights unresolved; refuse if club/season missing. Demoable: a named scope yields Kit counts and objects in the development R2 bucket, never shown on a public URL.

## Further Notes

- Legal: ADRs 0002 and 0005 consciously supersede `.scratch/Research/catalog-seed-sources.md` for these two pipelines only.
- Glossary: `CONTEXT.md` terms Seed, Seed run, Seed MCP, Apify seed, FK seed, ExternalId, Stamdata, Kit.
