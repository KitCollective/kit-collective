# Kit type vs occasion variant (FKA)

**Primary source:** Wayback CDX + `id_` HTML for Football Kit Archive kit pages (no live FKA; Cloudflare). Same transport as listing ingest.  
**Date:** 2026-09-11  
**Question:** Super Cup / cup / anniversary shirts are match kits of a base type (often Home), not extra photos on the league Home row, and not a closed `special` enum.

## Observed Type + URL (Wayback)

### AC Milan 2025-26

| URL stem | FKA `Type` | FKA `League` |
| --- | --- | --- |
| `…-home-kit` | Home | Serie A |
| `…-away-kit` | Away | Serie A |
| `…-third-kit` | Third | Serie A |
| `…-fourth-kit` | Fourth | Serie A · EA SPORTS FC Supercup |
| `…-supercoppa-italiana-home-kit` | **Supercoppa Italiana Home** | EA SPORTS FC Supercup |
| `…-gk-home-kit` / `…-gk-away-kit` / `…-gk-third-kit` | GK Home / Away / Third | Serie A |
| `…-gk-1-kit` / `…-gk-2-kit` | GK 1 / GK 2 | Serie A |

No `…-gk-fourth-kit` in this CDX cut. Live FKA season index listed GK Fourth; Wayback did not.

### FC Copenhagen 2010-11 (proof season)

| URL stem | FKA `Type` |
| --- | --- |
| `…-home-kit` | Home |
| `…-away-kit` | Away |
| `…-third-kit` | Third |
| `…-special-kit` | Special |
| `…-european-home-kit` | European Home |

### Real Madrid 2024-25

| URL stem | FKA `Type` |
| --- | --- |
| `…-home-kit` / `…-away-kit` / `…-third-kit` | Home / Away / Third |
| `…-copa-del-rey-final-kit` | Copa del Rey Final |
| `…-supercopa-de-espana-kit` | Supercopa de España |
| `…-uefa-super-cup-kit` and `…-uefa-super-cup-1-kit` | UEFA Super Cup (same Type, two stems) |
| `…-gk-home-kit` / `…-gk-1-kit` | GK Home / GK 1 |

Inter 2024-25: **0** kit stems in this CDX query (archive gap, not a type gap).

## What FKA is doing

FKA `Type` is **not** a closed set. It is either:

1. A **base type**: `Home` | `Away` | `Third` | `Fourth` | `Special` | `GK *`
2. A **base type with occasion prefix**: `Supercoppa Italiana Home`, `European Home`
3. An **occasion-only label** with no Home/Away/Third/Fourth: `Copa del Rey Final`, `Supercopa de España`, `UEFA Super Cup`

The URL stem after `{club}-{season}-` is the stable identity. Two kits can share the same Type string (`UEFA Super Cup` vs `UEFA Super Cup 1`).

`League` is a slash-list of competitions the shirt was used in. League Home often lists both domestic league and a cup. That field is **not** unique enough to split variants (Milan Home is Serie A; Milan Fourth also mentions the supercup).

## Recommended stamdata shape

Two axes on `kit`. Do **not** dump cup photos onto the league Home `kit_photo` list.

| Axis | Values | Source |
| --- | --- | --- |
| `type` | `home` \| `away` \| `third` \| `fourth` \| `gk` \| `special` | Parse FKA Type / URL suffix |
| `variant` | `null` on the league default; otherwise the URL occasion slug | Stem after `{club}-{season}-` minus `-kit` and minus the base-type suffix |

Parse (dynamic — no occasion enum):

1. Remainder = stem without `{club}-{season}-` and without trailing `-kit`.
2. `gk-*` → `type=gk`, variant = `home` / `away` / `third` / `fourth` / `1` / `2` / …
3. Remainder is exactly `home|away|third|fourth|special` → that type, `variant=null`.
4. Remainder ends with `-home|-away|-third|-fourth` → that type, variant = the prefix (`supercoppa-italiana`, `european`).
5. Else → `type=special`, variant = remainder (`copa-del-rey-final`, `supercopa-de-espana`, `uefa-super-cup`).

Upsert key stays FKA `external_id` (numeric id preferred). **Do not** collapse on `(club, season, type)` for non-gk. Collapse only slug URL vs `/…-kit/{id}/` of the **same stem**. Two homes with different variants are two rows.

Champions League / European Home is the same axis (`type=home`, `variant=european`). Today listing **drops** those paths (`-european-`, `champions-league`). Taking them in is a lock change vs “later leverage”, not a parser trick.

## What not to do

- Treat Super Cup as extra images on league Home.
- Map every cup Type to `special` and then singleton-upsert one `special` per club+season (Madrid would merge Copa, Supercopa, and UEFA Super Cup).
- Invent a closed variant enum (`supercoppa` | `anniversary` | …). FKA Type/URL is open-ended.

## Collector lock (flag)

Confirm chips are Hjemme / Ude / Tredje + Keeper / Special (`docs/design-system.md`). A Super Cup Home is still **Hjemme** with a variant. Special stays for FKA `Special` and occasion-only Types. Do not add a fifth chip for “cup” until `/to-design`.

## Second pass (other clubs / seasons)

Wayback CDX + `id_` HTML, same parser as above, 2026-09-11. Prefixes with **0 stems** (slug or archive gap, not a type gap): `brondby-2010-11`, `liverpool-2019-20`, `liverpool-2024-25`, `bayern-munich-2024-25`, `fc-bayern-2024-25`, `barcelona-2024-25` (needs `fc-barcelona-`), `arsenal-2024-25`, `ajax-2018-19`, `juventus-2010-11`.

### Denmark 2010 (national, calendar season)

| Stem | FKA Type | Parsed |
| --- | --- | --- |
| `…-home-kit` | Home | `home` / null |
| `…-away-kit` | Away | `away` / null |

Catalog also lists GK Home/Away. This CDX cut only had two match stems — same class as Milan GK Fourth missing from Wayback.

### FC Barcelona 2024-25 (stress test — 23 stems)

League defaults: Home, Away, Third, Fourth, plus many GK numbers.

Occasion / edition (must be **own rows**):

| Stem | FKA Type | Parsed (first rule set) | Better parse |
| --- | --- | --- | --- |
| `…-supercopa-de-espana-third-kit` | Supercopa De España Third | `third` / `supercopa-de-espana` | same |
| `…-supercopa-de-espana-final-kit` | Supercopa de España Final | `special` / `supercopa-de-espana-final` | same |
| `…-copa-del-rey-final-kit` | Copa del Rey Final | `special` / `copa-del-rey-final` | same |
| `…-trofeo-joan-gamper-kit` | Trofeo Joan Gamper | `special` / `trofeo-joan-gamper` | same |
| `…-home-2-kit` | Home 2 | **wrong** `special` / `home-2` | `home` / `2` |
| `…-home-v2-kit` | Home V2 | **wrong** `special` / `home-v2` | `home` / `v2` |
| `…-home-clasico-kit` | Home Clásico | **wrong** `special` / `home-clasico` | `home` / `clasico` |
| `…-home-clasico-2-kit` | Home Clásico 2 | **wrong** `special` / `home-clasico-2` | `home` / `clasico-2` |
| `…-gk-clasico-kit` | GK Clásico | `gk` / `clasico` | same |
| `…-gk-supercopa-de-espana-final-kit` | GK Supercopa de España Final | `gk` / `supercopa-de-espana-final` | same |
| `…-pre-season-away-kit` | Pre-Season Away | `away` / `pre-season` | **drop** (training / pre-season) |

### Paris Saint-Germain 2024-25 (thin archive)

Home, Away, Third, Fourth, GK, GK Home. No cup stems in this CDX cut. Completeness varies by club; the model still holds.

### Manchester United 2021-22 (older PL season)

| Stem | FKA Type | Parsed | Better parse |
| --- | --- | --- | --- |
| `…-home-kit` / `…-away-kit` / `…-third-kit` | Home / Away / Third | defaults | same |
| `…-home-2-kit` | Home 2 | **wrong** `special` | `home` / `2` |
| `…-away-2-kit` | Away 2 | **wrong** `special` | `away` / `2` |
| `…-gk-home/away/third-kit` | GK * | `gk` + slot | same |
| `…-traning-chinese-new-year-kit` (+ `-1`) | Traning Chinese New Year | `special` | **drop** (training; FKA typo `Traning`) |

## Combined verdict

The two-axis model holds across club, national team, 2010 / 2021-22 / 2024-25 / 2025-26, and Serie A / La Liga / Ligue 1 / Premier League / WC.

| Finding | Implication |
| --- | --- |
| League Home/Away/Third/Fourth + GK slots repeat everywhere they are archived | Keep `type` closed |
| Cup / Clásico / Super Cup / Joan Gamper / Home 2 are extra **rows** | `variant` from URL, never photos on the league Home |
| FKA Type is open-ended and misspelled | Do not enum variants; parse URL remainder |
| `Home 2` / `Home V2` / `Home Clásico` start with the base type, they do not *end* with `-home` | Parser rule: if remainder **starts with** `home\|away\|third\|fourth\|special`, that is `type` and the rest is `variant` |
| Occasion-prefixed base type still works (`supercoppa-italiana-home`, `supercopa-de-espana-third`) | Keep the “ends with `-home\|away\|third\|fourth`” rule for those |
| Training / pre-season still drop | Drop on Type/stem (`training`, `traning`, `pre-season`), not via `special` |
| Wayback is incomplete vs live FKA | Missing stems (Denmark GK, Milan GK Fourth, whole clubs) are archive gaps; Fetch kits cannot invent them |
| Many variants per `type` on one season (Barça 2024-25) | Never upsert-unique on `(club, season, type)` except we already special-case `gk` |

Revised parse order:

1. Drop training / anthem / track / rain / pre-match / pre-season / travel / bench (Type or stem; include FKA typo `traning`).
2. Remainder after `{club}-{season}-` minus `-kit`.
3. `gk…` → `type=gk`, variant = rest (`home`, `1`, `clasico`, `supercopa-de-espana-final`, or null for bare `gk`).
4. Remainder **starts with** `home|away|third|fourth|special` → that type; variant = the suffix or null.
5. Remainder **ends with** `-home|away|third|fourth` → that type; variant = prefix (`european`, `supercoppa-italiana`).
6. Else → `type=special`, variant = remainder.

Champions League / European Home is still step 5 (`type=home`, `variant=european`). Taking it in remains a lock change vs “later leverage”.

## Third pass — 20 clubs, nine leagues (Wayback CDX)

Correct FKA slugs (`liverpool-fc`, `bayern-munchen`, `inter-milan`, `ajax-amsterdam`, `sl-benfica`, `brondby-if`). Live FKA still Cloudflare; this is CDX stems classified with the revised parse (starts-with base type). Training / anthem / track / pre-match / pre-season / travel dropped.

| League | Club / season | League defaults | Variants (own rows) | GK slots |
| --- | --- | --- | --- | --- |
| Premier League | Liverpool FC 2024-25 | H/A/T | `home/2`, `special/efl-cup-final` | 1, 2, 3, gk |
| Premier League | Arsenal FC 2024-25 | H/A/T + Special | `home/2`, `home/v2` | 1…5 + v2 |
| Premier League | Chelsea FC 2024-25 | H/A/T | — | home, away |
| Premier League | Manchester City 2024-25 | H/A/T/4th | — | 1, 2 |
| Premier League | Tottenham 2024-25 | H/A/T | `home/v2`, `home/v3`, `special/europa-league-final` | 1…3 + EL final GK |
| Bundesliga | Bayern München 2024-25 | H/A/T | `home/v2`, `special/anniversary`, `special/oktoberfest` | home, 1, 3… |
| Bundesliga | Borussia Dortmund 2024-25 | H/A/T + Special | `special/cup` | 1, 2 |
| Bundesliga | Bayer 04 Leverkusen 2024-25 | H/A/T | `special/anniversary`, `third/1` | home, away |
| Serie A | Inter Milan 2024-25 | H/A/T/4th + Special | `away/v2`, `special/champions-league-final` | 1…4 |
| Serie A | SSC Napoli 2024-25 | H/A/T + Special | — | home, 2 |
| La Liga | Atlético Madrid 2024-25 | H/A/T | — | 2 |
| La Liga | Sevilla FC 2024-25 | H/A/T | `home/v2`, `home/v3` | — |
| Ligue 1 | Olympique Lyonnais 2024-25 | H/A/T | `home/coupe-de-france`, `away/cup`, `special/anniversary` | 1, 2 |
| Eredivisie | Ajax Amsterdam 2024-25 | H/A/T | `home/v2`, `special/anniversary` | 1, 2, 2-anniversary |
| Primeira Liga | SL Benfica 2024-25 | H/A/T | — | 1, 2 |
| Primeira Liga | FC Porto 2024-25 | H/A/T | `home/european` | — |
| Scottish Premiership | Celtic FC 2024-25 | Away only (thin CDX) | — | — |
| Süper Lig | Galatasaray 2024-25 | H + 4th | — | 1, 2, 3 |
| Superliga | FC Midtjylland 2010-11 | H/A | — | 1, 2 |
| Brasileirão | Flamengo 2024 | H/A/T/4th | — | 1 |

Zero CDX (slug or archive): `juventus-2024-25`, `psv-eindhoven-2024-25`, `olympiacos-2023-24`, `brondby-if-2010-11` (live FKA index exists: Home/Away/Third/GK 1–3 — Wayback miss).

### Verdict after 20 clubs

Same model everywhere we have archive:

- Closed `type` (home/away/third/fourth/gk/special) is enough.
- Cup / anniversary / Oktoberfest / EFL final / Europa final / Coupe de France / Home V2 are **`variant` rows**, not extra photos on league Home.
- Density varies: Chelsea/City/Atlético/Benfica/Midtjylland/Flamengo are almost only defaults; Tottenham/Bayern/Inter/Lyon/Ajax are variant-heavy.
- `fc-porto-2024-25-home-european-kit` is `home` + `european` — same axis as FCK European Home. Listing keeps `-european-` and `champions-league` stems (training / anthem / pre-match still drop).
- Archive ≠ live FKA. Slug must be the FKA club slug (`liverpool-fc` not `liverpool`). Brøndby IF 2010-11 is listed live and absent from this CDX cut.

## Admin nesting (same parse, presentation only)

Occasion kits stay **own rows**. Club Jerseys does not list them as peers when a type-default exists.

| Stem class (from the 20-club pass) | Type-default exists? | Club Jerseys | Kit drill |
| --- | --- | --- | --- |
| `home` / `away` / `third` / `fourth` | — | listed | Variants section lists children |
| `supercoppa-italiana-home`, `european-home`, `home-v2`, `home-clasico`, `home-coupe-de-france`, `fc-porto …-home-european` | yes (`home`) | nested under Home | child row + competition link |
| `supercopa-de-espana-third`, `third/1` | yes (`third`) | nested under Third | child of Third |
| `away-v2`, `away-cup` | yes (`away`) | nested under Away | child of Away |
| `gk-home` / `gk-1` / `gk-clasico` | **no** bare `gk` | listed (GK slots) | no parent Home |
| `special/oktoberfest`, `copa-del-rey-final`, `efl-cup-final`, `champions-league-final` | usually **no** bare `special` | listed | own drill; nest under Special only if a null-variant Special exists |

Competition href is a CatalogLabel match on `kit.competition` tokens (slash / middot split). Unmatched tokens stay plain. Variant slug is a second lookup key only when that slug already exists as a league label. No cup-name HTML map. Do not invent Super Coppa from FKA text.

## Why Milan 2025/26 is 8 kits, not 9

Live FKA season index lists nine match kits, including **GK Fourth**. Listing ingest does not scrape live FKA (Cloudflare; ADR-0041, no Decodo).

Wayback CDX `footballkitarchive.com/ac-milan-2025-26*` (status 200, not dropped) has stems for Home, Away, Third, Fourth, Supercoppa Italiana Home, GK Home/Away/Third, plus `gk-1` / `gk-2`. **No `gk-fourth`.** Exact CDX for `…-gk-fourth-kit*` is empty.

The archived season indexes (`…-kits/`, timestamps `20250702145229` and `20251017011853`) are stale vs live: they never listed Fourth, Super Coppa, or GK Fourth. Fourth and Super Coppa landed because their **detail pages** were archived later as individual URLs. GK Fourth never was.

Parser would classify `gk-fourth` as `type=gk`, `variant=fourth` if a snapshot existed. Wayback Save Page Now of the live URL returned **HTTP 520**. Fetch cannot invent the row. Index∪CDX discovery only helps kits that appear on an archived index **and** have (or then get) a detail snapshot.

Confirm chips (Hjemme / Ude / Tredje + Keeper / Special) stay as in `docs/design-system.md` until `/to-design`.




