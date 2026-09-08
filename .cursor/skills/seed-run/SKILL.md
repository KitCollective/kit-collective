---
name: seed-run
description: Desktop Football Data Seed ingest via the seed-apify CLI. Install packages, pick grain vs Join by budget, run, prove on Catalog peek.
disable-model-invocation: true
---

# Seed run

Load `factory.config.json` then `WORKFLOW.md`. Read [../_shared/factory.md](../_shared/factory.md).

Desktop ingest is the **`seed-apify` CLI** (grains and Join). Coolify MCP is host-only. Seed MCP HTTP (`kc_seed_mcp`) is a later wrap — skip it on this path.

## Factory twist

- Lane default is `development`. Name `staging` only when asked. Production is refused by the CLI.
- **`bulk` is the default for "scrape a lot"; `grain` stays for a single proof.** `bulk` checkpoints, resumes, and skips already-seeded club-seasons, so re-running it is how you clear the remainder.
- Live Transfermarkt goes through **Decodo Site Unblocker** everywhere `SEED_PROXY_URL` is set, Desktop included (ADR-0043 supersedes ADR-0042). `SEED_TM_TRANSPORT=direct` is the opt-out. Football Kit Archive uses listing HTTP / `FKAPI_BASE_URL` (ADR-0041) or `SEED_FK_FETCH=fixture`.
- The live HTML/portrait cache is **on by default** (`SEED_KADER_CACHE`, default `seed/apify/.cache/transfermarkt`). Re-running a scope costs Transfermarkt nothing. Delete that directory to force a refetch.
- Portraits go to **R2** when `R2_*` is complete and are mirrored to `SEED_OBJECT_DIR` when both are set. Either name alone is the whole store; neither means no portraits.
- Squad/club counts in Linear come from `seed/mcp/scripts/verify-development-db.mjs` stdout, never typed by hand.
- `DATABASE_URL` for a live run is the lane. Tests that `DROP SCHEMA` use `*_TEST_DATABASE_URL` — never the lane.

## Process

### 1. Name the ask

Read `CONTEXT.md` terms **Join workflow**, **FK after facts**, **Seed proxy**, **Catalog peek**. Pick the **smallest** CLI that covers the ask. Order and named-club sequence: [references/order.md](references/order.md). Budget: [references/budget.md](references/budget.md).

| Ask | Command class |
| --- | --- |
| Many seasons or many leagues | `bulk …` (checkpointed queue; see step 4) |
| One Hierarchy grain | `grain …` (kinds in `seed/apify/src/parse-cli.ts`) |
| Club identities for a season | `grain club-proof <competition> <season>` (all clubs on the season page; not kaders) |
| NT proof pair | `grain national-team-proof <ntRef> <season>` |
| One named club season (squads then kits) | `grain club` + `grain club-season` + `seed-fkapi` club — not `join club` |
| Named competition season (all clubs) | `join club <competition> <season>` |
| Denmark men WC path | `join national-team 3436 2010` (or alias `dk-men`) |
| ADR-0014 sentence | `join sentence "…"` |

`join club` Superliga 2010/11 is a full 12-club walk. Confirm with the human before starting unless they already named that whole season.

**Done when:** one argv line (or the named-club three-step) and a budget class (`grain` vs `join`), with human confirm on `join club`.

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

Live TM write: `DATABASE_URL` is the CX33 development lane. Substitute hosts (`localhost`, `kit_test`) are blocked for this CLI.

TM transport: `SEED_PROXY_URL` in `.env` is enough — Site Unblocker is the transport, Desktop included. `SEED_PROXY_HEADLESS` is `auto` by default (cheap pass first, rendered pass only when the AWS WAF answers); force it with `html`, forbid it with `off`. `SEED_PROXY_GEO` and `SEED_PROXY_SESSION_ID` are optional. Only set `SEED_TM_TRANSPORT=direct` when the human asks for the bare laptop IP, and expect Transfermarkt's own 502/504 there.

FK: `FKAPI_BASE_URL` (listing origin, no `/kits` suffix) **or** `SEED_FK_FETCH=fixture`. Missing both → Join/FK throws.

Portraits/kits: complete `R2_*` **or** `SEED_OBJECT_DIR`. Both set = R2 plus a local mirror.

Bulk checkpoints: `SEED_BULK_STATE_DIR` (default `.seed-state`, gitignored).

**Done when:** the chosen command’s required names are set, and the CLI’s `[seed] fetch transport=…` line says what you expected.

### 4. Run

From repo root, after the build:

```bash
node --env-file=.env seed/apify/dist/cli.js grain league superliga development
node --env-file=.env seed/apify/dist/cli.js grain club-season superliga 190 2010/11 development
node --env-file=.env seed/apify/dist/cli.js join club superliga 2010/11 development
node --env-file=.env seed/apify/dist/cli.js join national-team 3436 2010 development
node --env-file=.env seed/apify/dist/cli.js join sentence "Seed Superliga 2010/11 into development"
```

Bulk (many seasons, many leagues). `pnpm seed:bulk` loads `.env`, adds the lane TLS parameters to `DATABASE_URL`, and names the transport:

```bash
pnpm seed:bulk dk1 2012/13 2013/14                 # lane defaults to development
pnpm seed:bulk plan seed/apify/plans/big-five.json # one queue over several leagues
pnpm seed:bulk status dk1-2012-13-2013-14          # counts from the checkpoint, no fetching
```

Plan file shape:

```json
{ "id": "big-five", "entries": [{ "competition": "gb1", "fromSeason": "2015/16", "toSeason": "2024/25" }] }
```

The queue is `league` → `league_season` → per club `club` → `club_season`; clubs are discovered on the league-season page and appended to the checkpoint. A failing task is recorded and **the queue continues**, so the command still exits 0 with `{ ok: true }` — call it again to clear the remainder. Only `TransfermarktCircuitOpenError` stops it early (`"stopped": "circuit_open"`). `club_season` tasks that are already seeded are skipped through the DB gate.

Competition names resolve from `seed/shared/src/competitions.ts` (DK1, GB1, GB2, ES1, IT1, L1, FR1, NL1, PO1, TR1, SC1) without touching Transfermarkt's search page. Anything else falls back to a live `schnellsuche` lookup.

Named-club kits after grains:

```bash
node --env-file=.env seed/fkapi/dist/cli.js club superliga 190 2010/11 development
```

CLI prints progress on **stderr** (`[seed] …`) and JSON `{ ok: true, … }` on stdout when the command finishes.

On `TransfermarktCircuitOpenError` or HTTP 403/429 after retries: **stop**. Quote the stderr error. Leave transport as `direct` unless the human asked to switch.

**Done when:** the process exits 0 and stdout `ok` is true, or you stopped on circuit-open with the error quoted.

### 5. Prove

Open Catalog peek on the lane API (`GET /v1/catalog/peek` — development Nest is `https://api.kitcollective.app/v1/catalog/peek`) for a human eyeball.

Linear Evidence counts:

```bash
node --env-file=.env seed/mcp/scripts/verify-development-db.mjs
```

Attach that JSON. Leave `scripts/record-seed-development-proof.sh` for the MCP-path walker — it re-seeds and is the wrong proof after a grain/join CLI.

**Done when:** peek shows the scope you ran (sides, squads, kits as applicable), and any Linear counts are the verify script’s stdout.
