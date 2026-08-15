# Catalog name localization — programming pattern

**Date:** 2026-08-15  
**Product:** KitCollective  
**Question:** How should a Nest + Drizzle + Postgres modular monolith store human-readable names for catalog/stamdata (Country, League, Club, NationalTeam, Manufacturer, Patch, Player, …) when seed strings are English and the product is Danish-first?

This is **data** localization. UI chrome (buttons, errors) is a separate i18n system. How missing locales get filled later is out of scope. Historical renames (B 1903 → FCK) are validity/successor, not locales.

## Answer

**One shared translation table owned by the Catalog module** (`CatalogLabel`: `entityType` + `entityId` + `locale` + `kind` + `text`). One **label** per `(entity, locale)`, many **aliases** per locale. Identity tables (`Country`, `Club`, …) have **no** `name` column.

Do **not** use `name_da` / `name_en` columns. Do **not** use JSONB `{ da, en }` as source of truth. Do **not** create `club_translations`, `country_translations`, … — the translatable shape is identical across catalog types, so per-entity tables duplicate schema without buying a real FK we would use. Do **not** put catalog names in gettext/PO files.

Clients never see the table. The Catalog module resolves `id` + `label` for the request locale (fallback **request → `mul` → `en`**). Search matches **labels and aliases in all locales** and returns UUIDs.

This is Mobility’s default **KeyValue / shared-table** pattern, specialized: one attribute (`name`) plus a `kind` discriminator for aliases. Vendure/Globalize-style per-entity tables are the other common correct pattern; they win when each model has *different* translatable fields. Ours do not.

---

## The four storage patterns (what application code actually does)

Frameworks that translate **domain records** (not UI strings) converge on four backends. Mobility names them explicitly; the same four show up in Laravel, Django, and Nest/TypeORM.

| Pattern | Who ships it | Shape | Extra locale | Query / unique / aliases |
| --- | --- | --- | --- | --- |
| **Shared translation table** (polymorphic) | Mobility **default** `:key_value` — two shared tables, `translatable_type` + `translatable_id` + `locale` + `key` + `value` ([README](https://github.com/shioyama/mobility/blob/master/README.md), [KeyValue API](https://www.rubydoc.info/gems/mobility/Mobility/Backends/KeyValue)) | One schema for every model | New **row** | Index `value`; unique per (entity, locale, key). No Postgres FK to mixed parents |
| **Per-entity translation table** | Rails [Globalize](https://github.com/globalize/globalize) (`post_translations`); Mobility `:table`; Laravel [Astrotomic](https://docs.astrotomic.info/laravel-translatable/installation.md) (`post_id` + `locale`, unique, real FK); Django [parler](https://django-parler.readthedocs.io/en/stable/background.html); Nest [Vendure](https://docs.vendure.io/current/core/core-concepts/language) (`Facet` → `facet_translations`); TypeORM `OneToMany` translation entity | `club_id`, `locale`, `name` | New **row** | Real FK, one join. N tables if N models |
| **JSONB / JSON column on the parent** | Spatie [laravel-translatable](https://github.com/spatie/laravel-translatable): “Translations are stored as json. There is no extra table needed.” Nestbolt TypeORM mixin: `jsonb` map, no joins | `name: { "da": "…", "en": "…" }` | No migration | One value per locale. Unique/ILIKE/trigram and many aliases fight the document |
| **Extra columns** | Django [modeltranslation](https://django-modeltranslation.readthedocs.io/en/latest/registration.html): `title_de`, `title_en` on the same table; Mobility `:column` | `name_da`, `name_en` | **Migration on every catalog table** | Fast `SELECT`, no aliases, schema coupled to `LANGUAGES` |

Spatie is the most *downloaded* Laravel option because CMS rows often need “one string per locale, read with the row.” Mobility’s own default is still the **shared table**, because that is the generic way to attach the same translation shape to many models without a migration per model ([README](https://github.com/shioyama/mobility/blob/master/README.md): “The default way to store translations is to put them all in a set of two shared tables”).

Parler’s docs state the column-vs-table tradeoff without marketing: extra columns are fast but “the database schema is changed based on the project settings”; a translation table supports “unlimited languages” with “no database migrations” when a language is added ([parler background](https://django-parler.readthedocs.io/en/stable/background.html)).

---

## Verdict for this stack and scale

Constraints: Nest modular monolith, Drizzle, Postgres, ~thousands of catalog rows, four locales (`da` / `en` / `sv` / `no`), **seven+ entity types with the same name shape**, picker search across strings, aliases (FCK, København), Catalog module as the only owner of names.

| Candidate | Why it loses or wins here |
| --- | --- |
| `Country.name` / `Club.name` only | English seed becomes the Danish UI. Product lock forbids it. |
| `name_da`, `name_en`, … on each entity | modeltranslation. Four locales × seven tables = schema noise; fifth locale is a migration; no aliases; names leak out of Catalog into every entity table. |
| JSONB `name: { da, en }` on the parent | Spatie/Nestbolt. Fine as a **read cache** of resolved labels. Bad as truth: one value per locale (aliases need a nested array with no unique-per-kind), `pg_trgm` / `ILIKE` want a text column ([Postgres JSON](https://www.postgresql.org/docs/current/datatype-json.html) is a document, not a relation), unique “one label per locale” is an expression index per key. At 3–4k rows the join you avoid is irrelevant; the search you need is not. |
| `club_translations`, `country_translations`, … | Globalize / Astrotomic / Vendure / parler. **Correct** when Product has `name`+`slug`+`description` and Country has only `name` — different columns, real `ON DELETE CASCADE`. Here every type is `(locale, kind, text)`. Seven identical Drizzle schemas and seven picker queries. Catalog-wide search (“Danmark”, “FCK”) wants **one** `lower(text)` index. |
| **Shared `CatalogLabel`** | Mobility KeyValue. Catalog already owns Country, Club, … in one module, so the missing Postgres FK is an in-module delete rule, not a cross-bounded-context leak. One table, one search index, one resolver. Extra language = extra row. |

**Aliases** are why we do not copy Astrotomic/Vendure 1:1. Those packages store **one value per attribute per locale** (`unique (post_id, locale)` in [Astrotomic’s migration](https://docs.astrotomic.info/laravel-translatable/installation.md)). Search keys (FCK, Copenhagen) are a second cardinality. Options: a second table, a JSONB array, or a `kind` column. At this scale **one table + `kind` + a partial unique index** is enough. Split only if alias rules diverge from labels.

**Modular boundary (this is the point):**

```text
Catalog module (Nest)                    api-contract / clients
─────────────────────────────────        ─────────────────────────
Country, League, Club, …  (ids)          { id, label }
CatalogLabel              (names)        never CatalogLabel rows
resolve(locale) → label                  never English seed as Danish UI
search(q) → UUIDs (all locales)
```

Vendure documents the same delivery rule on a per-entity table: resolve in the API, “the API consumer always receives a flat object with the translated fields, rather than the underlying translations array” ([Language & Translations](https://docs.vendure.io/current/core/core-concepts/language)). We keep that **delivery** pattern and store in one Catalog-owned table because our fields do not differ by entity.

Drizzle maps this as a normal Postgres table in `packages/db`. Only `apps/api` imports it (tech-stack lock). No Prisma/TypeORM-specific i18n plugin.

---

## Fallback and invariant strings (application behaviour, not a wiki)

Every package above has a **request locale + fallback**, not a second entity:

- Vendure: `?languageCode=` then channel `defaultLanguageCode` ([docs](https://docs.vendure.io/current/core/core-concepts/language)).
- parler: current language, then configured fallbacks ([quickstart](https://django-parler.readthedocs.io/en/stable/quickstart.html)).
- Spatie: current app locale on the JSON map ([README](https://github.com/spatie/laravel-translatable)).
- Mobility: I18n locale + fallbacks on the backend.

Our seed is known-English (`FC Copenhagen`, `Denmark`). Product default request is `da`. Those are different knobs: **request default ≠ data fallback**. A Swedish client asks `sv`; do not fall through `da`.

Strings that do not change (adidas, many player names) should not be copied four times or tagged as English. Store one row with locale `mul` (ISO 639-2 “multiple languages” — a locale token, not a product feature). Resolve: **request → `mul` → `en`**. English seed stays `en`.

---

## Locked shape

```text
CatalogLabel
  entityType   country | league | club | national_team | manufacturer | patch | player
  entityId     UUID
  locale       da | en | sv | no | mul
  kind         label | alias
  text         "Danmark" | "Denmark" | "F.C. København" | "FCK"
  source       seed | admin | …     -- provenance only; not a locale
```

Applies to **every named catalog entity**, not clubs only. `Season.label` stays a season code (`1998/99`, `2026`) on the season row — not a translated proper name. Kit identity is club + season + type, not a localized display name in MVP.

Constraints to put in the schema later:

- Unique `(entityType, entityId, locale)` where `kind = 'label'`
- Unique `(entityType, entityId, locale, lower(text))` where `kind = 'alias'`
- Index on `lower(text)` (and `pg_trgm` if the picker needs it) for search
- Catalog module deletes labels in the same transaction as the entity (no cross-table Postgres FK)

| Input | How to store |
| --- | --- |
| Sportmonks / TM / FKApi English name | `locale: en`, `kind: label` |
| Same string in every language (adidas, Lautaro Martínez) | `locale: mul`, `kind: label` |
| FCK, København, Copenhagen | `kind: alias` on the locale that uses it (or `mul` if used everywhere) |
| B 1903 → FCK | **Not a label.** Successor / validity on `Club` |

Country (first-class example):

| locale | kind | text |
| --- | --- | --- |
| `da` | label | Danmark |
| `en` | label | Denmark |
| `sv` | label | Danmark |
| `no` | label | Danmark |

Club (same table, same rules):

| locale | kind | text |
| --- | --- | --- |
| `da` | label | F.C. København |
| `en` | label | FC Copenhagen |
| `mul` | alias | FCK |
| `en` | alias | Copenhagen |

Resolve for display: `COALESCE(label[request], label[mul], label[en])`.  
Search: any `label` or `alias` text, any locale → one UUID.  
`UserJersey` never copies `text`.

**Not in this lock:** machine-translating thousands of rows; gettext for catalog names; JSONB as truth.

Same relational idea appears in knowledge-graph label maps; that is not why we picked it.

---

**Gate:** Green — research + model lock. Model updated in [data-model §6](../Architecture/data-model.md). No application code.
