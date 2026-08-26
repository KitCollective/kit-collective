# Low-cost stamdata options (facts: club / season / squad / numbers)

**Date:** 2026-08-21  
**Product:** KitCollective  
**Question:** Which fetch paths can fill Transfermarkt-shaped facts (not kits) for a large league×season grid **without Apify pay-per-event** as the main bill? Includes [tommhe14/transfermarkt-wrapper](https://github.com/tommhe14/transfermarkt-wrapper).

Related: [apify-transfermarkt-actors.md](./apify-transfermarkt-actors.md); [transfermarkt-felipeall-api.md](./transfermarkt-felipeall-api.md); [transfermarkt-dcaribou.md](./transfermarkt-dcaribou.md); [catalog-seed-sources.md](./catalog-seed-sources.md); ADR-0002.

## Answer

**Cheapest path that still matches the catalog grain (historical kader + season `#`) is not a new vendor: HTTP HTML of `kader/.../plus/1`, parse the number column, cache, skip already-seeded, proxy only if CX33 is blocked.** Bandwidth for the 1990–2027 × ~20-league grid is ~0.5 GB gzip (squads-only). Apify’s cost is PPE per Actor run (~$700–1.400 for that grid), not bytes.

**Do not treat `transfermarkt-wrapper` as the cheap historical engine.** It is an unofficial client for `tmapi-alpha.transfermarkt.technology` + `transfermarkt.co.uk/ceapi`. Squad is **current only** (`GET /club/{id}/squad`, no `season`). Five GitHub stars, PyPI `0.0.8` alpha, last feature commit 2025-12-05. Same TM ToS class as HTML scrape; private JSON can disappear or 403 without notice.

Licensed match APIs (Sportmonks free Superliga, API-Football ~$19/mo) are cheap for **recent** squads and are a better *rights* story, but they do not ship 1991 Superliga kader depth. dcaribou’s weekly dump is **$0** for identity 2012–2025 and has **no season-registered `#`**.

---

## Option cards (cost = money + ops, not “is it possible”)

Legend: **Fit** = can it produce Club + Season + PlayerClubSeason with a season `#` for old years.

| Option | Money | Fit for 1990s + `#` | Verdict |
| --- | --- | --- | --- |
| **A. Direct kader HTML** (Cheerio/`fetch`, existing `FetchAdapter` seam) | ~$0 if CX33 200; ~$4–20 residential GB if blocked | **Y** if TM still serves the archive page | **Best cheap TM path.** One ~30 KB page per club-season. |
| **B. Felipeall self-host** | $0 compute + same proxy if blocked | **P** — kader JSON **omits `#`**; career `/jersey_numbers` × every player → ~10 GB / slow | Only if we **parse `#` from HTML ourselves**. Do not use Fly demo. |
| **C. dcaribou dump** (pinned R2/CSV) | $0 | **N** for registered `#`; **N** pre-2012 Superliga; TeamSeason from games | Cheap **identity complement** 2012–2025, not the catalog grain. |
| **D. Sportmonks** | Free = Superliga + Scottish Premiership; Starter €29 / 5 leagues; history >3 seasons is an add-on | **P** recent numbered squads; **N** 1991–2010 grid | Buy for *now*; do not replace TM archive. |
| **E. API-Football** | Free 100 req/day; Pro **$19**/7.5k/day | **P** `/players/squads` is **current**; historical `/players?season=` burns quota | Fine for a current-season top-up, not 37 years × 20 leagues. |
| **F. football-data.org** | Deep Data **€29**; Superliga not in free 12 | **P** paid squads/`shirtNumber` | Optional complement; no kits; not 1990s-complete. |
| **G. Keep Apify, shrink runs** | Starter **$29** prepaid; full grid still hundreds–1k USD | **Y** (already proven Superliga 2014/16) | Keep as **backup / small chat seed**, not the backfill engine. Cache season page; no per-player Actor hop. |
| **H. tommhe14 wrapper** | $0 client | **N** for historical kader (no season on squad) | See card below. |
| **I. Free proxy lists** | $0 | Does not unblock TM | Rejected ([iplocate/free-proxy-list](https://github.com/iplocate/free-proxy-list) = shared open proxies). |
| **J. Reverse-engineered TM app API** (same host as H, or more routes) | $0 until blocked | Unknown historical squad; high vanish risk | Same ToS; do not bet the catalog on `tmapi-alpha`. |

---

## Card: tommhe14/transfermarkt-wrapper

Sources (2026-08-21): [GitHub](https://github.com/tommhe14/transfermarkt-wrapper); [api.py](https://raw.githubusercontent.com/tommhe14/transfermarkt-wrapper/main/tmkt/api.py); [`tmkt/__init__.py`](https://raw.githubusercontent.com/tommhe14/transfermarkt-wrapper/main/tmkt/__init__.py); [setup.py](https://raw.githubusercontent.com/tommhe14/transfermarkt-wrapper/main/setup.py) (`description`: “Python API wrapper for Transfermarkt **undocumented API**”).

| Fact | Detail |
| --- | --- |
| Created | 2025-07-26 · last push 2026-01-12 (README) · last code 2025-12-05 |
| Popularity | 5 stars · 0 open issues · MIT on the *wrapper* |
| Hosts | `https://tmapi-alpha.transfermarkt.technology` (JSON); `https://www.transfermarkt.co.uk`; `https://www.transfermarkt.co.uk/ceapi` |
| Squad | `get_club_squad(clubId)` → `GET /club/{id}/squad` — **no season argument** |
| Clubs in a league | `get_competition_clubs(competitionId)` — **no season** |
| Table | `get_competition_table(..., seasonId=)` — season exists **only** here |
| Offered in felipeall #109 | Author said they reverse-engineered TM mobile/app HTTP as a 403 workaround |

**KitCollective:** could theoretically map *current* Superliga squads cheaply **if** `tmapi-alpha` stays open from CX33. It does **not** replace Apify for “Superliga 1995/96 trup + numre”. Building on an undocumented TM JSON host is a worse ops bet than parsing public kader HTML we already measured (HTTP 200, ~30 KB).

---

## What “without the biggest costs” actually means

Apify PPE for ~12.5k club-seasons ≈ **$500** in clubs-mode events plus profile-hop tax. HTML of the same pages ≈ **$0–20**. Licensed APIs ≈ **$0–29/mo** but **wrong depth**. The expensive mistakes are: (1) one Actor start per page, (2) one Actor start per missing `#`, (3) fetching the competition page once per club, (4) trying to backfill 20×37 in one month on Free $5.

**Recommended stack if money is the constraint (no ADR change in this note):**

1. Probe TM HTML from the Coolify job IP.  
2. `FetchAdapter` = kader HTML + number column; skip already-seeded; cache.  
3. Optional: pin a dcaribou snapshot for 2012–2025 **names/ids** only.  
4. Optional: Sportmonks free / API-Football Pro for **this season** while HTML backfill runs.  
5. Apify: keep wired, quota for tiny ranges only.

Unchanged: Nest does not fetch TM; production lane rejected; kits stay FK seed; drop market value / agent / TM URLs.

This note feeds `/grill-with-docs`. It does not open Linear issues or a PR.
