# Seed reference — Football Kit Archive grains

**Vendor:** Football Kit Archive via FKApi (`FKAPI_BASE_URL` / `FKAPI_TOKEN`) or fixtures  
**Field catalog (accept):** [`.scratch/football-data-seed/field-catalog.md`](../../.scratch/football-data-seed/field-catalog.md)  
**Postgres landing:** [`.scratch/football-data-seed/schema-gap.md`](../../.scratch/football-data-seed/schema-gap.md)  
**Forbidden (ADR-0002):** market value, agent PII, vendor branding (brand/club logos, FKA page URLs as product assets).  
**Rule:** FK after facts — Club or NationalTeam + Season rows must exist before kit map.  
**Transport lock:** **No Seed proxy / Decodo** on Football Kit Archive or FKApi. Decodo is Transfermarkt-only. Live FK uses `FKAPI_BASE_URL` (+ token) or another non-Decodo path.  
**Breadth for first proof:** kits for Superliga 2010/11 clubs and Denmark men World Cup 2010 side, after those facts exist.

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

---

## Club kit grain

| | |
| --- | --- |
| **Inputs** | Competition + season range (or club+season) whose TM Club + Season already exist; Transfermarkt club id for join |
| **Fetch** | FKApi kits for that club/season (live) or fixture JSON — **not** via Decodo |
| **ExternalId** | FK kit id / `kit_id` |
| **Join** | `clubTransfermarktId` → our `external_id` (`system=transfermarkt`, `entity_type=club`) + season label → `season` |
| **Stamdata now** | kit id, `type` (`home` \| `away` \| `third` \| `gk` \| `special`), manufacturer/brand name, season label, archive image bytes, **Kit colours** (primary/secondary name + hex) |
| **Later leverage** | English label; design; competition tags on kit |
| **Drop** | rating, brand/club logos, FKA URL as product asset |
| **Open** | **Sponsor** — product column `kit.sponsor_name` exists; FKApi OSS models have no sponsor; confirm without Decodo |

Fixture shape today: `seed/fkapi/fixtures/superliga-kits.json` (`id`, `clubTransfermarktId`, `seasonTransfermarktId`, `seasonLabel`, `type`, `manufacturerName?`, `labelEn?`, `imageBytes?`). Colours are catalog-accepted but not yet in the fixture type — extend when the grain implements.

---

## NationalTeam kit grain

| | |
| --- | --- |
| **Inputs** | NationalTeam + Season already seeded; NT identity for FK join |
| **Fetch** | Same FKApi family; national team pages on FKA — **no Decodo** |
| **ExternalId** | FK kit id |
| **Join** | Must land on `kit.national_team_id`, **not** `club_id`. Join key TBD (TM NT id `3436` and/or FKA team slug) — **open** |
| **Stamdata now** (once join confirmed) | same as club kit: type, manufacturer, season, archive bytes, Kit colours |
| **Later leverage** | label, design |
| **Drop** | branding logos/URLs |
| **Gap** | Current mapper (`seed/fkapi/src/mapper.ts`) resolves TM **club** ExternalId only — NationalTeam kit path is research-accepted as sibling grain, not implemented |

---

## Kit type vocabulary

Align with domain / DB enum: `home`, `away`, `third`, `gk`, `special`.  
FKApi may expose richer type categories; normalize into this set or CatalogLabel only when a later ticket names extras.

---

## Colours and sponsor (research lock)

| Field | Classification | Schema note |
| --- | --- | --- |
| Primary / secondary colour name + hex | **stamdata now** | FKApi Color models; extend `FkRawKit` + columns/CatalogLabel on the FK grain ticket — not deferred to a vague “later” |
| Sponsor name | open → stamdata now if confirmed | `kit.sponsor_name` already exists; confirm via FKApi/FKA without Decodo |

KIT-140 may deepen sponsor/NT join; colours are already in **stamdata now** for this catalog.

---

## Out of this reference

- Transfermarkt Hierarchy grains → [`seed/apify/reference.md`](../apify/reference.md)
- Join workflow season compose → milestone 3
- Seed MCP → milestone 4
