# Seed reference — Football Kit Archive grains

**Vendor:** Football Kit Archive via FKApi (`FKAPI_BASE_URL` / `FKAPI_TOKEN`) or fixtures  
**Field catalog (accept):** [`.scratch/football-data-seed/fk-field-catalog.md`](../../.scratch/football-data-seed/fk-field-catalog.md) (KIT-140 focused) · parent [field-catalog.md](../../.scratch/football-data-seed/field-catalog.md) (KIT-138)  
**Postgres landing:** [`.scratch/football-data-seed/schema-gap.md`](../../.scratch/football-data-seed/schema-gap.md)  
**Forbidden (ADR-0002):** market value, agent PII, vendor branding (brand/club logos, FKA page URLs as product assets).  
**Rule:** FK after facts — Club or NationalTeam + Season rows must exist before kit map.  
**Transport lock:** **No Seed proxy / Decodo** on Football Kit Archive or FKApi. Decodo is Transfermarkt-only. Live FK uses `FKAPI_BASE_URL` (+ token) or another non-Decodo path.  
**Breadth for first proof:** kits for Superliga 2010/11 clubs (e.g. FCK TM `190`) and Denmark men World Cup 2010 (TM NT `3436`, FKA `denmark-kits`), after those facts exist.

This file is the seed-module interface for FK kit grains. Not Nest OpenAPI. Not `/v1` seed.

---

## Shared contracts

| Concern | Rule |
| --- | --- |
| Primary key | Our UUID on `kit` |
| Vendor id | `external_id` with `system=fkapi` |
| Upsert | Same FK kit id → update |
| Lane | Default `development`; `staging` only when named; `production` rejected |
| Photos | Lane R2 object key; `kit_photo.rights=unresolved`; `visibility=admin_only`; never Expo/Astro/OG |
| Refuse | Missing Club/NationalTeam or Season for the scope |
| Proxy | Never inject Seed proxy / Decodo into FK fetch |
| Side FK | Club kit → `kit.club_id`; NationalTeam kit → `kit.national_team_id` — mutually exclusive |

---

## Club kit grain

| | |
| --- | --- |
| **Inputs** | Competition + season range (or club+season) whose TM Club + Season already exist; Transfermarkt club id for join |
| **Fetch** | FKApi kits for that club/season (live) or fixture JSON — **not** via Decodo |
| **ExternalId** | FK kit id / `kit_id` |
| **Join** | `clubTransfermarktId` → our `external_id` (`system=transfermarkt`, `entity_type=club`) + season label → `season` |
| **Stamdata now** | kit id, normalized `type`, manufacturer/brand name, season label, archive image bytes, **Kit colours** (primary/secondary name + hex → new columns), **Kit sponsor** (→ `kit.sponsor_name` when source provides it) |
| **Later leverage** | English label; design pattern; CL/European variant kits as separate rows |
| **Drop** | rating, brand/club logos, FKA URL as product asset; training/anthem/track kits for proof |
| **Transport gap** | FKApi REST does not return sponsor — column exists; populate when FKApi adds field or non-Decodo FKA parse lands |

**Proof example:** FC Copenhagen 2010-11 Home — FKA fact table: Type `Home`, Brand `Kappa`, Colors `White / Black / Blue`, Sponsor `Carlsberg`, Season `10-11`.

Fixture shape today: `seed/fkapi/fixtures/superliga-kits.json` (`id`, `clubTransfermarktId`, `seasonTransfermarktId`, `seasonLabel`, `type`, `manufacturerName?`, `labelEn?`, `imageBytes?`). Extend with colours (+ sponsor when fixture models it) on the FK grain ticket.

---

## NationalTeam kit grain

| | |
| --- | --- |
| **Inputs** | NationalTeam + Season already seeded; FKA team identity for join |
| **Fetch** | Same FKApi family; national sides on FKA (`denmark-kits`, etc.) — **no Decodo** |
| **ExternalId** | FK kit id |
| **Join** | FKA team `id` / `id_fka` → our `external_id` (`system=fkapi`, `entity_type=national_team`) + season label → `season`. **Not** TM club ExternalId. Lands on `kit.national_team_id`, **`club_id` null** |
| **Stamdata now** | same as club kit: normalized type, manufacturer, season, archive bytes, Kit colours, Kit sponsor when present |
| **Later leverage** | label, design |
| **Drop** | branding logos/URLs; training/anthem/track for proof |
| **Gap** | None for grain — NationalTeam kit path joins FKA team id → `external_id` (`fkapi`, `national_team`) → `kit.national_team_id` with `club_id` null |

**Proof example:** Denmark 2010 — FKA lists Home (`9857`, Red/White), Away (`9858`, White/Red), GK Home (`60206`, Black/Yellow/Red), GK Away (`60205`, Green/White); Season `2010` (calendar WC year); Brand `adidas`; **no Sponsor row** on match kits (Training lists Arla — dropped type).

---

## Kit type vocabulary

Domain / DB enum: `home`, `away`, `third`, `gk`, `special`.

FKApi `Type_K` is richer (categories: `match`, `prematch`, `training`, `travel`, `jacket`). Normalize into our enum:

| FKA / FKApi type | Our `kit.type` | Proof scope |
| --- | --- | --- |
| Home | `home` | keep |
| Away | `away` | keep |
| Third | `third` | keep |
| GK Home, GK Away, GK 1… | `gk` | keep |
| Special | `special` | keep |
| Champions League Home (+ V2), European Away, CL GK | base type | later leverage — CL duplicate |
| Training, Anthem, Track, Rain | — | drop for proof |

Full mapping: [fk-field-catalog.md](../../.scratch/football-data-seed/fk-field-catalog.md).

---

## Colours (research lock)

| Field | Classification | Schema note |
| --- | --- | --- |
| Primary colour name + hex | **stamdata now** | FKApi `primary_color`; FKA slash-list; **`kit.primary_color_hex`** (new) + optional CatalogLabel for name |
| Secondary colour name + hex | **stamdata now** | FKApi `secondary_color[]`; **`kit.secondary_color_hex`** (new) + optional CatalogLabel |
| Tertiary+ colours | later leverage | only if contests need full palette |

Extend `FkRawKit` + normalize on the FK grain ticket. Not Transfermarkt club colour swatches.

---

## Sponsor (research lock)

| Field | Classification | Schema note |
| --- | --- | --- |
| Sponsor name | **stamdata now** when source exposes it | **`kit.sponsor_name` already exists** |
| Club kits | observed on FKA HTML (e.g. FCK 2010-11 → Carlsberg) | populate when adapter can read it |
| NT kits | not observed on Denmark 2010 samples | nullable |
| FKApi REST | **transport gap** — not in OSS models or API response | do not drop; wait for FKApi upstream or non-Decodo FKA parse |

Full FK-after-facts lock (club vs NT join, refuse): [fk-field-catalog.md](../../.scratch/football-data-seed/fk-field-catalog.md).

---

## Out of this reference

- Transfermarkt Hierarchy grains → [`seed/apify/reference.md`](../apify/reference.md)
- Join workflow season compose → milestone 3
- Seed MCP → milestone 4
