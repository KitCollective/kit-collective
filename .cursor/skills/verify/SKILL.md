---
name: verify
description: How to prove a change works in KitCollective, per area. The commands, what counts as proof and the traps. Use when you build, review or claim something works.
---

# Verify

Proof is a command you ran and its output. "It compiles" and "the test file exists" are not proof.

## Before any test

The agents' container runs with `NODE_ENV=production`, which skips dev dependencies.

- Install: `NODE_ENV=development pnpm install --frozen-lockfile --prod=false`.
- The apps import built workspace packages. Build them once after install: `NODE_ENV=development pnpm -r --filter "./packages/*" --if-present run build`. A test that fails with `Failed to resolve entry for package "@kit/..."` means this step was skipped.

## The issue's own database

Every issue's worktree has its own Postgres, started when the worktree was made (`scripts/factory-db.sh up`) and deleted when the issue lands. It is never development, staging or production.

- Load it before API or database tests: `set -a; . .factory/db.env; set +a`. That sets `API_TEST_DATABASE_URL` and `DATABASE_URL` to `kit_api_test`, an empty database the API tests migrate and reset themselves.
- `MIRROR_DATABASE_URL` is `kit_mirror`, a fresh copy of development's data. Use it to prove a migration and to look at realistic data. Never point tests at it: they reset their database.
- A migration: `bash scripts/factory-db.sh migrate` applies the branch's migrations to `kit_mirror`, and `bash scripts/factory-db.sh report` lists the schema and row changes. A migration that fails on an object that already exists means development has drifted from the migrations: report it, do not work around it.
- No `.factory/db.env`: run `bash scripts/factory-db.sh up` yourself. Without a mirror connection it still makes `kit_api_test`.

## Per area

| Area | One file | Whole package | Typecheck |
| --- | --- | --- | --- |
| `apps/mobile` | `cd apps/mobile && pnpm exec vitest run tests/<file>` | `cd apps/mobile && pnpm exec vitest run` | `cd apps/mobile && pnpm exec tsc -p tsconfig.json --noEmit` |
| `apps/api` | `cd apps/api && pnpm build && pnpm exec vitest run tests/<file>` | `pnpm --filter @kit/api test` | `pnpm --filter @kit/api typecheck` |
| `packages/*` | `pnpm --filter @kit/<name> exec vitest run <file>` | `pnpm --filter @kit/<name> test` | `pnpm --filter @kit/<name> typecheck` |

The test runner is vitest everywhere. There is no jest.

Repo-wide, before every push: `pnpm format:check`, `pnpm lint:anti-slop` and `pnpm check:review-gate`.

## What counts as proof

| Change | Proof |
| --- | --- |
| Logic in `apps/mobile/src/**` | A vitest test that calls the function or hook and asserts the result. Red before, green after. |
| A screen in `apps/mobile/app/**` | Move the decision into `src/` and test it there. A source-text test only for wiring that has no other seam, and say so. |
| UI look and layout | The design-system checks (`pnpm check:mobile-design-tokens`, `pnpm check:mobile-tab-bar`) plus Device flows in CI. Offline you cannot see it: say "not verified visually". |
| A Device flow (`apps/mobile/.maestro/**`) | Runs only on CI's macOS runner. Write it, and say it has not run. |
| `apps/api` | A vitest test through the HTTP or service interface, run against the issue's own database (above). |
| A migration | `bash scripts/factory-db.sh migrate` clean on the copy of development, and the `report` it gives. |
| Mail templates | The notify tests, plus a rendered HTML file you opened. |

## Traps

- A red test that fails on an import or a missing export proves nothing about the behavior. Make the assertion fail.
- Running only your new file. The package suite is what catches the regression next door.
- A red check that was red before your change. Prove it on the base commit before you call it pre-existing.
