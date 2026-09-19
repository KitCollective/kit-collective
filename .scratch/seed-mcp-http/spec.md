# Seed MCP on its own URL

Feature spec for Football Data Seed milestone **Cross MCP**. Kickoff spec stays the project map; this document is the given for hosting Seed MCP after the Seed MCP catalog (KIT-147) is signed.

## Problem Statement

Nicklas can run Hierarchy grains and the Join workflow from CLI, but ingest chat still talks to a laptop stdio predecessor (`kc_seed_mcp` with `seed_apify` and `seed_fk` only). Coolify MCP is the Docker catalog, not ingest. A Superliga walk dies if the Mac sleeps. There is no unique Seed MCP URL, no Seed MCP token on HTTP, and no chat tools that speak grains and Join. He cannot treat Cross MCP as done until a hosted server on its own hostname accepts a human sentence without going through Coolify `control`.

## Solution

Host Seed MCP on Coolify with its own URL (`SEED_MCP_URL`, path `/mcp`, Coolify auto-FQDN via sslip.io until a named DNS exists) and a bearer Seed MCP token (`SEED_MCP_TOKEN`, fail closed). Cursor keeps server id `kc_seed_mcp` and switches that entry to Streamable HTTP. Chat tools are `seed_grain` and `seed_join` (Join composes FK after facts). Stdio stays an in-tree debug binary. Coolify MCP stays Docker and host only. Long jobs run inside the Seed MCP service. No hosted FKApi: the service sets `SEED_FK_FETCH=fixture` unless `FKAPI_BASE_URL` is set. Human-only ingest: issues stay `ready-for-human`.

## User Stories

1. As Nicklas, I want Seed MCP listening on a URL that is never Coolify’s MCP URL, so that ingest and Docker catalog cannot be confused.
2. As Nicklas, I want that URL’s path to be `/mcp`, so that Streamable HTTP has one POST/GET endpoint like the Coolify MCP pattern.
3. As Nicklas, I want the hostname to be Coolify’s auto-FQDN (sslip.io) when the app is created, so that we do not invent a production domain in git.
4. As Nicklas, I want the client env name `SEED_MCP_URL` documented, so that Desktop and Cloud Agent wire the same name without committing the value.
5. As Nicklas, I want Coolify to create and run the Seed MCP container in this increment, so that laptop-only HTTP is not Cross MCP accept.
6. As Nicklas, I want ingest chat to call only `SEED_MCP_URL`, so that Coolify `control` never starts a Seed scope.
7. As Nicklas, I want long Join and grain jobs to run inside that Seed MCP process, so that a Superliga 2010/11 walk survives a laptop sleep and does not go through Coolify MCP.
8. As Nicklas, I want every HTTP request to carry `Authorization: Bearer` from `SEED_MCP_TOKEN`, so that the URL is not an anonymous public MCP.
9. As Nicklas, I want the process to refuse to serve Streamable HTTP if `SEED_MCP_TOKEN` is unset or empty, so that a misconfigured host fails closed at boot.
10. As Nicklas, I want a request without a matching bearer to receive HTTP 401 and not run a grain or Join, so that a leaked URL without the token cannot ingest.
11. As Nicklas, I want `SEED_MCP_TOKEN` to be a different secret from `COOLIFY_API_TOKEN`, so that rotating Coolify access cannot open ingest.
12. As Nicklas, I want the token value never in git, logs, or Expo/Astro/admin bundles, so that only operator env holds it.
13. As Nicklas, I want the server copy of the token in Coolify app env and the client copy under the same name on Desktop and Cloud Agent, so that Bearer wiring matches Coolify MCP’s private-operator pattern.
14. As Nicklas, I want v1 to stay a static bearer, so that we do not stand up an OAuth authorization server before ingest works.
15. As Nicklas, I want Cursor server id `kc_seed_mcp` kept, so that we do not add a second id or name the server `seed`.
16. As Nicklas, I want that Cursor entry to be Streamable HTTP (`url` + Bearer), so that Cross MCP accept is not stdio.
17. As Nicklas, I want the stdio binary kept in-tree as local debug, so that a laptop can still run the predecessor without claiming Cross MCP done.
18. As tests, I want stdio `GetMcpTools` listing `kc_seed_mcp` not to count as Cross MCP accept, so that the hosted URL is the bar.
19. As Nicklas, I want Cross MCP tools to be `seed_grain` and `seed_join` only, so that chat does not keep `seed_apify` + `seed_fk` as the accept catalog.
20. As Nicklas, I want `seed_grain` to take a grain kind plus that kind’s identity and optional lane, so that I can fetch one League, Club season, or NationalTeam grain from chat.
21. As Nicklas, I want `seed_grain` kinds to match the grain CLI (league, league-season, club, club-season, club-proof, national-team, national-team-season, national-team-proof), so that MCP and CLI share one protocol.
22. As Nicklas, I want Fetch steps hidden behind those grains, so that chat never sees resolve-club or profile hops as tools.
23. As Nicklas, I want club kinds never to write Denmark `3436` as a Club and NT kinds never to stuff kits onto `kit.club_id`, so that Club and NationalTeam stay siblings.
24. As Nicklas, I want `seed_join` subcommand `club` with competition and season, so that Superliga 2010/11 is one chat call.
25. As Nicklas, I want `seed_join` subcommand `national-team` with ntRef and season, so that Denmark men World Cup 2010 is one chat call.
26. As Nicklas, I want `seed_join` subcommand `sentence` for the ADR-0014 sentences already parsed, so that I can speak the Join workflow in natural language.
27. As Nicklas, I want FK after facts to run inside `seed_join`, so that I do not get a sibling `seed_fk` chat tool.
28. As Nicklas, I want Seed MCP service env to set `SEED_FK_FETCH=fixture` when `FKAPI_BASE_URL` is unset, so that Join does not throw and does not silently default.
29. As Nicklas, I want fixture FK not treated as live Football Kit Archive ingest, so that proof kits stay honest.
30. As Nicklas, I want Transfermarkt still to use Seed proxy names on that service, and FK never to use Decodo, so that vendor routing stays locked.
31. As Nicklas, I want every `COOLIFY_*` name omitted from the Seed MCP process, so that Coolify tokens cannot leak into ingest.
32. As Nicklas, I want tool descriptions to say Coolify MCP is host-only, so that an agent does not call Coolify `control` for a Seed scope.
33. As Nicklas, I want default lane development, staging only when the tool arg or Join sentence names it, and production rejected, so that casual ingest cannot hit live users.
34. As Nest, I want zero seed imports and no `/v1` seed endpoints, so that the product request path never fetches vendors.
35. As Nicklas, I want Catalog peek to remain the eyeball after a chat Join, so that we do not build a seed UI.
36. As Nicklas, I want `.env.example` and Cursor example catalog to document `SEED_MCP_URL` and `SEED_MCP_TOKEN` names, so that KIT-148 wiring is copyable without secrets.
37. As a Cloud Agent, I want Integrations & MCP to use those same names, so that Desktop and cloud share one catalog.
38. As factory, I want Seed MCP to stay Desktop or Cloud Agent wiring, so that the PI worker does not install it as dispatch.
39. As Nicklas, I want Coolify one-shot seed Compose jobs to remain jobs, so that they are not mistaken for the 24/7 Seed MCP service.
40. As Nicklas, I want Hierarchy proof breadth only (Superliga 2010/11 and Denmark men World Cup 2010) as first Cross MCP demo, so that Season range is not this accept.
41. As Nicklas, I want a named later competition to use the same `seed_grain` / `seed_join` loop, so that Superliga is the proof, not the ceiling.
42. As tests, I want hermetic dispatch tests that never call Transfermarkt, Football Kit Archive, or Apify, so that CI stays offline.
43. As Nicklas, I want KIT-147’s Seed MCP catalog treated as given, so that implement does not re-research hostname or tool names.
44. As Nicklas, I want issues on this slice labelled `ready-for-human` only, so that planner and PI never dispatch ingest.

## Implementation Decisions

- Linear: attach this feature to existing project **Football Data Seed v1**, milestone **Cross MCP**. Do not create a second project. Kickoff already opened KIT-147 (catalog) and KIT-148 (host the server); this spec is the given for those slices, not a new board.
- Human-only ingest unchanged: `ready-for-human` only. Never `ready-for-agent`. Planner does not claim.
- Seed MCP catalog (KIT-147) is given. KIT-148 hosts Streamable HTTP + Coolify app. Do not implement grains or Join again; thin-adapt them.
- Seed MCP is a thin HTTP adapter over existing grain run and Join workflow modules (ADR-0033, ADR-0040). Nest never fetches. No schema change. No collector surfaces.
- Cursor server id stays `kc_seed_mcp`. Transport for accept is Streamable HTTP with `SEED_MCP_URL` and Bearer `SEED_MCP_TOKEN`. Do not name the server `seed`. Stdio predecessor remains a debug binary; its tools `seed_apify` and `seed_fk` are not the Cross MCP catalog.
- Cross MCP tools: `seed_grain` (grain CLI kinds + identity + optional lane) and `seed_join` (`club` | `national-team` | `sentence` + optional lane). FK after facts stays inside Join (`resolveFkFetchAdapterFromEnv`: live FKApi, else `SEED_FK_FETCH=fixture`, else throw — no silent fixture default).
- Hostname: unique vs Coolify MCP; Coolify auto-FQDN (sslip.io); path `/mcp`. Do not hardcode a live FQDN in product docs before Coolify assigns it. Named DNS is later leverage.
- Auth (ADR-0034): boot refuse if `SEED_MCP_TOKEN` unset/empty; every HTTP request requires matching Bearer; missing/wrong → 401 and no grain/Join. Not OAuth AS in v1. Token in Coolify app env (server) and Desktop/Cloud Agent env (client). Value never in git.
- Process env: TM lane names (`DATABASE_URL` / staging URL, Seed proxy names, R2 names, optional `APIFY_TOKEN`) plus FK names (`FKAPI_BASE_URL` or `SEED_FK_FETCH`). Omit every `COOLIFY_*` name.
- Coolify MCP remains Docker/host. Coolify may manage the Seed MCP container; ingest chat never uses Coolify’s MCP URL. One-shot seed Compose jobs stay jobs, not this service.
- Lane rule unchanged (ADR-0009): default development; staging if named; production rejected before spawn.
- Factory: Coolify MCP and Seed MCP stay Desktop / Cloud Agent wiring. Do not install Seed MCP on the PI worker as dispatch.
- Document env **names** in `.env.example` and Cursor example catalog on KIT-148. Do not put values in git.

## Testing Decisions

Tests cover external behaviour at the highest public interface. They do not call Transfermarkt, Football Kit Archive, or Apify. They do not assert MCP JSON-RPC or Streamable HTTP framing. They do not re-prove grain map or Join workflow row counts (those seams are given from earlier milestones).

**Good test:** a fake grain/Join runner (existing CliRunner-style injection) plus auth configuration. Assert tool catalog is `seed_grain` and `seed_join` with the locked args; a join club/national-team/sentence dispatch calls Join not a sibling FK tool; missing/empty token refuses boot; a request without matching Bearer is denied and does not invoke the runner; `production` lane is rejected; Cursor example catalog uses HTTP `kc_seed_mcp` with `SEED_MCP_URL` / Bearer name and no Coolify tokens on that server; stdio debug entry if kept does not count as accept.

**Seam** (`/tdd` will not re-quiz this — one seam):

1. **Seed MCP HTTP module (highest).** Module: Seed MCP server. Interface: Cursor id `kc_seed_mcp`; tools `seed_grain` and `seed_join`; required config `SEED_MCP_TOKEN` (fail closed) and client URL name `SEED_MCP_URL`; injected runner over grain CLI and Join workflow; lane via existing `resolveSeedLane`. Behaviour: dispatch to those modules, Coolify-not-ingest copy on tool descriptions, omit `COOLIFY_*` from spawned env. Adapters: fake runner in unit tests; live HTTP process only on Coolify (not CI). Do not unit-test the MCP SDK. Auth is part of this module’s interface (boot refuse + 401), not a second public Nest surface.

Grain run, FetchAdapter, and Join workflow stay the seams from the kickoff spec. This feature does not add them.

**Prior art:** Seed MCP catalog tests (server name, tool names, Coolify-not-scope copy); MCP input parse + lane reject; `mcp.json.example` name-only wiring tests; Join workflow and grain tests with injected fetch (do not duplicate here).

Vendor research / Seed MCP catalog is not a `/tdd` seam. KIT-147 accept is the written catalog. KIT-148 treats it as given. Coolify FQDN assignment and Dashboard MCP registration are HITL evidence (GetMcpTools on the HTTP server), not unit tests.

## Out of Scope

- Collector UI, Expo, Astro, OG, Admin SPA, `/to-design`.
- Nest `/v1` seed endpoints or Nest fetching vendors.
- Re-implementing Hierarchy grains or Join workflow.
- A third scraper tree; fusing TM and FK into one MCP tool instead of Join.
- Hosting sunr4y/fkapi; live footballkitarchive.com HTML; Decodo on FK.
- Full OAuth 2.1 authorization-server product.
- Inventing a branded production domain; hardcoding a Coolify FQDN before it exists.
- Season range 1995/96–2025/26 or women’s NationalTeam as first Cross MCP demo.
- Installing Seed MCP on the PI worker as factory dispatch.
- Planner/`ready-for-agent` on this board.
- Treating stdio `GetMcpTools` as Cross MCP done.

## Linear

- **Project:** Football Data Seed v1
- **Mode:** feature
- **Lead:** Nicklas
- **Priority:** None (not named)
- **Milestones** (existing — this feature belongs here, not a new staging increment):
  1. Cross MCP — Seed MCP catalog signed; Seed MCP on its own URL with `SEED_MCP_TOKEN` fail closed; Coolify hosts the container; Cursor `kc_seed_mcp` is HTTP with `seed_grain` + `seed_join`; ingest chat never uses Coolify MCP; stdio is predecessor/debug. Ready to promote when the same URL can target staging if named.

## Further Notes

- Given catalogs: Seed MCP catalog (KIT-147) `.scratch/football-data-seed/mcp-catalog.md`; Compose catalog `.scratch/football-data-seed/compose-catalog.md`; kickoff `.scratch/football-data-seed/spec.md`. ADRs 0033, 0034, 0040.
- Existing Linear issues: KIT-147 (research, HITL signed in catalog — AC still human on the issue), KIT-148 (host URL; blocked by 147). `/to-tickets` should reshape those issues to this spec, not spawn a parallel Cross MCP board.
- Proof sentences: “Seed Superliga 2010/11 including every club, squads, and kits into development.” / “Seed Denmark men World Cup 2010 including squad and kits into development.”
- Ops MCP evidence on KIT-148: GetMcpTools must list the HTTP Seed MCP in the same session before claiming the hosted-server AC; session-local memory is not evidence.
