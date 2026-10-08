# Handoff — lukket factory/harness-repo (multi-tenant skal)

**Dato:** 2026-09-01  
**Fra:** Cursor-session på `kit-collective` (Pi archive + kit-harness decommission)  
**Til:** Frisk agent der **opretter og bygger et lukket repo kun for factory/harness**  
**Fokus (brugerens intent):** Multi-tenant factory-skal parallelt med KitCollective-produktet — nemt at tilslutte nye projekter, men **første tenant er dynamisk KitCollective**.

Denne fil er den portable kickoff. Den erstatter ikke planen eller research — den fortæller *hvorfor* næste skridt er et separat repo, og *hvordan* I undgår at blande produkt og factory igen.

---

## Låste layout-beslutninger (2026-09-01)

| Emne | Valg |
| --- | --- |
| GitHub | **Privat** under org **`KitCollective`** |
| Repo | [`KitCollective/kit-factory`](https://github.com/KitCollective/kit-factory) |
| Lokal mappe | Sibling: `Projects/kit-factory` (ved siden af `kit-collective`) |
| Cursor | Multi-root: `Projects/kit-collective.code-workspace` (product + factory + Pi-arkiv) |
| Produktkode | Forbliver i `kit-collective` — ingen ny `harness/` der |

---

## One-liner

Factory-control-plane lever i **`KitCollective/kit-factory`** (worker + session registry + memory A/B + tenant-adapter). Deployér på den tomme `kit-harness`-boks. `kit-collective` leverer kun **tenant-config + product docs/skills** — ikke worker-kode.

---

## Hvorfor et lukket repo (låst intent)

| Problem i monorepo | Konsekvens |
| --- | --- |
| `harness/` + `.pi/` levede inde i produktet | CI, write-scope, docs og deploy blev sammenfiltrede |
| Pi archive landede i `kit-pi-harness` | Arkiv er reference — **ikke** det aktive Cursor-worker-mål |
| Næste generation er Issue Session Sandbox | Skal kunne genbruges på projekt #2 uden at forke hele KitCollective |

**Multi-tenant = samme worker-host, flere product-tenants.**  
Tenant #1 = KitCollective (Linear team `KIT`, repo `KitCollective/kit-collective`, lane `development`).  
Tenant N = nyt projekt der dropper sin egen `factory.config.json` (+ secrets) uden at kopiere harness-kilde.

Byg **skallen** (registry, container-per-issue, mounts, Retro, routing) generisk. Bind KitCollective via **config/adapters**, ikke hardcodede stier i worker-kernen.

---

## Allerede gjort (ikke gentag)

| Artefakt | Status |
| --- | --- |
| Pi-kode ude af `kit-collective` | Merged PR [#169](https://github.com/KitCollective/kit-collective/pull/169) på `development` |
| Arkiv-repo | [KitCollective/kit-pi-harness](https://github.com/KitCollective/kit-pi-harness) — reference only |
| Pointer i produktrepo | `docs/agents/pi-harness-archived.md` |
| Research (memory A/B/C) | `.scratch/cursor-factory-sandbox/research.md` |
| Designplan (Issue Session Sandbox) | `~/.cursor/plans/issue_session_sandbox_5a1105c8.plan.md` |
| `kit-harness` server | **Tom og klar** — Compose down, Linear webhook slettet, Docker prune, `/opt/kit-collective` kun README. Disk ~2.4G / 75G. SSH: `ssh kit-harness`. |
| Beholdt i produktrepo | `scripts/lib/land-policy.mjs` + `/land` skill (merge gates) |

**Ikke gjort:** `spec.md`, ADR-0031/0032, session-registry, cursor-container spike, CodeGraph host index, factory-lessons SQLite, CONTEXT/WORKFLOW-opdatering for IssueSession.

---

## Målarkitektur (`KitCollective/kit-factory`)

Repo findes (scaffold på `main`). Byg videre her — ikke i monorepo:

```text
Projects/
  kit-collective/               # product tenant
  kit-factory/                  # THIS repo (private)
  kit-pi-harness/               # Pi archive reference
  kit-collective.code-workspace

kit-factory/
  README.md                     # ✓ scaffold
  tenants/kit-collective.example.json  # ✓ scaffold
  factory.schema.json           # TODO JSON Schema for tenant config
  src/                          # TODO
    session-registry.mjs        # acquire → … → retro → archive → release
    cursor-session.mjs          # Docker one-shot / resume via sessionId
    model-router.mjs            # port fra arkiv; gate → model + tools
    retro-job.mjs
    codegraph-sync.mjs          # host index on lane push
  docker/
    session-image/
    compose.host.yml
  docs/
    adr/
```

**Tenant-kontrakt (dynamisk KitCollective, generisk for N):**

```jsonc
{
  "tenantId": "kit-collective",
  "productRepo": "KitCollective/kit-collective",
  "integrationLane": "development",
  "linear": { "teamKey": "KIT", "workspaceMatch": "kitcollective" },
  "paths": {
    "specs": ".scratch",
    "helpers": ".cursor/agents",
    "context": "CONTEXT.md",
    "workflow": "WORKFLOW.md"
  },
  "dispatch": { "state": "Backlog", "readyLabel": "ready-for-agent" },
  "session": { "slots": 4, "prefix": "KIT" }
}
```

Produktrepoet beholder `factory.config.json` (i dag findes også `factory.config.json` — afklar single source i grill). Worker læser tenant-fil + mount’er product checkout read/write til session-worktree — **kopierer ikke** monorepo-indhold ind i factory-repoet.

### Tre-lags memory (låst i plan)

| Lag | Ejerskab | Lifetime |
| --- | --- | --- |
| A factory-lessons SQLite | **Factory-repo / host volume** | Global pr. tenant (eller global med `tenantId` kolonne) |
| B CodeGraph | **Host mirror** af product repo | Rebuild on lane push; RO mount i alle sessions |
| C session ephemeral | `sessions/<ISSUE>/` på host | Indtil Retro → archive |

Detaljer: plan + `.scratch/cursor-factory-sandbox/research.md`. Kopiér ikke hele research ind i handoffen.

### Hovedloop (låst)

Implementing → Review → Merge → Done → **Retro** (ikke Linear-status) → archive → reap slot.  
Container-per-issue fra v1. Retro **før** reap.

---

## Parallel spor (brugerens strategi)

Kør **to spor samtidigt** uden at blande PR’er:

| Spor | Repo | Output |
| --- | --- | --- |
| **A — Factory shell** | `kit-factory` (findes) | Registry, Docker session, mounts, Retro, multi-tenant config schema |
| **B — KitCollective fit** | `kit-collective` | Tenant example, CONTEXT/WORKFLOW IssueSession-sprog, land-policy forbliver, ingen `harness/` tilbage |

Spor A må **ikke** kræve product feature-tickets for at lande spikes.  
Spor B må **ikke** genindføre Pi-paths.

Reference-kode til port (ikke runtime): `../kit-pi-harness` (model-router, capacity, land-policy tests, syncToRemoteBranch wipe-bug).

---

## Server / ops tilstand

- Host: Hetzner `kit-harness` — worker-boks, ikke product Coolify.
- Deploy dir historisk: `/opt/kit-collective/harness` — **slettet**. Brug fremover noget i stil med `/opt/kit-factory` + `tenants/kit-collective` checkout path.
- Linear Issue-webhook til harness: **slettet** (0 webhooks). Ny worker skal registrere ny webhook URL når spike er klar.
- OAuth “Pi”-app i Linear kan stadig eksistere — manuel oprydning senere; ikke blocker for Cursor-worker.
- Secrets: aldrig i git. Navne i `.env.example` (`CURSOR_API_KEY`, `OPENROUTER_API_KEY`, `LINEAR_*`, `GH_TOKEN`). Værdier = `[REDACTED]` i docs.

---

## Lokal kit-collective note (sync)

Lokal `development` kan være **foran** `origin/development` med browse-plan commit (`docs: lock collector browse plan…`) der ikke er på remote (branch protection). Factory-handoff afhænger **ikke** af den commit. Product work: egen PR hvis den skal landes.

Untracked i tree (ikke factory): `.scratch/wishlist-and-premium/`, ADR 0029/0030 — ignorér i factory-sporet.

---

## Første session — konkrete skridt

1. Åbn `Projects/kit-collective.code-workspace` i Cursor (begge roots).
2. **`/grill-with-docs`** på det der stadig er åbent:
   - Tenant-model: én process multi-tenant vs én Compose-stack pr. tenant v1.
   - Hvor lever `factory.config.json` — kun i product, kun i factory `tenants/`, eller begge med schema-sync?
   - Issue-id prefix (`KIT-n`) — tenant-felt eller Linear teamKey-derived?
3. Skriv `spec.md` + ADR-skitser **i `kit-factory`** (ikke i product monorepo).
4. Spike: session-container + Cursor CLI på `kit-harness` med **KitCollective** som første tenant-config.
5. Port `model-router` + fix `syncToRemoteBranch` wipe (låst uafhængigt bug i arkiv).
6. Først når shell kan acquire→retro→release: tilslut Linear webhook igen.

**Suggested skills:** `/grill-with-docs` → `/to-spec` (factory effort) → spikes/implement i factory-repo → `/ask-me` hvis fasegrænse er uklar. Product-side CONTEXT/WORKFLOW: separat lille PR i `kit-collective` når ADR’er er skrevet.

**Ikke:** genåbn Pi på serveren; merge product features ind i factory-repo; sæt Linear Agent til Cursor (Cloud Agent ≠ factory dispatch).

---

## Definition of done for “skallen”

- Privat factory-repo med tenant schema + `kit-collective` example.
- `session-registry` kan lease slot, køre en dummy container, Retro-stub, release.
- A/B mounts dokumenteret; B kan være stub indtil CodeGraph-spike.
- `kit-harness` kører factory Compose fra `/opt/kit-factory` (eller tilsvarende), ikke product monorepo root.
- KitCollective forbliver product-only: docs peger på factory-repo; ingen ny `harness/` i monorepo.

---

## Referencer (læs i denne rækkefølge)

1. Denne handoff  
2. [Issue Session Sandbox plan](file:///Users/nicklaseskou/.cursor/plans/issue_session_sandbox_5a1105c8.plan.md)  
3. `.scratch/cursor-factory-sandbox/research.md`  
4. `docs/agents/pi-harness-archived.md`  
5. `factory.config.json` + `WORKFLOW.md` + `CONTEXT.md` (tenant-fit)  
6. Arkiv: [kit-pi-harness](https://github.com/KitCollective/kit-pi-harness) — kun til port/reference  

---

## Åbne beslutninger til grill

1. Multi-tenant v1: shared host process + `tenantId` overalt, eller isolerede worker-processer pr. tenant?  
2. CodeGraph index: én pr. tenant-mirror (anbefalet) vs shared.  
3. Om land/auto-merge bor i factory-repo eller forbliver Cursor-skill i product (`/land` + `land-policy`).  
4. Om factory-repo også ejer generiske `.cursor/skills` (grill/to-spec/implement) eller kun runtime worker — product beholder skills i dag.  
5. Org-permissions på `kit-factory` (kun dig vs team) — repo er privat under KitCollective.
