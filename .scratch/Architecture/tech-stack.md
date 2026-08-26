# KitCollective tech stack

**Version:** 1.9 · 2026-08-15  
**Status:** Locked for MVP scaffolding  
**Owns:** how we build. Does not replace the product PRD.

Parent: [PRD 2.1](../Business/PRD.md)  
Data: [data-model](./data-model.md)  
Evidence: [jersey-registration-speed](../Research/jersey-registration-speed.md), [catalog-seed-sources](../Research/catalog-seed-sources.md), [jersey-vision-providers](../Research/jersey-vision-providers.md), [ops-environments](../Research/ops-environments.md) (inventory only — no host pick)

Use this file when writing specs (`to-spec`). If a spec fights a lock below, change this document first — not the spec.

---

## 1. Locked stack

| Surface | Choice | Repo path | Job |
| --- | --- | --- | --- |
| Mobile + in-app web | Expo (iOS, Android, degraded web) | `apps/mobile` | Create / edit collection. Camera + gallery. IAP. Push. |
| Public site | Astro | `apps/web` | Read-only collections, kits, OG, deep links. No login mutations. |
| Admin | Vite + React | `apps/admin` | Catalog queue, moderation. Never indexed. |
| API | NestJS modular monolith, Fastify adapter, `/v1` | `apps/api` | Only process that touches secrets, DB, IAP, Vision. |
| Contract | Zod | `packages/api-contract` | Shared request/response types. Clients typecheck against this. |
| Domain rules | Pure TypeScript | `packages/domain` | Match rules, visibility, field enums. No Nest, no React Native. |
| Database | Self-hosted Postgres | — | No Neon. No pgvector in MVP. |
| ORM | Drizzle | `packages/db` | Schema lives here. **Only `apps/api` imports it.** |
| Monorepo | pnpm workspaces + Turborepo | repo root | One git repo. |
| Compute | Hetzner **CX33** (4 vCPU / 8 GB / 80 GB), **Helsinki** | — | Coolify + Nest + Postgres + Redis. See [server-stack](./server-stack.md). |
| Object storage | **Cloudflare R2** (S3 API) | — | User photos + admin-only kit archive bytes. **Not** on the CX33 disk. |
| Jobs | **BullMQ** via `@nestjs/bullmq`, worker in the same Nest process | `apps/api` | Wishlist, push, Vision, seed. Redis beside Nest per lane. See §9. |

**Rejected inside the product repo:** Next.js, Nest microservices, Expo Web as the public site, Prisma (unless Drizzle is blocked), pgvector, Nest calling Apify/FKApi at runtime, `@nestjs/bull` (legacy Bull).

**Separate seed repos (not polyrepo-of-the-product):** `kit-collective-seed-apify` and `kit-collective-seed-fkapi`. They only produce mapped stamdata. See §7.

---

## 2. Repo layout

```text
kit-collective/
  apps/
    mobile/          # Expo
    web/             # Astro
    admin/           # Vite + React
    api/             # NestJS
  packages/
    api-contract/    # Zod — the only shared I/O
    domain/          # pure functions
    db/              # Drizzle schema + migrations
  .scratch/
    Business/PRD.md
    Architecture/tech-stack.md   # this file
    Research/
  .cursor/rules/     # import + secret rules for agents
```

---

## 3. Agent / import rules

These are non-negotiable. Put them in Cursor rules before the first scaffold.

1. `apps/mobile`, `apps/web`, `apps/admin` **must not** import `apps/api` or `packages/db`.
2. Clients import **only** `packages/api-contract` and `packages/domain`.
3. Secrets (`DATABASE_URL`, Gemini, Apple/Google IAP, SMTP) exist only in Nest env / the matching GitHub Environment (`development` / `staging` / `production`). Never in Expo or Astro. Never put production secrets in the staging or development Environment.
4. No `@nestjs/microservices` in MVP. No `@nestjs/bull` (use `@nestjs/bullmq`). Queue workers stay **in** the Nest process — do not add a second worker deploy.
5. No free-text club / league / season as catalog truth. No single `name` column as the only catalog string — use `CatalogLabel` (locale + kind) for every named stamdata entity. See [data-model §6](./data-model.md).
6. Vision output is a **suggestion**. Persist catalog UUIDs after user confirm or high-confidence match — never raw model club names as FK.
7. Do not serve `rights: unresolved` kit images to Expo, Astro, or Open Graph.
8. Catalog API returns `id` + **resolved label** for any named stamdata (country, league, club, …) for the request locale (fallback **request → `mul` → `en`**). Search matches labels and aliases in all locales. Never treat the English seed string as the Danish UI name.

---

## 4. Nest modules (modular monolith)

One deployable. Modules = domains, not “helpers”.

| Module | Owns |
| --- | --- |
| `Identity` | **Email + password (mandatory).** Apple + Google social. Facebook later if we add it. Verify email. Roles `user` / `admin`. Apple required because we offer social. |
| `Catalog` | country, league, club, national team, season, kit, manufacturer, player, patch, `CatalogLabel`, `ExternalId`, propose queue |
| `Collection` | user jersey, photos, drafts sync, visibility, listing status |
| `Vision` | Gemini worker, nano fallback, suggestion log |
| `Wishlist` | structured criteria, match job |
| `Billing` | IAP receipt validation (server is source of truth) |
| `Notify` | **Expo Push** (APNs/FCM via EAS). Email: **AWS SES** (verify-email primary; match secondary) |
| `Moderation` | report, block, image review |

HTTP + **BullMQ workers in the same Nest process**. Match and push are jobs, not a second repo. Redis is the broker only — see §9.

---

## 5. Registration (the 45-second path)

Product rules live in the PRD. Implementation shape:

```text
Photos (gallery-first on first session, CameraView on repeat)
    → local draft (expo-sqlite) on every shot / pick
    → Nest Vision worker fired at first photo (do not await)
    → Confirm screen: club search + club-scoped season + type/size/condition chips
    → Save (local-complete counts; upload may finish later)
    → "New jersey" | "Same club"
```

- **New jersey:** empty identity. Inter must not become Barça.
- **Same club:** prefill club only. Season / type / condition are not sticky.
- Nameset, patch, purchase, authenticity = “More details”, off the 45s clock.
- Save **must succeed** with club + season + type + size + condition + ≥1 photo. Missing kit row / manufacturer / patch is not an error.
- Catalog miss on club or season → upgrade CTA, draft kept.
- Expo Web: gallery-first, no 45s promise.

Camera: `expo-camera` `CameraView` + `takePictureAsync`. Not `ImagePicker.launchCameraAsync` as the primary path. Gallery: system picker, `allowsMultipleSelection`, no `READ_MEDIA_IMAGES`.

Photo entity (MVP): `role`, `source`, dimensions, URIs. Vacant OCR envelope (`ocrStatus: none`) so Vision/ML Kit label OCR can attach later.

---

## 6. Vision

| Item | Lock |
| --- | --- |
| Worker | Gemini 2.5 Flash-Lite (paid API) |
| Fallback | OpenAI `gpt-4.1-nano` |
| Do not use | `gpt-4o-mini` for images (tile pricing), reasoning models on the hot path |
| Timeout | 8–12 s, fail open |
| Output | Structured JSON → map to catalog UUIDs in Nest |
| Auto-fill | ≥70% **and** catalog hit → pre-select on confirm. 50–69% → show as suggestion. Else ignore |
| Logging | `vision_raw`, confidences, latency, model, user action (accepted / edited / ignored). **No embedding / pgvector** |
| Cost (order of mag.) | ~$0.0004 / 1600² image; ~$0.0009 / 3-image jersey |

Port from Huddle: prompt shape, ID match, confidence gates. Do **not** port the 4-step wizard or kit-template embeddings.

---

## 7. Catalog seed — two git repos, deep spec handoff

The product monorepo (`kit-collective`) does **not** scrape and does **not** contain Apify/FKApi fetch code. Stamdata is two **separate GitHub repos**. Create them when we leave restructuring — not inside this monorepo.

> **Interim exception (ADR 0001):** until `kit-collective-seed-fkapi` exists on GitHub, FK seed CLI lives at `seed/fkapi/` in this monorepo. It uses `DATABASE_URL` only (no `@kit/db`). Move out and delete the folder when the standalone repo is created. Apify seed is **not** interim — still a separate future repo.

| Repo | Learns | Writes into KitCollective |
| --- | --- | --- |
| `kit-collective-seed-apify` | Clubs, seasons, team-seasons, players, squad numbers (facts only) via Apify | `Club`, `Season`, `TeamSeason`, `Player`, `PlayerClubSeason`, `CatalogLabel`, `ExternalId` |
| `kit-collective-seed-fkapi` | Kit identity + archive image bytes (Football Kit Archive / FKApi) | `Kit`, `Manufacturer`, `KitPhoto` (`admin_only`, `rights: unresolved`), `CatalogLabel`, `ExternalId` |

Pipeline: fetch → normalize to our field names (keep their id on `ExternalId`) → mapper into **our** Postgres. Nest never imports those repos. Nest never calls Apify or FKApi at request time.

Folder map (same shape in both repos — keep them small):

```text
kit-collective-seed-{apify|fkapi}/
  README.md                 # how to run; points at spec/
  spec/handoff.md           # copy of the product-repo spec (source of truth starts here)
  src/fetch/                # talk to Apify or FKApi only
  src/normalize/            # their JSON → our field names + ExternalId
  src/map/                  # write into KitCollective Postgres (DATABASE_URL)
  fixtures/                 # tiny golden samples for the mapper
  data/                     # gitignored dumps
```

**Spec = deep handoff.** A seed spec written in this product repo (`.scratch` / later `docs`) must be copy-pasteable into `spec/handoff.md` so a new agent in the seed repo can fetch and map **without** reading the PRD or guessing tables. Minimum in every seed spec:

1. Target tables + columns (from [data-model](./data-model.md)), including `CatalogLabel` + `ExternalId`.
2. Locale: English seed → `en`; no MT; resolve request → `mul` → `en`.
3. Thick vs thin: club + `TeamSeason` is required for 45s; kit/manufacturer/pads/squads must not block Save.
4. Forbidden fields: TM market values, agent PII, TM branding. FKApi images: `rights: unresolved`, `admin_only`, never public.
5. Season labels: Superliga `1998/99`; Allsvenskan / Eliteserien `2026`.
6. How to connect: env names only (`DATABASE_URL`, actor tokens). No Nest import. No product-app code in the seed repo.
7. Success: one club + one season + labels + external ids in a fresh DB; fixture in `fixtures/`.

Pads: season × competition → `KitPatchCandidate`. Confirm before it is truth.

Full entity list: [data-model](./data-model.md).

---

## 8. Data model

See [data-model](./data-model.md). Short version:

- **`Kit`** = stamdata-trøje (Inter home 23/24 as a product).
- **`UserJersey`** = brugerens kopi (his photos, size, Lautaro print).
- User row points at catalog UUIDs. Names are not copied.

---

## 9. Auth, billing, files, jobs

- **Auth:** our own Nest `Identity` module, **Passport** (`@nestjs/passport` + JWT). **Email + password is the default and always offered.** Social: Sign in with Apple + Google in MVP; Facebook is optional later (same `Identity` table, extra provider). Not Clerk. Not Better Auth (Nest adapter is community; Fastify support is beta — we locked Fastify). Apple is mandatory because we offer third-party login. Admin = same user, `admin` role.
- **Billing:** digital sub **in the Expo iOS/Android apps = IAP** (Apple/Google are merchant of record; Restore purchases required). Nest stores `Entitlement` after server-side receipt validation. **Stripe is not a substitute inside the store binaries.** Stripe is a later/optional web checkout (`Entitlement.source = stripe`) if we sell outside the stores — same 29 kr product, two pipes. Do not spec Stripe-only MVP if the first clients are App Store / Play.
- **Files:** both classes live in **R2**, never on the CX33 disk and never as bytea in Postgres. Postgres stores the object key + metadata only.
  - `UserJerseyPhoto` → `user/{userId}/{jerseyId}/{photoId}.jpg` (front/back ~1600 px, label ~2400 px). Served via short-lived signed URLs after visibility checks.
  - `KitPhoto` → `kit/{kitId}/{photoId}.jpg`. Seed mapper writes. `rights: unresolved`, `admin_only`. **Do not** put this prefix on a public CDN or use it as OG.
  - One R2 bucket **per GitHub lane** (`development` / `staging` / `production`). Staging must not read production keys.
- **Jobs (locked):** wishlist match, push, vision, seed imports — **BullMQ** (`@nestjs/bullmq`), **worker in the same Nest process**. Redis is required ([Nest queues](https://docs.nestjs.com/techniques/queues); [BullMQ installation](https://docs.bullmq.io/guide/introduction): Redis 6.2+, 7+ recommended, `maxmemory-policy noeviction`).
  - One Redis **per lane** (same isolation as Postgres). Do not use Coolify’s internal Redis for app jobs. Staging must not share production Redis.
  - Cap each Redis: `maxmemory 256mb`, `maxmemory-policy noeviction`. At this job volume that is headroom, not a squeeze.
  - Vision still fail-open 8–12 s on the request path; the worker is the retry/backoff, not a blocker on Save.
  - `@nestjs/schedule` may enqueue repeatable work; it is not a substitute for the queue.
  - **Rejected:** `@nestjs/bull` (legacy), a second Nest “worker” container, Redis without a memory cap.
  - **CX33 stays.** Two capped Redis instances are ~0.3–0.5 GB together — not a SKU bump. See [server-stack](./server-stack.md).
- **Search (MVP):** Postgres filters on catalog FKs. Dedicated search engine later if the 500 ms / 50k-jersey gate slips.

---

## 10. Hosting and GitHub lanes

### GitHub (locked)

The product repo uses **three** GitHub Environments and **three** long-lived git branches, same names:

| Name | Role |
| --- | --- |
| `development` | Daily integration. Disposable data. |
| `staging` | Pre-release. TestFlight / Play internal. Separate Postgres and storage from production. |
| `production` | Live users. Store binaries. Production secrets only here. |

- Workflow jobs that deploy or need lane secrets **must** set `environment:` to one of those three names.
- Per-lane secrets live on the Environment, not as repo-wide secrets, when the value differs by lane.
- Staging and production **must not** share a Postgres or an object-storage prefix that holds user photos.
- Default branch on GitHub is **`production`**. `main` may still exist as a leftover; do not treat it as a fourth lane. Cutover done 2026-08-15.
- EAS channels use the **same three names** (`development` / `staging` / `production`). They are still not git branches.

Compute and object storage: [server-stack](./server-stack.md). Inventory: [ops-environments](../Research/ops-environments.md).

### Runtime (locked host class)

| App | Runtime |
| --- | --- |
| `apps/api` | Long-running Node on **Hetzner CX33 Helsinki**, Coolify + Docker. Own Postgres + Redis beside it. **`api.kitcollective.app`** |
| `apps/web` | Astro on Pages / Workers. **`kitcollective.app`** (www → apex). Read Nest. |
| `apps/admin` | Static SPA behind auth. **`admin.kitcollective.app`**. Never indexed. |
| `apps/mobile` | EAS Build / Submit. **Project id `ddddf92b-e7cd-4ec5-b07c-643106041550`.** Channels: `development` / `staging` / `production`. One Expo project; do not `eas init` a second id. |
| Files | **Cloudflare R2.** Nest is the only writer/reader of secrets. |
| Email | **AWS SES** from Nest, **EU region** (pick at provision — Frankfurt `eu-central-1` is the usual pair with Helsinki). Verify-email first; match mail later. How templates/from-address work is Notify-spec, not a lock now. |

Three deploy loops, one repo. Path-filtered CI.

---

## 11. Deferred (do not spec into the **product** MVP)

These are not “we will not design them”. They are “they do not ship as Nest request-path or Expo screens in v1”.

| Deferred in product | Still designed |
| --- | --- |
| Nest calling Apify / FKApi at runtime | Seed repos + mapper (§7, data-model) |
| Serving archive kit renders to users | `KitPhoto` stored, `admin_only` until rights |
| Stripe as the only pay wall | IAP in stores; Stripe as optional later source on `Entitlement` |
| pgvector / on-device OCR | Schema hooks exist; no index, no native module |
| Nest microservices, Next.js | — |
| A second Nest worker deploy | BullMQ worker stays in `apps/api` (§9) |
| Price estimates | — |
| Sportmonks live refresh | Seed repos cover Fase 0 |

---

## 12. How to spec from here

A feature spec should name:

1. **Which app** (`mobile` / `web` / `admin` / `api`) **or which seed repo**
2. **Which Nest module** (if product)
3. **Catalog (`Kit`) vs user (`UserJersey`)** — which IDs are required on Save
4. **Contract change** (Zod) vs internal-only
5. **Vision** — suggestion, ignore, or out of scope
6. **Telemetry**
7. Nothing from the left column of §11 as a runtime dependency

Do not invent a fifth product app. Seed repos are allowed — they are not a second KitCollective API.

A **seed spec** is a deep handoff, not a thin note. It must satisfy the seven points in §7 so `spec/handoff.md` in `kit-collective-seed-apify` or `kit-collective-seed-fkapi` can run without reading the PRD.

---

## 13. Open (not locked)

- Exact SES EU region + from-address (ops when we turn verify-email on)
- Staging/dev hostnames (`staging.api.…` vs separate subdomain) — production names above are locked

---

**Gate:** Green — architecture lock for specs. No application code.