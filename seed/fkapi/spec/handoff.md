# FK seed handoff — Football Kit Archive → KitCollective Postgres

Copy of the product-repo spec for `kit-collective-seed-fkapi`. Source: KIT-9 + [data-model](../../.scratch/Architecture/data-model.md).

**Interim:** code currently lives at `seed/fkapi/` in `kit-collective` per ADR 0001. This file is the migration target for `spec/handoff.md` in the standalone repo.

## 1. Target tables + columns

| Table | Columns written | Notes |
| --- | --- | --- |
| `kit` | `club_id`, `season_id`, `type`, `manufacturer_id` | Points at Apify-seeded club + season UUIDs |
| `external_id` | `entity_type=kit`, `system=fkapi`, `value=<FK id>` | FK archive id on `ExternalId` |
| `manufacturer` | `id` | Upsert by `catalog_label` (`mul`, `label`, text) |
| `catalog_label` | manufacturer label | `locale=mul`, `kind=label`, `source=seed` |
| `kit_photo` | `kit_id`, `object_key`, `rights=unresolved`, `visibility=admin_only` | Archive bytes — never public |

Lookup prerequisites (must exist before run):

- `external_id` where `entity_type=club`, `system=transfermarkt`, `value=<TM club id>`
- `season` + `team_season` for club + season label

## 2. Locale

English seed strings → `en` / `mul`. Resolve request → `mul` → `en`. No machine translation.

## 3. Thick vs thin

Club + `TeamSeason` required (Apify seed). Kit / manufacturer must not block user Save in the product app.

## 4. Forbidden fields

No TM market values, agent PII, TM branding. FK images: `rights: unresolved`, `admin_only`, never Expo/Astro/OG.

## 5. Season labels

Superliga `1998/99`; Allsvenskan / Eliteserien `2026`.

## 6. Connection

| Env | Purpose |
| --- | --- |
| `DATABASE_URL` | Lane Postgres (required) |
| `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | S3-compatible object store for archive bytes |
| `FKAPI_BASE_URL`, `FKAPI_TOKEN` | Optional; enables live FKApi fetch (not used in tests) |

No Nest import. No product-app code. No `@kit/db` — raw SQL over `pg`.

## 7. Success

One club + one season + FK kits + `admin_only` photos in a fresh DB. Fixture: `fixtures/superliga-kits.json`.

## CLI shape (shared seed contract)

```text
kit-seed-fkapi <competition> <from-season> <to-season> <lane>
```

- `competition` — e.g. `superliga`, `championship`
- `from-season` — label or `0001` (first season for competition)
- `to-season` — label or `today`
- `lane` — `development` or `staging` (`production` rejected)

Same positional contract as the future Apify seed CLI (not yet implemented).
