# Seed MCP catalog — Cross MCP

**Issue:** [KIT-147](https://linear.app/kitcollective/issue/KIT-147/seed-mcp-research)  
**Accept:** Nicklas signs off this catalog before Seed MCP is hosted ([KIT-148](https://linear.app/kitcollective/issue/KIT-148/seed-mcp-on-its-own-url)).  
**Breadth:** Superliga **2010/11** (`DK1`, `saison_id=2010`) and Denmark men **World Cup 2010** (TM national side `verein/3436`, calendar `saison_id=2010`) — same proof as Join. Not every league. Not a Season range 1995/96–2025/26 as first accept.  
**Upstream catalogs (given):** [compose-catalog.md](./compose-catalog.md) (KIT-145) · [field-catalog.md](./field-catalog.md) (KIT-138) · [fk-field-catalog.md](./fk-field-catalog.md) (KIT-140)  
**Seed references:** [`seed/apify/reference.md`](../../seed/apify/reference.md) · [`seed/fkapi/reference.md`](../../seed/fkapi/reference.md)

This file names the **Seed MCP** URL, token, and tool shapes over Hierarchy grains and the Join workflow. It is the given for KIT-148 — not executable code. KIT-148 is not implemented by this research.

**Not this milestone’s accept:** a laptop-only stdio wrapper, Coolify MCP as ingest, or `seed_apify` + `seed_fk` as the only tools. Those are the predecessor (`kc_seed_mcp`). Cross MCP accept is Seed MCP on its own hostname speaking grains and Join.

---

## Evidence (this pass)

| Source | What |
| --- | --- |
| Repo | ADR-0033, ADR-0034, ADR-0007, ADR-0012, ADR-0013, ADR-0014, ADR-0032, ADR-0009; CONTEXT Seed MCP / Seed MCP token / Cross MCP / `kc_seed_mcp` / Coolify MCP; `seed/mcp` stdio predecessor; grain + Join CLI; FK `resolveFkFetchAdapterFromEnv` |
| Kickoff spec | Milestone 4 Cross MCP; stories 41–49; Implementation Decisions Seed MCP; Testing Decisions item 4 |
| Predecessor MCP | `@kit/seed-mcp`: Cursor id `kc_seed_mcp`, tools `seed_apify` and `seed_fk` only, `StdioServerTransport` |
| Cursor wiring | `.cursor/mcp.json.example` — Coolify HTTP (`COOLIFY_MCP_URL` + Bearer `COOLIFY_API_TOKEN`) vs `kc_seed_mcp` stdio; `.env.example` Seed MCP section (names only) |
| Coolify | `seed/coolify/README.md` — one-shot jobs, not 24/7 MCP; Coolify MCP `control` is Docker/host. kit-api FQDNs use `{uuid}.{ipv4}.sslip.io` (names/FQDN only) |
| MCP spec | Streamable HTTP MCP endpoint; `Authorization: Bearer` on every HTTP request; stdio is a different transport |

---

## Decision — unique hostname (HITL)

Seed MCP listens on **its own URL**. Coolify MCP stays `{COOLIFY_API_URL}/mcp` (optional override `COOLIFY_MCP_URL`). The two URLs must never be the same string. Ingest chat calls only the Seed MCP URL. ([ADR-0033](../../docs/adr/0033-seed-mcp-own-url.md), CONTEXT **Seed MCP**, spec stories 42–44)

**Locked in repo:** uniqueness vs Coolify MCP. **Not locked:** the concrete FQDN or DNS name. Do not invent a production domain.

**Recommend (pattern only):**

| Piece | Pattern | Why |
| --- | --- | --- |
| Host | Coolify application with its **own** FQDN, not the Coolify panel | Same host pattern as `kit-api` on this team: `{coolify-app-uuid}.{cx33-ipv4}.sslip.io` (observed Coolify app FQDNs, names only). Nicklas may instead attach a dedicated DNS name. |
| Path | Single MCP endpoint, typically `/mcp` | MCP Streamable HTTP: one URL that accepts POST and GET ([spec 2025-06-18 transports](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports); same shape in [2025-03-26](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports)) |
| Env **name** (client) | `SEED_MCP_URL` | Distinct from `COOLIFY_MCP_URL`. Value never in git. Document the name in `.env.example` on KIT-148. |
| TLS | HITL | kit-api smoke uses `http://` + sslip.io today (`.github/workflows/wire-coolify-nest.yml`). MCP spec authorization servers require HTTPS; a private Bearer MCP on sslip.io HTTP is a host choice, not a locked product domain. |

**HITL (signed 2026-09-07):** Coolify auto-FQDN (sslip.io) when KIT-148 hosts; path `/mcp`. Do not invent a production domain. KIT-148 must not hardcode a live hostname in product docs before Coolify assigns the FQDN.

**Cursor HTTP wiring (KIT-148, not this file’s code):** Same Cursor server id `kc_seed_mcp`, Streamable HTTP: `url` = `SEED_MCP_URL` and `Authorization: Bearer` from `SEED_MCP_TOKEN`. Do **not** copy Coolify’s URL into that entry. Do **not** name the Cursor server `seed`. Stdio binary stays in-tree as local debug, not the Cursor accept (ADR-0040).

---

## Decision — Seed MCP token (fail closed)

Every HTTP request to Seed MCP requires a bearer token. Missing token **fails closed**. The env **name** is documented; the **value is never in git**. Coolify’s API token is a different secret. ([ADR-0034](../../docs/adr/0034-seed-mcp-bearer-token.md), CONTEXT **Seed MCP token**, spec stories 46–47)

| Env **name** | Role | Must not be |
| --- | --- | --- |
| `SEED_MCP_TOKEN` | Bearer secret for Seed MCP HTTP | `COOLIFY_API_TOKEN`, `COOLIFY_MCP_URL`, `COOLIFY_API_URL` |
| `SEED_MCP_URL` | Client URL for that server | The Coolify panel `/mcp` URL |

**Propose `SEED_MCP_TOKEN`.** It is unused in `.env.example` today (Seed MCP section still describes stdio `kc_seed_mcp` only). Distinct from `COOLIFY_API_TOKEN` by construction.

**Protocol (HTTP):** MCP clients send `Authorization: Bearer <access-token>` on **every** HTTP request, including the same logical session. Tokens MUST NOT go in the query string. Missing or invalid token → HTTP **401**. ([MCP authorization 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization) Access Token Usage; same Bearer rule in [2025-03-26](https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization))

**Fail closed (KIT-148 auth adapter):**

1. Process **must not** serve Streamable HTTP if `SEED_MCP_TOKEN` is unset or empty (boot refuse).
2. Request **without** `Authorization: Bearer …`, or with a token that does not match, returns **401** and does not run a grain or Join.
3. Stdio predecessor does **not** use this HTTP Authorization spec — MCP says STDIO implementations SHOULD NOT follow HTTP authorization and instead read credentials from the environment ([2025-06-18 Authorization Protocol Requirements](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)). Cross MCP accept is the HTTP server, not stdio.

**v1 vs full OAuth:** MCP HTTP authorization is specified as OAuth 2.1 (optional at protocol level; SHOULD when using HTTP). This factory’s Coolify MCP already uses a **static Bearer** from `COOLIFY_API_TOKEN` (`.cursor/mcp.json.example`, `scripts/setup-coolify-mcp.sh`, `seed/coolify/mcp-call.sh`). Seed MCP v1 matches that private-operator pattern: pre-shared `SEED_MCP_TOKEN`, not an anonymous public MCP, not a public OAuth authorization server. Full OAuth AS is later leverage — not KIT-148.

**Never:** commit the value; log the header; put the token in Expo/Astro/admin bundles; reuse `COOLIFY_API_TOKEN` as this token; mix Coolify env names onto the Seed MCP process (`omitCoolifyHostEnv` in `seed/mcp/src/run-cli.ts` already strips `COOLIFY_*` from predecessor CLI env).

---

## Decision — tool shapes (not predecessor-only)

Cross MCP **accept is not** `seed_apify` + `seed_fk` as the only tools. Those two tools are the predecessor catalog (`SEED_MCP_TOOL_NAMES` in `seed/mcp/src/server.ts`; test “registers as `kc_seed_mcp` with `seed_apify` and `seed_fk` only”). Seed MCP must speak **Hierarchy grains** and the **Join workflow** (CONTEXT **Seed MCP**, spec stories 41 and 48, ADR-0032 + ADR-0014).

Thin adapter: tools call existing CLI/modules. Nest never fetches vendors. Do not unit-test MCP JSON-RPC framing (spec Testing Decisions item 4).

### Predecessor → Cross MCP map

| Predecessor (`kc_seed_mcp` stdio) | Cross MCP (HTTP Seed MCP) |
| --- | --- |
| `seed_apify` — competition + `fromSeason`/`toSeason`, or `club` + `season` | **Not the accept.** Old walk / Coolify one-shot job shape (`seed/coolify/docker-compose.apify-job.yml`). Chat protocol becomes grain + Join. |
| `seed_fk` — competition + season range, “run Apify first” | **Not the accept as a sibling chat tool.** FK after facts is composed **inside Join** (`seed/apify/src/fk-runner.ts` → `resolveFkFetchAdapterFromEnv`). Standalone `@kit/seed-fkapi` CLI / Coolify FK job remain operator leftovers, not Cross MCP chat. |
| Tool copy: “Coolify MCP is host-only… Do not use Coolify control/deploy for Seed scope” | Keep the boundary in **new** tool descriptions. Stronger lock: ingest chat never calls Coolify `control` to start a Seed scope (ADR-0033). |

### Tool A — `seed_grain`

Thin adapter over `seed-apify grain …` ([`seed/apify/reference.md`](../../seed/apify/reference.md), [`seed/apify/src/parse-cli.ts`](../../seed/apify/src/parse-cli.ts)).

| `kind` (CLI grain kind) | Required identity | Writes (see compose-catalog / Seed reference) |
| --- | --- | --- |
| `league` | `competition` | League + country + ExternalId |
| `league-season` | `competition`, `season` | Season + club list |
| `club` | `competition`, `clubId` | Club facts + Honours; **not** a NationalTeam row |
| `club-season` | `competition`, `clubId`, `season` | Squad + `#` + Rich kader body |
| `club-proof` | `competition`, `season` | Partial Club-path helper (not a complete named season) |
| `national-team` | `ntRef` | NationalTeam facts + Honours; never `club` |
| `national-team-season` | `ntRef`, `season` | NT squad + `#` |
| `national-team-proof` | `ntRef`, `season` | Partial NT-path helper (not a complete named season) |

Shared arg: `lane` optional — omit → `development`; `staging` only when named; `production` rejected (`resolveSeedLane` in `seed/shared/src/lane.ts`, ADR-0009).

**Do not expose as MCP tools:** Fetch steps (resolve club, profile hop) — CONTEXT **Fetch step**. Player / Player season are Hierarchy grains in ADR-0032 but are hops inside Club season / NationalTeam season, not `grain` CLI kinds in `parse-cli.ts`.

**Club ≠ NationalTeam:** club kinds never write Denmark `3436` as a Club; NT kinds never stuff kits onto `kit.club_id`.

### Tool B — `seed_join`

Thin adapter over `seed-apify join …` ([`seed/apify/reference.md`](../../seed/apify/reference.md) Join workflow, compose-catalog, [`parse-cli.ts`](../../seed/apify/src/parse-cli.ts) `parseJoinArgv`).

| Subcommand | Args | Composes (internal; not extra MCP tools) |
| --- | --- | --- |
| `club` | `competition`, `season`, optional `lane` | League → League season → Club × N → Club season × N → **FK after facts** |
| `national-team` | `ntRef`, `season`, optional `lane` | NationalTeam → NationalTeam season → **FK after facts** |
| `sentence` | natural-language string (ADR-0014) | Same Club or NT path after `parseJoinSentence` |

Proof sentences already parsed in `seed/shared/src/join-sentence.ts`:

- Club: “Seed Superliga 2010/11 including every club, squads, and kits into development.”
- NationalTeam: “Seed Denmark men World Cup 2010 including squad and kits into development.”

Lane words in the sentence: default development; `staging` when named; **`production` rejected** (fail closed).

**Complete named season** remains the compose-catalog checklist (stamdata + R2 + peek). Join is the operator protocol; grains stay addressable via `seed_grain`.

### FK fetch on the Seed MCP service (not silent)

Join’s FK step uses `resolveFkFetchAdapterFromEnv` (`seed/fkapi/src/fetch.ts`):

1. `FKAPI_BASE_URL` set → live FKApi (`FKAPI_TOKEN` when the origin requires it).
2. Else `SEED_FK_FETCH=fixture` → committed Hierarchy proof kits (Superliga 2010/11, Denmark WC 2010).
3. Else **throw** — no silent fixture default.

This factory does **not** host sunr4y/fkapi (CONTEXT **FK after facts**, `seed/fkapi/reference.md`, `.env.example`). Operator Join / Seed MCP without `FKAPI_BASE_URL` **must** set `SEED_FK_FETCH=fixture`. Direct footballkitarchive.com HTML is Cloudflare 403 and must not go through Decodo.

Seed MCP **service env** (KIT-148) therefore includes TM names (`DATABASE_URL`, `SEED_PROXY_URL`, `SEED_REQUIRE_PROXY`, R2 names, optional `APIFY_TOKEN`) **and** either `FKAPI_BASE_URL` or `SEED_FK_FETCH`. Still omit every `COOLIFY_*` name from that process.

---

## Decision — Coolify MCP vs Seed MCP

| | Coolify MCP | Seed MCP |
| --- | --- | --- |
| Job | Docker and host catalog | Ingest: Hierarchy grains + Join workflow |
| URL | `COOLIFY_MCP_URL` (default `{COOLIFY_API_URL}/mcp`) | Unique `SEED_MCP_URL` (HITL FQDN) |
| Token | `COOLIFY_API_TOKEN` | `SEED_MCP_TOKEN` |
| Cursor | HTTP Bearer (`.cursor/mcp.json.example` `coolify`) | HTTP Bearer after KIT-148; stdio predecessor until then |
| Chat may | `control` / deploy / host debug | `seed_grain` / `seed_join` only |
| Chat must not | Start a Seed scope; share this URL as “the seed MCP” | Call Coolify `control`; use Coolify’s MCP URL |

Coolify **hosts** the Seed MCP **container** in KIT-148 (ADR-0033 *may*; grill 2026-09-07 *does*). That is Docker management. Ingest chat still talks only to Seed MCP.

`seed/coolify/README.md` one-shot Compose jobs (`docker-compose.apify-job.yml`, `docker-compose.fkapi-job.yml`) remain jobs, not 24/7 MCP. KIT-17 ratchet (Coolify MCP `control` vs Coolify REST start) applies to those **host jobs**, not to Cross MCP ingest. ADR-0012’s “chat starts a Coolify job so the Mac can sleep” is **superseded for ingest** by ADR-0033: long jobs run **inside the Seed MCP service**.

**Factory wiring:** Coolify MCP and `kc_seed_mcp` are Desktop or Cloud Agent wiring — not default PI-worker MCP. Do not install Seed MCP on the PI worker as factory dispatch (CONTEXT **Product MCP**; spec Out of Scope). `factory.config.json` has no MCP keys; the product MCP note lives in generated CONTEXT orchestration.

---

## Decision — `kc_seed_mcp` stdio is predecessor

| Fact | Source |
| --- | --- |
| Cursor server id `kc_seed_mcp` | `SEED_MCP_SERVER_NAME`; `.cursor/mcp.json.example`; CONTEXT **kc_seed_mcp** |
| Transport | `StdioServerTransport` (`seed/mcp/src/server.ts` `startSeedMcpServer`) |
| Tools | `seed_apify`, `seed_fk` only |
| Env | Lane + proxy + FK + R2 **names**; **no** `COOLIFY_API_URL` / `COOLIFY_MCP_URL` / `COOLIFY_API_TOKEN` (`seed/mcp/tests/server.test.ts`) |
| Cross MCP accept | Seed MCP on its own URL (ADR-0033). Not this stdio process. Not a laptop-only server (laptop sleep). |

KIT-148 may keep stdio in-tree as a local debug binary. It is not the milestone accept. Do not treat “GetMcpTools lists `kc_seed_mcp` stdio” as Cross MCP done.

---

## Decision — long jobs, lane, Nest

**Long jobs** (Proof Join, later Season range) execute **inside** the Seed MCP HTTP service so a laptop sleep does not kill the walk (ADR-0033, spec story 45). They do not go through Coolify MCP. Seed MCP is a long-running service, unlike `seed/coolify` one-shot jobs.

**Lane** (ADR-0009, `resolveSeedLane`): default `development`; `staging` only when the tool arg or Join sentence names it; **`production` rejected** (predecessor already refuses before spawn — `seed/mcp/tests/run-cli.test.ts`).

**Nest:** zero seed imports, no `/v1` seed endpoints (spec story 27, ADR-0032). Seed MCP is a thin HTTP adapter over grain run and Join workflow modules (Testing Decisions item 4). Catalog peek stays counts on Nest, not a seed API.

---

## Cursor / Cloud Agent wiring names (KIT-148)

Document **names** only. Do not put values in git.

| Name | Surface |
| --- | --- |
| `SEED_MCP_URL` | Cursor HTTP MCP `url`; Cloud Agent Integrations & MCP URL |
| `SEED_MCP_TOKEN` | `Authorization: Bearer` header; fail closed if missing |
| `COOLIFY_MCP_URL` / `COOLIFY_API_TOKEN` | Coolify MCP only — never on Seed MCP |
| `SEED_FK_FETCH` | `fixture` when no `FKAPI_BASE_URL` |
| `FKAPI_BASE_URL` / `FKAPI_TOKEN` | Live FKApi only if Nicklas runs a host; factory does not |
| `SEED_PROXY_URL` / `SEED_REQUIRE_PROXY` | Transfermarkt only; never FK |
| `DATABASE_URL` / `SEED_STAGING_DATABASE_URL` / `R2_*` | Lane Postgres + object store |

`.env.example` Seed MCP section today still describes stdio predecessor. KIT-148 adds `SEED_MCP_URL` + `SEED_MCP_TOKEN` names and the fail-closed note.

---

## HITL accept

Signed 2026-09-07 (`/grill-with-docs`). Given for KIT-148.

- [x] Nicklas accepts this catalog as the given before KIT-148 hosts the server.
- [x] **Hostname** — Coolify auto-FQDN (sslip.io); path `/mcp`; unique vs Coolify MCP. No production domain invented in git.
- [x] **Token** — env name `SEED_MCP_TOKEN` (not `COOLIFY_API_TOKEN`); bearer on every HTTP request; missing → fail closed; value never in git. Server copy in Coolify app env; Desktop/Cloud Agent use the same name. Not an OAuth AS in v1.
- [x] **Coolify hosts the container in KIT-148** — HTTP server **and** Coolify app. Laptop-only is not accept.
- [x] **Tools** — `seed_grain` + `seed_join` (ADR-0040). Not `seed_apify` + `seed_fk` alone.
- [x] **FK** — no hosted FKApi; Seed MCP env sets `SEED_FK_FETCH=fixture` unless `FKAPI_BASE_URL` is set. Not a silent default.
- [x] **Boundary** — ingest chat never Coolify `control` for a Seed scope; never share Coolify MCP URL; PI worker does not install Seed MCP as dispatch.
- [x] **`kc_seed_mcp`** stays the Cursor server id; transport becomes HTTP. Stdio is predecessor/debug, not Cross MCP accept. KIT-148 is not done by this file.

---

## Out of this catalog

- Implementing Streamable HTTP, Docker, or Cursor Dashboard registration (KIT-148).
- Changing Nest, Expo, or collector surfaces.
- A third scraper tree or fusing TM+FK into one MCP tool **instead of** Join (Join already composes FK after facts).
- Full OAuth 2.1 authorization-server product (unless HITL expands KIT-148).
- Women’s NationalTeam as first proof; Season range 1995/96–2025/26 as first accept.
