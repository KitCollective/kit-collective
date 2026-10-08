# ADR 0001: Interim FK seed CLI in product monorepo

**Status:** Accepted  
**Date:** 2026-08-16  
**Supersedes:** `.scratch/Architecture/tech-stack.md` §7 placement rule (partial — see below)

## Context

`tech-stack.md` §7 locks catalog seed to two **separate** GitHub repos (`kit-collective-seed-apify`, `kit-collective-seed-fkapi`). Those repos do not exist on the KitCollective GitHub account yet (`ops-environments.md` inventory).

KIT-9 needs a working FK seed CLI for the KitCollective Seed kickoff milestone: mapped `Kit` + `KitPhoto` rows, fixture-backed tests, and a Coolify job handoff (KIT-10).

## Decision

Until `kit-collective-seed-fkapi` is created and the code is moved out:

1. **FK seed lives at `seed/fkapi/`** inside `kit-collective` as an interim workspace package.
2. **Seed code talks to Postgres only via `DATABASE_URL`** (raw `pg` queries). No `@kit/db` or Drizzle schema imports from the product monorepo.
3. **FKApi fetch stays in `seed/fkapi/src/fetch.ts`** but the default CLI entry point does **not** call the network unless `FKAPI_BASE_URL` is explicitly set. Tests always inject fake adapters.
4. **`spec/handoff.md`** in `seed/fkapi/` is the copy-paste handoff for the future standalone repo (same seven points as §7).
5. When the standalone repo exists, **delete `seed/fkapi/`** from this monorepo and keep only the handoff pointer in `.scratch` / docs.

Apify seed placement is unchanged — still a future separate repo; no Apify fetch code in this monorepo.

## Consequences

- `pnpm-workspace.yaml` includes `seed/*` during the interim period.
- Import-boundary CI ratchet: `seed/fkapi` must not import `@kit/db` or `packages/db`.
- Nest and client apps remain forbidden from importing `seed/`.
- This ADR does **not** allow Nest to call FKApi at runtime.
