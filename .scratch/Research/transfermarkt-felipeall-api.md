# Transfermarkt via felipeall FastAPI vs Apify / dcaribou

**Date:** 2026-08-18  
**Product:** KitCollective  
**Question:** Can [felipeall/transfermarkt-api](https://github.com/felipeall/transfermarkt-api) replace (or precede) live Apify as the way KitCollective learns Transfermarkt facts — Country, League, Club, Season, TeamSeason, Player, squad numbers — **not** kits? Separately: which Superliga years exist in the dcaribou **published dump** vs a crawler `--season` older than 2012?

## Answer

**Do not point KitCollective at the public Fly.io demo, and do not treat this repo as a licensed Transfermarkt API.** It is a **self-hosted FastAPI HTML scraper** of `transfermarkt.com` pages (BeautifulSoup + lxml XPath + `requests`). MIT licences the **Python service**, not Transfermarkt’s database. That is the same ToS class as Apify and dcaribou (`§11.1` bots/scraping reserved). ADR-0002 already accepted facts-only scrape; this does not make that cleaner.

As a **self-hosted** fetch it is closer to Apify’s *shape* than the dcaribou dump: `GET /competitions/{id}/clubs?season_id=` plus `GET /clubs/{id}/players?season_id=` is a historical *kader* roster, and `GET /players/{id}/jersey_numbers` is the career `#` table. The club-players schema **does not include jersey numbers**; you compose them. The hosted app at `https://transfermarkt-api.fly.dev` returned **HTTP 500** on `GET /competitions/DK1/clubs?season_id=2012` when probed 2026-08-18. Open issues since 2025–2026 report 500/503/403/202 because Transfermarkt blocks or returns empty HTML and `self.page` is `None`. Last **code** commit on `main` is **2025-04-13**; GitHub Release **v3.0.0** is **2024-12-29**. Python `^3.9`. Not a PyPI client library.

**1990s Superliga in the dcaribou weekly dump: no.** Published `games.csv.gz` (R2, 2026-08-05) has `DK1` seasons **2012–2025** only. The scraper *will request* `--season 1991` URLs (`saison_id`); that is not in the dump. See [transfermarkt-dcaribou.md](./transfermarkt-dcaribou.md) § 1990s.

Related: [ADR-0002](../../docs/adr/0002-apify-transfermarkt-facts.md) (facts only; live Apify unwired); [catalog-seed-sources.md](./catalog-seed-sources.md); [transfermarkt-dcaribou.md](./transfermarkt-dcaribou.md); [apify-transfermarkt-actors.md](./apify-transfermarkt-actors.md) (Store actors vs IP block).

---

## Verdict

| Option | Instead of live Apify? | Verdict |
| --- | --- | --- |
| **felipeall Fly.io demo** | No | Testing toy. Rate-limited by README. 500 on DK1 when probed. Do not seed from it. |
| **Self-host felipeall** | Possible *fetch* substitute | Same scrape as Apify, **we** operate anti-bot. Historical kader + jersey-numbers endpoints exist. Club squad payload **omits** `#`. HTML/XPath rot + TM blocks are open and unfixed. Drop market value, agent, TM URLs/images. |
| **Import `app.services` in-process** | Same scrape, no HTTP | FastAPI app, not a published SDK. Still live TM HTTP from our job. |
| **dcaribou dump** | Complement for 2012–2025 identity | **No 1990s Superliga.** No registered squad numbers (match-worn lineups only). |
| **Keep fixture-only Apify** | Current KIT path | Live fetch still unwired (`SEED_APIFY_FIXTURE`). |

**Still needed in all live-TM cases:** `FetchAdapter` → `TransfermarktRawPayload`; hermetic fixtures; drop forbidden columns; `ExternalId`; FK seed for kits; production lane stays rejected.

---

## Question 1 — 1990s Superliga vs dump vs crawler

Danish Superliga started **1991** (TM competition id `DK1`). KitCollective “competition `0001`” is that first season.

### Published weekly dump (dcaribou/transfermarkt-datasets)

**1990s: no.**

| Evidence | Finding |
| --- | --- |
| `config.yml` `defintions.seasons` | `[2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]`. `DK1` is in `competition_ids`. |
| R2 `games.csv.gz` (Last-Modified 2026-08-05) | 88,958 games. `games.season` min **2005**, max **2025**. Rows with `season < 2000`: **0**. **`DK1`: 2,312 games, seasons 2012–2025 only.** (`SE1`/`NO1` only 2024–2025 — added to the allowlist in 2026.) |
| Acquire workflow | Cron default `SEASON=2025`. Weekly job refreshes the current year; it does not backfill 1991. |
| `seasons_list()` | `"2012-2014"` expands. A range **longer than 20 years raises**. You cannot acquire `1991-2025` in one `--seasons` string. |
| dbt | `game_lineups` date-part test `2013-01-01`–`2026-01-01`. `player_valuations.date` min `'2000-01-20'`. |
| Datapackage / README | “automatically updated **once a week**”; 12 tables; no claim of 1990s Superliga. |

Curated `clubs` / `players` are **latest-season snapshots** (`base_clubs.sql` / `base_players.sql` `n = 1`). TeamSeason for DK1 2012–2025 is derivable from `games`, not from a 1991 kader dump.

### What the scraper would do with older `--season`

**The crawler has no year floor.** It will HTTP-get whatever `saison_id` you pass.

| File | Behaviour |
| --- | --- |
| `tfmkt/cli.py` | `-s` / `--season`, `type=int`, **default `2024`** (README: “defaults to the most recent season” — the code default is hardcoded 2024, not “latest”). |
| `tfmkt/common.py` `seasonize_href` | Club/NT: `{base_url}{href}/saison_id/{season}`. First-tier (DK1): `{href}/plus/0?saison_id={season}`. Cups: `?saison_id=` on `pokalwettbewerb`. |
| `tfmkt/crawlers/clubs.py` | Requests the seasonized competition page, then club detail URLs; strips `/saison_id/[0-9]{4}$` from stored `href`. Default `season=2024` in `run()`. |
| README | Club kader example uses `/kader/verein/281/saison_id/2019`. Games `--season` examples are World Cup `2021` / Euro `2023` (TM summer-tournament off-by-one). |

So `--season 1991` against a DK1 competitions parent **requests** `https://www.transfermarkt.co.uk/…/wettbewerb/DK1/plus/0?saison_id=1991` and club pages `…/saison_id/1991`. Whether those HTML pages are complete for 1991/92 Superliga is Transfermarkt’s archive, not dcaribou’s dump. Anti-bot / Bright Data / §11.1 still apply. Putting 1990s into the **published** CSVs would mean editing `config.yml` seasons and running acquire — not downloading this week’s R2 file.

Sources: [config.yml](https://raw.githubusercontent.com/dcaribou/transfermarkt-datasets/master/config.yml), [games.csv.gz](https://pub-e682421888d945d684bcae8890b0ec20.r2.dev/data/games.csv.gz), [cli.py](https://raw.githubusercontent.com/dcaribou/transfermarkt-scraper/main/tfmkt/cli.py), [common.py](https://raw.githubusercontent.com/dcaribou/transfermarkt-scraper/main/tfmkt/common.py), [clubs.py](https://raw.githubusercontent.com/dcaribou/transfermarkt-scraper/main/tfmkt/crawlers/clubs.py), [utils.seasons_list](https://raw.githubusercontent.com/dcaribou/transfermarkt-datasets/master/transfermarkt_datasets/core/utils.py), [acquire-transfermarkt-scraper.yml](https://raw.githubusercontent.com/dcaribou/transfermarkt-datasets/master/.github/workflows/acquire-transfermarkt-scraper.yml), [models.yml](https://raw.githubusercontent.com/dcaribou/transfermarkt-datasets/master/dbt/models/curated/models.yml).

---

## Question 2 — Card: felipeall/transfermarkt-api

### GitHub About (API 2026-08-18)

- **description:** `API service to get data from Transfermarkt`
- **homepage:** [https://transfermarkt-api.fly.dev](https://transfermarkt-api.fly.dev)
- **topics:** `fastapi`, `football`, `players`, `scraper`, `soccer`, `transfermarkt`, `webscraping`
- **language:** Python · **default branch:** `main` · created 2023-02-16 · **pushed_at** 2026-04-12 (Fly.io noise; see commits)
- **stars:** 441 · **forks:** 156 · **open issues:** 19 · **not archived**
- **SPDX:** **MIT** (`license.spdx_id` + `LICENSE` file, Copyright 2023 Felipe Allegretti)
- **Releases:** latest tag **v3.0.0** published **2024-12-29** (Pydantic schemas refactor). Tags exist through v2.0.x.
- **HEAD of `main`:** `bee4c496` **2025-04-13** `fix: parse fee value with html tags (#105)`. No further *code* commits on `main` after that date (query `since=2025-04-14` empty).

### What it is (FastAPI vs library)

README: “lightweight … interface for extracting data from Transfermarkt **by applying web scraping processes** and offering a **RESTful API service via FastAPI**.”

| Artefact | Fact |
| --- | --- |
| `pyproject.toml` | Poetry package `transfermarkt-api` **3.0.0**, `python = "^3.9"`, `license = "MIT"`, `packages = [{include = "app"}]`. Deps: FastAPI 0.115.6, uvicorn, slowapi, requests, beautifulsoup4, lxml, pydantic. **No setup.py.** No console-script client. |
| `Dockerfile` | `python:3.9-slim-bullseye`; `CMD python app/main.py`. |
| `app/main.py` | FastAPI title `"Transfermarkt API"`; SlowAPI limiter; `/` → `/docs`. |
| Intended run | Clone → `poetry install --no-root` → `python app/main.py` **or** Docker on `:8000`. |
| Library? | Services are importable dataclasses (`TransfermarktClubPlayers`, …). This is **not** a documented PyPI SDK; it is an HTTP app you host. |

### How it hits Transfermarkt (unofficial pages, not an official API)

`app/services/base.py` `make_request()`: `requests.get` with a Chrome 113 User-Agent. No Transfermarkt `ceapi`, no API key, no robots handling.

URL templates in services (all `https://www.transfermarkt.com/…`, not `.co.uk`):

| Service | HTML path |
| --- | --- |
| Competition clubs | `/-/startseite/wettbewerb/{competition_id}/plus/?saison_id={season_id}` |
| Club players (kader) | `/-/kader/verein/{club_id}/saison_id/{season_id}/plus/1` |
| Club profile | club profil page |
| Player profile | `/-/profil/spieler/{id}` |
| Jersey numbers | `/-/rueckennummern/spieler/{id}` |
| Market value | player market-value page + Highcharts script |
| Search | `schnellsuche` |

Empty/blocked responses become `self.page = None` → `AttributeError: 'NoneType' object has no attribute 'xpath'` (issue #121 comment, 2026-07-30).

### HTTP surface (`app/api/api.py` + endpoints)

Prefix routers: `/competitions`, `/clubs`, `/players`. **No `/countries`.** No list-all-competitions (open #56 since 2024-01).

| Method | Endpoint | Season? | KitCollective-relevant fields | Must drop (ADR-0002) |
| --- | --- | --- | --- | --- |
| GET | `/competitions/search/{name}` | — | League discovery | market-value columns in search xpath |
| GET | `/competitions/{competition_id}/clubs` | `season_id` optional | **TeamSeason clubs** (`id`, `name`, `seasonId`) | — |
| GET | `/clubs/search/{name}` | — | Club identity | market values |
| GET | `/clubs/{club_id}/profile` | — | Club + **league.country_id / country_name** (Country/League seam) | `currentMarketValue`, `image`, `url`, address/tel/fax |
| GET | `/clubs/{club_id}/players` | `season_id` optional | **Historical squad** (id, name, position, dob, …) | **`marketValue`**. **No jersey field** |
| GET | `/players/search/{name}` | — | Player discovery | market value |
| GET | `/players/{id}/profile` | — | Player + current `shirtNumber` | **`marketValue`**, **`agent.{name,url}`**, `imageUrl`, `url` |
| GET | `/players/{id}/jersey_numbers` | — (full career table) | **`jerseyNumbers[]`: season, club, jerseyNumber** | — |
| GET | `/players/{id}/market_value` | — | **Do not call** | entire payload |
| GET | `/players/{id}/transfers` | — | Optional club history | fees / market value |
| GET | `/players/{id}/stats` `/injuries` `/achievements` | — | Not catalog | — |

`season_id` is a string (TM `saison_id` year). Nothing stops `season_id=1991` on DK1/club kader if TM still serves the page.

### Jersey numbers vs historical squads vs agent vs market value

| Need | Present? | Grain |
| --- | --- | --- |
| Historical squad (who was at club in season) | **Y** | `/clubs/{id}/players?season_id=` parses kader `/plus/1`. Schema `ClubPlayer` has **no** shirt number (`app/schemas/clubs/players.py`). Open #79 / closed #27: last rows truncated; joinedOn misaligned. |
| Season-registered `#` | **P** | Not on kader response. Career table `/players/{id}/jersey_numbers` from `rueckennummern` (`season`, `club` id, `jerseyNumber`). Current `#` only: profile `shirtNumber`. PR #62 merged 2024-03-19. PR #120 (shirt schema fix) **closed unmerged** 2026-06-29. |
| Market value | Present | Club players `marketValue`; profile `marketValue`; dedicated `/market_value`. **Drop.** |
| Agent | Present | Profile `agent.name` + `agent.url` (`Players.Profile.AGENT_*`). **Drop.** |
| TM branding / photos | Present | `url`, `imageUrl`, club `image`, historical crests. **Drop.** |
| Kits / manufacturer | **N** | Profile `outfitter` is player boot brand (same hole as dcaribou). FK seed only. |

Composing Apify’s nested `competition → seasons[] → clubs[] → players[].jerseyNumber` from felipeall is **1 + C + P** HTTP calls per season (competition clubs, each club kader, each player jersey table unless you skip numbers). Rate limits and TM blocks scale with that.

### Rate limiting (app vs Transfermarkt)

README: deployed app is **testing only** and **has rate limiting enabled**; self-host to customize.

| Layer | What |
| --- | --- |
| App (`slowapi`) | `.env.example`: `RATE_LIMITING_ENABLE=false`, `RATE_LIMITING_FREQUENCY=2/3seconds`. `settings.py` same defaults. Limiter in `main.py` uses `get_remote_address`. This limits **callers of the FastAPI**, not TM. |
| `fly.toml` | `auto_stop_machines = true`, `min_machines_running = 0`, 1 shared CPU / 1 GB, region `ams`. Does not set the env vars in-repo. |
| Transfermarkt | Unofficial HTML. Issues document **503** on kader (`Service Unavailable for url: …/kader/verein/…/saison_id/…`), **403** on search, **202** empty body, **500** when `page` is None. Comment on #121 (2026-07-30): “Transfermarkt blocking/rate-limiting the scraper's request, and the library doesn't handle that gracefully.” Workaround suggested: different IP / VPN. |

Probe 2026-08-18: `GET https://transfermarkt-api.fly.dev/competitions/DK1/clubs?season_id=2012` → **500** in 0.49s. `/docs` returned 200.

### Licence / ToS

- **MIT** on the Software (`LICENSE`). Commercial use of *the scraper code* is allowed with copyright notice.
- MIT **does not** licence Transfermarkt content. Same as dcaribou scraper (which has **no** SPDX) vs datasets CC0-on-packaging.
- README has **no** ToS / robots / “users must comply” paragraph (dcaribou scraper README does).
- Transfermarkt T&C §11.1 still forbids bots/scrapers; §3.2 databases; TDM reserved. ADR-0002 already accepted that for a facts-only seed. Hosting felipeall ourselves makes **us** the bot operator (same as running dcaribou Crawlee; Apify is the named hosted operator today, still unwired).

---

## GitHub Issues (open + recently closed)

Queried 2026-08-18 via `gh api repos/felipeall/transfermarkt-api/issues`. 19 open, none labelled.

### Maintenance

| Signal | Detail |
| --- | --- |
| Code freeze on `main` | Last merge **2025-04-13**. Open breakage from **2025-06 through 2026-07** has **no maintainer reply** that ships a fix. |
| Author presence | Closed parsing PRs through Apr 2025 (`#105`, `#104`, `#96`, …). Draft “Unit tests” **#87** still open (author, 2025-01). |
| Community forks | #121 comment runs `khalilosx/transfermarkt-api:latest` — third-party image, still 500. |
| Unmerged 2026 PRs | #120 shirt/schema fix **closed not merged**. #116/#118 “all competitions / national teams” closed Jun 2026 without landing on `main` HEAD above. |
| Fly.io | #119 bot “Launch config files” (2026-04). `auto_stop` cold starts + TM blocks. |

### Broken endpoints / TM blocks (open)

| # | Date | Title | Takeaway |
| --- | --- | --- | --- |
| [121](https://github.com/felipeall/transfermarkt-api/issues/121) | 2026-07 open | 500 on all GET | Confirmed by others. Docker log: `page.xpath` on `None`. Comment: TM block, not caller bug. |
| [117](https://github.com/felipeall/transfermarkt-api/issues/117) | 2025-12 open | 202 on all GET | Scrape gets HTTP 202 → empty page → 500. |
| [110](https://github.com/felipeall/transfermarkt-api/issues/110) | 2025-07 open | 503 on `/{club_id}/players` | Prod `503` for `…/kader/verein/631/saison_id/2022`. Local OK; Fly then works 1–2 min; fails again. Author of issue hosts their own Fly copy, same 503s. |
| [109](https://github.com/felipeall/transfermarkt-api/issues/109) | 2025-06 open | Player search 403 | `Forbidden for url: …/schnellsuche/ergebnis/schnellsuche?query=…` |
| [79](https://github.com/felipeall/transfermarkt-api/issues/79) | 2024-11 open | Club players truncated | Bayern 2024 kader missing last rows; `joinedOn` shifted. Points at closed #27. |
| [107](https://github.com/felipeall/transfermarkt-api/issues/107), [106](https://github.com/felipeall/transfermarkt-api/issues/106) | 2025-04 open | Club profile parse | stadium / transfer record XPath. |
| [113](https://github.com/felipeall/transfermarkt-api/issues/113), [111](https://github.com/felipeall/transfermarkt-api/issues/111) | 2025 open | DOB/age wrong | Header parse. |
| [108](https://github.com/felipeall/transfermarkt-api/issues/108) | 2025-05 open | Stats header/data mismatch | Incomplete stats. |
| [56](https://github.com/felipeall/transfermarkt-api/issues/56) | 2024-01 open | List competitions/clubs | Never built — no catalog crawl without knowing TM ids (`DK1`, club ids). |

### Closed (illustrative)

| # | Closed | Title | Takeaway |
| --- | --- | --- | --- |
| [83](https://github.com/felipeall/transfermarkt-api/issues/83) | 2025-01 | “currently down” | Recurring outage reports. |
| [91](https://github.com/felipeall/transfermarkt-api/issues/91)/[93](https://github.com/felipeall/transfermarkt-api/issues/93)/[100](https://github.com/felipeall/transfermarkt-api/issues/100) | 2025-02/03 | 500s from optional fields | HTML drift → crash until fields made Optional. Pattern continues. |
| [62](https://github.com/felipeall/transfermarkt-api/issues/62) | 2024-03 merged | Squad numbers API | Origin of `/jersey_numbers`. |
| [27](https://github.com/felipeall/transfermarkt-api/issues/27) | 2023-08 | Incomplete club players | Closed; **regressed or unfixed** per #79. |
| [66](https://github.com/felipeall/transfermarkt-api/issues/66) | 2024-06 | Disable Vercel | Hosting moved; Fly is the demo. |

**Legal issues:** none filed (no ToS discussion in the tracker). Absence is not a grant.

---

## Compare to dcaribou dump and ADR-0002

Legend: **Y** usable after drop list. **P** derivable / extra calls / sparse. **N** missing or forbidden.

| KitCollective entity | felipeall (self-host) | dcaribou dump | ADR-0002 / Apify types today |
| --- | --- | --- | --- |
| Country | P (club profile `league.country_*`; no countries router) | Y `countries` | Nested payload / mapper |
| League | Y search + `DK1` as `competition_id` | Y `competitions` | Competition node |
| Club | Y profile + search | P latest snapshot | Club node |
| Season | P `season_id` query param only (no calendar bounds) | P `games.season` int 2012–2025 | `seasons[]` |
| TeamSeason | **Y** `/competitions/DK1/clubs?season_id=` | P from `games` | `seasons[].clubs[]` |
| Player | Y profile / search | Y snapshot | Player node |
| Squad numbers | **P** jersey_numbers endpoint + current `shirtNumber`; **not** on kader JSON | P `game_lineups.number` (match-worn) | `players[].jerseyNumber` on kader |
| 1990s Superliga | P if TM HTML exists and we are not blocked | **N** (2012–2025) | Would need live fetch |
| Kits | N | N | N (FK seed) |
| Market value / agent / TM URLs | Present — **must drop** | Present — **must drop** | `stripForbiddenFields` |

Apify remains the **named** hosted fetch in ADR-0002; live path is **unwired** (fixture-only). felipeall is another live HTML scraper we would host. It is **better than the dump** for historical kader + a dedicated jersey-numbers page, **worse than Apify-as-designed** for a single nested document and for ops (no Bright Data path, brittle XPath, 16 months without a `main` fix while TM 500s).

---

## What we would still need (if we self-hosted felipeall)

1. **Our process, our IPs** — Coolify/Fly job; expect 403/503/202; no unlocker in this repo.
2. **Mapper** — competition clubs + club players + optional jersey_numbers → `TransfermarktRawPayload`. Do not import market value / agent / images.
3. **Id bootstrap** — no list-all-leagues; hardcode `DK1` / known club ids or use search.
4. **Hermetic tests** — fixtures; never hit `transfermarkt.com` or `transfermarkt-api.fly.dev` in CI.
5. **Pin a fork** — `main` is stale; HTML will keep moving. Treat as a vendor we must patch.
6. **Same TM ToS** as Apify. MIT is the *code* licence only.

**Unchanged:** FK seed after facts; production lane rejected.

---

## Licence / maintenance red flags (for grill)

1. **MIT ≠ Transfermarkt licence.** Facts remain TM’s; §11.1 still applies.
2. **Demo is not a product API.** README says testing + rate limit. Probe: DK1 **500**.
3. **Maintainer gap.** Last `main` code 2025-04-13; open 500/503/403/202 through 2026-07 unanswered with fixes.
4. **TM blocks are the failure mode**, not our mapper. Empty HTML crashes the process (`page is None`).
5. **Kader JSON has no `#`.** Incomplete squads (#79). Jersey numbers are a second scrape.
6. **Must-drop:** market value, agent PII, TM `url` / images — same ADR-0002 list.
7. **Python 3.9 FastAPI app**, not Nest, not a contract we control.

This note feeds `/grill-with-docs`. It does not change ADR-0002, open Linear issues, or open a PR.
