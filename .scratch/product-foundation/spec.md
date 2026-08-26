# KitCollective — product foundation and map

Kickoff spec for the product Linear project. Seed ingest lives on the **Seed** project (`.scratch/stamdata-seed/spec.md`). Same git repo.

## Problem Statement

Nicklas cannot run KitCollective yet: there is no Coolify host, no Postgres lanes, and no Drizzle schema for stamdata or User. Cloud agents have nowhere durable to point `DATABASE_URL`. After a seed run there is no Nest surface that proves rows landed — only hope and a local laptop database the VMs cannot see. Design and collection UI are still unchosen, so the product must exist as host + schema + catalog stats without inventing taste.

## Solution

Stand up the CX33 with Coolify: staging and production Nest on the box, a development Postgres volume on the same box, Nest for development in Cursor / cloud-agent VMs. Migrate stamdata tables plus `User`. Expose read-only catalog stats so a seed run is visible. Later milestones on this project are the collector product (Expo Save, Astro, wishlist) after `/to-design`. Seed fetch stays out of Nest and off this board.

## User Stories

1. As Nicklas, I want Coolify on the Hetzner CX33 in Nürnberg, so that staging and production Nest have a real host.
2. As Nicklas, I want staging and production as separate Coolify environments on that one VPS, so that TestFlight can hit an isolated API without a second machine.
3. As Nicklas, I want development Nest to keep running in Cursor / cloud-agent VMs, so that an 8 GB box is not running a third app stack.
4. As a cloud agent, I want the development database on the CX33, so that I am not pointed at a laptop Postgres I cannot reach.
5. As Nicklas, I want that development Postgres capped in memory and disk, so that a seed run cannot starve production.
6. As Nicklas, I want Coolify MCP authenticated in Cursor, so that an agent can operate the panel and jobs without me SSHing by habit.
7. As Nicklas, I want GitHub Environments `development`, `staging`, and `production` to hold lane secrets, so that production credentials never sit in staging or in client apps.
8. As Nicklas, I want `DATABASE_URL` for development to be the CX33 volume, so that local Cursor and cloud agents share one schema.
9. As Nicklas, I want staging Postgres on its own volume, so that seed-into-staging cannot share production data.
10. As Nicklas, I want production Postgres on its own volume, so that live users are isolated.
11. As Nicklas, I want Cloudflare R2 buckets per lane, so that kit archive bytes never land on the 80 GB disk.
12. As the API, I want to store only object keys in Postgres, so that JPEGs are not bytea.
13. As Nicklas, I want Drizzle in `packages/db` as the only schema owner, so that clients never import the database.
14. As Nicklas, I want a fresh migrate to create stamdata tables, so that seed has somewhere to write.
15. As the Catalog module, I want Country, League, Club, NationalTeam, Season, TeamSeason, Player, PlayerClubSeason, Manufacturer, Kit, KitPhoto, CatalogLabel, and ExternalId, so that Apify and FK seed can map into our UUIDs.
16. As the Catalog module, I want no `name` column on those identity tables, so that English seed strings cannot become the Danish UI.
17. As the Catalog module, I want CatalogLabel with locale and kind (label vs alias), so that `Danmark` and `Denmark` are one country.
18. As the Catalog module, I want our UUID as primary key, so that Transfermarkt and FK ids hang on ExternalId.
19. As the mapper (seed project), I want ExternalId unique on `(system, value)`, so that a second seed run upserts instead of duplicating clubs.
20. As Nicklas, I want a `User` table with email + password hash and role `user` | `admin`, so that accounts exist before any login UI.
21. As Nicklas, I do not want UserJersey, photo, Vision, or wishlist tables in the first migration, so that we do not design the collection while taste is open.
22. As a cloud agent, I want `GET /v1/catalog/stats` to return counts, so that I can see a seed run landed without a catalog browser.
23. As Nicklas, I want those stats to exclude KitPhoto bytes, so that unresolved archive renders never leak to a client.
24. As Nicklas, I want to inspect rows in Drizzle Studio locally and in Coolify’s Postgres UI, so that stats are not the only verification.
25. As Nest, I want a healthcheck that proves Postgres connectivity, so that Coolify can restart a dead container.
26. As Nicklas, I want staging Nest reachable at the staging API hostname, so that catalog stats can be curled against staging when we name that lane.
27. As a client app, I want to import only `packages/api-contract` and `packages/domain`, so that I never pull `packages/db`.
28. As Nest, I want to be the only process that reads database secrets, so that Expo and Astro stay secret-free.
29. As Nicklas, I want path-filtered CI, so that a docs-only commit does not rebuild mobile.
30. As Nicklas, I want `seed/` excluded from the API Docker image, so that Nest cannot import Apify or FK fetch at request time.
31. As a collector (later milestone), I want to register owned shirts in Expo, so that I am not stuck in Facebook groups and spreadsheets.
32. As a collector (later), I want Save to succeed with club + season + type + size + condition + a photo even if Kit is missing, so that a thin catalog does not blow 45 seconds.
33. As a collector (later), I want Vision to suggest catalog UUIDs without blocking Save, so that inference is a shortcut not a gate.
34. As a collector (later), I want a public Astro page for a collection, so that I can share into a Facebook group.
35. As a collector (later), I want a wishlist that can match, so that I have a reason to open the app again.
36. As Nicklas (later), I want `/to-design` before collection UI, so that agents do not invent taste.
37. As the Identity module (later), I want email + password sign-in on the `User` row we already migrated, so that we do not add Clerk.
38. As staging automation, I want a completed foundation milestone to be the unit that promotes `development` → `staging`, so that we do not dump the whole product at once.

## Implementation Decisions

- Two Linear projects, one git repo (`kit-collective`). This board owns Coolify, schema, Nest, later clients and design. Seed fetch tickets stay on KitCollective Seed. ADR-0004, ADR-0003.
- Host: one Hetzner CX33 Nürnberg, Coolify, Docker. Staging + production Nest + Postgres + Redis (Redis required when BullMQ lands; not required to serve catalog stats). Development Nest stays in VMs. Development Postgres is the exception on the box. ADR-0008. Server lock: `.scratch/Architecture/server-stack.md`.
- Object storage: R2 per lane. `KitPhoto` keys `kit/{kitId}/…`, `rights: unresolved`, `admin_only`. User photo prefix is not in the first schema.
- Schema module: `packages/db` (Drizzle). Only `apps/api` imports it. First migration = stamdata list in story 15 + `User`. No Patch / KitPatchCandidate / UserJersey / VisionLog / Entitlement in this increment.
- CatalogLabel: one label per `(entity, locale)`; many aliases; locales `da | en | sv | no | mul`; English seed → `en`; invariant strings → `mul`; resolve request → `mul` → `en`.
- Season uses a season code (`1998/99` vs `2026`), not CatalogLabel.
- Identity: `User` row only. No Passport routes, no JWT login, no Apple/Google in this increment.
- Nest: modular monolith, Fastify, `/v1`. Catalog module owns stats. Identity module owns the User table but not HTTP auth yet.
- Catalog stats contract (Zod in `packages/api-contract`): authenticated or network-restricted read of integer counts per stamdata entity (and User count). No label text dumps, no image URLs, no archive bytes.
- Seed code at top-level `seed/apify` and `seed/fkapi` must not be imported by Nest. Product Docker and CI path-filter it out.
- Coolify MCP auth is human setup (Cursor). Not a Nest feature.
- ADRs in force: 0003, 0004, 0008, 0009 (seed default lane is a seed-project rule but product staging/production DBs must refuse casual seed; product should not expose a public seed HTTP API).
- Later milestones on this project require `/to-design` before Expo/Astro UI. Do not implement collection in the foundation increment.
- Default git integration lane is `development`. Do not push staging or production from an issue land.

## Testing Decisions

Tests cover external behaviour at the highest public interface. They do not assert Drizzle internals, Coolify panel clicks, or Transfermarkt HTML.

**Seams** (`/tdd` will not re-quiz these):

1. **Catalog stats (HTTP contract).** Module: Catalog. Interface: `GET /v1/catalog/stats` as defined in `packages/api-contract`. Adapter: Nest handler reading `packages/db`. Tests insert known stamdata via the schema (or a test helper that uses the schema), call the contract, assert counts. Do not test SQL strings.
2. **Schema (Drizzle public tables).** Module: `packages/db`. Interface: migrations + table shapes and invariants (UUID PKs, no `name` on identity tables, CatalogLabel uniqueness for `(entityType, entityId, locale, kind=label)`, ExternalId uniqueness `(system, value)`, User email uniqueness). Adapter: Postgres. Tests run migrate on a fresh database (CI ephemeral Postgres is fine; the development CX33 volume is not required for unit/integration tests).
3. **Import seam (static).** Nest and clients must not import `seed/`. Clients must not import `packages/db` or `apps/api`. Enforce with existing repo rules / lint, not a runtime test.

Host and Coolify are ops. A healthcheck that fails when Postgres is down is enough; do not mock Traefik.

Prior art: none — the application tree is unscaffolded.

## Out of Scope

- Seed fetch, Apify, Football Kit Archive, Seed MCP, Coolify seed jobs (Seed project).
- Login UI, Passport, IAP, Expo, Astro, admin catalog browser, `/to-design`.
- UserJersey, Vision, wishlist, patches as truth, serving KitPhoto to Expo/Astro/OG.
- Production seed from chat.
- Kubernetes, Neon, Nest microservices, a third Nest on the CX33, PR preview deploys on this box.
- Machine-translating CatalogLabel into `da` / `sv` / `no`.

## Linear

- **Project:** KitCollective
- **Mode:** kickoff
- **Craft labels:** `craft:backend` (Linear Craft group allows one label; foundation is host + schema + Nest)
- **Lead:** Nicklas
- **Priority:** None (not named)
- **Milestones** (each is one staging increment — a handful of issues, not the whole product):
  1. Foundation host and stamdata schema — Coolify on the CX33 with staging + production Nest and a capped development Postgres; Drizzle stamdata + `User` migrated; `GET /v1/catalog/stats` on Nest; R2 buckets per lane; seed/ not in the API image. Demoable: curl stats against a migrated database; cloud agent uses the remote development `DATABASE_URL`. Ready to promote integration → staging when this milestone’s issues are Done.
  2. Collector registration — Expo Save of a UserJersey (club + season + photo) after `/to-design`. Demoable: jersey #2 in 45s on a device build. Ready to promote when Save works against staging catalog.
  3. Public collection web — Astro read-only collection and kit pages, OG from user photos not archive renders. Demoable: share a URL into a group.
  4. Wishlist and premium — structured wishlist + IAP entitlement on Nest. Demoable: a match notification path on staging.

## Further Notes

- Glossary: `CONTEXT.md`. Architecture lock: `.scratch/Architecture/tech-stack.md` and `data-model.md`. If a ticket fights those, change the lock first.
- Seed handoff for mappers is the sibling spec `.scratch/stamdata-seed/spec.md`.
- Human must authenticate Coolify MCP before agents can operate the panel.
