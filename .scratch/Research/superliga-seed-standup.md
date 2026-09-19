# Standing up Superliga seed (chat → MCP → CLI → development Postgres)

**Date:** 2026-08-19  
**Product:** KitCollective  
**Question:** Nicklas wants to type something like “Superliga, clubs and squads from 1995 to today” in Cursor and have Seed MCP / CLI run it so facts land in the development Postgres. How exactly do we stand that system up? What already exists vs what is missing?

## Answer

**The chat → MCP → CLI → Postgres *shell* already exists. Live Transfermarkt fetch does not.** Saying that sentence in Cursor is supposed to become `seed_apify({ competition: "superligaen", fromSeason: "1995", toSeason: "today" })` (lane omitted → development). Today that tool only works if `SEED_APIFY_FIXTURE` is set, and the fixture adapter **ignores** competition and season args — it dumps `seed/apify/fixtures/superliga-mini.json` (two seasons, two clubs). Nest (`apps/api`) must not call Apify; seed writes catalog rows, Nest reads them. Production from chat is rejected (ADR-0009). Kits stay on `seed_fk` **after** facts for the same scope.

The missing slice is a live `FetchAdapter`: pin Store actor `automation-lab/transfermarkt-scraper`, map slug `superligaen` → TM `DK1`, loop `saison_id` 1995…current start year, collect **all clubs that season** (the 19 Aug probe was **FCK only**), read the named `squads` dataset (`shirtNumber` present on 2000/2010/2025 FCK), map into `TransfermarktRawPayload`, then existing normalize → `filterSeasons` → `mapFacts` → `DATABASE_URL` on `kc-development-postgres`. `0001` in `season-range.ts` is an **index into the already-fetched payload**, not Superliga’s 1991 founding year — for this sentence pass `"1995"`, not `"0001"`.

Coolify has the development Postgres (healthy) and **zero** seed/apify job resources. Compose files exist in git; they are not deployed. `.env.example` does not name `APIFY_TOKEN` or `SEED_APIFY_FIXTURE`. Cursor Seed MCP example only passes `SEED_REPO_ROOT`.

Related: [ADR-0002](../../docs/adr/0002-apify-transfermarkt-facts.md), [ADR-0003](../../docs/adr/0003-seed-in-product-repo.md), [ADR-0005](../../docs/adr/0005-fk-seed-bulk-ingest.md), [ADR-0006](../../docs/adr/0006-scoped-seed-runs.md), [ADR-0007](../../docs/adr/0007-seed-via-cursor-mcp.md), [ADR-0008](../../docs/adr/0008-development-postgres-on-cx33.md), [ADR-0009](../../docs/adr/0009-seed-default-development.md), [stamdata-seed/spec.md](../stamdata-seed/spec.md), [apify-transfermarkt-actors.md](./apify-transfermarkt-actors.md) (live probe 2026-08-19).

This note feeds `/grill-with-docs`. It does not open Linear issues or a PR.

---

## 1. Target sentence → exact MCP / CLI invocation

ADR-0007: the operator talks **natural language**. They do not type CLI flags. The **Cursor agent** maps the sentence onto Seed MCP tool args.

| Human says | Agent sends |
| --- | --- |
| “Superliga, clubs and squads from 1995 to today” | MCP tool **`seed_apify`** with `competition: "superligaen"`, `fromSeason: "1995"`, `toSeason: "today"`, `lane` **omitted** |

Tool schema (`seed/mcp/src/server.ts`): `competition`, `fromSeason`, `toSeason`, optional `lane`. Example slug in the schema is `superligaen`. Description already says: pipeline fetch → normalize (facts only) → map; `0001` = first season; default development; staging only when named; production impossible; run Apify before FK.

MCP then spawns (`seed/mcp/src/run-cli.ts` `buildSeedCliInvocation`):

```text
pnpm --filter @kit/seed-apify run seed -- superligaen 1995 today development
```

(`lane` omitted on the tool becomes `development` via `resolveSeedLane`.)

Equivalent Coolify job env (`seed/coolify/docker-compose.apify-job.yml`): `SEED_COMPETITION=superligaen`, `SEED_FROM_SEASON=1995`, `SEED_TO_SEASON=today`, `SEED_LANE=development`.

Do **not** send `fromSeason: "0001"` for this sentence. Do **not** send `lane: "production"`. Do **not** call `seed_fk` until Club + Season rows exist for the same scope (ADR-0006, MCP `seed_fk` description).

CLI entry (`seed/apify/src/run.ts`): `fetchAdapter.fetch({ competition, fromSeason, toSeason })` → `normalize` → `filterSeasons` → `mapFacts` into the lane `DATABASE_URL`. **No `apps/api` hop.** Spec: “Do not add a Nest HTTP seed endpoint.”

---

## 2. What already runs today (fixture path)

End-to-end **hermetic** path exists. Live TM / Apify does not.

| Piece | State | Source |
| --- | --- | --- |
| MCP tools `seed_apify` / `seed_fk` | Coded; thin CLI wrapper | `seed/mcp/src/server.ts`, `run-cli.ts` |
| CLI arity + `production` reject | Coded | `seed/apify/src/run.ts` `parseCliArgs`; `lane.ts` |
| Lane default development | Coded | `seed/shared/src/lane.ts`; ADR-0009 |
| Fixture fetch | **Only** fetch implementation | `seed/apify/src/cli.ts`: exit 1 unless `SEED_APIFY_FIXTURE` |
| Fixture adapter | Ignores `FetchParams` | `seed/apify/src/fetch/fixture-adapter.ts` — reads JSON once, returns whole file |
| Nested payload type | Coded | `types.ts` `TransfermarktRawPayload` (`competition → seasons[] → clubs[] → players[].jerseyNumber`) |
| Strip market value / agent / TM URLs | Coded | `normalize/index.ts` `stripForbiddenFields` |
| Season slice `0001` / `today` / label | Coded **on fetched seasons** | `season-range.ts` |
| Upsert on `ExternalId` `(transfermarkt, value)` | Coded + tested | `map/index.ts`; `tests/seed-cli.test.ts` vs `fixtures/superliga-mini.json` |
| Mini fixture content | 2 seasons (`22/23`, `23/24`), FCK + Brøndby, `jerseyNumber`, poison fields for strip tests | `seed/apify/fixtures/superliga-mini.json` (`competition.id: "dk1"`) |
| Coolify compose + Dockerfile | Files in git; **not deployed** | `seed/coolify/docker-compose.apify-job.yml`, `Dockerfile`, `README.md` |
| CX33 development Postgres | **Running, healthy** (`kc-development-postgres`) | Coolify MCP `search_resources` 2026-08-19 |
| Coolify seed/apify job resource | **None** (0 hits for `seed` / `apify`) | Same Coolify query |
| Cursor Seed MCP | Example only | `.cursor/mcp.json.example` `seed` stdio → `seed/mcp/dist/index.js`; env **only** `SEED_REPO_ROOT` |
| `apify-client` / live adapter | **Absent** | `seed/apify/package.json` has no Apify dep; `fetch/index.ts` exports fixture only |

What a wired-MCP chat can do **today**: if `SEED_APIFY_FIXTURE` points at the mini JSON **and** `DATABASE_URL` is the CX33 development volume **and** `seed/mcp/dist` + `seed/apify/dist` are built, `seed_apify` upserts those two seasons. Passing `fromSeason: "1995"` against that fixture throws `Season not found: 1995` (`filterSeasons` matches `label` or `externalId` only).

CI stays fixture-only by design (spec testing decisions; ADR-0002 mitigations).

---

## 3. Gap: live Apify `FetchAdapter`

`FetchAdapter` (`seed/apify/src/fetch/adapter.ts`) is the seam: `fetch({ competition, fromSeason, toSeason }) → TransfermarktRawPayload`. Compose comment names this as the KIT-8 adapter; it was never landed (`docker-compose.apify-job.yml`: “when KIT-8 fetch adapter is wired”).

**Pin (live probe 2026-08-19, [apify-transfermarkt-actors.md](./apify-transfermarkt-actors.md)):** community actor `automation-lab/transfermarkt-scraper`.

| Input / output | Proven 2026-08-19 | Not proven |
| --- | --- | --- |
| `mode: "clubs"` + `season` integer | FCK 2000, 2010, 2025 squads | League-wide Superliga; `season: 1995` |
| Named dataset `squads` (`run.output.squads`) | **Required** — default dataset empty in clubs mode | Published schema for every squad column |
| `shirtNumber` on those squad rows | 36/38 (2000), 29/32 (2010), 37/40 (2025) | Historical kader `#` as a documented field (README still says profile “current”) |
| `haketa/transfermarkt-scraper` | — | **FAILED** WAF HTTP 202 |
| Henry career `#` | `kawsar` + `rueckennummern` + residential | Not needed for club-season catalog numbers |

**What the adapter must do:**

1. Resolve competition slug → TM code `DK1` (see §4). No mapping exists in `seed/apify` today (`fkapi` has a different slug table).
2. Expand `fromSeason`/`toSeason` to integer start years. `1995` → 1995. `today` → current football season start year (actor README: omit `season` = current; `2025` means 2025/26). Loop **one actor run per season** (actor takes a single `season` int).
3. For each season, collect **every Superliga club that season** (see §5 — probe did not do this), then `mode: "clubs"` + that `season`.
4. Read **named** `squads` (and club identity from named `clubs` if needed). Default dataset is empty in clubs mode.
5. Group rows into `TransfermarktRawPayload`. Invent calendar bounds actors do not ship: fixture uses `split_year`, `startDate` 1 Jul, `endDate` 30 Jun (`superliga-mini.json`). Competition node: `id` TM `DK1` / fixture `"dk1"`, `name` Superligaen, country Denmark `iso3166: DK`.
6. Map squad `shirtNumber` → `players[].jerseyNumber` (omit if missing). **Drop** market value, agent PII, TM URLs/images — `stripForbiddenFields` already enforces this if they leak in.
7. Return the nested document. `runSeed` then `filterSeasons` (so a live fetch that over-fetches can still slice).

**CLI branch (code, not present):** if `SEED_APIFY_FIXTURE` set → fixture adapter (CI / hermetic). Else if `APIFY_TOKEN` set → live adapter. Else fail with a message that names both. Today live is not a branch — fixture is mandatory.

**Env names (values never in git):**

| Name | Where documented today | Role |
| --- | --- | --- |
| `APIFY_TOKEN` | Coolify compose + `seed/coolify/README.md` only | Apify API token for `actor().call` |
| Actor id | Not an env yet | Default `automation-lab/transfermarkt-scraper`; optional `SEED_APIFY_ACTOR_ID` is a reasonable name to add in `.env.example` |
| `SEED_APIFY_FIXTURE` | `cli.ts` error string only — **not** in `.env.example` | Path to hermetic JSON |
| `DATABASE_URL` | `.env.example` | Development lane Postgres |
| `SEED_STAGING_DATABASE_URL` | `.env.example` | Staging ingest when `lane=staging` |

Tests must keep recorded actor JSON under `seed/apify/fixtures/` — do not call Apify or TM from CI.

**Cost (order of mag., same probe):** one club-season ~$0.04 PPE on `automation-lab`. ~12 clubs × ~31 seasons (1995→2025) ≈ **$15** before retries. FREE plan on the probe account was `$5` monthly credits. First live acceptance should be **one Superliga season, all clubs**, development lane — not 1995→today in one chat.

Career `rueckennummern` (`kawsar`) is a **different** grain (player career + NT). Do not block this standup on it.

---

## 4. Superliga identity: slug → `DK1`; 1995; “today”

| Phrase | What it means here | Evidence |
| --- | --- | --- |
| Superliga / Superligaen | TM competition code **`DK1`**. MCP example slug **`superligaen`**. | MCP schema; dcaribou sample `/superligaen/startseite/wettbewerb/DK1`; FK map `superliga` → `DK1` |
| Slug allowlist (missing in apify) | Agent/adapter should accept `superligaen`, `superliga`, `dk1`, `DK1`. **`seed/apify` has no competition table.** `seed/fkapi/src/cli-args.ts` only knows `superliga` and `championship`. | Code |
| `1995` | TM `saison_id` **1995** = season **1995/96**. automation-lab: “season start year … `2025` means 2025/26.” Pass `fromSeason: "1995"` (label or id the adapter writes, e.g. `"1995"` / `"1995/96"`). | Actor README; user sentence |
| `today` | `filterSeasons`: last season **in the fetched, sorted payload** (`toSeason === "today"` → `sorted.length - 1`). Live adapter must include the current start year in what it fetches, or “today” means “last year we pulled.” | `season-range.ts` |
| `0001` | **Spec / MCP copy:** first season of that competition. Superliga inaugural is **1991** (spring 1991, then split-year 1991/92). **Code:** `/^0\d{3}$/` → `parseInt - 1` as an **index into already-fetched seasons**. Fixture with two seasons: `0001` = `22/23`, not 1991. FK seed **does** rewrite `0001` → `1991/92` before fetch. Apify seed does **not**. | `season-range.ts`; `catalog-seed-sources.md`; `fkapi` `firstSeasonLabel` |
| Founding vs this ask | User asked **1995 → today**, not founding. Do not silently substitute `0001`. | This question |

Live fetch must **honor `FetchParams`**. The fixture adapter does not — that is acceptable for CI only.

Calendar: Superliga is `split_year` in the fixture and in catalog research. Actor datasets do not emit `startDate` / `endDate` / `calendarKind`; the adapter invents them (same as dcaribou research: “invent Season label / startsOn / endsOn”).

---

## 5. League-wide vs one club (probe was FCK only)

The 19 Aug probe ran **one club** (FCK) × three seasons. It did **not** return the rest of Superliga.

**`automation-lab` documented inputs** ([Store README + input schema](https://apify.com/automation-lab/transfermarkt-scraper.md), fetched 2026-08-19):

| Mode | How you name the target | What you get |
| --- | --- | --- |
| `clubs` | `searchQueries` (club **names**, e.g. `"FC Barcelona"`) or `startUrls` (club URLs). `maxPlayersPerQuery` = max matching **entities** per query. `season` = start year. | Named `clubs` + named `squads` |
| `competitions` | `startUrls` like `…/premier-league/startseite/wettbewerb/GB1` + `season` | Named `competitions` + `season_statistics` (**standings**, not squads) |
| `players` / `transfers` | Wrong grain for TeamSeason | Skip |

There is **no** `competitionCodes` field on this actor. A Superliga analog of the competitions example is:

```json
{
  "mode": "competitions",
  "startUrls": ["https://www.transfermarkt.com/superligaen/startseite/wettbewerb/DK1"],
  "season": 1995
}
```

That is the documented way to get **which clubs were in DK1 that season** (standings rows). Squads still need a **second** step: `mode: "clubs"` + each club name or `…/startseite/verein/{id}` + the same `season`.

**Documented one-shot league walk (different actor):** `haketa/transfermarkt-scraper` `competitionCodes: ["DK1"]` + `season` — README: “Every club and player in the league.” **Failed WAF** on the probe account. Do not treat it as the vendor until a residential retry succeeds.

**Current-only league walk (wrong years):** `solidcode/transfermarkt-scraper` `…/wettbewerb/DK1` + `includeCompetitionClubs` + `includeClubSquad` — no `season` input ([apify-transfermarkt-actors.md](./apify-transfermarkt-actors.md)).

**Grill choices for the adapter:**

1. **Two-phase automation-lab (matches README):** `competitions` + `season` → club list; then N `clubs` runs (or one run with many `startUrls` / `searchQueries` and a high `maxPlayersPerQuery`). Unproven for DK1; cheapest to probe for **one season**.
2. **Hardcoded Superliga-ever TM club ids** (~33 historically; ~12 per modern season — `catalog-seed-sources.md`) and loop `clubs` + `season`. Matches the **proven** FCK grain. Misses a club that is not on the list.
3. **kawsar / curious_coder** competition or kader URLs — generic tables, heavier mapper, residential often required.

Until a cheap DK1 `competitions` (or haketa retry) probe exists, “all Superliga clubs that season” is **design, not evidence**. Do not claim the chat sentence works league-wide on the 19 Aug FCK runs.

---

## 6. Human wiring: Cursor Seed MCP, Coolify job, secret **names**

Wizard-class (human must paste tokens / click Coolify). Agent cannot complete these from chat.

### Cursor Seed MCP (once)

1. Copy `.cursor/mcp.json.example` → `.cursor/mcp.json` (gitignored). Keep the `seed` stdio server: `node seed/mcp/dist/index.js`.
2. `pnpm --filter @kit/seed-mcp build` (and `@kit/seed-apify` build — MCP runs `pnpm --filter @kit/seed-apify run seed` → `node dist/cli.js`).
3. Give the MCP **process** (not Nest):
   - `SEED_REPO_ROOT` — already in the example (`${workspaceFolder}`)
   - `DATABASE_URL` — development CX33 volume (ADR-0008). **Missing from the example `env` block.** Without it, CLI throws `DATABASE_URL is required for development lane`.
   - Later: `APIFY_TOKEN` (live). Leave `SEED_APIFY_FIXTURE` **unset** for live; set it only for hermetic demos.
4. Coolify MCP is a **separate** server in the same example (`COOLIFY_MCP_URL` + `COOLIFY_API_TOKEN`). It owns host/jobs (ADR-0007), not the mapper.

### Coolify job (optional for long runs)

- Import `seed/coolify/docker-compose.apify-job.yml` as a Docker Compose resource, restart **never** / one-shot (`seed/coolify/README.md`).
- Limits already in compose: 1 CPU / 512M so seed cannot starve Nest on the CX33 (ADR-0008).
- Env **names:** `DATABASE_URL`, `SEED_COMPETITION`, `SEED_FROM_SEASON`, `SEED_TO_SEASON`, `SEED_LANE` (default development), `APIFY_TOKEN` when live exists.
- **Do not** put production credentials on this job (ADR-0009, README).
- 2026-08-19: **no** Coolify resource named seed/apify. `kc-development-postgres` is the target database.

### Secret names to add to `.env.example` (names only)

Already present: `DATABASE_URL`, `SEED_STAGING_DATABASE_URL`, `COOLIFY_API_URL`, `COOLIFY_API_TOKEN`, `COOLIFY_MCP_URL`.

**Missing names** that standup needs: `APIFY_TOKEN`, `SEED_APIFY_FIXTURE` (fixture-only), optional actor id. Never commit values. Rotate the Apify token used in the 19 Aug probe (pasted in chat; research already says rotate).

Product secrets for Nest stay in GitHub Environments `development` / `staging` / `production`. Apify token is seed-job / Cursor-MCP only — not Expo/Astro/admin.

---

## 7. Ordered standup (code vs wizard vs grill)

Do **not** file tickets from this note. `/grill-with-docs` owns decisions; `/to-spec` / `/to-tickets` come after.

**0. Grill (decisions before code)**

- Pin `automation-lab` vs retry haketa with residential vs two-phase competitions→clubs.
- Canonical slug (`superligaen` vs `superliga` vs `dk1`) and allowlist.
- Whether `0001` on Apify should mean TM 1991 (FK already does) or stay a payload index.
- Who invents `label` / `startsOn` / `endsOn` (`1995/96` vs `"1995"`).
- First live proof: one season × all clubs vs FCK-only vs 1995→today (cost).
- Laptop MCP vs Coolify job for the long loop (ADR-0007 story 11).

**1. Wizard (human, unblocks live)**

- Copy Seed MCP config; build `dist`; put `DATABASE_URL` on the MCP process.
- Create Apify token; document `APIFY_TOKEN` in `.env.example`; store on Coolify **development** env when the job exists. Never production.
- Optional: import compose as a Coolify job pointing at `kc-development-postgres`.
- Rotate the leaked probe token.

**2. Code (after grill)**

- `createApifyFetchAdapter` implementing `FetchAdapter`; CLI: fixture XOR live.
- Slug → `DK1`; season int loop; league-wide strategy from grill; map `squads` → `TransfermarktRawPayload`.
- Recorded actor JSON fixture for tests; keep `SEED_APIFY_FIXTURE` in CI.
- Optional `seed/apify/spec/handoff.md` (kickoff spec required it; only FK has one).
- Document env **names** in `.env.example` and the Seed MCP example `env` block (`DATABASE_URL`, `APIFY_TOKEN`).

**3. Live proof (development only)**

- One DK1 season, all clubs (or fail closed if league-walk probe fails).
- Inspect counts via catalog stats / Drizzle Studio — **not** a Nest seed route.
- Then widen `1995`→`today` on a paid Apify plan if credits allow.

**4. After facts (not this sentence)**

- `seed_fk` same competition + range (ADR-0005, ADR-0006). Kits still FK.

---

## 8. What is **not** this path

| Not | Why |
| --- | --- |
| Nest (`apps/api`) calling Apify | ADR-0003: Nest never imports `seed/`. Spec: no HTTP seed endpoint. Catalog **reads** Postgres. |
| `felipeall/transfermarkt-api` (Fly.io or self-host) | Same TM §11.1 class; Fly demo 500 on `DK1`; open 403/503/202; we would operate anti-bot. [transfermarkt-felipeall-api.md](./transfermarkt-felipeall-api.md) |
| dcaribou weekly dump for 1990s | Published `games.csv.gz` DK1 is **2012–2025** only. No registered kader `#` (`game_lineups.number` is match-worn). [transfermarkt-dcaribou.md](./transfermarkt-dcaribou.md) |
| Licensed Sportmonks / API-Football as the Apify source | Kickoff spec explicitly rejected that substitution. |
| Production ingest from chat | `parseLane("production")` throws; ADR-0009. Promotion is a later ops path. |
| Kits, manufacturers, archive photos | `seed_fk` / ADR-0005 **after** facts. This sentence is clubs + squads only. |
| Henry `rueckennummern` / NT career numbers | `kawsar` probe; not required for club-season pickers. |
| World dump / baked “Denmark first” | ADR-0006: scoped competition + range. |

Legal unchanged: ADR-0002 accepted TM ToS §11.1 for **facts-only** via Apify. A Store actor is not a TM licence. Drop MV / agent / branding.

---

## Red flags (for `/grill-with-docs`)

1. Live fetch unwired — MCP/CLI are a hollow shell without the adapter.
2. `0001` in `season-range.ts` ≠ Superliga 1991 unless fetch returned that span.
3. Slug mismatch: MCP `superligaen`, fixture `dk1`, FK `superliga`.
4. Clubs-mode default dataset empty; must read named `squads`.
5. League-wide Superliga **unproven**; FCK-only is proven.
6. `saison_id` 1995 **unproven** (probe 2000 / 2010 / 2025).
7. FREE Apify credits will not cover 1995→today × 12 clubs.
8. `APIFY_TOKEN` / `SEED_APIFY_FIXTURE` not in `.env.example`; Seed MCP example does not pass `DATABASE_URL`.
9. Coolify job YAML exists; **no** Coolify resource. Postgres **does**.
10. No `seed/apify/spec/handoff.md`.

This note feeds `/grill-with-docs`. It does not change ADRs, open Linear issues, or open a PR.
