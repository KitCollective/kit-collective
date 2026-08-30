# Schema gap — field catalog → Postgres

**Issue:** [KIT-138](https://linear.app/kitcollective/issue/KIT-138/vendor-research-for-transfermarkt-and-football-kit-archive) accept artifact  
**Field catalog:** [field-catalog.md](./field-catalog.md)  
**Architecture lock:** [data-model.md](../Architecture/data-model.md) v1.5 — UUID PK, `ExternalId`, `CatalogLabel`, seed mapper only (no Nest scrape)

This document is the **given** for Football Data Seed grain tickets. When a ticket implements a Hierarchy grain, it lands the rows below in the same PR (reversible migration + mapper + tests). Product Nest/UI tickets consume columns later — they do not invent schema silently.

---

## Rules (unchanged locks)

| Rule | Meaning |
| --- | --- |
| UUID is PK | Transfermarkt / FK ids → `external_id` only |
| No `name` columns | Display strings → `catalog_label` (`en` from seed; `da` later) |
| Season.label | Season **code** (`2010/11`) — not `CatalogLabel` |
| Bytes | Archive / portraits → lane R2 + photo row (`rights: unresolved`, `admin_only` until cleared) |
| Club ≠ NationalTeam | Sibling tables — never `club.kind = national` for Denmark |
| Schema owner | **Seed board** grain PRs land catalog migrations. Product board only when a collector/admin slice **must** read a new column in Nest/Expo |

---

## Today vs catalog (summary)

| Area | Schema today | Catalog **stamdata now** | Gap |
| --- | --- | --- | --- |
| League / Season | ✅ | ✅ | — |
| Club identity | ✅ thin | ✅ + Club facts | Club fact columns |
| Club season squad | ✅ `#` only | ✅ Rich kader row | `player_club_season` + player body columns |
| NationalTeam identity | ✅ thin | ✅ + Honours | Honours table |
| NationalTeam season | ❌ no `national_team_season` | ✅ squad | **New table** + `player_national_team_season` |
| Player | ✅ id only | ✅ Rich player | Player columns + photo + history + honours |
| Kit | ✅ partial | ✅ + colours | Colour columns; sponsor when confirmed |
| Honours | ❌ | ✅ all three sides | **New table** |
| Jersey history | ❌ | ✅ | **New table** |
| Player photo | ❌ (only `kit_photo`) | ✅ | **New table** (mirror `kit_photo`) |

---

## Storage decisions

**Column** — filterable facts (DOB, height, foot, position, founded, capacity, hex colours).  
**CatalogLabel** — human names and place names (`kind: label` or `alias`; `locale: en` from seed).  
**Table** — repeating or polymorphic facts (Honours, jersey history, season membership).  
**R2 + photo row** — bytes never hot-linked from TM/FKA CDN in product surfaces.

---

## By Hierarchy grain

### League / League season

| Field | Storage | Notes |
| --- | --- | --- |
| TM code, name, country | `external_id` + `catalog_label` on `league` / `country` | ✅ exists |
| Season label, bounds, calendarKind | `season` columns | ✅ exists |
| Club list for season | drives `team_season` inserts | ✅ exists |

**Grain ticket:** KIT-139 (League grains) — no new tables expected.

---

### Club

| Field | Storage | Notes |
| --- | --- | --- |
| TM id, display name, country | ✅ `external_id`, `catalog_label`, `club.country_id` | exists |
| Official name | `catalog_label` (`en` label; optional `alias`) | may duplicate display name |
| Founded | `club.founded_on` **date** (new) | |
| Stadium name | `catalog_label` **or** `club.stadium_name` text | prefer **column** for admin/search |
| Capacity | `club.stadium_capacity` **integer** (new) | |
| Club colour swatches | `club.primary_color_hex`, `club.secondary_color_hex` (new) | **Club** colours — not Kit colours |
| Website | `club.website_url` text (new) | |
| Honours | **`honour`** rows (new) | see Honours table |

**Grain ticket:** KIT-143 (Club Rich grain) — migration + mapper + seed reference.

---

### Club season

| Field | Storage | Notes |
| --- | --- | --- |
| Club + season + player id + `#` | ✅ `team_season`, `player_club_season` | exists |
| Position | `player_club_season.position` text or enum (new) | TM position string preserved |
| DOB | `player.date_of_birth` **date** (new) | on Player, not PCS |
| Nationality | `player.primary_country_id` → `country` (new) | dual citizenship → later `player_citizenship` if needed |
| Height | `player.height_cm` **smallint** (new) | store cm; parse from `1,88m` |
| Preferred foot | `player.preferred_foot` enum `left\|right\|both` (new) | |
| Portrait on row | **`player_photo`** (new) | same rights model as `kit_photo` |
| Player Honours | **`honour`** where `subject_type = player` | profile `/erfolge` |
| Jersey history | **`player_jersey_number`** (new) | career table `/rueckennummern` |

**Grain ticket:** KIT-141 / KIT-143 — extend parser + mapper; schema can land on first Club season Rich PR.

---

### NationalTeam

| Field | Storage | Notes |
| --- | --- | --- |
| TM id, name, country, gender | ✅ `national_team` + labels + `external_id` | exists |
| Association official name, founded, confederation | `catalog_label` + `national_team.founded_on` / `confederation` text (new) | mirror Club facts pattern |
| Honours | **`honour`** where `subject_type = national_team` | `/erfolge/verein/{id}` |

**Grain ticket:** KIT-142, KIT-144.

---

### NationalTeam season

| Field | Storage | Notes |
| --- | --- | --- |
| NT + season | **`national_team_season`** (new) | mirror `team_season` — `national_team_id` + `season_id` unique |
| Squad player + `#` | **`player_national_team_season`** (new) | mirror `player_club_season` |
| Call-up club, DOB, height, foot, position | PCS columns **or** same player columns + `player_national_team_season.position` | parent club → `player_national_team_season.club_id` nullable FK (call-up club at selection) |

**Grain ticket:** KIT-142, KIT-144 — **blocked until this table exists** for Denmark WC 2010 proof.

---

### Player (grain / profile hop)

| Field | Storage | Notes |
| --- | --- | --- |
| id, display name | ✅ | exists |
| DOB, nat, height, foot, position | **player** columns (above) | prefer kader; profile fills gaps |
| Place of birth | `catalog_label` (`kind: label`, `locale: en`) **or** `player.place_of_birth` text | prefer **column** for contest queries |
| Name in home country | `catalog_label` alias on `player` | |
| Player photo | **`player_photo`** | `player_id`, `object_key`, `rights`, `visibility` default `admin_only` |
| Jersey number history | **`player_jersey_number`** | see below |
| Honours | **`honour`** `subject_type = player` | |
| Youth clubs | `catalog_label` aliases or **`player_youth_club`** later | catalog **later leverage** — optional small table if list is long |

**Grain ticket:** embedded in Club/NT season mappers + optional Player grain hop tests.

---

### Kit (FK)

| Field | Storage | Notes |
| --- | --- | --- |
| id, type, manufacturer, season, club/NT FK | ✅ `kit` + `manufacturer` + labels | exists |
| Archive bytes | ✅ `kit_photo` + R2 | exists |
| Primary / secondary colour | `kit.primary_color_hex`, `kit.secondary_color_hex` (new) + optional `catalog_label` for colour **names** | hex for filters; name optional |
| Sponsor | ✅ `kit.sponsor_name` | populate when FK source confirmed |

**Grain ticket:** KIT-140+ / FK milestone — extend `FkRawKit` + mapper.

---

## New tables (proposed)

### `honour`

Titles from TM `/erfolge/…`. Keep vendor season + title text verbatim.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `subject_type` | enum `club \| national_team \| player` | polymorphic subject |
| `subject_id` | uuid | FK enforced in app/migration check |
| `season_label` | text nullable | TM season cell (`10/11`, `2010`, …) |
| `title` | text not null | e.g. `Danish champion` |
| `source` | enum default `seed` | |
| `created_at` | timestamptz | |

Unique index suggestion: `(subject_type, subject_id, season_label, title)` for idempotent upsert.

### `player_jersey_number`

Career `#` from `/rueckennummern`. Distinct from single-season `player_club_season.squad_number`.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `player_id` | uuid FK | |
| `season_id` | uuid FK nullable | resolve when season label maps |
| `season_label` | text | raw TM label when `season_id` not resolved yet |
| `club_id` | uuid FK nullable | |
| `national_team_id` | uuid FK nullable | exactly one of club / NT set |
| `squad_number` | integer nullable | `-` → null |
| `created_at` | timestamptz | |

### `player_photo`

Mirror `kit_photo` for Transfermarkt portraits.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `player_id` | uuid FK | |
| `object_key` | text | lane R2 |
| `rights` | enum | default `unresolved` |
| `visibility` | enum | default `admin_only` |
| `created_at` | timestamptz | |

### `national_team_season`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `national_team_id` | uuid FK | |
| `season_id` | uuid FK | |
| `created_at` | timestamptz | |

Unique: `(national_team_id, season_id)`.

### `player_national_team_season`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `player_id` | uuid FK | |
| `national_team_id` | uuid FK | |
| `season_id` | uuid FK | |
| `squad_number` | integer nullable | |
| `position` | text nullable | |
| `call_up_club_id` | uuid FK nullable | parent club at call-up |
| `created_at` | timestamptz | |

Unique: `(player_id, national_team_id, season_id)`.

---

## Column additions (existing tables)

### `club`

`founded_on`, `stadium_name`, `stadium_capacity`, `primary_color_hex`, `secondary_color_hex`, `website_url` (all nullable).

### `national_team`

`founded_on`, `confederation` (nullable text).

### `player`

`date_of_birth`, `height_cm`, `preferred_foot`, `primary_country_id`, `place_of_birth` (nullable).

### `player_club_season`

`position` (nullable text).

### `kit`

`primary_color_hex`, `secondary_color_hex` (nullable).

### Domain package

Add enums to `@kit/domain` when columns land: `preferred_foot`, `honour_subject_type`, extend `EXTERNAL_ID_ENTITY_TYPES` only if new entities get vendor ids (unlikely for honour rows).

---

## Migration order (recommended)

Land schema in the **same PR** as the grain that first writes the rows. Suggested sequence:

1. **Club season Rich + Player body** (Superliga proof path) — `player` columns, `player_club_season.position`, `player_photo`, `player_jersey_number`, `honour` (player + club subjects as fetched).
2. **Club facts + club Honours** — `club` columns + club `honour` rows.
3. **NationalTeam season** — `national_team_season`, `player_national_team_season`, `national_team` fact columns, NT `honour` (Denmark WC 2010 proof).
4. **Kit colours** — FK milestone after TM facts exist.

Do **not** split “schema-only” PRs from mapper PRs on this board — tests need real Postgres shape at the grain seam.

---

## Ticket checklist (every grain PR)

- [ ] Migration reversible; applied on fresh lane DB
- [ ] `@kit/domain` + `@kit/db` + seed mapper updated together
- [ ] Seed reference row matches landed columns
- [ ] Fixture asserts Rich fields present; forbidden fields absent
- [ ] No Nest `/v1` or client imports of `packages/db`
- [ ] Photo bytes: R2 fake in tests; `admin_only` in mapper

---

## Follow-ups outside this catalog

| Item | Where |
| --- | --- |
| Remove Decodo from `seed/fkapi` | [KIT-149](https://linear.app/kitcollective/issue/KIT-149/remove-decodo-seed-proxy-from-football-kit-archive-fetch) |
| Bump `data-model.md` v1.6 with new entities | Human `/to-spec` or first schema PR notes — CONTEXT + this file win until then |
| Product UI for contests/marketing | Product board after catalog columns exist in development lane |
