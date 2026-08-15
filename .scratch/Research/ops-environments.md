# Ops inventory — git, GitHub, runtimes, load

**Date:** 2026-08-14  
**Product:** KitCollective  
**Question:** What must exist to run the product with the named lanes `development` / `staging` / `production`, and what does ~1,000 users/month imply for uptime and jersey-create / load speed?

**This file is an inventory of *what must run*.** GitHub Environment and long-lived branch **names** are locked in [tech-stack §10](../Architecture/tech-stack.md): `development`, `staging`, `production`. This file still does not pick a Node/Postgres host or EAS channel names.

Parent: [PRD 2.1](../Business/PRD.md) · [tech-stack](../Architecture/tech-stack.md)

---

## Observed repo state (2026-08-14)

Checked against `github.com/eskobar95/kit-collective` and the local clone.

| Fact | Value |
| --- | --- |
| Default git branch | `main` |
| Other remote branches | none (`development`, `staging`, `production` do not exist) |
| GitHub Environments | none |
| Branch protection on `main` | none |
| Visibility | public |
| GitHub Environments available | yes — public repos on Free can use Environments ([GitHub: managing environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)) |
| Product application code | not scaffolded yet |
| Seed repos `kit-collective-seed-apify`, `kit-collective-seed-fkapi` | do not exist on the account yet |

The three names are **locked** in tech-stack §10. They are **not** yet created on the remote (still only `main`, zero GitHub Environments as of this check). Creating them is an ops step.

---

## Four things that share the same words

`development`, `staging`, and `production` are used for four different objects. They do not become the same thing because they share a name.

| Axis | What it is | Who owns it | What it does **not** do |
| --- | --- | --- | --- |
| **Git branch** | An ordered list of commits (`development`, `staging`, `production`, or `main`) | Git / GitHub | Does not start a server, create a database, or change what a store binary talks to |
| **GitHub Environment** | A deploy target with its own secrets, variables, optional reviewers, wait timer, and allowed branches/tags | GitHub Actions ([docs](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments#using-environments)) | Does not exist until created under Settings → Environments (or first referenced by a workflow). Official example names are exactly `production`, `staging`, `development` |
| **EAS channel** | A string baked into an Expo **binary** at build time (`eas.json` `build.*.channel`) | Expo EAS Update ([how it works](https://docs.expo.dev/eas-update/how-it-works/), [deployment](https://docs.expo.dev/eas-update/deployment)) | Is not a git branch. Expo also has *EAS Update branches* (lists of OTA updates). A channel is linked to an EAS branch; default link is same-name. `eas update --channel staging` targets builds that already embed `channel: "staging"` |
| **Runtime lane** | A running Nest process + Postgres + object-storage prefix + public URLs | The host (whatever is chosen later) | Is not created by `git checkout`. A branch named `production` with no deploy job is just commits |

Expo’s own docs state that EAS Update branches were *meant* to map to git branches, and that many apps ignore that and only publish to channels (`eas update --channel production`). Both patterns exist. This file does not pick one.

**Consequence:** a commit on git `staging` does nothing to TestFlight until something (Action, EAS Workflow, or a human) publishes an update or submits a build whose channel and API URL match the staging runtime.

---

## What must actually run (bill of materials)

Locked in tech-stack: Nest is the only process that touches secrets, DB, IAP, and Vision. Jobs stay in the same Nest process. Postgres is own (not Neon). Object storage is **Cloudflare R2**. Expo is the product client. Astro is read-only public. Admin is an internal SPA.

### A. Processes / surfaces (per runtime lane that is “live”)

| Piece | Why it exists | Typical multiplicity |
| --- | --- | --- |
| NestJS (`apps/api`) | Auth, collection write, catalog read, IAP receipt, Vision worker, wishlist match, push fan-out | One long-running Node process per lane (tech-stack §10) |
| Postgres | Catalog + users + entitlements + photos metadata | One database (or one cluster + separate DBs) per lane that must not share user data |
| Object storage | User JPEGs + admin-only kit reference bytes | One bucket **or** one prefix per lane. Bytes do not belong in Postgres |
| Astro (`apps/web`) | SEO, OG, share, deep-link landing | One static/SSR deploy per public lane |
| Admin SPA (`apps/admin`) | Catalog queue | One static deploy; must not be indexed |
| Expo binary | iOS / Android / degraded web | Built by EAS, not hosted as our Node. Store / TestFlight / internal track per channel |

### B. Not a process we host

| Piece | Role |
| --- | --- |
| Gemini 2.5 Flash-Lite (+ OpenAI `gpt-4.1-nano` fallback) | Vision suggestions. Fail-open 8–12 s. Outage must not block Save (already locked) |
| Apple App Store / IAP / Sign in with Apple | Binary distribution + merchant of record on iOS + required social login |
| Google Play / Play Billing / Google Sign-In | Same on Android |
| APNs / FCM (via Expo or direct) | Push. Vendor not locked (tech-stack §13) |
| Transactional email | Verify-email. Vendor not locked |
| EAS Build / Submit / Update | Compile, store submit, OTA JS |

### C. Optional later (not locked)

| Piece | When it appears |
| --- | --- |
| Redis / BullMQ | **Rejected for MVP.** In-process `@nestjs/schedule` + module async ([tech-stack §9](../Architecture/tech-stack.md)). Revisit only on restart-survival without a Postgres outbox, or Nest replicas |
| Dedicated search engine | Only if the 500 ms / 50k-jersey gate slips (tech-stack §9) |
| CDN in front of object storage | Read-path for collection photos / OG images |
| Second Nest replica + connection pooler | Only if one process is the bottleneck (see load section) |
| Stripe | Optional later web checkout. Not a substitute inside store binaries |

### D. Accounts and artefacts that are not “a server”

Needed to *ship*, independent of which Node host is chosen:

- GitHub product repo (exists) + two seed repos (named in tech-stack, not created)
- Domain + DNS + TLS for API, Astro, admin
- Expo account + EAS project + `eas.json` profiles
- Apple Developer Program; Sign in with Apple capability; IAP product; TestFlight
- Google Play Console; Play Billing product; internal/closed track
- Apple Small Business Program (fee cut) — week-1 ops in prior notes, not a runtime
- Gemini + OpenAI API keys (server-only)
- Object-storage credentials (server-only)
- Push + email credentials when those vendors are chosen
- GitHub Environment secrets **per lane** so staging keys never ride in the production Environment

Secrets stay on Nest / CI environments. Never in Expo or Astro (tech-stack §3).

---

## Git topologies that exist (facts, not a pick)

All of these are used in the wild. They can all feed the same three **runtime** lanes.

1. **Three long-lived git branches** `development` → `staging` → `production`, each deploying to the same-named GitHub Environment and runtime. Common, easy to explain, merge lag and “which commit is live” drift.
2. **Trunk (`main`) + Environment deploys.** `main` is the only long-lived branch. A workflow deploys `main` to staging automatically and to production on tag / approval. GitHub’s own deploy docs use `push` to `main` + `environment: production` as the example.
3. **Trunk + release tags.** Production is a tag (`v1.2.0`), not a branch. Staging tracks `main`.
4. **GitHub Environment branch policy** can require that only `production` (or only tags) may use production secrets, even if other branches exist.

GitHub Environments and git branches are configured separately. Creating a branch named `staging` does not create the Environment. Creating the Environment does not create the branch.

**Expo overlay (independent of 1–4):** store / TestFlight binaries embed an EAS **channel** and an API base URL. OTA updates go to that channel. A native change (new permission, new IAP, new Expo SDK) still needs a new binary and store review. JS-only changes can ride EAS Update if `runtimeVersion` matches.

**Three deploy loops, one product repo** (already in tech-stack §10): path-filtered CI for `apps/api`, `apps/web`+`apps/admin`, `apps/mobile`. Seed repos are a fourth loop and must not be called from Nest at request time.

---

## What “good uptime and speed” is already specified

From PRD Success Metrics (technical):

| Gate | Number |
| --- | --- |
| Monthly uptime | 99.5 % |
| Jersey create (median, jersey index ≥ 2) | < 45 s |
| Search | < 500 ms at 50,000 registered jerseys |
| Crash-free sessions | > 99.5 % both stores |
| Cold start to usable screen | < 2 s on a four-year-old phone |
| Push after wishlist match | delivered and opened within 5 minutes |

99.5 % monthly availability is about **3 hours 36–39 minutes** downtime per 30/30.44-day month ([uptime.is/99.5](https://uptime.is/99.5)). That is a product target, not a host SLA. A host quoting 99.9 % still leaves room for *our* deploys, migrations, and disk-full to blow the budget.

The 45 s jersey-#2 budget is **mostly client + catalog completeness**, not API CPU. Registration research already places nameset/pads/purchase off that path; Vision is suggestion-only and fail-open. A slow host can still ruin it (upload stall, API hang), but a large host cannot save a missing club/season picker.

---

## Load at ~1,000 users/month (order of magnitude)

“1,000 users/month” is not a traffic unit. Two readings:

| Reading | Implication |
| --- | --- |
| 1,000 **monthly active** users | Peak concurrent in a hobby consumer app is typically a few tens, not hundreds, unless a launch spike |
| 1,000 **new registrations** in a month | Write-heavy that month; still small in absolute rows |

PRD 6-month product target is **1,500 registered**, **15 jerseys** average depth, search gate at **50,000 user jerseys**. 1,000 users × 15 jerseys = **15,000** `UserJersey` rows — below the search gate.

**Illustrative storage (not a forecast):** 1,000 users × 3 jerseys × 2 photos × ~0.4–0.8 MB resized JPEG ≈ **2–5 GB** object storage in an early month; 1,500 × 15 × 2.5 photos × 0.6 MB ≈ **~34 GB** at the 6-month depth target. Catalog reference images are extra and stay `admin_only` until rights are resolved.

**Illustrative Vision cost (from [jersey-vision-providers](./jersey-vision-providers.md), Gemini Flash-Lite ~$0.0004/image):** 1,000 users × 3 jerseys × 2 images ≈ **$2.40** if every photo hits the worker. Latency sits in the **external API** (fail-open 8–12 s), not in Postgres size.

**What is actually on the request path for “create jersey” / “load collection”:**

1. Client upload of 1–3 JPEGs → Nest → object storage (bandwidth + storage, not CPU).
2. `INSERT` user jersey + photo rows (tiny).
3. Optional Vision job in the same Nest process (outbound HTTPS; must not block Save).
4. Collection / search: Postgres filters on catalog FKs (tech-stack §9).

At this row count, **Postgres and a single Fastify process are not the scarce resource**. The scarce resources for *felt* speed are: photo upload RTT, object-storage PUT/GET, client resize, Vision (optional), and catalog seed quality. The scarce resources for *uptime* are: process crash/restart, disk, failed migrate, shared staging/production database, and unpaid/expired Apple/Google/Expo/DNS.

No instance size is stated here. Any concrete vCPU/RAM number would be a conclusion.

---

## What each runtime lane needs (checklist, still no vendor)

For a lane to be *real* (not just a branch name):

1. Its own Nest env: `DATABASE_URL`, storage credentials, Gemini/OpenAI, Apple/Google IAP, JWT/session secrets, API public URL.
2. Its own Postgres (or a clearly isolated database on a shared cluster). Staging data must be disposable. Production backups must exist and be restorable.
3. Its own storage prefix/bucket and a rule that unresolved kit images are never served to Expo/Astro/OG.
4. Astro and admin pointed at **that** API URL.
5. Expo profile whose **channel** and **API URL** match that lane (TestFlight / internal track ≠ App Store).
6. Health check on Nest that includes “can select 1 from Postgres”.
7. Restart policy on the Node process (crash ≠ hours of downtime).
8. TLS on the public hostnames.
9. A deploy path that cannot apply a staging migration to the production database.

Sharing one Postgres between staging and production is the usual way a “three branch” setup still destroys production.

---

## Uptime / speed levers that are independent of vendor brand

| Lever | Why it shows up at this scale |
| --- | --- |
| Long-running Node (already locked) | Avoids cold-start on every jersey save |
| Postgres close to Nest | Search 500 ms gate is network + query, not “need Elasticsearch at 15k rows” |
| Photos out of Postgres | Large TOAST / backup bloat; upload path stays object storage |
| Vision fail-open | Gemini downtime must not fail Save or the 45 s clock |
| Separate lanes | A staging migrate or seed dump cannot take production down |
| Backups + one restore drill | 99.5 % is meaningless if the disk is gone |
| Health check + restart | Single-process MVP: most downtime is “process died and nobody restarted it” |
| Path-filtered CI | A docs commit on `main` need not rebuild / resubmit the iOS binary |
| Do not serve unresolved kit images | Legal + bandwidth; already locked |

---

## Open (same as tech-stack §13, plus ops)

Still unset, and this inventory does not set them:

- Exact push / email vendors
- Nest auth library (queue library is locked: not BullMQ)
- Hostnames (`app.` vs `/app`)
- Which git topology (section above) is used
- Which Node/Postgres host class is used (Coolify / Railway / VPS / other)
- Whether all three runtime lanes exist from day one, or only local + one remote until first TestFlight

---

**Gate:** Green — research inventory only. No application code. No vendor or topology pick.
