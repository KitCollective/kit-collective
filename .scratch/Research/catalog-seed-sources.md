# Catalog seed sources — primary-source research

**Date:** 2026-08-14  
**Product:** KitCollective  
**Question:** How should we collect and seed catalog master data from day one: clubs, national teams, seasons, players + squad numbers, sleeve/competition patches, and the actual kits (home/away/third/gk) per season?

## Answer

Buy a licensed football API (Sportmonks or API-Football) for **countries, leagues, clubs, seasons, and current squads with numbers**. Pair that with **Wikidata CC0** for Q-ids, aliases, and validity (renames, mergers, dissolved clubs). **Do not expect any match API to ship home/away/third artwork or sleeve patches** — Sportmonks’ own Superliga payload sets `has_jerseys: false`; football-data.org and API-Football document squads and `shirtNumber`, not kits. Kit identity (club + season + type + manufacturer) is a **curated catalog**, seeded by admin plus the closed Danish beta, not scraped. Patches are a **separate catalog entity**, propose-only except for a small hand list (Superliga sleeve, UEFA, DBU). Do not scrape Transfermarkt, Flashscore, Sofascore, or kit-archive HTML; do not put third-party kit photography in the product CDN. Users photograph their own shirts. A catalog miss on club or club-scoped season is what blows the 45-second jersey-#2 budget — seed those two layers thick for Denmark first; treat kit manufacturer and patches as enrichment that must not block Save.

Related: [jersey-registration-speed.md](./jersey-registration-speed.md) (catalog miss + season picker); [PRD](../Business/PRD.md) (canonical catalog, validity periods, 48h propose SLA).

---

## Entity × source coverage matrix

Legend: **Y** = first-party field exists and is usable for commercial seed under that source’s licence (see cards). **P** = partial / sparse / paid-tier / not Nordic-complete. **N** = not in the schema, or ToS/licence forbids the use we would need. **Ref** = human identity reference only (no dump, no API, do not scrape).

| Entity | football-data.org | API-Football | Sportmonks | TheSportsDB | Wikidata CC0 | OpenFootball CC0 | open-jersey-db ODbL | StatsBomb open | Kit archive sites | Transfermarkt / Sofa / Flash |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Countries | Y | Y | Y | Y | Y | Y | P | N | N | N (ToS) |
| Leagues + historical names | P | Y | Y | P | P (P1448 / P571 / P576) | P | N | P (few comps) | N | N |
| Clubs (live) | Y (paid for Superliga) | Y | Y (free includes Superliga) | P | Y | Y (DK file ~50 clubs) | P (no Superliga depth) | N | Ref | N |
| Clubs (dissolved / renamed / farm) | P | P | P | P | **Y** (P576, P1366, P156) | Y (aliases, mergers) | N | N | Ref | N |
| National teams | P (WC/EURO on some tiers) | Y | Y | P | Y | P | P | N | Ref | N |
| Seasons (calendar vs split-year) | Y (`startDate`/`endDate`) | Y | Y (`starting_at`/`ending_at`, `name` e.g. `2025/2026`) | P | P | P | P | P | Ref | N |
| Club-scoped season lists | Y (teams by `?season=`) | Y | Y (`seasons` include) | P | P | N | N | N | Ref | N |
| Kits home/away/third/GK | **N** | **N** | **N for Superliga** (`has_jerseys: false`) | **P** (equipment artwork, not structured types) | P (P5995 supplier; infobox kits on wiki) | **N** | P (~280 kits, Big-5 not Nordic) | **N** | Ref (HTML only) | N |
| Manufacturer | N | N | N (jersey flag unused for DK) | P (in artwork metadata if editors filled it) | P (P5995, often club-level not per kit) | N | Y where present | N | Ref | N |
| Sponsor as identity | N | N | N | N | P | N | Y where present | N | Ref | N |
| Players | Y (squads, paid Deep Data) | Y | Y | P | Y | N | N | P (lineups, selected comps) | N | N |
| Squad numbers | Y (`shirtNumber` in lineups/squads) | Y (`/players/squads`) | Y (`jersey_number`) | P | P | N | N | P | N | N |
| Patches / sleeve badges | **N** | **N** | **N** | **N** | **N** | **N** | **N** | **N** | Ref (Shirt Squad: variants go in notes) | N |
| Kit photography (republication) | N | N | Logos: arrange IP yourself | Paid + attribution; trademarks as-is; **do not CDN** | Commons file-by-file | N | No images by design | N | Copyright reserved | N |

---

## API / dataset cards

### football-data.org (Freitag Web Tec UG)

- **What:** REST v4 JSON. Competitions, seasons, teams, matches, standings, scorers. Paid “Deep Data” adds line-ups, bookings, **squads**. Match line-ups include `shirtNumber`. Documented resources are match/table/squad — **no kit, manufacturer, patch, or shirt-artwork fields**.
- **Nordic:** Coverage table lists Denmark Superliga, Sweden Allsvenskan, Norway as **Tippeligaen** (the pre-2017 name — a live example of why catalog rows need validity periods). Superliga is **not** in the free 12 (those are Big-5, CL, Eredivisie, Primeira, Championship, Brazil Série A, WC, EURO).
- **Kits?** No.
- **Players / numbers?** Squads and `shirtNumber` on paid Deep Data / Standard+.
- **Cost (fetched 2026-08-14):** Free €0 / 12 comps / 10 calls/min. Deep Data €29 (12 comps, squads, 30/min). Standard €49 / 30 comps / 60/min. Advanced €99 / 50. Pro €199 / 100. VAT extra. Custom: `daniel@football-data.org`.
- **Rate limits:** Anonymous 100/24h (area + competition list only). Free 10/min; Standard 30/min; plans above 60/min (FAQ/policies).
- **Licence / commercial:** Registration requires accepting T&C (page itself did not resolve at `/terms` — 404). About page links “Privacy Policy and the Terms and Conditions.” FAQ requires visible attribution: `Data provided by football-data.org`. A 2014 blog post said the API was free only for non-commercial use and asked commercial users to contact Daniel; **paid tiers now exist**. Treat the 2014 post as historical; lock commercial use against the live T&C at signup and a written note from Daniel for a catalog-seed (offline dump) use, because the published FAQ is about live API attribution, not a perpetual database licence.
- **Use for KitCollective:** Optional. Superliga is paid. No kits. Fine as a **club/season/squad** complement if Sportmonks/API-Football are rejected; not sufficient alone.

Sources: [pricing](https://www.football-data.org/pricing), [coverage](https://www.football-data.org/coverage), [API reference](https://www.football-data.org/documentation/api), [v4 docs](https://docs.football-data.org/general/v4/index.html), [FAQ](https://www.football-data.org/documentation/faq), [about](https://www.football-data.org/about).

### API-Football (API-SPORTS)

- **What:** REST `https://v3.football.api-sports.io/`, header `x-apisports-key`. GET only. First-party beginner guide: 1,200+ leagues; `/leagues`, `/teams`, `/players`, `/players/squads` (current roster: **shirt number**, no season param), `/players?team=&season=` for historical stats. **No kit/jersey/equipment endpoint in that guide.**
- **Nordic:** Worldwide league list includes domestic top flights; confirm Superliga / Allsvenskan / Eliteserien IDs at signup (coverage page timed out this pass — do not invent IDs). Free plan is volume-limited and **season-depth limited**; paid unlocks deeper history.
- **Kits?** No (documented endpoints).
- **Players / numbers?** Yes, current squads cheaply via `/players/squads`; historical via `/players` + season (paginated, costs quota).
- **Cost (pricing page, 2026-08-14):** Free $0 / 100 req/day. Pro $19 / 7,500/day. Ultra $29 / 75,000. Mega $39 / 150,000. Prepaid, no auto-renew, no overage (requests stop). Custom up to 1.5M/day. All plans include all endpoints; free is limited on available seasons.
- **Licence / commercial:** [Terms](https://api-sports.io/terms) (same text on api-football.com/terms): data “as is”; **they do not grant a licence to publish the data** — “Any license or permission to publish the data must be requested by the user from the competent authorities.” League/federation IP may apply. Resale of the API is out of scope; building an app is the intended use, but **KitCollective must not treat API-SPORTS as a rights grant for club names/crests in a public catalog**. No scraping of their HTML is discussed; use the API.
- **Use for KitCollective:** Strong **buy** candidate for clubs/seasons/current numbers at $19/mo during seed, then cancel (prepaid). Does not solve kits or patches. Crests/logos from the API are third-party IP (same issue as Sportmonks).

Sources: [pricing](https://www.api-football.com/pricing), [terms](https://api-sports.io/terms), [beginner guide](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide).

### Sportmonks Football API v3

- **What:** REST `https://api.sportmonks.com/v3/football`, `api_token`. Entities: countries, leagues, seasons, teams, players, **team squads** with `jersey_number`, start/end dates. League object includes **`has_jerseys`**. Official Superliga example (`id: 271`, `short_code: "DNK SL"`) has **`has_jerseys: false`**. Team includes do **not** list a jerseys include. Premier League example in docs also `has_jerseys: false`. The jersey feature is a flag, not a Superliga dataset.
- **Nordic:** **Free forever plan = Danish Superliga + Scottish Premiership** (including play-offs). That is uniquely useful for a Denmark-first product. Paid Starter: any 5 leagues / €29/mo / 2,000 calls per entity per hour. Growth 30 / €99. Pro 120 / €249. History older than three seasons is a one-time add-on except Enterprise.
- **Kits?** Not for Superliga. Do not plan on Sportmonks kit artwork.
- **Players / numbers?** Yes. `GET /squads` by team and by team+season. `jersey_number` is a first-class squad field.
- **Cost:** Free (two leagues). Starter €29. 14-day trial on paid (card required). Prices ex-VAT. Yearly −20%.
- **Licence / commercial:** [Terms](https://www.sportmonks.com/terms-of-service/): **reselling Sportmonks data is not allowed**; “If you use our data to create something based on our data and start earning money from your creation, everything is fine.” Distribution/storage of data from the API is allowed; reselling the product is not. **Logos and profile photos are copyrighted by their legal owner** — “to display these types of content in your app or website, you have to arrange proof of intellectual property yourself.” Coverage gaps disclaimed. Account not shareable. NL law.
- **Use for KitCollective:** **Best first buy for DK seed.** Use the free Superliga feed to import clubs, seasons, current + recent squads. Upgrade Starter to add Allsvenskan, Eliteserien, and two Big-5 leagues when SE/NO/Europe depth starts. Still **curate kits**. Do not hot-link Sportmonks CDN crests into the public web without a rights plan (text names + user photos are enough for MVP).

Sources: [free plan](https://www.sportmonks.com/football-api/free-plan/), [pricing](https://www.sportmonks.com/football-api/plans-pricing/), [ToS](https://www.sportmonks.com/terms-of-service/), [leagues](https://docs.sportmonks.com/v3/endpoints-and-entities/endpoints/leagues.md), [get-all-leagues](https://docs.sportmonks.com/v3/endpoints-and-entities/endpoints/leagues/get-all-leagues.md), [team/squad entity](https://docs.sportmonks.com/v3/endpoints-and-entities/entities/team-player-squad-coach-and-referee.md).

### TheSportsDB (TheDataDB Ltd)

- **What:** Community sports DB + JSON API. **This is the only widely documented public API with a team-equipment (kit artwork) lookup.** v1: `lookupequipment.php?id={idTeam}` (free limit **2**/call type; premium 100). v2 (premium): `GET /lookup/team_equipment/{idTeam}` returns `idEquipment`, `idTeam`, `strSeason` (e.g. `2019-2020`), `strEquipment` (PNG URL). Artwork types page lists “Team Equipment” 500×500 fan-style kit images.
- **Nordic:** Soccer leagues exist; **equipment completeness for Superliga is not published**. Treat as sparse fan art, not a master catalog.
- **Kits?** Artwork + season string. Not a reliable home/away/third/GK enum, not manufacturer, not patches.
- **Players?** Yes, community-edited; quality varies.
- **Cost:** Free $0 / 30 req/min / limited methods (key `123`). Single developer **$9/mo** / 100 rpm. Small business **$20/mo** / 120 rpm / private key. v2 is premium-only.
- **Licence / commercial:** [ToS, last updated 01/07/2025](https://www.thesportsdb.com/docs_terms_of_use.php): **“You can scrape, copy and modify any content returned from the API, as long as you use the official end points. Please do not scrape our website.”** **“You cannot publish apps to an appstore unless you are a paid subscriber.”** Paid: use custom artwork but **must mention them as the source**. Artwork is mostly user-created; do not pass it off as own; DMCA in 24h. **Trademarked sports logos must be used as-is.** `strCreativeCommons` on player artwork. No reselling the API.
- **Use for KitCollective:** Paid $9–20 is cheap and **App Store–mandatory if we used them at all**. Still **do not put their equipment PNGs in our CDN** (user-contributed drawings of trademarked kits; PRD needs identity, not republished art). Optional as a **hint** for admin when curating manufacturer/season, never as user-facing kit photography.

Sources: [ToS](https://www.thesportsdb.com/docs_terms_of_use.php), [pricing](https://www.thesportsdb.com/pricing), [docs](https://www.thesportsdb.com/documentation), [artwork types](https://www.thesportsdb.com/docs_artwork).

### StatsBomb Open Data (hudl/open-data)

- **What:** GitHub JSON: competitions, matches, events, lineups. Aimed at **research and football analytics**.
- **Nordic / kits / patches:** Not a catalog source. Selected competitions only. No kit fields.
- **Licence:** README: public use for **research projects and genuine interest in football analytics**; credit StatsBomb + logo if you publish analysis. Licence file is `LICENSE.pdf` (“StatsBomb Open Data User Agreement”) — not CC. **Not a commercial master-data licence for a collector app.**
- **Use:** Skip for catalog seed.

Source: [README](https://github.com/statsbomb/open-data/blob/master/README.md).

### Transfermarkt

- **What:** The de-facto human reference for squads, numbers, historical clubs. **No official public API.** Unofficial GitHub “APIs” wrap HTML/internal endpoints; they are not a licence.
- **ToS (UK, §11.1):** “The User is not permitted to access or copy the Digital Content using bots, spiders, screen scraping or other automated processes.” AI training prohibited. **Text and data mining (UrhG §44b) expressly reserved.** §3.2: all rights in databases reside with Transfermarkt; reproduction illegal outside stated licences. German law, Hamburg courts.
- **robots.txt (transfermarkt.co.uk):** `User-agent: wget` / `Disallow: /`. `User-agent: *` / `Allow: /` (search engines). robots.txt is not permission to build a commercial catalog.
- **Use:** **Manual lookup by admin** when verifying a propose. Never automated ingest.

Sources: [Terms](https://www.transfermarkt.co.uk/intern/anb), [robots.txt](https://www.transfermarkt.co.uk/robots.txt).

### Sofascore

- **What:** Livescores/stats product. **No public data API.** First-party FAQ (updated 2025-11-06): “due to agreements with our data providers, we are unable to share the data sources in the form of API endpoints.” Widgets exist for media partners.
- **ToS (Torneo by Sofascore, same corporate family):** licence “does not include any resale or commercial use of the Platform or its contents” or “data mining, robots, or similar data gathering and extraction tools.” Platform for domestic/private use unless licensed.
- **robots.txt:** Disallows dated path prefixes 2017–2025 and standings; blocks many AI crawlers.
- **Use:** Do not scrape. Do not depend on an unofficial API.

Sources: [FAQ](https://sofascore.helpscoutdocs.com/article/129-sports-data-api-availability?lng=en), [Torneo ToS](https://torneo.sofascore.com/terms-of-service), [robots.txt](https://www.sofascore.com/robots.txt).

### Flashscore (Livesport s.r.o.)

- **ToS:** Site “for your personal use only. You may not use the Site for any commercial purpose.” Database right: no extraction or making available of a qualitatively or quantitatively substantial part without consent. **“you are not permitted to use the content of the website by embedding, aggregating, scraping or recreating it without our express consent.”** Infringement may be civil/administrative/criminal.
- **robots.txt:** Disallows `/standings/`, `/draw/`, `/newsfeed/`; blocks CCBot and many AI bots.
- **Use:** Do not scrape. No public API for catalog seed.

Sources: [Terms of Use](https://www.flashscore.com/terms-of-use/), [robots.txt](https://www.flashscore.com/robots.txt).

### FIFA / UEFA “open data”

- No first-party FIFA or UEFA public kit/club master-data API was found for commercial reuse. Third-party World Cup APIs (e.g. BallDontLie FIFA) are not FIFA-licensed catalog dumps and do not cover Superliga kits. **Do not treat tournament microsites as open datasets.**

---

## Open / Wikimedia sources

### Wikidata (structured data: CC0)

- **Licence:** All structured data in main/property/lexeme namespaces is **CC0**. Text in other namespaces is CC BY-SA 4.0. ([Wikidata:Licensing](https://www.wikidata.org/wiki/Wikidata:Licensing), [Data access](https://www.wikidata.org/wiki/Wikidata:Data_access).) Attribution is requested (“Powered by Wikidata”), not required by CC0.
- **Access (official, not HTML scrape):** SPARQL `https://query.wikidata.org/sparql`; EntityData `https://www.wikidata.org/wiki/Special:EntityData/Q….json`; dumps; Wikibase REST; Action API. Follow [Wikimedia API Usage Guidelines](https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_API_Usage_Guidelines) (User-Agent with contact, honour 429, no multi-UA to hide load, no sublicensing the API). Wikipedia **robots.txt** asks crawlers not to copy the entire site and blocks site-copier UAs (HTTrack, wget-class tools); **use the APIs**.
- **Useful properties for this catalog:**
  - **P5995 kit supplier** — official sportswear supplier to a club or national team (item; often current deal, not per-season kit row).
  - **P13152 Football Kit Archive ID** — slug for `https://www.footballkitarchive.com/$1-kits/` (identifier only; the archive is not CC0).
  - **P31 / P279** club class, **P17** country, **P118** league, **P571** inception, **P576** dissolved, **P1366** replaced by / **P156** followed by (mergers: KB+B 1903 → FCK; Ikast+Herning Fremad → FCM; Herfølge+Køge → HB Køge).
  - **P3828 wears** is generic clothing, not a kit-season entity.
- **Gaps:** No first-class “2024/25 Brøndby home by Hummel with 3F sleeve” item type with complete Nordic coverage. Wikipedia **Template:Football kit** is an infobox renderer (Commons pattern images), not a SPARQL catalog. Completeness for Superliga kits is volunteer-sparse.
- **Use:** **Canonical external ID** (`wikidataQid`) on every Country/League/Club/NationalTeam. SPARQL pull for DK/SE/NO clubs + aliases + dissolved. P5995 as a **hint** for manufacturer, admin-confirmed. Do not import Football Kit Archive pages via P13152.

### Wikipedia text (CC BY-SA 4.0 + GFDL)

- Reuse requires attribution and share-alike on the **text**. Media is **per-file**. Fair-use images on enwiki are **not** reusable in a commercial DK app. ([Reusing Wikipedia content](https://en.wikipedia.org/wiki/Wikipedia:Reusing_Wikipedia_content).)
- **Use:** Human briefing for validity periods (league rename Coca-Cola Ligaen → SAS Ligaen → Alka Superliga → 3F Superliga; Norway Tippeligaen → Eliteserien 2017). Not a machine seed of kit identity.

### Wikimedia Commons

- Only free licences (CC BY/SA, CC0, PD, etc.). **No NC, no fair use.** Logos and copyrighted crests are often **not** acceptable on Commons; many kit photos are copyrighted match photography and should not be there. Each file’s licence must be checked. ([Commons:Licensing](https://commons.wikimedia.org/wiki/Commons:Licensing).)
- **Use:** Optional **diagrammatic** kit patterns if a file is truly free **and** we still prefer user photos in-product. Never assume a Commons “kit” image is a rights-cleared product shot.

### OpenFootball / football.db (CC0-1.0)

- GitHub org [openfootball](https://github.com/openfootball). [clubs](https://github.com/openfootball/clubs) README: public-domain clubs & stadiums; aliases via `|`. GitHub licence badge **CC0-1.0**. [SUMMARY](https://github.com/openfootball/clubs/blob/master/SUMMARY.md): **`europe/denmark/dk.clubs.txt` (50 clubs)** including FCK, Brøndby, FCM, AGF, and historical/merged names (B 1903 1903–1992, KB 1876–1992, Ikast FS 1935–1999, Herfølge BK 1921–2009, Køge BK 1927–2009). [leagues](https://github.com/openfootball/leagues) and [football.json](https://github.com/openfootball/football.json) are CC0 match/league dumps; football.json emphasises Big-5, “no API key”.
- **Kits / players / patches:** Not in scope.
- **Use:** **Alias and historical-name seed** for Danish clubs, merge into canonical Club rows with validity periods. Do not expect live Superliga squads.

### open-jersey-db (ODbL 1.0)

- Community YAML/JSON of jersey **identity** (team, season, kit type, manufacturer, sponsor, **GTIN/EAN**). **No image binaries.** ~350 teams / ~280 kits; football coverage listed as Bundesliga, PL, La Liga, Serie A, Ligue 1/2, MLS, some national teams — **not Superliga / Allsvenskan / Eliteserien**.
- **Licence:** ODbL 1.0 — use with attribution; **derived databases must stay open under ODbL**. Mixing ODbL kit rows into a proprietary KitCollective catalog has share-alike implications — **legal review before ingest**. GTINs are facts; trademarks nominative.
- **Use:** Schema inspiration (kit as identity, no photos, no prices). Not a Nordic seed. Optional later for Big-5 barcode identity if ODbL is acceptable.

Source: [README](https://github.com/dmnk-rdr/open-jersey-db/blob/main/README.md).

---

## Kit-specific and patch-specific reality

This is the actual gap. Match APIs answer “who played for whom in 2019/20 with which number.” Collectors need “Brøndby away 1998/99, Hummel, UEFA sleeve, nameset.” Those are different products.

### Sites that know kits (HTML, not APIs)

| Source | API / dump? | Licence | Notes |
| --- | --- | --- | --- |
| **Historical Football Kits** (historicalkits.co.uk) | No API. robots.txt only disallows `/~store/`. | **All material copyright; all rights reserved.** Non-commercial reuse with credit + link. **Commercial use only with written permission**; they license graphics, prices on request. Crests/sponsors/photos remain third-party IP. | Best English-language **identity reference** for UK/historical kits. Ask them for a commercial licence if we ever want their **diagrams**. Do not scrape. Do not hot-link. |
| **Football Kit Archive** (footballkitarchive.com) | **No official API.** Homepage (2026): 455,679 kits, 28,752 teams, 3,223 leagues, 5,069 brands, 3,015 user submissions; “powered by Footy Headlines.” Wikidata P13152 points here. Third-party `fkapi` (sunr4y) is an unofficial scraper described as educational / not for commercial use — **do not use.** | No published CC dump. Treat as proprietary HTML + user uploads. | Useful as **admin eyeball** when verifying a propose. Not a seed pipeline. |
| **Shirt Squad** (first-party site) | No dump. User submission into *their* DB. | Their catalog, not ours. | Submission rules: official shirts only; **sponsor / poppy / cup-winners patch variants are “not considered new”** — belong in notes. Arm/back differences even across seasons are not separate shirts. Contact them *before* submitting a missing team. That is the Shirt Squad dead-end the PRD forbids; it also proves **patches are not first-class in competitor DBs**. |
| **MyFootballShirts** | No dump. User catalog + premium AI prefill. | Their catalog. | Built by submission, not by a licensed kit API. |
| **Classic Football Shirts / other retailers** | Shop HTML/JSON for *their* SKUs. | Product photography and descriptions are theirs / brands’. | **Identity reference only** (season, type, manufacturer on a product title). Do not scrape product photos into the CDN. Do not copy commercial copy. |
| **Manufacturer lookbooks** (Nike, adidas, Puma, **Hummel**) | Marketing sites / PDFs. No public kit API. | Copyrighted commercial photography and trademarks. | Hummel is DK-critical as a **fact** (who supplied whom). Record manufacturer as an enum/catalog org, sourced from club announcements / Wikidata P5995 / Hummel press — not by ingesting lookbook images. |
| **Soccerbible / Beautiful Game / “FIFA Kit Database” fan sites** | HTML magazines / galleries. | Copyright. | Reference, not ingest. |

### Patches (league, UEFA, memorial, tournament)

No source in this pass offers a structured, licensed patch catalog (Superliga sleeve 2019–now, UEFA Respect, Champions League starball, DBU, memorial poppy, tournament). Shirt Squad’s own rules push patches into **notes**. Therefore:

- **Patch is its own catalog entity** (name, issuer, validity, image = optional admin diagram or empty).
- Attachable to a **Kit** (this season’s league sleeve was issued on the home shirt) **and/or** to a **user jersey** (this copy has the cup final patch).
- **MVP seed:** a hand list of ~20–40 Nordic-relevant patches (3F Superliga, Allsvenskan, Eliteserien, DBU, SvFF, NFF, UEFA CL/EL/UECL, WC/EURO). Everything else is **premium propose**.
- Do not scrape patch PNGs from Wikipedia infoboxes or kit archives into the CDN. A text label is enough for match/search.

### Image copyright (explicit)

| We need | We do not need / must not do |
| --- | --- |
| Identity: club, season, type, manufacturer if known | Copyrighted kit photography republished as “the” catalog image |
| User photos of *their* copy (front/back/label) | Historical Football Kits diagrams without a written commercial licence |
| Optional: simple geometric colour chips (our art) | TheSportsDB equipment PNGs as product shots (fan art + trademarks) |
| Optional: Commons file **after** per-file licence check | Sportmonks/API-Football crests without a rights arrangement |
| | Scraped Football Kit Archive / retailer / lookbook JPEGs |

PRD already says the camera is the capture method. Catalog pages on Astro can show **user-contributed photos of owned shirts** (with the uploader’s licence to us) or a typographic placeholder. That is enough for Facebook Open Graph later.

---

## Legal / ToS summary (scraping)

**Usable for a commercial Nordic app**

| Path | Why |
| --- | --- |
| Sportmonks API (paid or free Superliga) | ToS allows building apps; forbids resale of the feed. Import + store our canonical rows. Arrange logo rights separately or skip logos. |
| API-Football paid | Intended for apps; they **disclaim** a publishing licence — we still need to treat facts (names, years, numbers) as facts and not claim league endorsement. Crests are not ours. |
| football-data.org paid + attribution | FAQ requires the disclaimer. Confirm T&C at registration for offline seed. |
| Wikidata CC0 via SPARQL/EntityData | Official data access; follow API etiquette. |
| OpenFootball CC0 files | Public domain datasets. |
| Wikipedia **API** for text we attribute CC BY-SA (rare; prefer Wikidata) | Not a full-site copy. |
| TheSportsDB **API** on a paid plan | App Store clause; still don’t CDN their art. |
| Manual admin research on any public webpage | A human verifying a propose is ordinary use, not a bot. |

**Not usable (ban / sue / grey)**

| Path | Why (first party) |
| --- | --- |
| Transfermarkt scrape or unofficial API | ToS §11.1 bans bots/spiders/screen scraping; TDM reserved; wget disallowed in robots.txt. |
| Flashscore scrape | Personal use only; database right; explicit no scraping/aggregating. |
| Sofascore scrape / reverse unofficial API | No API (provider agreements); commercial extraction forbidden in related ToS; robots blocks historical paths. |
| Historical Football Kits scrape | Copyright reserved; commercial needs written permission. |
| Football Kit Archive scrape / fkapi | No licence; third-party scraper is not their API. |
| Wikipedia HTML dump / HTTrack | robots.txt forbids site-copiers; use APIs. |
| TheSportsDB website scrape | ToS: use endpoints, “do not scrape our website.” |

**Conclusion:** Licensed API + CC0 + **manual/admin curation** is the only defensible seed. Grey scraping of kit archives would not even solve patches, would poison App Review/partnerships, and would put copyrighted photos in a CDN we would then have to purge.

---

## Recommended MVP seed plan (phased)

### Design rule (so thin kits do not blow 45s)

From [jersey-registration-speed.md](./jersey-registration-speed.md): jersey #2 dies on **season pick** or **catalog miss**, not on photos.

Make **Club + club-scoped Season** the required catalog hits. **Type** (home/away/third/GK) is an enum on the user jersey. **Kit** is a canonical row `(clubId, seasonId, type, manufacturerId?)` used when it exists (search, web catalog page, wishlist precision). If the kit row is missing, **Save still succeeds** pointing at club + season + type; premium may propose manufacturer/variant. **Never** block the 45s path on manufacturer or patch.

This is compatible with the PRD (collection points at catalog IDs; no free-text club) and avoids Shirt Squad’s “submit the shirt to the global DB before you own it.”

### What to buy vs curate vs propose

| Layer | Source | Who | When |
| --- | --- | --- | --- |
| Countries, current leagues, current clubs, season calendars, **current squads + numbers** | **Sportmonks free (Superliga)** then Starter 5 leagues; *or* API-Football Pro $19 for a one-off historical pull | Engineering import → admin review | Fase 0, week 1 |
| Aliases, dissolved, mergers, Q-ids | **Wikidata CC0** + OpenFootball `dk.clubs.txt` | Engineering merge + admin | Fase 0 |
| League historical names (SAS Ligaen, Tippeligaen, …) | Wikipedia/Wikidata (facts) as **validity-period aliases** on League | Admin | Fase 0 |
| Kit identity Superliga current 12 × ~25 seasons × 4 types | **Curated** (admin + 50–100 beta collectors). APIs do not have this. | Admin queue | Before DK launch |
| Kit identity remaining Superliga-historical 21 clubs | Curate **home/away/GK** for years they were in the top flight; thirds propose | Admin / propose | Launch + 48h SLA |
| Nordic NTs (DK/SE/NO men; women if time) | Curate last ~20 seasons × 4 types | Admin | DK launch |
| Allsvenskan 16 + Eliteserien 16 clubs + seasons | Sportmonks/API-Football clubs/seasons; kits curated thinner (current season + last 10) | Month 3 (PRD) | |
| Big-5 “largest European clubs” (~20–30 clubs) | API clubs/seasons; kits: current + last 10 home/away/GK | Depth, not blocking DK | |
| Players / numbers historical | **Skip seed.** Current Superliga squads only for nameset autocomplete. | Propose | |
| Patches | Hand-curate 20–40; rest propose | Admin | |
| Photos | **Users only** | — | Forever |
| Prices | **Never** (PRD) | — | |

**Do not buy** StatsBomb, Transfermarkt-unofficial, TheSportsDB *for artwork*, or a kit-archive licence unless Historical Football Kits quotes a price we actually need (diagrams). We do not.

### Minimum viable Denmark Superliga seed (order of magnitude)

First-party counts:

- Superliga: **12 clubs**, founded **1991**, split-year from 1991/92 (inaugural 1991 was a spring-only season). ([enwiki Danish Superliga](https://en.wikipedia.org/wiki/Danish_Superliga); [superliga.dk](https://superliga.dk) 2025/26 and 2026/27 coverage is 12 clubs.)
- **33 clubs** have ever played in the Superliga. ([List of Danish Superliga clubs](https://en.wikipedia.org/wiki/List_of_Danish_Superliga_clubs).) Mergers that must be separate catalog orgs with validity: B 1903 + KB → FCK (1992); Ikast fS + Herning Fremad → FCM (1999); Herfølge + Køge → HB Køge (2009).
- OpenFootball lists **50** Danish clubs including lower-tier and defunct names — more than Superliga-ever, useful as aliases.

**Required for 45s (no catalog miss on club/season):**

| Object | Count (order of mag.) |
| --- | --- |
| Superliga-ever clubs + current 1st Division yo-yo clubs collectors own | **~35–50** Club rows |
| Denmark NT (men) | 1 |
| Season labels 1991 → 2026/27 (split-year) plus pre-1991 club seasons as needed | **~40** Season rows on the league; **club-scoped lists** = union of years each club fielded a first team |
| Kit rows that *should* exist at launch (current 12 × 25 seasons × 4 types) | **~1,200** |
| Additional historical clubs (21 × ~12 Superliga seasons × 3 types home/away/GK) | **~750** |
| Denmark NT kits (~20 × 4) | **~80** |
| **DK kit identity target** | **~2,000 rows** |
| Current Superliga squads (~12 × 28 players) | **~350** PlayerSeasonNumber rows |
| Patch hand list | **~30** |

2,000 kit identity rows is a **spreadsheet + admin UI** job for Fase 0, not an API. Closed beta (PRD: 50–100 Danish collectors) should be asked to **propose the kits they actually own** in week one — that is the highest-ROI seed, because it matches real collections rather than a theoretical 1991–2026 complete set.

If Fase 0 time is short: seed **all clubs + all club-scoped seasons**, and kit rows only for **current 12 × last 10 seasons × home/away/GK** (~360 kits). Thirds, GK alts, and older seasons fall through to propose. **Club/season must not be thin** — that is the 45s leak.

### Players / numbers

- **Seed:** current Superliga (and, at SE/NO launch, Allsvenskan / Eliteserien) squads + numbers from Sportmonks/API-Football. Refresh on a cron; do not treat as live scores.
- **Do not seed** 1990s squads. Nameset autocomplete for vintage shirts is propose or free-text **on the user jersey only** (optional field), never a new canonical Player until admin verifies.
- Shirt number is **season-scoped** (`PlayerClubSeason.number`), not a property of the person forever.

### Patches

Confirmed: no licensed dataset. Curate + propose. 48h SLA applies.

### How the 48h SLA interacts with thin seed

PRD: premium propose → admin verifies within 48h; free users see upgrade CTA on miss.

- If **club or season** is missing, jersey #2 is lost (speed research). **Over-seed clubs/seasons.**
- If **kit manufacturer** is missing, Save anyway; optional “suggest manufacturer” is premium and not on the 45s path.
- If **player/patch** is missing, optional accordion; propose; SLA is about **wishlist/search quality**, not first save.
- Staff the admin queue **before** opening propose. A thin kit layer plus a dead queue recreates Shirt Squad.

### Phase timeline

**Phase DK (launch)**  
Sportmonks Superliga import + Wikidata/OpenFootball aliases + ~35–50 clubs + club-scoped seasons 1991–present + ~360–2,000 kit rows + current squads + ~30 patches + DK/SE/NO NTs (clubs/seasons even if SE/NO kits are thin).

**Phase SE/NO (month 3)**  
Allsvenskan **16** clubs, **calendar-year** seasons (March–November). Eliteserien **16** clubs, calendar-year; league renamed from Tippeligaen in **2017** (validity on League). Same pattern: clubs/seasons from API, kits curated current+10y.

**Phase Europe (depth)**  
Big-5 largest clubs (not full leagues). API for orgs/seasons; kits current+10y home/away/GK. Thirds/patches propose.

### Season model (calendar vs split)

| Competition | Pattern | Example label |
| --- | --- | --- |
| Superliga | Split-year from 1991/92; one spring 1991 | `1998/99`, `2025/26` |
| Allsvenskan | Calendar since 1959 | `2026` |
| Eliteserien | Calendar (from 1963 one-group era) | `2026` |
| Big-5 | Split-year | `2025/26` |
| National teams | Calendar (tournament years) plus qualifying windows | `2018`, `2024` |

Store `startsOn` / `endsOn` (dates) plus `label`. Club-scoped season picker = seasons where that club has a TeamSeason (or Kit) row, newest first, with search — as the speed note requires.

---

## Data model hooks (external IDs)

Canonical catalog stays ours. Foreign keys are a map, not the PK.

```text
ExternalId {
  entityType: 'country' | 'league' | 'club' | 'national_team' | 'player' | 'kit'
  entityId: uuid
  system: 'wikidata' | 'football-data' | 'api-football' | 'sportmonks' | 'thesportsdb' | 'openfootball'
  value: string          // Q191395, 271, ...
}

Country { id, iso3166, name, validity }

League {
  id, countryId, name
  validity: { from: date, to: date | null }
  aliases[]              // "SAS Ligaen", "Tippeligaen"
}

Club {
  id, countryId
  name, aliases[]
  validity
  successorClubId?       // FCK after merger
  predecessorClubIds[]
  kind: 'club' | 'farm' | 'dissolved'
}

NationalTeam { id, countryId, gender, name, validity }

Season {
  id, leagueId?
  label                  // "1998/99" | "2026"
  startsOn, endsOn
  calendarKind: 'split_year' | 'calendar'
}

Kit {
  id
  clubId | nationalTeamId
  seasonId
  type: 'home' | 'away' | 'third' | 'gk' | 'special'
  manufacturerId?
  sponsorName?           // identity only, not a price
  validity               // mid-season redesigns
}

Manufacturer { id, name, wikidataQid? }  // Hummel, Nike, adidas, Puma, ...

Player { id, displayName, wikidataQid? }

PlayerClubSeason {
  playerId, clubId, seasonId
  squadNumber: int | null
}

Patch {
  id, name, issuer       // league | uefa | federation | memorial | tournament
  validity
}

KitPatch { kitId, patchId }           // issued on that kit
JerseyPatch { jerseyId, patchId }     // present on this user copy

Jersey {
  catalogClubId
  catalogSeasonId
  catalogKitId?          // null if kit row not yet curated
  type                   // enum; required even if kitId null
  // instance fields: size, condition, nameset, photos...
  // NEVER copy catalog names
}
```

**Rules**

- User jersey **always** points at club + season IDs. `catalogKitId` is optional until curated.
- Patch is never a free-text truth; missing patch → propose.
- Store Sportmonks/API-Football IDs for refresh; store Wikidata Q-ids for merge/dedup.
- Do not persist scraped image URLs as our assets.

---

## Open questions / weak evidence

1. **football-data.org live T&C HTML** did not resolve (`/terms` 404). Commercial seed should be confirmed at registration or by email, not inferred only from the 2014 blog.
2. **API-Football Nordic league IDs and historical depth on Pro** were not fetched (docs timed out). Verify Superliga/Allsvenskan/Eliteserien + season range on a free key before committing.
3. **Sportmonks `has_jerseys: true` leagues** — which leagues actually have jersey payloads, and are they photos or colour codes? Superliga is false. Even if PL later flips true, logo/kit image IP still sits with clubs/brands.
4. **TheSportsDB Superliga equipment coverage** is unpublished. Spot-check 5 DK clubs before spending time on it as an admin hint.
5. **Historical Football Kits commercial quote** was not requested. Only needed if we want their diagrams; we should not.
6. **ODbL share-alike** vs a proprietary KitCollective catalog: do not ingest open-jersey-db until counsel says the mix is safe.
7. **Exact 2026/27 Superliga 12** — Wikipedia’s “current teams” table did not list names in the fetch; superliga.dk 2026/27 fixture grid includes FCK, FCM, Brøndby, FCN, OB, AGF, Randers, Silkeborg, Viborg, Sønderjyske, and others. Import from Sportmonks, do not hardcode from this note.
8. **Women’s Superliga / Damallsvenskan / Toppserien** — out of MVP scope unless beta collectors demand it; same architecture.
9. **UEFA/FIFA official open kit databases** — none found; absence of evidence, not a proof they will never publish one.

---

## Sources

| URL | What it supports |
| --- | --- |
| https://www.football-data.org/pricing | Tiers, squads on Deep Data+, call rates |
| https://www.football-data.org/coverage | Superliga, Allsvenskan, Tippeligaen listed; free 12 = Big-5 etc. |
| https://www.football-data.org/documentation/api | Resources; `shirtNumber`; no kits |
| https://docs.football-data.org/general/v4/index.html | v4 seasons, team squads |
| https://www.football-data.org/documentation/faq | Attribution string |
| https://www.football-data.org/about | Operator; T&C linked but URL not fetched |
| https://www.api-football.com/pricing | $0–$39 plans, prepaid, all endpoints |
| https://api-sports.io/terms | No publishing licence; third-party IP |
| https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide | `/players/squads` shirt number; no kit endpoint; 100 req/day free |
| https://www.sportmonks.com/football-api/free-plan/ | Free = Superliga + Scottish Premiership |
| https://www.sportmonks.com/football-api/plans-pricing/ | €29 / 5 leagues; history add-on |
| https://www.sportmonks.com/terms-of-service/ | App OK, resale forbidden, logo IP on clubs |
| https://docs.sportmonks.com/v3/endpoints-and-entities/endpoints/leagues/get-all-leagues.md | Superliga `has_jerseys: false` |
| https://docs.sportmonks.com/v3/endpoints-and-entities/entities/team-player-squad-coach-and-referee.md | `jersey_number` on squads |
| https://www.thesportsdb.com/docs_terms_of_use.php | API OK, no site scrape, App Store needs paid, artwork attribution |
| https://www.thesportsdb.com/pricing | $9 / $20 |
| https://www.thesportsdb.com/documentation | `lookupequipment` / v2 `team_equipment` |
| https://www.thesportsdb.com/docs_artwork | Equipment PNG type |
| https://github.com/statsbomb/open-data/blob/master/README.md | Research-only event data |
| https://www.transfermarkt.co.uk/intern/anb | §11.1 no scraping; TDM reserved |
| https://www.transfermarkt.co.uk/robots.txt | wget disallowed |
| https://sofascore.helpscoutdocs.com/article/129-sports-data-api-availability?lng=en | No public API |
| https://torneo.sofascore.com/terms-of-service | No commercial extraction / robots |
| https://www.sofascore.com/robots.txt | Historical paths disallowed |
| https://www.flashscore.com/terms-of-use/ | Personal use; DB right; no scraping |
| https://www.flashscore.com/robots.txt | Partial disallow + AI bots |
| https://www.wikidata.org/wiki/Wikidata:Licensing | CC0 structured data |
| https://www.wikidata.org/wiki/Wikidata:Data_access | SPARQL, EntityData, dumps, etiquette |
| https://www.wikidata.org/wiki/Property:P5995 | kit supplier |
| https://www.wikidata.org/wiki/Property:P13152 | Football Kit Archive ID |
| https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_API_Usage_Guidelines | API operator rules |
| https://en.wikipedia.org/wiki/Wikipedia:Reusing_Wikipedia_content | CC BY-SA text; per-file media |
| https://commons.wikimedia.org/wiki/Commons:Licensing | Free licences only; no NC/fair use |
| https://en.wikipedia.org/robots.txt | No full-site copy; use APIs |
| https://github.com/openfootball/clubs | CC0 clubs; DK file |
| https://github.com/openfootball/clubs/blob/master/SUMMARY.md | 50 Danish clubs, mergers |
| https://github.com/openfootball/football.json | CC0 JSON; Big-5 emphasis |
| https://github.com/dmnk-rdr/open-jersey-db/blob/main/README.md | ODbL kits+GTIN; no Nordic depth; no images |
| https://www.historicalkits.co.uk/copyright.htm | Commercial licence required |
| https://www.historicalkits.co.uk/robots.txt | `/~store/` only |
| https://footballkitarchive.com/ | Kit counts; no API; Footy Headlines |
| https://en.wikipedia.org/wiki/Template:Football_kit | Infobox patterns, not an API |
| https://shirtsquadapp.wixsite.com/shirt-squad | Patches ≠ new shirts; submit-and-wait |
| https://en.wikipedia.org/wiki/Danish_Superliga | 12 clubs; 1991; split-year; name sponsors |
| https://en.wikipedia.org/wiki/List_of_Danish_Superliga_clubs | 33 ever; mergers |
| https://superliga.dk/nyheder/kamptidspunkter/2025-2026/kamptidspunkter-for-1-7-spillerunde-er-klar | 12 clubs 2025/26 |
| https://en.wikipedia.org/wiki/Allsvenskan | 16 clubs; calendar year |
| https://en.wikipedia.org/wiki/Eliteserien | 16 clubs; calendar; Tippeligaen→Eliteserien 2017 |
| ../Business/PRD.md | Canonical catalog, 48h SLA, no prices |
| ./jersey-registration-speed.md | Catalog miss / season picker = 45s leak |

**Gate:** Green for research completeness against the brief (primary docs/ToS/pricing/robots/READMEs). No scrapers, no app code. Implementation of the import job and admin seed UI remains engineering work.
