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
| `apps/api` | A vitest test through the HTTP or service interface. Tests that need Postgres need `DATABASE_URL`. Without it, say which tests did not run. |
| Mail templates | The notify tests, plus a rendered HTML file you opened. |

## Traps

- A red test that fails on an import or a missing export proves nothing about the behavior. Make the assertion fail.
- Running only your new file. The package suite is what catches the regression next door.
- A red check that was red before your change. Prove it on the base commit before you call it pre-existing.
