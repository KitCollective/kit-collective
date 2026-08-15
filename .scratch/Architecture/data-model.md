# KitCollective data model

**Version:** 1.5 · 2026-08-15  
**Status:** Locked for schema specs  
**Parent:** [tech-stack](./tech-stack.md) · [PRD 2.1](../Business/PRD.md)

Two worlds. They both contain “jerseys”. They are not the same table.

```text
CATALOG (stamdata)                         USER (samling)
what exists in football                    what this person owns
─────────────────────────────────          ─────────────────────────────────
Country, League, Club, Season              Account
Kit          ← the shirt as a product      UserJersey  ← their copy
Player + squad number                      UserJerseyPhoto (their camera/roll)
Patch                                      UserJerseyPatch (what is on THIS copy)
Manufacturer
```

A `UserJersey` **points at** catalog IDs. It does not copy names.  
Save requires catalog **club + season**. `catalogKitId` may be null.

Seed sources usually speak English (`Denmark`, `FC Copenhagen`). The product is Danish-first (`Danmark`, `F.C. København`). That is **two labels on one catalog row**, not two countries or two clubs. Every named stamdata entity uses the same rule. How we later fill missing locales is out of scope — `CatalogLabel` must exist from day one so we do not paint ourselves into a single `name` column.

---

## 1. Catalog (stamdata)

Learned from seed repos (Apify, FKApi) and later from premium propose. Our UUID is always PK. Foreign systems hang on `ExternalId`.

| Entity | What it is | How we learn it |
| --- | --- | --- |
| `Country` | DK, SE, NO, … **Identity is the UUID, not `"Denmark"`.** Display names live on `CatalogLabel` (`da` Danmark, `en` Denmark). | Seed → our row + `CatalogLabel` |
| `League` | Superliga, Allsvenskan, … + validity (Tippeligaen → Eliteserien). Names on `CatalogLabel`. | Seed → our row + `CatalogLabel` |
| `Club` | Inter, Barça, Brøndby, dissolved/renamed. **Identity is the UUID, not the English seed string.** | Apify/TM facts → our row + `CatalogLabel` |
| `NationalTeam` | Same shape as club, `kind: national`. Names on `CatalogLabel`. | Seed → our row + `CatalogLabel` |
| `Season` | Season **code** `label` + `startsOn`/`endsOn` (split-year vs calendar). Not a translated proper name — not `CatalogLabel`. | Seed |
| `TeamSeason` | This club fielded a first team in this season | Apify squad/season pages → picker list |
| `Player` | Lautaro, Yamal. Names on `CatalogLabel` (`mul` when the spelling does not change). | Apify player facts (no market value, no agent) → our row + `CatalogLabel` |
| `PlayerClubSeason` | Player wore number N at club in season | Apify historical numbers |
| `Manufacturer` | Nike, adidas, Hummel. Names on `CatalogLabel` (`mul` when the brand string is invariant). | FKApi brand / admin → our row + `CatalogLabel` |
| **`Kit`** | The catalog jersey: club + season + type (+ manufacturer) | FKApi identity + admin. **This is stamdata-trøjen.** |
| `KitPhoto` | Archive render | FKApi download → **R2** `kit/{kitId}/…`, `rights: unresolved`, `admin_only` |
| `Patch` | Superliga sleeve, CL, memorial, …. Names on `CatalogLabel`. | Season × competition candidates + admin → our row + `CatalogLabel` |
| `KitPatchCandidate` | “This kit / season likely had this pad” | Derived, not truth |
| `ExternalId` | `system` + `value` (transfermarkt, fkapi, wikidata, …) | Written by the mapper |
| **`CatalogLabel`** | Catalog-wide names: one **label** + many **aliases** per locale on any named stamdata UUID (country, league, club, …). Not a `name` column on those tables. | Seed writes `en` (or `mul` if the string does not change). `da` / `sv` / `no` can be empty. |

**Learning rule:** scrapers never write `Kit` / `Club` directly in production.  
Import repo → normalized JSON → mapper → **our** tables. Re-run mapper; do not re-shape Nest.

---

## 2. User (samling)

| Entity | What it is |
| --- | --- |
| `User` | Our account. **Email + password is always available (mandatory path).** Apple / Google (and later Facebook) are extra identities on the same user. Role `user` \| `admin` |
| **`UserJersey`** | Their copy. Points at `clubId`, `seasonId`, optional `kitId` |
| `UserJerseyPhoto` | Their front/back/label. `role`, source camera\|gallery. Bytes in **R2** `user/{userId}/{jerseyId}/…`; row holds the key |
| `UserJerseyPatch` | Pads actually on this copy (confirmed) |
| `JerseyDraft` | Local sqlite ↔ server, same id |
| `VisionLog` | Suggestion + whether they accepted/edited/ignored |

Required on Save: `clubId`, `seasonId`, `type`, `size`, `condition`, ≥1 photo.  
Optional: `kitId`, player print, patches, purchase, authenticity (default `unknown`).

Vision may **suggest** `kitId` / player. It does not create catalog rows.

---

## 3. Why two “trøjer”

| | `Kit` (stamdata) | `UserJersey` (bruger) |
| --- | --- | --- |
| Example | Inter home 23/24 (Nike, …) | Mikkel’s Inter 23/24, size L, Lautaro 10, his photos |
| Photos | Archive reference, admin-only until rights OK | User’s own — these are the product images |
| Pads | Candidates for that season/kit | What is sewn on his shirt |
| Missing row | Save still works (`kitId` null) | Cannot save without club + season |
| Who writes | Seed mapper + admin + propose | The collector |

Wishlist and public Astro pages join **user jerseys** to **kits/clubs**. They never show unresolved archive files as OG images.

---

## 4. How seed repos map in

```text
[kit-collective-seed-apify]     [kit-collective-seed-fkapi]
        │ facts: club, season,          │ facts: kit type, brand,
        │ player, number                │ archive image URL
        ▼                               ▼
   normalized JSON (our field names, their IDs kept as ExternalId)
        │
        ▼
   mapper (script or admin job) ──► KitCollective Postgres
        │
        ├── Club / Season / TeamSeason / PlayerClubSeason
        ├── CatalogLabel (en or mul; da/sv/no may be empty)
        ├── Kit + KitPhoto (admin_only)
        └── ExternalId(system, value)
```

These two repos are **not** the product API and **not** folders inside the monorepo. They are separate GitHub repos. Nest does not call Apify or FKApi at request time.

Spec handoff and folder map: [tech-stack §7](./tech-stack.md).

---

## 5. Pads

- **Backfill:** season × competition → `KitPatchCandidate`. Admin or beta confirms → `Patch` + optional link on `Kit`.
- **On a user shirt:** `UserJerseyPatch` only after the collector (or Vision suggestion they accept) says it is there.
- **Forward:** same candidate rule on new seasons; propose for one-offs (poppy, memorial).

---

## 6. Catalog labels (locale, not UI chrome)

UI strings (buttons, errors) are a separate i18n contract. This section is **stamdata names only**, for every named catalog entity — Country, League, Club, NationalTeam, Manufacturer, Patch, Player. Not clubs only. `Season.label` is a season code (`1998/99`), not a translated proper name.

Programming lock: one **shared translation table** owned by the Catalog module. Identity tables have no `name`. Clients see `id` + resolved `label` only. Evidence and rejected alternatives (JSONB, `name_da` columns, per-entity `club_translations`): [catalog-labels](../Research/catalog-labels.md).

```text
CatalogLabel
  entityType   country | league | club | national_team | manufacturer | patch | player
  entityId     UUID
  locale       da | en | sv | no | mul
  kind         label | alias
  text         "Danmark" | "Denmark" | "F.C. København" | "FCK"
  source       seed | admin
```

| Rule | Why |
| --- | --- |
| One **label** per `(entity, locale)` | Display name the UI shows. Unique partial index, same as Astrotomic/Globalize `(parent_id, locale)` |
| Many **aliases** per locale | Search keys (FCK, København). Standard translatable packages store one value per locale; `kind` covers the extra cardinality without a second table |
| Shared table, not `country_translations` / `club_translations` | Same `(locale, kind, text)` shape on every catalog type. Catalog-wide picker = one `lower(text)` index. Catalog module deletes labels with the entity (no mixed-parent Postgres FK) |
| No `Country.name` / `Club.name`, no `name_da` columns, no JSONB as truth | Extra language = extra row, not a migration. JSONB is a fine **cache** of resolved labels, not unique-per-locale + aliases + trigram search |
| English seed → `en`, not `mul` | We know Sportmonks/TM/FKApi sent English. `mul` is only for strings that do not change (adidas, many player names) |
| Resolve: **request locale → `mul` → `en`** | Same fallback idea as Vendure/parler/Mobility. A Swedish client asks `sv`; do not fall through `da` |
| Danish-first app defaults the *request* to `da` | Product default ≠ data fallback |
| Historical names stay on validity / successor | B 1903 → FCK is a rename, not a locale |
| `UserJersey` never copies `text` | Fix the label once; every collection updates |

Example — one country (same table as clubs):

| locale | kind | text |
| --- | --- | --- |
| `da` | label | Danmark |
| `en` | label | Denmark |
| `sv` | label | Danmark |
| `no` | label | Danmark |

Example — one club:

| locale | kind | text |
| --- | --- | --- |
| `da` | label | F.C. København |
| `en` | label | FC Copenhagen |
| `mul` | alias | FCK |
| `en` | alias | Copenhagen |

**Not in this lock:** machine-translating thousands of rows. How `da` / `sv` / `no` get filled is a later seed/admin job.

---

## 7. Auth and billing (data, not UI)

- `User` is ours. **Email + password is the mandatory sign-up/sign-in path** (verified email for free tier).  
  Social is additive on the same user: `apple`, `google`, later `facebook` if we want it.  
  Offering any third-party login **requires Sign in with Apple** (App Review). Admin is a role on the same user.
- `Entitlement` (premium yes/no, expires, source) is decided by **Nest**, not the client.
  - Source `iap_apple` / `iap_google` for the Expo store builds (required for digital subs in the apps).
  - Source `stripe` only if we later sell on a web checkout — not a replacement for IAP inside the iOS/Android binaries.

---

**Gate:** Green — model lock. Schema/migrations come when we scaffold `packages/db`.