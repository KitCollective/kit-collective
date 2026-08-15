# KitCollective server stack

**Version:** 1.2 · 2026-08-15  
**Status:** Locked (copied into [tech-stack](./tech-stack.md) §1 / §9 / §10)  
**Owns:** where Nest and Postgres run, how many machines, Docker vs Kubernetes, where bytes live. Redis is **in** as the BullMQ broker only.

Parent: [tech-stack](./tech-stack.md) · [ops-environments](../Research/ops-environments.md) · [PRD 2.1](../Business/PRD.md)

This is a **stance**, not another inventory. Numbers below use the load already in ops-environments (~1,000 users/month, PRD 1,500 registered / 15 jerseys at 6 months, 99.5 % uptime, 45 s jersey-#2, search &lt; 500 ms at 50k rows).

---

## Answer

**Docker on one EU VPS, orchestrated by Coolify. Not Kubernetes. Not three physical servers for the three GitHub lanes.**

| Layer | Choice |
| --- | --- |
| Packaging | Dockerfile for `apps/api` (and later Astro only if it needs SSR) |
| Process list | Docker Compose: Nest + Postgres + **Redis** (BullMQ broker). Worker stays inside Nest ([tech-stack §9](./tech-stack.md)) |
| Control plane | Coolify on that VPS — Git deploy, TLS, health, Postgres backups |
| Machines we SSH into | **One Hetzner CX33** (4 vCPU / 8 GB / 80 GB NVMe), **Nürnberg** |
| Staging | Second Coolify **environment** on the **same** VPS (own Nest + own Postgres volume) |
| Development | Laptop + Compose. Not a 24/7 third server |
| Files | **Cloudflare R2** — user uploads **and** kit-archive bytes. Not on the CX33 disk |
| Astro + admin | Static host (Cloudflare Pages / Workers). Not containers on the VPS |
| Expo | EAS. Not our server |

Kubernetes is the wrong size for a Nest modular monolith, a solo operator, and this traffic. Docker is the right size. Coolify is Docker with a panel, Git webhooks, and backups — not a second orchestrator.

---

## Docker vs Kubernetes (the actual question)

They are not alternatives at the same layer.

| | Docker (Compose + Coolify) | Kubernetes |
| --- | --- | --- |
| What it is | Package a process; run a short list of containers on one Linux box | Cluster OS: control plane, nodes, scheduler, ingress, operators |
| Official Compose production path | “The easiest way to deploy an application is to run it on a single server” ([Docker: Compose in production](https://docs.docker.com/compose/how-tos/production/)) | Designed for many services across many machines |
| Coolify | Every app is a Docker container. Compose is a first-class deploy. Swarm in Coolify is **deprecated** ([Coolify docs](https://coolify.io/docs)) | Coolify is not a k8s distribution |
| Ops tax | Dockerfile, compose, disk, backups, one firewall | Cluster upgrades, RBAC, CNI, ingress, etcd, node drain |
| Fits our locks | Long-running Node + own Postgres beside it | Implies replicas, service mesh thinking we rejected (no Nest microservices) |

At ~1,000 MAU the scarce resources are photo upload, object storage, Vision (external), and catalog seed — not container scheduling. A k8s cluster that is down because we misconfigured it **is** how a 99.5 % month dies. Allowed downtime is ~3.6 hours/month ([uptime.is/99.5](https://uptime.is/99.5)); a single planned VPS reboot fits. An unattended control-plane incident does not.

**Revisit Kubernetes only if** we have multiple Nest replicas behind a load balancer, a dedicated operator, or a compliance demand that a single VM cannot meet. That is not MVP and not 1,500 users.

---

## How many servers

Three GitHub lanes ≠ three VPS.

| Lane | Where it runs | Why |
| --- | --- | --- |
| `development` | Developer machine (`docker compose up`). CI can spin an ephemeral Postgres for tests | Disposable. A third always-on box is cost and another thing that can rot |
| `staging` | Coolify environment `staging` on the **same** VPS as production | TestFlight / Play internal need a public API. Isolated Postgres volume + isolated storage prefix. Resource limits so a seed dump cannot starve production |
| `production` | Coolify environment `production` on that VPS | Live Nest + live Postgres |

**Count:** 1 VPS we operate + 0 Kubernetes nodes + object storage and static hosting we do not SSH into.

Coolify’s own model is Project → Environments (`development`, `production`, …) → Resources, and it states you can run multiple environments on a single server ([Coolify concepts](https://github.com/coollabsio/coolify-docs/blob/v4.x/content/docs/get-started/concepts.mdx)). That maps onto the GitHub Environment names already locked in tech-stack §10.

**Optional later (not day one):** a second small VPS only for staging, if a production reboot must not take TestFlight down. That is blast-radius insurance, not capacity. Do not buy it until the first VPS is boring.

Coolify official minimum for the **panel** is 2 CPU / 2 GB RAM / 30 GB disk, and they recommend more when several apps share the box ([Coolify installation](https://github.com/coollabsio/coolify-docs/blob/v4.x/content/docs/get-started/installation.mdx)). They also say putting every resource on the Coolify localhost is “not recommended” under high load ([Coolify server introduction](https://github.com/coollabsio/coolify-docs/blob/v4.x/content/docs/knowledge-base/server/introduction.mdx)). For this product that caveat is about *later* saturation, not a reason to start with two machines.

**SKU (locked):** Hetzner **CX33**, Cost-Optimized shared x86, **Nürnberg**. **BullMQ does not force a rescale.** IPv4 required (+€0.50). Photos must not live on the 80 GB disk. Coolify **PR preview deploys are off** in MVP — a fourth stack on this box next to staging+prod is how 8 GB dies. Use the `staging` lane for TestFlight.

---

## What runs on the VPS

```text
EU VPS (Coolify + Docker Engine 24+)
├── Coolify control plane + proxy (Traefik or Caddy) + TLS
├── environment: production
│   ├── container: nest (apps/api)     HTTP + BullMQ worker, healthcheck → SELECT 1
│   ├── container: postgres            named volume
│   └── container: redis               maxmemory 256mb, noeviction
└── environment: staging
    ├── container: nest
    ├── container: postgres            separate volume
    └── container: redis               separate instance, same cap
```

**Redis is a broker, not a reason to leave CX33.** BullMQ requires Redis ([Nest queues](https://docs.nestjs.com/techniques/queues)). Empty Redis is tens of MB; with `maxmemory 256mb` and `maxmemory-policy noeviction` ([BullMQ installation](https://docs.bullmq.io/guide/introduction)) two lane instances use **~0.3–0.5 GB** together. That is not the 8 GB budget. Coolify + two Nest + two Postgres + Docker builds are. Do not use Coolify’s internal Redis for app jobs. Do not add a second Nest worker container.

Not on this VPS:

- User JPEGs and kit archive bytes → **Cloudflare R2** (see below)
- Astro / admin static assets → Pages / Workers
- Expo binaries / OTA → EAS
- Gemini / Apple / Google → their APIs
- A second Nest “worker” process — BullMQ workers live in `apps/api`

**Deploy loop:** push to git branch `staging` or `production` → GitHub Environment of the same name → Coolify webhook or GitHub App auto-deploy for that Coolify environment ([Coolify GitHub auto-deploy](https://github.com/coollabsio/coolify-docs/blob/v4.x/content/docs/applications/ci-cd/github/auto-deploy.mdx)). Path-filtered CI still applies: a docs-only commit must not rebuild the iOS binary.

**Backups:** Coolify scheduled Postgres dump to the same S3-compatible store (Coolify documents S3 and R2 as backup destinations). One restore drill before first TestFlight. 99.5 % is meaningless if the volume is gone.

**Uploads:** Nest accepts the JPEG, writes the object store, stores the key in Postgres. A full disk on the VPS must not be caused by photos.

---

## Object storage (locked): Cloudflare R2

One store for **both** file classes. Two prefixes. Postgres never holds JPEG bytes.

| Class | Who writes | Key | Who may read |
| --- | --- | --- | --- |
| User upload | Nest, after Expo upload | `user/{userId}/{jerseyId}/{photoId}.jpg` | Owner always. Others only after `UserJersey` visibility. Short-lived **signed GET**. These are the product images (Astro/OG when public). |
| Kit archive | Seed mapper (`kit-collective-seed-fkapi`), not Nest at request time | `kit/{kitId}/{photoId}.jpg` | Admin only. `rights: unresolved` until a human says otherwise. **Never** Expo, Astro, or OG. |

One R2 bucket per lane (`kc-development`, `kc-staging`, `kc-production`). Same key layout inside each. Staging credentials must not open the production bucket.

```text
CX33                          R2 (per lane)
├── Coolify / Docker          ├── user/…     ← collectors’ camera + roll
├── Nest  ──PUT/signed GET──► ├── kit/…      ← FKApi archive, admin_only
└── Postgres (keys only)      └── backups/…  ← Coolify Postgres dumps
```

**Why R2, not the CX33 disk:** 80 GB is for OS, images, and two Postgres volumes. User photos at 6-month depth are already ~34 GB; kit-archive dumps on top would fill the box and make backups huge.

**Why R2, not Hetzner Object Storage:** Hetzner is S3-compatible and EU, but it has a **€4.99/mo base** even for an empty bucket, is **HDD-backed**, and bills egress after the included 1 TB ([Hetzner Object Storage](https://docs.hetzner.com/storage/object-storage/overview/)). R2 has **no egress** to the internet, a 10 GB-month free tier, and ~$0.015/GB after that ([R2 pricing](https://developers.cloudflare.com/r2/pricing/)). Collection pages will *read* user photos; kit bytes stay private so they should not ride a public CDN.

**How a jersey save works:** client resizes → Nest `PUT` to `user/…` → row in `UserJerseyPhoto` with the key → Vision reads via Nest (server-side GET), never a public kit URL.

**How a kit seed works:** fkapi repo downloads archive bytes → mapper `PUT` to `kit/…` → `KitPhoto` row with `rights: unresolved`, `visibility: admin_only`. Re-run mapper; do not hot-link the source site.

---

## Alternatives considered

| Option | Verdict | Why |
| --- | --- | --- |
| **Coolify + Docker on 1 EU VPS** | **Recommend** | Matches “own Postgres”, long-running Node, three named lanes, solo ops |
| Redis + `@nestjs/bullmq` on that VPS | **Locked** | Broker only. `maxmemory 256mb` per lane. CX33 unchanged. |
| Raw Docker Compose on a VPS, no Coolify | Workable, more manual TLS/backups/Git | Coolify is that compose file plus the panel we will otherwise reinvent |
| **Railway** (project environments `production` / `staging`) | Rejected for MVP | Railway environments match the mental model ([Railway environments](https://docs.railway.com/guides/environments)), but Postgres there is **their** managed DB — same class we already refused with Neon. Also a second bill next to EAS + Apple |
| Kubernetes (k3s, Civo, GKE, …) | Rejected | Orchestrator for a fleet we do not have |
| Coolify Cloud (panel hosted, we still bring a VPS) | Optional later | Extra fee to move the panel off the workload box. Not needed at this size |
| Three VPS (one per GitHub lane) | Rejected | Burns money and attention. `development` is local |

---

## When this design is wrong

Upgrade the **same** shape (bigger VPS, then second VPS for staging, then managed Postgres still on our account) before changing paradigm.

Move off a single box when **any** of these is true:

1. Disk or CPU on the VPS is saturated **after** photos are off-box
2. A production reboot is no longer acceptable inside the 3.6 h/month budget
3. We need two Nest replicas (then add a load balancer — still not k8s)
4. Search at 50k jerseys misses 500 ms **because of Postgres**, not because of a missing cluster

Do not add Elasticsearch or a second Nest process “for scale” at 1,000 users. Redis is already in, capped. Do not uncap it or give it the CX33 disk as persistence beyond a small AOF/RDB volume.

---

## Open

Still unset (not this file):

- Exact SES EU region + from-address
- Staging/dev hostnames (production: `kitcollective.app` / `api.` / `admin.`)

---

**Gate:** Green — host + R2 + BullMQ/Redis on CX33 locked. No application code.
