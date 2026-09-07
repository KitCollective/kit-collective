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
- Live Transfermarkt on Desktop uses the machine IP (ADR-0042). Coolify uses Decodo. Football Kit Archive uses listing HTTP / `FKAPI_BASE_URL` (ADR-0041) or `SEED_FK_FETCH=fixture`.
- Squad/club counts in Linear come from `seed/mcp/scripts/verify-development-db.mjs` stdout, never typed by hand.
- `DATABASE_URL` for a live run is the lane. Tests that `DROP SCHEMA` use `*_TEST_DATABASE_URL` — never the lane.

## Process

### 1. Name the ask

Read `CONTEXT.md` terms **Join workflow**, **FK after facts**, **Seed proxy**, **Catalog peek**. Pick the **smallest** CLI that covers the ask. Order and named-club sequence: [references/order.md](references/order.md). Budget: [references/budget.md](references/budget.md).

| Ask | Command class |
| --- | --- |
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

Desktop TM: leave `SEED_REQUIRE_PROXY` unset so `resolveTransfermarktTransport` stays `direct`. Set `SEED_TM_TRANSPORT=proxy` only when the human opts into Decodo from the laptop.

FK: `FKAPI_BASE_URL` (listing origin, no `/kits` suffix) **or** `SEED_FK_FETCH=fixture`. Missing both → Join/FK throws.

Portraits/kits: complete `R2_*` **or** `SEED_OBJECT_DIR`.

**Done when:** the chosen command’s required names are set, and TM transport is Desktop `direct` unless the human asked for proxy.

### 4. Run

From repo root, after the build:

```bash
node --env-file=.env seed/apify/dist/cli.js grain league superliga development
node --env-file=.env seed/apify/dist/cli.js grain club-season superliga 190 2010/11 development
node --env-file=.env seed/apify/dist/cli.js join club superliga 2010/11 development
node --env-file=.env seed/apify/dist/cli.js join national-team 3436 2010 development
node --env-file=.env seed/apify/dist/cli.js join sentence "Seed Superliga 2010/11 into development"
```

Named-club kits after grains:

```bash
node --env-file=.env seed/fkapi/dist/cli.js club superliga 190 2010/11 development
```

CLI prints JSON `{ ok: true, … }` on success.

On `TransfermarktCircuitOpenError` or HTTP 403/429 after retries: **stop**. Quote the error. Leave transport as `direct` unless the human asked to switch.

**Done when:** the process exits 0 and stdout `ok` is true, or you stopped on circuit-open with the error quoted.

### 5. Prove

Open Catalog peek on the lane API (`GET /v1/catalog/peek` — development Nest is `https://api.kitcollective.app/v1/catalog/peek`) for a human eyeball.

Linear Evidence counts:

```bash
node --env-file=.env seed/mcp/scripts/verify-development-db.mjs
```

Attach that JSON. Leave `scripts/record-seed-development-proof.sh` for the MCP-path walker — it re-seeds and is the wrong proof after a grain/join CLI.

**Done when:** peek shows the scope you ran (sides, squads, kits as applicable), and any Linear counts are the verify script’s stdout.
