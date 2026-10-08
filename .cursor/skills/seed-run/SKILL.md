---
name: seed-run
description: Desktop Football Data Seed ingest via the seed-apify CLI. Use when running grain, join, bulk, or jersey-numbers; when Transfermarkt fail-closed transport, Decodo 402/quota, or Catalog peek after a Desktop seed.
disable-model-invocation: true
---

# Seed run

Load `factory.config.json` then `WORKFLOW.md`. Read [../_shared/factory.md](../_shared/factory.md).

Desktop ingest is the **`seed-apify` CLI** (grains, Join, bulk, jersey-numbers). Coolify MCP is host-only. Seed MCP HTTP (`kc_seed_mcp`) is a later wrap — skip it on this path.

## Quota stop

HTTP 402 / `TransfermarktProxyQuotaError` is **fatal**. The circuit opens on the first hit. Quote stderr and stop. Re-run only **cache hits** (HTML already under `seed/apify/.cache/transfermarkt`) or **fixtures** (`SEED_KADER_HTML` / `SEED_APIFY_FIXTURE`). Cache misses still call Unblocker and 402 again. Top up the plan before any new live TM. Never set `SEED_TM_TRANSPORT=direct` to work around quota.

## Factory twist

- Lane default is `development`. Name `staging` only when asked. Production is refused by the CLI.
- **`bulk` is the default for "scrape a lot"; `grain` stays for a single proof.** `bulk` checkpoints, resumes, and skips already-seeded club-seasons, so re-running it is how you clear the remainder.
- **`jersey-numbers`** backfills career squad-number history (`/rueckennummern`) for players the lane already has. It is not a grain and not Join.
- Live Transfermarkt goes through **Decodo Site Unblocker** wherever `SEED_PROXY_URL` is set, Desktop included (ADR-0043 supersedes ADR-0042). Fail-closed: no URL and no `SEED_TM_TRANSPORT=direct` → throw (`No Transfermarkt transport is configured`).
- Football Kit Archive uses listing HTTP / `FKAPI_BASE_URL` (ADR-0041) or `SEED_FK_FETCH=fixture`. **Never Decodo.**
- The live HTML/portrait cache is **on by default** (`SEED_KADER_CACHE`, default `seed/apify/.cache/transfermarkt`, gitignored). A cache hit costs Transfermarkt nothing. Delete that directory to force a refetch.
- Portraits go to **R2** when `R2_*` is complete and are mirrored to `SEED_OBJECT_DIR` when both are set. Either name alone is the whole store; neither means no portraits.
- Squad/club counts in Linear come from `seed/mcp/scripts/verify-development-db.mjs` stdout, never typed by hand.
- `DATABASE_URL` for a live run is the lane. Tests that `DROP SCHEMA` use `*_TEST_DATABASE_URL` — never the lane.

## Process

### 1. Name the ask

Read `CONTEXT.md` terms **Join workflow**, **FK after facts**, **Seed proxy**, **Catalog peek**. Pick the **smallest** CLI that covers the ask.

| Ask | Command class |
| --- | --- |
| Many seasons or many leagues | `bulk …` (checkpointed queue; see step 4) |
| One Hierarchy grain | `grain …` (kinds in `seed/apify/src/parse-cli.ts`) |
| Club identities for a season | `grain club-proof <competition> <season>` (all clubs on the season page; not kaders) |
| NT proof pair | `grain national-team-proof <ntRef> <season>` |
| One named club season (squads then kits) | `grain club` + `grain club-season` + `seed-fkapi` club — not `join club` |
| Named competition season (all clubs + FK kits) | `join club <competition> <season>` |
| Denmark men WC path | `join national-team 3436 2010` (or alias `dk-men`) |
| ADR-0014 sentence | `join sentence "…"` |
| Career jersey-number history for lane players | `jersey-numbers backfill` |
| Same history for named TM player ids | `jersey-numbers <playerId…>` |

`join club` Superliga 2010/11 is a full 12-club walk. Confirm with the human before starting unless they already named that whole season.

**Done when:** one argv line (or the named-club three-step) and a budget class, with human confirm on `join club`.

### 2. Install locally

From repo root:

```bash
pnpm install
pnpm --filter @kit/domain --filter @kit/db --filter @kit/seed-shared --filter @kit/seed-fkapi --filter @kit/seed-apify build
```

**Done when:** `test -f seed/apify/dist/cli.js` and `test -f seed/fkapi/dist/cli.js`.

### 3. Env

Load gitignored `.env` with Node (names in `.env.example`):

```bash
node --env-file=.env seed/apify/dist/cli.js grain league superliga development
```

Parse in a subprocess. The hook blocks `source .env`.

Live TM write: `DATABASE_URL` is the CX33 development lane.

TM transport (fail-closed):

- `SEED_PROXY_URL` set → Site Unblocker, Desktop included.
- No `SEED_PROXY_URL` and no `SEED_TM_TRANSPORT=direct` → throw.
- `SEED_TM_TRANSPORT=proxy` without URL → throw.
- `SEED_REQUIRE_PROXY` truthy without URL → throw.
- `SEED_TM_TRANSPORT=direct` → laptop IP. Human-asked only. Dangerous.
- `SEED_PROXY_HEADLESS` is `auto` by default (cheap pass first, rendered pass when the AWS WAF answers); force it with `html`, forbid it with `off`. `SEED_PROXY_GEO` and `SEED_PROXY_SESSION_ID` are optional.

`pnpm seed:bulk` currently sets `SEED_TM_TRANSPORT=direct` when `SEED_PROXY_URL` is missing. That bypasses fail-closed. Require the URL, or call `node --env-file=.env seed/apify/dist/cli.js bulk …` so a missing URL throws.

FK: `FKAPI_BASE_URL` (listing origin, no `/kits` suffix) **or** `SEED_FK_FETCH=fixture`. Missing both → Join/FK throws. Never `SEED_PROXY_URL` on this path.

Portraits/kits: complete `R2_*` **or** `SEED_OBJECT_DIR`. Both set = R2 plus a local mirror.

Bulk / jersey checkpoints: `SEED_BULK_STATE_DIR` (default `.seed-state`, gitignored).

**Done when:** the chosen command’s required names are set, and the CLI’s `[seed] fetch transport=…` line says `proxy`, `fixture`, or `apify` — never an unasked `direct`.

### 4. Run

From repo root, after the build. Lane omitted → `development`.

Grain / Join / jersey:

```bash
node --env-file=.env seed/apify/dist/cli.js grain league superliga development
node --env-file=.env seed/apify/dist/cli.js grain club-season superliga 190 2010/11 development
node --env-file=.env seed/apify/dist/cli.js join club superliga 2010/11 development
node --env-file=.env seed/apify/dist/cli.js join national-team 3436 2010 development
node --env-file=.env seed/apify/dist/cli.js join sentence "Seed Superliga 2010/11 into development"
node --env-file=.env seed/apify/dist/cli.js jersey-numbers backfill development
node --env-file=.env seed/apify/dist/cli.js jersey-numbers 28003 38253 development
```

Bulk (many seasons, many leagues). `pnpm seed:bulk` loads `.env`, adds lane TLS parameters to `DATABASE_URL`, and names the transport. **Requires `SEED_PROXY_URL`.** Without quota, only re-run when the cache already holds the HTML.

```bash
pnpm seed:bulk dk1 2012/13 2013/14
pnpm seed:bulk plan seed/apify/plans/big-five-recent.json
pnpm seed:bulk status dk1-2012-13-2013-14
pnpm seed:bulk status seed/apify/plans/big-five-recent.json
```

Equivalent without the wrapper (fail-closed stays intact):

```bash
node --env-file=.env seed/apify/dist/cli.js bulk dk1 2012/13 2013/14 development
node --env-file=.env seed/apify/dist/cli.js bulk plan seed/apify/plans/big-five-recent.json development
node --env-file=.env seed/apify/dist/cli.js bulk status dk1-2012-13-2013-14
```

Committed plan: `seed/apify/plans/big-five-recent.json`. Shape is `{ "id", "entries": [{ "competition", "fromSeason", "toSeason" }] }`.

The queue is `league` → `league_season` → per club `club` → `club_season`; clubs are discovered on the league-season page and appended to the checkpoint (`.seed-state/<planId>.jsonl`). A failing task is recorded and **the queue continues**, so the command still exits 0 with `{ ok: true }` — call it again to clear the remainder. Only `TransfermarktCircuitOpenError` stops it early (`"stopped": "circuit_open"`). Quota 402 opens that circuit on the first hit — stop; do not keep draining the queue. `club_season` tasks that are already seeded are skipped through the DB gate.

Catalogued competitions (no Transfermarkt search): DK1, GB1, GB2, ES1, IT1, L1, FR1, NL1, PO1, TR1, SC1 (`seed/shared/src/competitions.ts`). Anything else falls back to a live `schnellsuche` lookup.

Jersey-numbers backfill checkpoint: `.seed-state/player-jersey-numbers.jsonl`. Last line wins per player; `done` is skipped on resume; `failed` is retried. Named player ids do not use the checkpoint. `SEED_JERSEY_CONCURRENCY` default 1, max 8. Circuit-open and quota stop the walk.

Named-club kits after grains (FK — **not** Decodo):

```bash
node --env-file=.env seed/fkapi/dist/cli.js club superliga 190 2010/11 development
```

CLI prints progress on **stderr** (`[seed] …`) and JSON `{ ok: true, … }` on stdout when the command finishes. Expect `[seed] fetch transport=proxy` on live TM.

On `TransfermarktProxyQuotaError`, `TransfermarktCircuitOpenError`, or HTTP 403/429 after retries: **stop**. Quote the stderr error. Do not set `SEED_TM_TRANSPORT=direct`.

**Done when:** the process exits 0 and stdout `ok` is true, or you stopped on circuit-open / quota with the error quoted.

### 5. Prove

Open Catalog peek on the lane API (`GET /v1/catalog/peek` — development Nest is `https://api.kitcollective.app/v1/catalog/peek`) for a human eyeball.

Linear Evidence counts:

```bash
node --env-file=.env seed/mcp/scripts/verify-development-db.mjs
```

Attach that JSON. Leave `scripts/record-seed-development-proof.sh` for the MCP-path walker — it re-seeds and is the wrong proof after a grain/join CLI.

**Done when:** peek shows the scope you ran (sides, squads, kits as applicable), and any Linear counts are the verify script’s stdout.
