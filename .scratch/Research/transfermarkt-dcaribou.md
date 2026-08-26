# Transfermarkt via dcaribou scraper/datasets vs Apify

**Date:** 2026-08-18  
**Product:** KitCollective  
**Question:** Can [dcaribou/transfermarkt-scraper](https://github.com/dcaribou/transfermarkt-scraper) and/or [dcaribou/transfermarkt-datasets](https://github.com/dcaribou/transfermarkt-datasets) replace (or complement) Apify as the way KitCollective learns Transfermarkt facts — Country, League, Club, Season, TeamSeason, Player, squad numbers — **not** kits/artwork?

## Answer

**Neither repo is a drop-in replacement for Apify.** Use **datasets as a complement** (or as a fixture-backed fetch source) for club/league/player **identity** from 2012 onward. Do **not** run the scraper as our production fetch unless we deliberately take over Crawlee + anti-bot ops. Do **not** treat either repo as a Football Kit Archive substitute.

`transfermarkt-datasets` is a **published weekly dump** (12 CSV tables + DuckDB on Cloudflare R2, Kaggle mirror) produced by running `transfermarkt-scraper` plus Transfermarkt’s unofficial `ceapi` endpoints, then dbt. Superliga (`DK1`), Allsvenskan (`SE1`), and Eliteserien (`NO1`) are in the allowlist. History in `config.yml` is **2012–2025**, not Superliga `1998/99` / competition `0001`. Curated `clubs` and `players` are **latest-season snapshots**. Shirt numbers exist as **`game_lineups.number` (per match)**, not as a season-registered `PlayerClubSeason`. Market value, `agent_name`, player `image_url`, and Transfermarkt `url`s are first-class and must be dropped (ADR-0002). CC0 waives **dcaribou’s** rights in the packaging; it does not licence Transfermarkt’s database.

`transfermarkt-scraper` is a **Python/Crawlee HTML crawler** of `transfermarkt.co.uk`. GitHub SPDX is **null**; there is no `LICENSE` or `CONTRIBUTING.md`. The clubs crawler does **not** emit a squad-with-numbers table. The players crawler extracts a headline `number` from the **profile** page (current kit number, not a historical kader cell) and also `player_agent`, market value history, and `image_url`. `base_players.sql` in the datasets repo **drops** that `number`. Authors’ only legal note: Bright Data Web Unlocker is for CI DataDome blocks; users must comply with site terms.

Apify is **not uniquely licensed**. ADR-0002 already accepted TM ToS §11.1 for a facts-only seed. Live Apify fetch is **not wired**; `SEED_APIFY_FIXTURE` is required; production lane is rejected. What Apify still uniquely offers, if we ever wire it: **hosted** scrape of historical *kader* pages into the nested payload `seed/apify` already types (`competition → seasons[] → clubs[] → players[].jerseyNumber`) without us running Crawlee, Bright Data, or GitHub Actions acquire jobs. dcaribou’s published schema is match-analytics, not that catalog shape.

Related: [catalog-seed-sources.md](./catalog-seed-sources.md) (forbade TM scrape); [ADR-0002](../../docs/adr/0002-apify-transfermarkt-facts.md) (accepted TM facts via Apify anyway); [transfermarkt-felipeall-api.md](./transfermarkt-felipeall-api.md) (FastAPI HTML scraper, MIT, `season_id` on kader); [apify-transfermarkt-actors.md](./apify-transfermarkt-actors.md) (Store actors). FK seed (`seed/fkapi`) stays a separate source.

---

## Verdict

| Option | Instead of Apify? | Verdict |
| --- | --- | --- |
| **Datasets only** | Partial substitute for **identity** 2012–present | Complement. New fetch adapter + mapper. Drop forbidden columns. No registered squad numbers. No pre-2012 Superliga. |
| **Scraper only** | Same ToS class as Apify; we operate the bot | Not a shortcut. No SPDX licence. Would need crawler work to emit historical kader numbers into our payload. |
| **Both** | Datasets for dump; scraper if we outgrow 2012 / numbers | Same as “datasets complement + optional in-house Apify”. |
| **Neither as replacement** | Keep Apify as the named live-fetch vendor | Correct if `0001` and season-registered numbers stay acceptance. Live fetch still unwired. |

**Still needed in all cases:** a `FetchAdapter` (DuckDB/CSV or Crawlee stdout → `TransfermarktRawPayload`); the existing normalize/map path; hermetic fixtures (mapper tests must not hit R2, TM, or Apify); drop market value / agent / TM branding; `ExternalId` on our UUIDs; FK seed after facts for the same scope; production lane stays rejected.

---

## What KitCollective needs

From ADR-0002, `seed/apify` types, and [data-model](../../.scratch/Architecture/data-model.md): facts only into `Club`, `Season`, `TeamSeason`, `Player`, `PlayerClubSeason`, `CatalogLabel`, `ExternalId`. Forbidden: market value, agent PII, TM branding. Kits stay on `seed/fkapi`.

Legend: **Y** = field exists and is usable after dropping forbidden columns. **P** = derivable / sparse / wrong grain. **N** = not in schema or ToS/licence forbids the use.

| KitCollective entity | datasets (published) | scraper (raw JSON) | Notes |
| --- | --- | --- | --- |
| Country | Y (`countries`: `country_id`, `country_name`, `country_code`) | Y (`countries` crawler; competitions carry `country_id` / `country_name`) | Datasets `country_code` is TM league-ish (e.g. sample `GB1` on England), not ISO 3166. Our mapper wants `iso3166` (`DK`). |
| League | Y (`competitions`; `DK1` Superligaen in `config.yml` + scraper sample) | Y (`competitions`; `first_tier` + cups) | Allowlist is first-tier + selected cups/UEFA/NT. Not every TM competition. |
| Club | P (one row per club, **latest** scrape season; `last_season`) | P (club **detail** page: name, stadium, coach, `total_market_value`, `club_image_url`) | Historical membership is **not** a club-season table. Derive TeamSeason from `games` / `club_games`. |
| Season | P (`games.season` integer year, 2012–2025) | P (`--season`, default most recent) | No `startsOn`/`endsOn` / `calendarKind`. Superliga labels in our spec are `1998/99`-style split years. |
| TeamSeason | P (distinct `club_id` × `games.season` × `competition_id`) | P if we scrape each season’s competition page | Clubs who did not play a listed game that season are missing. Unused squad members never appear in appearances. |
| Player | Y (`players`, 35k–80k rows; TM `player_id`) | Y (profile: name, citizenship, `href`) | Snapshot `current_club_id` + `last_season`. Past clubs via `appearances.player_club_id` or `transfers`. |
| Squad numbers | **P** (`game_lineups.number` = match-worn) | **P** (profile headline `number`; **not** written to curated `players`) | Not “player wore N at club in season” on the kader page. Bench-only / unused numbers missing from lineups. |
| National teams | Y (`national_teams`) | Y (`national_teams` crawler) | Out of M1 catalog-seed critical path; available. |
| Kits / manufacturer / photos | N | N (`outfitter` on player profile is boot brand, not kit) | FK seed only. |
| Market value | Present — **must drop** | Present — **must drop** | `player_valuations`, `players.market_value_in_eur`, club `total_market_value`, lineup `player_market_value`. |
| Agent | `agent_name` — **must drop** | `player_agent.{name,href}` — **must drop** | No phone/email in these repos. Still ADR-0002 agent PII. |
| TM branding | `url`, `image_url` — **must drop** | `href`, `club_image_url`, `image_url` — **must drop** | Matches `tmLogoUrl` / `transfermarktUrl` in our strip list. |

---

## Card: transfermarkt-scraper

- **GitHub About (API 2026-08-18):** description `Collects data from Transfermarkt website`; homepage empty; topics `[]`; language Python; default branch `main`; created 2020-11-29; pushed 2026-08-04; stars 170; not archived. SPDX **null**.
- **What:** Recurses Transfermarkt HTML and prints **one JSON object per line** to stdout. Two hierarchies (README): club football `Confederations → Competitions → Clubs → Players → Appearances` (also Games → Game Lineups, Tournament Editions → Games); international `Confederations → Countries → National Teams → Players → Appearances`.
- **How data is produced:** Live HTTP crawl of `DEFAULT_BASE_URL = https://www.transfermarkt.co.uk`. Not a published dataset. Downstream consumer is `transfermarkt-datasets` (Poetry git dep on `main`).
- **Stack:** Python `^3.12`, Poetry, Crawlee `^1.8.3` with Parsel extra. CLI `python -m tfmkt` / script `tfmkt`. Docker `dcaribou/transfermarkt-scraper:main`. `pyproject.toml` version **0.5.0**; last **GitHub Release** is **v0.4.0** (2022-12-24) — tags lag `main`.
- **Crawlers (README table + source):**

  | Crawler | Input | Output (authors’ notes) | KitCollective-relevant fields in code |
  | --- | --- | --- | --- |
  | `confederations` | — | 5 confederations | Discovery only |
  | `competitions` | Confederation | Domestic + NT competitions | `country_id`, `country_name`, `country_code`, `competition_type`, `href` (e.g. `/superligaen/startseite/wettbewerb/DK1`) |
  | `countries` | Confederation | League-bearing nations | Country items |
  | `clubs` | Competition **`first_tier` only** | “Club squads with market value, coach, stadium” | **Club header**, not squad rows: `name`, `code`, `total_market_value`, `squad_size`, `coach_*`, `stadium_*`, **`club_image_url`**. `common.py` skips non-`first_tier`. |
  | `national_teams` | Country | Senior NT | NT profiles |
  | `players` | Club or NT | “Full player profile including market value history” | `name`, `last_name`, **`number`** from h1 `span`, `player_agent`, `current_market_value`, `highest_market_value`, `market_value_history`, `image_url`, `outfitter`, social URLs |
  | `appearances` | Player | Per-match stats | No jersey field in README table |
  | `games` | Competition | Results; `--season` selects edition | Season grain |
  | `game_lineups` | Game | Starting XI + substitutes | **`player['number']`** from `div.rn_nummer`; also `player_market_value` |
  | `tournament_editions` | Competition | Year, season, winner | NT/club cups |

- **Season argument:** `-s` / `--season`; “defaults to the most recent season.” Club URLs are seasonized as `{href}/saison_id/{season}`.
- **Samples:** `samples/competitions.json` includes Denmark Superligaen `DK1` and `DKP`. `samples/clubs.json` is Premier League **href-only** (2020). `samples/players.json` (one Leicester player) includes `player_agent` name+href; **no `number` in that sample** (crawler now sets it).
- **Anti-bot / authors’ legal note (README):** Optional Bright Data. Quote: “This optional integration is intended to stabilize this project's existing CI tests when requests from GitHub Actions infrastructure are blocked. It is not intended to bypass access controls or encourage unlawful or unauthorized scraping. Users are responsible for complying with applicable laws, website terms, and access restrictions.” Default = direct requests; `BRIGHTDATA_API_KEY` non-empty → DataDome-looking responses retry via Bright Data Web Unlocker (`tfmkt/brightdata.py`, endpoint `https://api.brightdata.com/request`). `common.py`: Transfermarkt “blocks direct requests from datacenter IPs such as CI runners”; `use_unlocker=False` for paths Bright Data refuses because TM `robots.txt` disallows them.
- **Licence:** No `LICENSE` file (GitHub contents 404). `pyproject.toml` has authors only — no licence classifier. GitHub licence API 404. Treat as **all rights reserved** for the **code**. Scraped facts remain Transfermarkt’s.
- **Contribute:** README section only (fork, edit `tfmkt/crawlers`, PR). No `CONTRIBUTING.md`.
- **Releases:** v0.0.1 (2021-01-30) through v0.4.0 (2022-12-24). v0.3.0 added player image URL and historical market value. v0.2.1 added `market_value` on players.
- **KitCollective use:** Replacing Apify with this means **we** run the crawler (Coolify/CI), hold `BRIGHTDATA_API_KEY` if datacenter IPs are blocked, reshape stdout JSONL into `TransfermarktRawPayload`, and still scrape TM. The crawlers do **not** emit our nested club-season-number document. Extending `clubs`/`players` to parse the kader table’s `#` column would be new work on an unlicensed codebase.

Sources: [README](https://raw.githubusercontent.com/dcaribou/transfermarkt-scraper/main/README.md), [pyproject.toml](https://raw.githubusercontent.com/dcaribou/transfermarkt-scraper/main/pyproject.toml), [tfmkt/common.py](https://raw.githubusercontent.com/dcaribou/transfermarkt-scraper/main/tfmkt/common.py), [tfmkt/crawlers/clubs.py](https://raw.githubusercontent.com/dcaribou/transfermarkt-scraper/main/tfmkt/crawlers/clubs.py), [tfmkt/crawlers/players.py](https://raw.githubusercontent.com/dcaribou/transfermarkt-scraper/main/tfmkt/crawlers/players.py), [tfmkt/crawlers/game_lineups.py](https://raw.githubusercontent.com/dcaribou/transfermarkt-scraper/main/tfmkt/crawlers/game_lineups.py), [tfmkt/brightdata.py](https://raw.githubusercontent.com/dcaribou/transfermarkt-scraper/main/tfmkt/brightdata.py), [samples/competitions.json](https://raw.githubusercontent.com/dcaribou/transfermarkt-scraper/main/samples/competitions.json), [samples/players.json](https://raw.githubusercontent.com/dcaribou/transfermarkt-scraper/main/samples/players.json), [GitHub repo API](https://api.github.com/repos/dcaribou/transfermarkt-scraper), [releases](https://api.github.com/repos/dcaribou/transfermarkt-scraper/releases).

---

## Card: transfermarkt-datasets

- **GitHub About (API 2026-08-18):** description `Extract, prepare and publish Transfermarkt datasets.`; homepage [Kaggle davidcariboo/player-scores](https://www.kaggle.com/datasets/davidcariboo/player-scores); topics `analytics`, `dataset`, `dbt`, `football`, `football-data`, `soccer-analytics`; language Python; default branch `master`; created 2020-12-26; pushed 2026-08-05; stars 473; SPDX **CC0-1.0**. **No GitHub Releases.**
- **What:** “Clean, structured and **automatically updated**” football dataset **built from Transfermarkt**. README scale (fetched 2026-08-18): 79k+ games, 37k+ players, 1.8M+ appearances; 12 tables.
- **How data is produced (not a separate rights grant):**
  1. **Scraper acquirer** — `scripts/acquiring` + image `dcaribou/transfermarkt-datasets`; workflow `acquire-transfermarkt-scraper.yml` cron `0 4 * * TUE,FRI` (Tue/Fri 04:00 UTC), default season `2025`; jobs: clubs → players → appearances, games → game_lineups; DVC commit to R2.
  2. **Unofficial TM REST** — `scripts/acquiring/transfermarkt-api.py` hits `https://www.transfermarkt.com/ceapi/marketValueDevelopment/graph/{player_id}` and `https://www.transfermarkt.co.uk/ceapi/transferHistory/list/{player_id}`. User-Agent `transfermarkt-datasets/1.0`. Authors document that the API “rejects whole runs when it decides to block us” (null-response guard after 2026-07-11 data loss). Workflow runs after scraper success.
  3. **Prepare** — dbt 1.11.5 + DuckDB (`build.yml` on push to `master`: `dvc_pull test prepare_local`, export DuckDB, `sync-r2`).
  4. **Publish** — public R2 `https://pub-e682421888d945d684bcae8890b0ec20.r2.dev/data/` (`transfermarkt-datasets.duckdb`, `players.csv.gz`, …); `sync-kaggle.yml` after successful `build`. README: “automatically updated **once a week**” (datapackage: same). Acquire is twice weekly; curated publish is on successful build/sync.
- **Coverage allowlist (`config.yml`):** seasons `[2012 … 2025]`. `competition_ids` include `DK1` Superligaen, `DKP` pokal, `SE1`, `NO1`, Big-5, selected other first tiers, cups, UEFA club comps, World Cup / Euro / Copa / AFCON / Asian Cup. Developer guide: competitions **not** in TM’s confederation hierarchy need hand JSON in `data/supplemental_competitions.json`.
- **Curated tables (README + `dbt/models/curated/models.yml` + datapackage):**

  | Table | Grain | KitCollective keep | Must drop (ADR-0002) |
  | --- | --- | --- | --- |
  | `competitions` | One row per tracked league/cup | `competition_id`, `name`, `country_*`, `type` | `url` |
  | `clubs` | One row per club, **latest** season (`base_clubs.sql` `where n = 1`) | `club_id`, `club_code`, `name`, `domestic_competition_id` | `total_market_value`, `url` |
  | `players` | One row per player, **latest** scrape (`base_players.sql` `where n = 1`) | `player_id`, `name`, `current_club_id`, `last_season` | `market_value_in_eur`, `highest_market_value_in_eur`, **`agent_name`**, `image_url`, `url` |
  | `games` | One row per match | `season`, `competition_id`, `home/away_club_id`, `date` | `url` |
  | `club_games` | Two rows per game | Club × season presence | — |
  | `appearances` | Player × game | `player_id`, `player_club_id`, `competition_id`, `date` | — (no jersey column) |
  | `game_lineups` | Player × game (XI + bench) | **`number`**, `club_id`, `player_id`, `date` | — |
  | `countries` | One row per country | `country_id`, `country_name` | `url` |
  | `national_teams` | One row per NT | `national_team_id`, `name`, `country_id` | `total_market_value`, `url` |
  | `player_valuations` | Player × date | **Do not import** | Entire table is market value |
  | `transfers` | Player movement | Optional for club history; not required for M1 | `transfer_fee`, `market_value_in_eur` |
  | `game_events` | Goals/cards/subs | Not catalog | — |

- **Squad-number hole (code, not README marketing):** Scraper `players.py` sets `attributes["number"]`. `base_players.sql` never selects `$.number`. Datapackage `players` schema has no number field. The only published jersey field is `game_lineups.number` (from the match line-up page).
- **Club/player snapshot hole:** `base_clubs.sql` / `base_players.sql` partition by id, `order by season desc`, keep `n = 1`. Historical names/squads in raw DVC are collapsed. Reconstruct TeamSeason from `games` (clubs that **played**), not from a season kader dump.
- **Licence:** Repo `LICENSE` is CC0 1.0. Kaggle metadata `"licenses": [{"CC0": "Public Domain"}]`. CC0 Statement of Purpose includes commercial use of **the affirmer’s** rights. **§4(c):** “Affirmer disclaims responsibility for clearing rights of other persons that may apply to the Work.” CC0 **§4(a)** does not waive trademarks. This is **not** a Transfermarkt licence.
- **Stack:** Python `^3.12,<3.13`, Poetry, dbt-duckdb, DVC (S3-compatible R2), frictionless, Streamlit, Kaggle CLI. Depends on `transfermarkt-scraper` git `main`.
- **Docs:** `docs/developer-guide.md` (acquire/prepare/sync). `docs/vision.md` is a **future** “multi-source canonical platform” — Transfermarkt remains the current source; do not treat vision as shipped schema. Contribute instructions live in README (no `CONTRIBUTING.md`). Streamlit about page: “dataset scraped from Transfermarkt”; no extra ToS waiver.
- **KitCollective use:** Best dcaribou option: a **fetch adapter** that reads a **pinned** DuckDB/CSV snapshot (gitignored `data/` or a tiny fixture slice), maps TM ids onto `ExternalId`, derives Season/TeamSeason from `games` for `DK1` 2012–2025, optionally infers numbers from `game_lineups` (document the grain: match-worn, players who appeared). Keep mapper tests hermetic — do not curl R2 in CI. Still need FK for kits. Still need live TM (Apify or scraper) if `0001` / pre-2012 Superliga or registered squad numbers stay required.

Sources: [README](https://raw.githubusercontent.com/dcaribou/transfermarkt-datasets/master/README.md), [LICENSE](https://raw.githubusercontent.com/dcaribou/transfermarkt-datasets/master/LICENSE), [docs/developer-guide.md](https://raw.githubusercontent.com/dcaribou/transfermarkt-datasets/master/docs/developer-guide.md), [docs/vision.md](https://raw.githubusercontent.com/dcaribou/transfermarkt-datasets/master/docs/vision.md), [config.yml](https://raw.githubusercontent.com/dcaribou/transfermarkt-datasets/master/config.yml), [datapackage_description.md](https://raw.githubusercontent.com/dcaribou/transfermarkt-datasets/master/transfermarkt_datasets/datapackage_description.md), [data/prep/dataset-metadata.json](https://raw.githubusercontent.com/dcaribou/transfermarkt-datasets/master/data/prep/dataset-metadata.json), [dbt/models/curated/models.yml](https://raw.githubusercontent.com/dcaribou/transfermarkt-datasets/master/dbt/models/curated/models.yml), [base_players.sql](https://raw.githubusercontent.com/dcaribou/transfermarkt-datasets/master/dbt/models/base/transfermarkt_scraper/base_players.sql), [base_clubs.sql](https://raw.githubusercontent.com/dcaribou/transfermarkt-datasets/master/dbt/models/base/transfermarkt_scraper/base_clubs.sql), [game_lineups.sql](https://raw.githubusercontent.com/dcaribou/transfermarkt-datasets/master/dbt/models/curated/game_lineups.sql), [players.sql](https://raw.githubusercontent.com/dcaribou/transfermarkt-datasets/master/dbt/models/curated/players.sql), [acquire-transfermarkt-scraper.yml](https://raw.githubusercontent.com/dcaribou/transfermarkt-datasets/master/.github/workflows/acquire-transfermarkt-scraper.yml), [acquire-transfermarkt-api.yml](https://raw.githubusercontent.com/dcaribou/transfermarkt-datasets/master/.github/workflows/acquire-transfermarkt-api.yml), [scripts/acquiring/transfermarkt-api.py](https://raw.githubusercontent.com/dcaribou/transfermarkt-datasets/master/scripts/acquiring/transfermarkt-api.py), [pyproject.toml](https://raw.githubusercontent.com/dcaribou/transfermarkt-datasets/master/pyproject.toml), [GitHub repo API](https://api.github.com/repos/dcaribou/transfermarkt-datasets).

---

## Legal (Transfermarkt + authors)

Transfermarkt T&C ([transfermarkt.com/intern/anb](https://www.transfermarkt.com/intern/anb), fetched 2026-08-18; scraper cites [transfermarkt.co.uk](https://www.transfermarkt.co.uk/)):

- **§3.2:** All rights in programs, trademarks, **databases**, and related material reside exclusively with Transfermarkt; reproduction only as stated in their licences.
- **§11.1:** “The User is not permitted to access or copy the Digital Content using bots, spiders, screen scraping or other automated processes.” AI training prohibited. **Text and data mining (UrhG §44b) expressly reserved.**
- **§10:** German law; Hamburg courts.

That is the same first-party ban [catalog-seed-sources.md](./catalog-seed-sources.md) recorded. ADR-0002 accepted scrape **via Apify** for historical club-season-number depth anyway; Apify does not change TM’s ToS. dcaribou does not change it either.

| Path | Who hits TM | Authors’ licence to us | TM ToS |
| --- | --- | --- | --- |
| Live Apify actor (unwired) | Apify cloud | Apify actor terms (not evaluated here) | §11.1 still applies |
| dcaribou scraper | **Us** (or Coolify) | **No SPDX** on the crawler | Same scrape |
| dcaribou datasets dump | dcaribou’s GHA + unofficial `ceapi` | CC0 on **their** packaging only | Same origin; unofficial API is still automated access |
| `SEED_APIFY_FIXTURE` | Nobody | Our fixture | Current KIT path |

CC0 is not a Transfermarkt licence. Running Bright Data against DataDome does not create permission (scraper README says so).

---

## What we would still need

If we consume **datasets**:

1. **Fetch adapter** — read pinned DuckDB/CSV (not live R2 in tests). Implement `FetchAdapter.fetch({ competition, fromSeason, toSeason })` → `TransfermarktRawPayload` or skip raw and map to `NormalizedFacts`.
2. **Mapper** — TM `DK1` / club_id / player_id → `ExternalId.system = transfermarkt`. Invent Season `label` / `startsOn` / `endsOn` / `calendarKind` (not in dump). Derive TeamSeason from `games`.
3. **Drop list** — `market_value*`, `agent_name`, `image_url`, TM `url`, whole `player_valuations`. Align with `stripForbiddenFields` (`marketValue`, `agent`, `tmLogoUrl`, `transfermarktUrl`).
4. **Numbers policy** — either accept `game_lineups` match-worn numbers (sparse) or keep a second fetch for kader pages.
5. **Ops** — weekly (or less) download of a snapshot; no Apify token; no Bright Data. Pin a hash so CI stays hermetic.
6. **Gap fill** — pre-2012 Superliga; clubs/players who never appear in listed games; ISO country codes.

If we run **scraper**:

1. Python 3.12 + Crawlee job (not Nest).
2. Likely `BRIGHTDATA_API_KEY` / `BRIGHTDATA_ZONE` (name only; never commit values).
3. Reshape JSONL → our nested payload; extend crawlers for historical `#` on kader tables.
4. Licence review of **unlicensed** code before vendoring.
5. Same TM ToS as Apify, with us as the operator.

**Unchanged:** FK seed after facts; mapper tests on fixtures; production lane rejected (`seed/apify/src/lane.ts`).

---

## What Apify still uniquely does

Today, Apify uniquely does **nothing in production**: CLI requires `SEED_APIFY_FIXTURE`; live fetch is not wired (`seed/apify/src/cli.ts`).

Architecturally (ADR-0002 + `seed/apify` types), Apify is the **named hosted fetch** for Transfermarkt **squad/season pages** into a document that already has `jerseyNumber` per player per club per season. dcaribou datasets do not ship that grain. dcaribou scraper could, only after we write the kader parser and run anti-bot ourselves.

Apify does **not** uniquely: licence TM data; avoid §11.1; provide kits; make mapper tests non-hermetic; unlock the production lane.

---

## Licence red flags

1. **Scraper has no licence file** — cannot vendor/fork on CC0/MIT assumptions.
2. **Datasets CC0 §4(c)** — does not clear Transfermarkt (or player-image) rights; commercial use of the *packaging* is not a TM grant.
3. **TM §11.1 + §3.2 + reserved TDM** — scrape and unofficial `ceapi` remain automated access.
4. **Must-drop columns** in the dump: market values, `agent_name`, `image_url`, TM URLs — same list as ADR-0002.
5. **Bright Data unlocker** — authors disclaim bypassing access controls; still our compliance if we run it.

## 1990s Superliga coverage

**1990s in the published weekly dump: no.** Superliga (`DK1`) games in `games.csv.gz` (R2, Last-Modified 2026-08-05) are seasons **2012–2025** only (2,312 rows). Dump-wide `games.season` min is **2005** (likely NT tournaments; TM uses `year-1` for summer cups). **Zero** game rows have `season < 2000`.

That matches the pipeline allowlist, not TM’s founding year (Superliga 1991):

| Control | What it says |
| --- | --- |
| `config.yml` `defintions.seasons` | `[2012, 2013, …, 2025]` — 14 years. `DK1` is in `competition_ids`. |
| Weekly acquire | `.github/workflows/acquire-transfermarkt-scraper.yml` cron default `SEASON=2025`. Historical 2012–2024 stay in DVC from prior runs; **1991 is never acquired**. |
| `seasons_list()` | `--seasons 2012-2014` expands to a list. A range **> 20 years raises**. `1991-2025` cannot be one acquire call. |
| dbt | `game_lineups` completeness test starts `2013-01-01`. `player_valuations.date` min test is `2000-01-20`. |

**If you ran the scraper with an older `--season`:** yes, the crawler will *request* 1990s URLs. There is no year floor. CLI `-s` / `--season` is an `int` (code default **2024**; README says “most recent”). `seasonize_href` builds:

- club / national team: `{href}/saison_id/{season}`
- first_tier competition (DK1): `{href}/plus/0?saison_id={season}`

`clubs.py` also strips `/saison_id/[0-9]{4}$` from stored hrefs. So `--season 1991` against a DK1 parent hits `…/wettbewerb/DK1/plus/0?saison_id=1991` and club kader `…/saison_id/1991`. Whether Transfermarkt still serves complete 1991 Superliga HTML is a TM content question; this repo does not ship those seasons. Same ToS §11.1 + DataDome as any live crawl. To publish them in the dump you would add years to `config.yml` and re-acquire — that is not the weekly artefact.

Related: [transfermarkt-felipeall-api.md](./transfermarkt-felipeall-api.md) (`season_id` on competition clubs + club kader).

Sources: [config.yml](https://raw.githubusercontent.com/dcaribou/transfermarkt-datasets/master/config.yml), [tfmkt/cli.py](https://raw.githubusercontent.com/dcaribou/transfermarkt-scraper/main/tfmkt/cli.py), [tfmkt/common.py](https://raw.githubusercontent.com/dcaribou/transfermarkt-scraper/main/tfmkt/common.py), [utils.seasons_list](https://raw.githubusercontent.com/dcaribou/transfermarkt-datasets/master/transfermarkt_datasets/core/utils.py), [acquire-transfermarkt-scraper.yml](https://raw.githubusercontent.com/dcaribou/transfermarkt-datasets/master/.github/workflows/acquire-transfermarkt-scraper.yml), [games.csv.gz](https://pub-e682421888d945d684bcae8890b0ec20.r2.dev/data/games.csv.gz).

This note feeds `/grill-with-docs`. It does not change ADR-0002, open Linear issues, or open a PR.
