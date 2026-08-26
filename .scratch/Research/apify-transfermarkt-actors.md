# Transfermarkt facts via Apify Store actors

**Date:** 2026-08-18  
**Product:** KitCollective  
**Question:** Can KitCollective get Transfermarkt facts (Country, League, Club, Season, TeamSeason, Player, squad numbers — **not** kits) **via Apify Store actors** — including historical Superliga (DK1, started 1991, seed `0001`) and season-registered jersey numbers? How do the various Transfermarkt Apify actors differ? Does Apify uniquely solve Transfermarkt IP blocking compared to self-hosted felipeall?

## Answer

**Yes, with a mapper, and only if Transfermarkt still serves the historical *kader* HTML.** Several community Store actors can take a TM league code (including `DK1` even though **no README names Superliga**) and/or a `saison_id` year (including `1991` / `1998` — no documented year floor). A few emit a **current** `shirtNumber` / `jerseyNumber` / `number` on the **live squad or profile**. Almost none document a season-registered `#` cell from a historical kader table. None emit `TransfermarktRawPayload` (`competition → seasons[] → clubs[] → players[].jerseyNumber`) as-is.

**Closest to `seed/apify` types:** `automation-lab/transfermarkt-scraper` (season integer + `clubs` + `squads` datasets) and `haketa/transfermarkt-scraper` (`competitionCodes` + `season` + `shirtNumber`). For raw historical kader pages, `curious_coder/transfermarkt` and `kawsar/transfermarkt-scraper` accept any URL including `/kader/verein/…/saison_id/1991` or `/tabelle/…/saison_id/1998` and scrape the HTML table. `lulzasaur/transfermarkt-scraper` is the only actor whose README shows a kader URL **and** a `season` input.

**There is no official Apify-maintained Transfermarkt actor.** `GET https://api.apify.com/v2/acts/apify~transfermarkt` is **404**. Every Store listing is marked **community**. The oldest / most-used is `curious_coder/transfermarkt` (created 2018-09-17, 2,818 users, rental **$15/month + usage**). Apify published a how-to blog for it; Store source is **hidden**; a public GitHub mirror exists at [cermak-petr/actor-transfermarkt](https://github.com/cermak-petr/actor-transfermarkt).

**Apify does not uniquely licence TM data.** ADR-0002 already accepted TM ToS §11.1. Apify General Terms §6.2 / §11.1 put **authorised-source** and **unauthorized-extract** liability on us. What Apify uniquely offers vs self-hosted felipeall is **hosted IP rotation** (datacenter, residential, Unblocker) so we are not the machine TM already 403/503s. Several actors **document** that TM blocks datacenter IPs (same failure mode as felipeall Fly.io). Live Apify fetch is still **unwired**; CLI still requires `SEED_APIFY_FIXTURE`.

**Still not kits. Still need a fetch adapter** that maps flat actor dataset items → nested `TransfermarktRawPayload`, then existing `stripForbiddenFields` (market value, agent PII, TM branding).

Related: [ADR-0002](../../docs/adr/0002-apify-transfermarkt-facts.md); [catalog-seed-sources.md](./catalog-seed-sources.md); [transfermarkt-dcaribou.md](./transfermarkt-dcaribou.md); [transfermarkt-felipeall-api.md](./transfermarkt-felipeall-api.md); [superliga-seed-standup.md](./superliga-seed-standup.md) (MCP → live fetch). FK seed (`seed/fkapi`) stays a separate source.

---

## Verdict

| Option | Instead of fixture-only Apify? | Verdict |
| --- | --- | --- |
| **Official `apify/*` TM actor** | — | **Does not exist** (404). |
| **`automation-lab` / `haketa` / `lulzasaur`** | Possible live fetch | Season param + squad grain. Jersey is **current** or undocumented on historical rows. Need mapper. |
| **`curious_coder` / `kawsar` (any URL)** | Possible live fetch | Can paste 1991 kader URLs. Output is generic tables, not our nested payload. |
| **`data_xplorer` / `parsebird` / `solidcode` / `jungle_synthesizer`** | Partial | Club/competition discovery + current squads. Internal TM JSON (`ceapi`-class), not HTML kader. Stats seasons typically 2021+. |
| **Player-search / market-value toys** | No | Wrong grain. |
| **Keep `SEED_APIFY_FIXTURE`** | Current KIT path | Live fetch still unwired. |

**Still needed in all live-actor cases:** `FetchAdapter` → `TransfermarktRawPayload`; hermetic fixtures; drop forbidden columns; `ExternalId`; FK seed for kits; production lane stays rejected.

---

## Explicit answers

### Can you pass a historical season (`saison_id=1991` or `1998`) on squad URLs?

**Yes on input; TM archive is the limit.** No Store README states a year floor.

| Actor | How | Source |
| --- | --- | --- |
| `automation-lab/transfermarkt-scraper` | Input `season` integer: “season start year … `2025` means 2025/26. If omitted, the current football season.” | [Store README + input schema](https://apify.com/automation-lab/transfermarkt-scraper.md) |
| `haketa/transfermarkt-scraper` | Input `season` integer, default `2026`: “For the 2026/27 season enter 2026. Applies to club and competition squad collection.” | [Store README + input schema](https://apify.com/haketa/transfermarkt-scraper.md) |
| `lulzasaur/transfermarkt-scraper` | Input `season` string (“e.g. `2025` for 2024/25”) **and** example club URL `…/kader/verein/281/saison_id/2025`. | [Store README](https://apify.com/lulzasaur/transfermarkt-scraper.md) |
| `curious_coder/transfermarkt` | `startUrls` any TM page. Example input includes `/tabelle/wettbewerb/GB1/saison_id/2023`. Actor `exampleRunInput` includes `/startseite/verein/1035/saison_id/2018`. | [Store README](https://apify.com/curious_coder/transfermarkt.md); [acts API](https://api.apify.com/v2/acts/curious_coder~transfermarkt) |
| `kawsar/transfermarkt-scraper` | “To target a specific season, add `/saison_id/<year>` … `saison_id/2023` is the 2023/24 season.” Generic table scrape for other URLs (including kader). | [Store README](https://apify.com/kawsar/transfermarkt-scraper.md) |
| `scraper-engine/transfermarkt-scraper` | Table URLs with `saison_id/2023`. FAQ: “club squads are crawled for links but produce **no rows** themselves.” | [Store README](https://apify.com/scraper-engine/transfermarkt-scraper.md) |
| `data_xplorer` / `parsebird` | Player **stats** seasons as `"2021"`…`"2026"` or `"last_6"`. Club transfers example uses `/saison_id/2025`. **No squad-season input.** | [data_xplorer README](https://apify.com/data_xplorer/transfermarkt-api-scraper.md); [parsebird README](https://apify.com/parsebird/transfermarkt-scraper.md) |
| `solidcode` / `handsome_apostrophe` / `jungle_synthesizer` / `crawlerbros` | Current club/competition pages. No `saison_id` / `season` input. | Their Store READMEs |

Whether TM still publishes a complete 1991/92 Superliga kader is a Transfermarkt content question (same as felipeall / dcaribou `--season 1991`).

### Is jersey / shirt number on the squad record or only the current profile?

**Documented numbers are current-profile or current-squad, not a historical kader `#`.**

| Actor | Jersey field | Grain (as documented) |
| --- | --- | --- |
| `data_xplorer` / `parsebird` | Player `jerseyNumber`; club squad `number` | Current |
| `haketa` | `shirtNumber` — “Current squad number” (🟡 when assigned) | Current |
| `handsome_apostrophe` (+ v2) | `shirt_number` under “Contract — current club” | Current |
| `jungle_synthesizer` player | `shirt_number` | Current |
| `blackfalcondata` | Player `shirtNumber`; `includeSquad` “players with shirt number” | Current club squad |
| `automation-lab` | Player `shirtNumber` “Current shirt number”. `squads` dataset = “one player row per selected-season squad member” — **jersey column not in the published schema** | Current on profile; squad `#` undocumented |
| `lulzasaur` | Club-squad output lists name/position/age/nationality/club/marketValue/contract — **no jersey field** | Missing |
| `solidcode` | Player schema has no shirt field | Missing |
| `webdatalabs` | Player-only; no shirt field | Missing |
| `curious_coder` / `kawsar` | Generic HTML table headers. A kader page **could** include `#` if TM’s table has that column | Possible, not typed |

None document felipeall’s `/rueckennummern` career table.

### Is Superliga / DK1 mentioned?

**No.** Preset tables are Big-5 (`GB1`, `ES1`, `IT1`, `L1`, `FR1`) plus a few others (RO1, MLS1, …). **DK1 is never listed.** Actors that accept **any competition code** or **any URL** can still be pointed at Superliga:

- `handsome_apostrophe`: “Enter ANY Transfermarkt league code.”
- `haketa` / `crawlerbros` / `jungle_synthesizer`: `competitionCodes` / `competitionId` as free string (`GB1` examples).
- `curious_coder` / `kawsar` / `lulzasaur`: paste `…/wettbewerb/DK1` or `…/kader/verein/{id}/saison_id/1991`.

### Do they recommend Apify Proxy / residential vs datacenter? (IP block vs felipeall)

| Actor | Proxy claim | Source |
| --- | --- | --- |
| `kawsar` | “Residential US proxies are **required**. Datacenter IPs are blocked by the site's bot protection.” Default input: `RESIDENTIAL` + `US`. | [README + input schema](https://apify.com/kawsar/transfermarkt-scraper.md) |
| `parsebird` | “default residential Apify proxy — **datacenter IPs are blocked by Transfermarkt**.” | [README](https://apify.com/parsebird/transfermarkt-scraper.md) |
| `lulzasaur` | Example input `apifyProxyGroups: ["RESIDENTIAL"]`. “Residential proxies are recommended for large-scale runs.” | [README + input example](https://apify.com/lulzasaur/transfermarkt-scraper.md) |
| `scraper-engine` | Escalation: direct → datacenter → residential (sticky). | [README](https://apify.com/scraper-engine/transfermarkt-scraper.md) |
| `data_xplorer` | “Datacenter proxy **recommended** for the best speed and success rate.” Example also shows `RESIDENTIAL`. | [README + input schema](https://apify.com/data_xplorer/transfermarkt-api-scraper.md) |
| `webdatalabs` | `useProxies` default **false**; `DATACENTER` “cheap, recommended” or `RESIDENTIAL`. | [README](https://apify.com/webdatalabs/transfermarkt-scraper.md) |
| `automation-lab` | FAQ: “Transfermarkt has **minimal anti-bot**. Plain HTTP … **No proxy is needed**.” | [README](https://apify.com/automation-lab/transfermarkt-scraper.md) |
| `curious_coder` | `proxyConfig.useApifyProxy: true` (group not specified). | [input schema](https://apify.com/curious_coder/transfermarkt.md) |
| `haketa` / `bovi` | Optional; start direct. | Their READMEs |

**Apify platform (first-party):** [Proxy docs](https://docs.apify.com/platform/proxy.md) — datacenter = “fastest and cheapest … Other users' activity can get these IPs blocked”; residential = “least likely to be blocked”; Unblocker = “bypass anti-bot … smart routing.”

**Vs felipeall:** self-host hits TM from **our** Coolify/Fly IPs. Open issues document 403/503/202 and `page is None` ([transfermarkt-felipeall-api.md](./transfermarkt-felipeall-api.md)). Apify does **not** change TM §11.1. It **does** let the scrape originate from a maintained residential/Unblocker pool instead of one datacenter IP — that is the only unique ops claim.

### Pricing model

Almost all are **pay-per-event** (start + per dataset row). Exception: `curious_coder/transfermarkt` is **rental $15.00/month + platform usage**. Store page: [rental-actors](https://docs.apify.com/platform/actors/running/actors-in-store#rental-actors). Per-result list prices (FREE tier, Store `.md` “from $X / 1,000”):

| Actor | Model | Stated unit price |
| --- | --- | --- |
| `curious_coder/transfermarkt` | Rental | $15/mo + usage (~$2.5 credits / 1k results on “basic plan”, README) |
| `data_xplorer/transfermarkt-api-scraper` | PPE | from $0.75 / 1k (tiered $0.0015–$0.00075/result + $0.10 start) |
| `solidcode/transfermarkt-scraper` | PPE | $1.00 / 1k |
| `jungle_synthesizer/…-player-scraper` | PPE | from $1.25 / 1k |
| `haketa/transfermarkt-scraper` | PPE | from $1.50 / 1k |
| `handsome_apostrophe` v1 / v2 | PPE | from $0.35 / 1k vs from $0.01 / 1k |
| `lulzasaur` | PPE | from $10.00 / 1k ($0.01/result current pricingInfos) |
| `kawsar` | PPE | from $4.00 / 1k |
| `crawlerbros` | PPE + usage | from $3.00 / 1k |
| `bovi` | PPE | $3.00 / 1k |
| `blackfalcondata` | PPE | from $0.50 / 1k |
| `parseforge` | PPE | from $19.00 / 1k ($0.021/result) |
| `parsebird` | PPE | from $1.10 / 1k |
| `automation-lab` | PPE | $0.005 start + $0.002/player + $0.001/entity |

Apify takes a **20%** `apifyMarginPercentage` on Store pricingInfos.

### Do they scrape HTML or unofficial TM API (`ceapi`)?

| Class | Actors | Evidence |
| --- | --- | --- |
| **Unofficial TM JSON / “internal API”** | `jungle_synthesizer` player (“public Transfermarkt JSON API”); `crawlerbros` (“public Transfermarkt API without authentication”); `parsebird` (“public pages with the same internal API its own site widgets use”); `data_xplorer` (“full career transfers via Transfermarkt's internal endpoints”); `solidcode` (numeric `countryId` / `positionGroup` / `seasonId` payload — widget-API shape); `bovi` (“public pages and JSON endpoints the website itself uses”) | Their Store READMEs |
| **HTML** | `curious_coder`, `kawsar`, `scraper-engine`, `automation-lab` (Cheerio), `lulzasaur` (`got-scraping`), `webdatalabs` | README stack notes |
| **Mixed / unspecified** | `haketa`, `handsome_apostrophe`, `blackfalcondata`, GetDataForMe spiders | Not stated |

Same ToS class either way: automated access to TM’s database (§11.1 / §3.2). dcaribou already uses `ceapi` for market-value/transfer graphs ([transfermarkt-dcaribou.md](./transfermarkt-dcaribou.md)).

---

## Store inventory (2026-08-18)

`GET https://api.apify.com/v2/store?search=transfermarkt` → `total: 44`, `count: 41` items in the payload. HTML [store?search=transfermarkt](https://apify.com/store?search=transfermarkt) is a generic Store index (no actor list). Extra first-party hit not in that ranking: [`curious_coder/transfermarkt`](https://apify.com/curious_coder/transfermarkt) (2,818 users). `GET https://api.apify.com/v2/acts/apify~transfermarkt` → **404**.

### Transfermarkt-named / TM-scraping actors

| # | username/name | Users | 30d ok/total | Pricing | Last build (acts API or Store) | Source public? |
| --- | --- | ---: | --- | --- | --- | --- |
| 1 | [jungle_synthesizer/transfermarkt-global-football-player-scraper](https://apify.com/jungle_synthesizer/transfermarkt-global-football-player-scraper) | 89 | 1212/1369 | PPE | Store last run 2026-08-18 | Hidden (typical) |
| 2 | [data_xplorer/transfermarkt-api-scraper](https://apify.com/data_xplorer/transfermarkt-api-scraper) | 211 | 1323/1327 | PPE | modified 2026-08-17, build 2.8.3 | `isSourceCodeHidden: true` |
| 3 | [webdatalabs/transfermarkt-scraper](https://apify.com/webdatalabs/transfermarkt-scraper) | 170 | 390/412 | PPE | Store last run 2026-08-18 | Hidden |
| 4 | [kawsar/transfermarkt-scraper](https://apify.com/kawsar/transfermarkt-scraper) | 20 | 52/52 | PPE | Store last run 2026-08-17 | Hidden |
| 5 | [bovi/transfermarkt-scraper](https://apify.com/bovi/transfermarkt-scraper) | 8 | 163/169 | PPE | Store last run 2026-08-17 | Hidden |
| 6 | [automation-lab/transfermarkt-scraper](https://apify.com/automation-lab/transfermarkt-scraper) | 70 | 221/223 | PPE | Store last run 2026-08-18 | Hidden |
| 7 | [solidcode/transfermarkt-scraper](https://apify.com/solidcode/transfermarkt-scraper) | 55 | 576/588 | PPE | modified 2026-08-07, 1.0.6 | `isSourceCodeHidden: true` |
| 8 | [handsome_apostrophe/transfermarkt-football-scraper](https://apify.com/handsome_apostrophe/transfermarkt-football-scraper) | 37 | 14/14 | PPE | Store last run 2026-08-18 | Hidden |
| 9 | [handsome_apostrophe/transfermarkt-football-scraper-v2](https://apify.com/handsome_apostrophe/transfermarkt-football-scraper-v2) | 31 | 21/136 | PPE | Store last run 2026-08-18 | Hidden |
| 10 | [lulzasaur/transfermarkt-scraper](https://apify.com/lulzasaur/transfermarkt-scraper) | 7 | 29/31 | PPE | modified 2026-08-07, 1.0.6 | `isSourceCodeHidden: true` |
| 11 | [getdataforme/transfermarkt-playrdetails-spider](https://apify.com/getdataforme/transfermarkt-playrdetails-spider) | 5 | 29/30 | PPE | Store last run 2026-08-17 | Hidden |
| 12 | [crawlerbros/transfermarkt-scraper](https://apify.com/crawlerbros/transfermarkt-scraper) | 3 | 34/35 | PPE | Store last run 2026-08-17 | Hidden |
| 13 | [scraper-engine/transfermarkt-scraper](https://apify.com/scraper-engine/transfermarkt-scraper) | 2 | 27/32 | PPE | Store last run 2026-08-18 | Hidden |
| 14 | [jungle_synthesizer/transfermarkt-football-agency-directory-scraper](https://apify.com/jungle_synthesizer/transfermarkt-football-agency-directory-scraper) | 2 | 11/22 | PPE | Store last run 2026-08-18 | Hidden |
| 15 | [blackfalcondata/transfermarkt-market-value-scraper](https://apify.com/blackfalcondata/transfermarkt-market-value-scraper) | 1 | 30/30 | PPE | Store last run 2026-08-18 | Hidden |
| 16 | [getdataforme/transfermarkt-player-spider](https://apify.com/getdataforme/transfermarkt-player-spider) | 1 | 29/30 | PPE | Store last run 2026-08-17 | Hidden |
| 17 | [haketa/transfermarkt-scraper](https://apify.com/haketa/transfermarkt-scraper) | 1 | 13/19 | PPE | modified 2026-08-17, 0.1.15 | `isSourceCodeHidden: true` |
| 18 | [parsebird/transfermarkt-scraper](https://apify.com/parsebird/transfermarkt-scraper) | 2 | — | PPE | Store last run 2026-08-18 | Hidden |
| 19 | [studio-amba/transfermarkt-scraper](https://apify.com/studio-amba/transfermarkt-scraper) | 3 | 8/21 | PPE | Store last run 2026-08-18 | Hidden |
| 20 | [parseforge/transfermarkt-scraper](https://apify.com/parseforge/transfermarkt-scraper) | 11 | 33/39 | PPE | Store last run 2026-08-18 | Hidden |
| 21 | [itsedgar/RefereeStats](https://apify.com/itsedgar/RefereeStats) | 2 | 16/21 | PPE | Store last run 2026-08-17 | Hidden |
| 22 | [curious_coder/transfermarkt](https://apify.com/curious_coder/transfermarkt) | 2818 | 43/45 | **Rental $15/mo** | modified 2026-07-27, build 0.0.113 | Store hidden; [GitHub](https://github.com/cermak-petr/actor-transfermarkt) |

30-day ok/total from Store `publicActorRunStats30Days` SUCCEEDED/TOTAL. “Hidden” = Store actors use `SOURCE_FILES` + `isSourceCodeHidden: true` where the acts API was fetched.

### False positives in the same Store search (not TM)

`parseforge/fbref-scraper`, `bovi/yahoo-finance-scraper`, `omarchydev/football-intelligence-hub`, `bovi/companies-france`, `bovi/unusual-options-activity`, `bovi/seeking-alpha-scraper`, `jungle_synthesizer/jolpica-f1-results-scraper`, `bovi/crunchbase-scraper`, `jungle_synthesizer/espn-hidden-api-multi-sport-scores-scraper`, `jungle_synthesizer/fpl-official-fantasy-premier-league-api-scraper`, `jungle_synthesizer/cricsheet-ball-by-ball-match-data-scraper`, `blackfalcondata/elpris-scraper`, `jungle_synthesizer/premier-league-pulselive-fixtures-results-scraper`, `jungle_synthesizer/conmebol-copa-libertadores-fixtures-results-scraper`, `parseforge/fpl-premier-league-scraper`, `blackfalcondata/mlb-scraper`, `studio-amba/flashscore-scraper`, `bovi/companies-house-uk`, `jungle_synthesizer/atp-tour-rankings-player-profile-scraper`, `blackfalcondata/google-trends-scraper`.

---

## Cards (prefer squad / kader / season / DK1)

### Card: curious_coder/transfermarkt (oldest, rental)

- **Store:** [apify.com/curious_coder/transfermarkt](https://apify.com/curious_coder/transfermarkt) · community · News · 2,818 users · 100% 30-day success (43/45) · 21 bookmarks · no rating.
- **Created** 2018-09-17 · **modified** 2026-07-27 · build `0.0.113`.
- **What:** “almost any Transfermarkt page”; auto-detects player / club / competition. Input: `startUrls`, `proxyConfig`, `crawlDepth`, `pageDepth`.
- **Historical season:** yes, via URL (`saison_id` in examples). Actor example: Sheffield Wednesday `…/saison_id/2018`.
- **Jersey:** not typed; generic page extract. Player sample has agent, outfitter, transfers — no shirt field.
- **DK1 / Superliga:** not mentioned. Any URL works.
- **HTML vs API:** HTML crawler.
- **Proxy:** `useApifyProxy: true`.
- **Pricing:** **$15/month rental + usage**.
- **Source:** Store hidden. README points at [github.com/cermak-petr/actor-transfermarkt](https://github.com/cermak-petr/actor-transfermarkt) (11★). Apify blog tutorial: [How to scrape Transfermarkt](https://blog.apify.com/how-to-scrape-transfermarkt/).
- **KIT fit:** Best “paste 1991 kader URL” hammer. Worst shape (flat page objects). Need a table→payload mapper.

### Card: automation-lab/transfermarkt-scraper (closest season+squad grain)

- **Store:** [apify.com/automation-lab/transfermarkt-scraper](https://apify.com/automation-lab/transfermarkt-scraper) · community · 70 users · 221/223 30d.
- **Modes:** `players` | `clubs` (metadata + **selected season squad**) | `competitions` (standings) | `transfers`.
- **Season:** integer start year; omitted → current. Example `season: 2025` → 2025/26. No min documented.
- **Jersey:** player `shirtNumber` = current. `squads` dataset undocumented beyond “one player row per selected-season squad member”.
- **Stack:** Cheerio HTML. FAQ: “no proxy needed” / “minimal anti-bot” — **conflicts** with kawsar/parsebird and with felipeall 403/503.
- **Pricing:** PPE $0.005 start + $0.002/player + $0.001/entity.
- **KIT fit:** Closest **operational** match: competition URL + `season` + club/squad rows. Still flat datasets, not nested payload. Jersey-on-historical-squad is **not evidenced**.

### Card: haketa/transfermarkt-scraper (competition code + season)

- **Store:** [apify.com/haketa/transfermarkt-scraper](https://apify.com/haketa/transfermarkt-scraper) · community · **1 user** · 13/19 30d (**68%**) · created 2026-08-05 · build 0.1.15 (2026-08-17).
- **Input:** `competitionCodes` (any TM code), `clubUrls`, `season` (default 2026), rankings, search.
- **Jersey:** `shirtNumber` — “**Current** squad number”.
- **Club record** includes `season`, `squadUrl`.
- **Proxy:** optional; “start with direct”.
- **Pricing:** from $1.50 / 1k.
- **KIT fit:** `["DK1"]` + `season: 1991` is **schema-legal**. Shirt field is labelled current. Tiny user base / 32% fail — treat as unproven.

### Card: lulzasaur/transfermarkt-scraper (kader URL + season)

- **Store:** [apify.com/lulzasaur/transfermarkt-scraper](https://apify.com/lulzasaur/transfermarkt-scraper) · community · 7 users · 29/31 30d.
- **Modes:** `playerSearch` | `playerProfile` | **`clubSquad`** | `transfers`.
- **Season + URL:** `season` string; example `https://www.transfermarkt.us/manchester-city/kader/verein/281/saison_id/2025`.
- **Jersey:** not in club-squad field list.
- **Proxy:** residential recommended / example RESIDENTIAL. `got-scraping` TLS fingerprinting.
- **League IDs table:** GB1/L1/ES1/IT1/FR1/NL1/PO1/MLS1 — **no DK1**.
- **Pricing:** from $10 / 1k (pricingInfos $0.01/result).
- **KIT fit:** Only README that shows a **kader + saison_id** URL. Missing `#` in the documented squad schema.

### Card: data_xplorer/transfermarkt-api-scraper (most used PPE)

- **Store:** [apify.com/data_xplorer/transfermarkt-api-scraper](https://apify.com/data_xplorer/transfermarkt-api-scraper) · community · 211 users · **1323/1327** 30d · rating 4/5 (1) · build **2.8.3** (2026-08-17).
- **Types:** players, clubs (current squad + staff), transfersPlayer / transfersClub / transfersCompetition.
- **Season:** player **stats** `2021`–`2026` or `last_6`. Club transfers example `/saison_id/2025`. **No historical squad season.**
- **Jersey:** current `jerseyNumber` / squad `number`.
- **API:** “internal endpoints”; FAQ: TM has no official public API.
- **Proxy:** datacenter recommended (also shows RESIDENTIAL in an example).
- **Pricing:** from $0.75 / 1k + $0.10 start.
- **Clone:** `parsebird/transfermarkt-scraper` is the same five scrape types, same Bakwa `jerseyNumber: "29"` sample, same “internal API” claim, but **requires residential** (“datacenter IPs are blocked”).
- **KIT fit:** Strong current-squad + league transfer dump. Wrong grain for 1991 kader numbers.

### Card: solidcode/transfermarkt-scraper (URL auto-detect + league walk)

- **Store:** [apify.com/solidcode/transfermarkt-scraper](https://apify.com/solidcode/transfermarkt-scraper) · community · 55 users · 576/588 30d.
- **Input:** `startUrls` player `/profil/spieler/`, club `/startseite/verein/`, competition `/startseite/wettbewerb/`. Toggles `includeCompetitionClubs` + `includeClubSquad` walk a whole league.
- **Season:** none. Current pages only.
- **Jersey:** not in player field table.
- **Shape:** unofficial-API-like IDs (`countryId`, `positionGroup`, `currentSeasonId`).
- **Pricing:** $1.00 / 1k.
- **KIT fit:** Good DK1 **current** walk (`…/wettbewerb/DK1` + both toggles). No 1990s.

### Card: handsome_apostrophe v1 / v2 (custom league codes)

- **Store:** [v1](https://apify.com/handsome_apostrophe/transfermarkt-football-scraper) · [v2](https://apify.com/handsome_apostrophe/transfermarkt-football-scraper-v2) · community. Same README. v2 cheaper (from $0.01 / 1k) but 21/136 30d (many non-success).
- **Modes:** leagues / players / clubs. `customLeagueCodes`: “ANY Transfermarkt league code.”
- **Jersey:** `shirt_number` current.
- **Season:** none.
- **KIT fit:** `customLeagueCodes: ["DK1"]` for **current** Superliga roster. Not 1991.

### Card: jungle_synthesizer player (JSON API + current roster)

- **Store:** [apify.com/jungle_synthesizer/transfermarkt-global-football-player-scraper](https://apify.com/jungle_synthesizer/transfermarkt-global-football-player-scraper) · 89 users · 1212/1369 30d.
- **Discovery:** `playerIds` | `clubIds` (current roster) | `competitionCodes` | search. “public Transfermarkt JSON API”; CloudFront WAF on listing pages.
- **Jersey:** `shirt_number` current.
- **Must-drop extra:** agency, market value history.
- **Sister actor** [agency-directory](https://apify.com/jungle_synthesizer/transfermarkt-football-agency-directory-scraper): email/phone/staff — **ADR-0002 agent PII. Do not call.**

### Card: kawsar/transfermarkt-scraper (any URL, residential required)

- **Store:** [apify.com/kawsar/transfermarkt-scraper](https://apify.com/kawsar/transfermarkt-scraper) · 20 users · 52/52 30d.
- **Typed pages:** achievements, injuries, league **tables** (historical via `saison_id`). Other URLs = generic table (kader possible).
- **Proxy:** residential US **required**; datacenter blocked.
- **Pricing:** from $4 / 1k.
- **KIT fit:** Historical **tables** yes; squad `#` only if the generic parser keeps the `#` column.

### Card: webdatalabs/transfermarkt-scraper (player-only, reject club URLs)

- **Store:** [apify.com/webdatalabs/transfermarkt-scraper](https://apify.com/webdatalabs/transfermarkt-scraper) · 170 users · 390/412 · 5.0/5 (2).
- **Rejects** `/verein/` and `/wettbewerb/` before billing.
- **Must-drop:** market value, `agent`, `agentUrl`, `outfitter`, `instagramUrl`, portrait.
- **KIT fit:** Player-name toy. Skip.

### Remaining TM actors (short)

| Actor | Why not primary |
| --- | --- |
| `crawlerbros` | Search / current club / competition. “Public API.” No season. Sample has no jersey. $3/1k. |
| `blackfalcondata` | Current squad + `shirtNumber`. Competition codes. Market-value-first. $0.50/1k. |
| `bovi` | League/squad/player. `shirt_number`. Optional residential. $3/1k. No season. |
| `scraper-engine` | curious_coder clone. **Club squads produce no rows.** |
| `parseforge` | Current market-value listing by league. No history, no squad, $19/1k. |
| `getdataforme/*` | Player spiders. Search toys. |
| `studio-amba` | Player-by-name. 8/21 30d. |
| `itsedgar/RefereeStats` | Referees. Out of catalog scope. |

---

## Compare to KitCollective mapper

`seed/apify/src/types.ts` `TransfermarktRawPayload` is **one nested document**:

`competition { id, name, country { id, name, iso3166 } } → seasons[] { id, label, startDate, endDate, calendarKind, clubs[] { id, name, players[] { id, name, jerseyNumber? } } }`

Fixture: `seed/apify/fixtures/superliga-mini.json` (`dk1`, Superligaen, `jerseyNumber` on players, plus forbidden `marketValue` / `agent` / `tmLogoUrl` / `transfermarktUrl` for the strip test).

**No Store actor emits that document.** Every live path is:

1. Run actor(s) with `DK1` / club ids / kader URLs and a season range.
2. **Fetch adapter** groups dataset items into the nested payload (invent `label` / `startDate` / `endDate` / `calendarKind` — actors do not ship calendar bounds).
3. Existing normalize / `stripForbiddenFields`.
4. Hermetic tests stay on `SEED_APIFY_FIXTURE` — do not call Apify or TM in CI.

Legend: **Y** usable after drop. **P** extra calls / current-only / undocumented. **N** missing or forbidden.

| KitCollective entity | automation-lab | haketa | lulzasaur | curious_coder / kawsar | data_xplorer / parsebird | solidcode |
| --- | --- | --- | --- | --- | --- | --- |
| Country | P (club/comp) | P | P | P (page text) | P (`playerLeague.country`) | P (`countryId`) |
| League | Y (comp URL / search) | Y (`competitionCodes`) | P (league id on transfers) | Y (URL) | Y (name or URL) | Y (`…/wettbewerb/DK1`) |
| Club | Y | Y | Y | Y | Y | Y |
| Season | Y (`season` int) | Y (`season` int) | Y (`season` + URL) | P (in URL) | P (stats 2021+ / current transfers) | N (current) |
| TeamSeason | Y (`clubs` + `squads`) | Y (league walk) | Y (`clubSquad`) | P (if you crawl clubs) | Y current | Y current walk |
| Player | Y | Y | Y | Y | Y | Y |
| Squad numbers | P (current `shirtNumber`; squad `#` undocumented) | P (current `shirtNumber`) | N (not in schema) | P (generic `#` column) | P (current `number`) | N |
| 1990s Superliga | P if TM HTML + `season=1991` | P if `season=1991` works | P if kader URL served | P if URL served | N | N |
| Kits | N | N | N | N | N | N |
| Market / agent / TM URLs | Present — **drop** | Present — **drop** | Present — **drop** | Present — **drop** | Present — **drop** | Present — **drop** |

---

## Keep vs must-drop (ADR-0002)

**Keep (facts):** TM competition/club/player ids, names, country (map to ISO `DK` ourselves — actors use TM country ids or English names), season start year, squad membership, jersey **only when it is the kader/season number**.

**Must drop** (same list as `stripForbiddenFields` / fixture poison fields):

- Market value, peak, history, squad total value (`marketValue`, `marketValueHistory`, `totalMarketValue`, …).
- Agent / agency (`agent`, `playerAgent`, phone, email, website, portfolio). **Do not run** `jungle_synthesizer/transfermarkt-football-agency-directory-scraper`.
- TM branding: `url` / `profileUrl` / `crestUrl` / `portraitUrl` / `imageUrl` / `tmLogoUrl` / `transfermarktUrl`.
- Outfitter (boot brand, not kit). Fees, addresses, stadium, staff.

**Never from these actors:** kit type, manufacturer, sleeve patches, shirt photos.

---

## Licence / ToS

### Transfermarkt (unchanged)

[transfermarkt.com/intern/anb](https://www.transfermarkt.com/intern/anb) / [catalog-seed-sources.md](./catalog-seed-sources.md) (fetched 2026-08-18 in that note):

- **§3.2:** databases and related material belong to Transfermarkt.
- **§11.1:** no bots, spiders, screen scraping or other automated processes; TDM (UrhG §44b) reserved.
- **§10:** German law; Hamburg courts.

ADR-0002 accepted facts-only scrape **via Apify** anyway. A Store actor does not create a TM licence.

### Apify (first-party)

- [General Terms](https://docs.apify.com/legal/general-terms-and-conditions.md) **§3.1:** public Store actors are **not** Apify Services unless stated. **§6.2:** process only Customer Data you are **authorized** to access. **§11.1:** you indemnify Apify; “Should you use the Services or Actors to extract Customer Data from **unauthorized sources**, you shall be responsible…”
- [Actor Terms](https://docs.apify.com/legal/actor-terms-and-conditions.md): community actors; we pick permission level and trust.
- Actor READMEs (data_xplorer, solidcode, automation-lab, parseforge, kawsar): “you are responsible for complying with Transfermarkt’s terms.” That is a disclaimer, not a grant.

### Actor source licence

Store `isSourceCodeHidden: true` on every acts-API lookup. `curious_coder` README links a public GitHub repo; that licences **their crawler code**, not TM’s database (same as felipeall MIT).

---

## What Apify uniquely does vs felipeall / dcaribou

| Claim | True? |
| --- | --- |
| Unique TM licence | **No** |
| Avoid §11.1 | **No** |
| Hosted residential / Unblocker vs our Fly IP | **Yes** (platform). Several actors still say DC is blocked — same class as felipeall #121/#110. |
| Nested `TransfermarktRawPayload` | **No** — we still write the adapter |
| 1990s Superliga dump | **No** — only if we request those URLs and TM serves them |
| Kits | **No** |
| Unlock production lane | **No** (`seed/apify/src/lane.ts`) |

Today Apify uniquely does **nothing in production**: CLI requires `SEED_APIFY_FIXTURE`.

---

## Live probe (2026-08-19)

Account: Apify **FREE** (`$5` monthly credits). Token used only in-session; **not stored in git**. Rotate it — it was pasted in chat.

| Run | Actor | Result | Shirt # | Cost (platform USD) |
| --- | --- | --- | --- | --- |
| FCK `season=2000` | `automation-lab/transfermarkt-scraper` `mode=clubs` | **38** squad rows (Zaza, Myhre, Bo Svensson, …). Club header still looks *current* (stadium name); squad rows are historical. | **36/38** `shirtNumber` | 0.044 |
| FCK `season=2010` | same | **32** rows (Wiland, Zanka, Wendt, …) | **29/32** | 0.038 |
| FCK `season=2025` | same | **40** rows (Kotarski, Zanka, …) | **37/40** | 0.046 |
| FCK `season=2000` | `haketa/transfermarkt-scraper` | **FAILED** — WAF HTTP 202, then crash on `error.message` | — | 0.0002 |
| Henry profile | `data_xplorer` + `automation-lab` players | Name, 15 transfers (Monaco→Juve→Arsenal→Barça→NY→Retired). `playerStats` empty. | Current `jerseyNumber`/`shirtNumber` **empty** (retired) | 0.10 + 0.007 |
| Henry `rueckennummern` | `kawsar` + **RESIDENTIAL** | **40** table rows: club seasons **and** France / U18–U21 | Club e.g. Arsenal **#14**, France **#12** | 0.24 |

**Clubs mode default dataset is empty** — squads live in the named `squads` output (`run.output.squads`). `2000`→`today` was **not** fully looped (would be ~26 × ~$0.04 ≈ **$1** on this actor). Endpoints 2000, 2010, 2025 all returned season-scoped `#`.

Sources: Apify run outputs on that date (dataset items; no token logged).

---

## Red flags (for `/grill-with-docs`)

1. **No official Apify TM actor.** Community-only; source hidden; clones (`data_xplorer` ≈ `parsebird`; `scraper-engine` ≈ `curious_coder`).
2. **Superliga / DK1 never named.** Custom code / URL only.
3. **Jersey grain is current**, except undocumented generic kader tables.
4. **Proxy story is contradictory** (automation-lab “no proxy” vs kawsar/parsebird “DC blocked”). Believe the block reports + felipeall issues.
5. **Must-drop columns** are first-class (values, agents, images). Agency-directory actor is PII.
6. **Apify ToS §6.2 / §11.1** — unauthorized extract is our liability. TM §11.1 still applies.
7. **None match `TransfermarktRawPayload`.** Mapper + fixtures stay.
8. **Still not kits.** FK seed after facts.
9. **Low-n actors** (`haketa` 1 user, `handsome` v2 21/136) are not production vendors without a paid probe.
10. **Do not hit Store / TM from CI.** Keep `SEED_APIFY_FIXTURE`.

This note feeds `/grill-with-docs`. It does not change ADR-0002, open Linear issues, or open a PR.
