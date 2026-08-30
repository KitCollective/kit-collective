# Seed reference — Transfermarkt Hierarchy grains

**Vendor:** Transfermarkt (Kader fetch / Opt-in Apify / fixtures)  
**Field catalog (accept):** [`.scratch/football-data-seed/field-catalog.md`](../../.scratch/football-data-seed/field-catalog.md)  
**Forbidden (ADR-0002):** market value, agent PII, TM branding (`tmLogoUrl`, crests, profile URLs as product assets).  
**Seed proxy (Decodo):** required for live Transfermarkt from Coolify / `kc_seed_mcp` — **TM only**. Never point Decodo at Football Kit Archive.  
**Breadth for first proof:** Superliga 2010/11 (`DK1`, `saison_id=2010`); Denmark men World Cup 2010 path (`verein/3436`, `saison_id=2010`).

This file is the seed-module interface for Transfermarkt grains. Not Nest OpenAPI. Not `/v1` seed.

---

## Shared contracts

| Concern | Rule |
| --- | --- |
| Primary key | Our UUID |
| Vendor id | `external_id` with `system=transfermarkt` |
| Upsert | Same vendor id → update, do not duplicate |
| Lane | Default `development`; `staging` only when named; `production` rejected |
| Fetch | Injected `FetchAdapter` (live kader via Seed proxy, Opt-in Apify, fixture) |
| Forbidden | Strip before map (`normalize` / `stripForbiddenFields`) |
| Rich grain | While on a page, persist every **stamdata now** field — human-only ingest does not defer Club facts or kader body depth |

---

## League

| | |
| --- | --- |
| **Inputs** | Competition identity (catalog alias or Competition query → TM code + slug + country) |
| **Fetch** | Competition search / catalog; competition season page for proof |
| **ExternalId** | TM competition code (e.g. `DK1`) |
| **Stamdata now** | competition code, slug, display name, country → ISO |
| **Later leverage** | league level, team count, champions trivia, UEFA coefficient |
| **Drop** | market-value aggregates, TM crest/URLs |

---

## League season

| | |
| --- | --- |
| **Inputs** | League ExternalId + `saison_id` / season label |
| **Fetch** | Competition season page (`…/wettbewerb/{code}/saison_id/{year}`) |
| **ExternalId** | Season key derived from competition + `saison_id` / label (mapper today invents calendar bounds) |
| **Stamdata now** | `saison_id`, season label, club list (`clubId` + name), our `startsOn`/`endsOn`/`calendarKind` |
| **Later leverage** | per-club squad size / ø-age / foreigners on the table |
| **Drop** | market-value columns, fixtures, standings, scorers |

---

## Club

| | |
| --- | --- |
| **Inputs** | TM club id (from competition season club list or named club scope) |
| **Fetch** | Club profile + facts (`datenfakten`) as part of the Club grain — not a deferred second run |
| **ExternalId** | TM club id (e.g. `190`) |
| **Stamdata now** | club id, display name, country, kind=`club`; **Club facts**: official name, founded, stadium, capacity, club colour swatches, website |
| **Drop** | address/tel/fax, TM crest/URLs, current-season transfer records / table position as historical truth |

---

## Club season

| | |
| --- | --- |
| **Inputs** | Club ExternalId + season label / `saison_id` |
| **Fetch** | Kader HTML `…/kader/verein/{id}/saison_id/{year}/plus/1` |
| **ExternalId** | Club+season pair via `team_season` + Already seeded rule |
| **Stamdata now** | club id, season id; each player id + name + jersey `#` + **position, DOB, nationality, height, foot** + portrait when on the row (**Player photo**) |
| **Drop** | market value; Joined / Signed from / Current club until proven season-true; bare TM hrefs as product assets |
| **Open** | loan / parent-club (**Player registration**) markers |

Already seeded: skip fetch when that club+season already has a squad with jersey numbers (and Rich grain body fields once those land).

---

## NationalTeam

| | |
| --- | --- |
| **Inputs** | TM national side id (proof: Denmark `3436`) + gender (ours) |
| **Fetch** | National side profile (`…/verein/{id}`) — TM uses `verein` URLs for NT |
| **ExternalId** | TM id on **`national_team`**, never `club` |
| **Stamdata now** | id, display name, country, gender; association official name, founded, confederation |
| **Drop** | address/tel/fax, TM crest, current FIFA rank as frozen 2010 truth |

---

## NationalTeam season

| | |
| --- | --- |
| **Inputs** | NationalTeam ExternalId + `saison_id` (proof `2010`) |
| **Fetch** | NT kader `…/kader/verein/{id}/saison_id/{year}` (+ `/plus/1`) |
| **ExternalId** | NT + season pair (mapping table is implementer’s job; not invented here) |
| **Stamdata now** | season key, squad player ids, jersey `#` when present; call-up **parent club**, DOB, height, foot, position when on `plus/1` |
| **Later leverage** | caps/goals/debut (confirm career-to-date vs season) |
| **Drop** | market value |
| **Open** | **Tournament squad** (WC-2010-only 23) vs calendar-year NT kader; FIWC participant page |

---

## Player

| | |
| --- | --- |
| **Inputs** | TM player id (from kader row; profile hop when id, `#`, body facts, or portrait missing) |
| **Fetch** | Kader row first; `…/profil/spieler/{id}` as Player profile fetch when needed |
| **ExternalId** | TM player id |
| **Stamdata now** | player id, display name; **date of birth**; nationality/citizenship; height; preferred foot; position; place of birth; name in home country; **Player photo** (portrait bytes → lane object store, `rights: unresolved`, `admin_only` — same rights model as KitPhoto; schema may land with the grain ticket) |
| **Later leverage** | youth clubs; **Player honours** (`/erfolge`); jersey history (`/rueckennummern`) |
| **Drop** | agent/agency, market value, contract as historical stamdata, boot outfitter, TM logo/URL as product asset, current profile shirt as historical `#` |

---

## Player season

| | |
| --- | --- |
| **Inputs** | Player + Club **or** NationalTeam + Season from kader |
| **Fetch** | Same kader as Club season / NationalTeam season (no separate hop for `#` or body facts) |
| **Stamdata now** | player id, side id, season, jersey `#`, position → `player_club_season` on club path |
| **Drop** | market value |
| **Open** | appearances/goals; loan registration; NT season sibling row shape |

---

## Out of this reference

- Football Kit Archive fields → [`seed/fkapi/reference.md`](../fkapi/reference.md)
- Join workflow compose → milestone 3 research
- Seed MCP tool shapes → milestone 4 research
