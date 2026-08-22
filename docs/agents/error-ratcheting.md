# Error ratcheting

When the same class of mistake recurs, land the fix as a **committed, reviewable constraint** in the repo — a Cursor hook or an always-applied rule — in the **same PR** as the code fix. The approver approves the constraint together with the code.

This is not a memory store. Wrong lessons are reverted with git.

## Tighten only

- Agents may **add** or **strengthen** hooks and rules.
- Agents must **never** loosen, delete, empty, or bypass an existing ratchet.
- If a ratchet blocks legitimate work, open a `signal-up` Linear issue (`docs/agents/signal-up.md`) instead of editing the hook to get past it.

## Where constraints live

| Path | Role |
| --- | --- |
| `.cursor/hooks.json` | Which events run which scripts |
| `.cursor/hooks/*.sh` | Command hooks (deny/allow) |
| `.cursor/rules/*.mdc` | Always-applied agent rules |
| `biome.json` / `oxlint.config.ts` | Format, lint, and anti-slop gates run in CI |
| `docs/agents/error-ratcheting.md` | This contract |

## Default factory ratchet

Command hooks on `beforeShellExecution` (fail closed). Scripts must print `{"permission":"allow"}` or `{"permission":"deny"}` on stdout — empty output is a hook failure.

1. `block-dangerous-git.sh` — no force-push, hard reset, `clean -f`, branch `-D`
2. `block-reward-hacks.sh` — no shell deletion of tests or `.github/workflows`
3. `protect-ratchet.sh` — no shell removal/emptying of `.cursor/hooks*`

Do **not** put factory learning in `sessionStart` context injection or in Cursor Automations **Memories** (`MEMORIES.md`). Cloud Agents may never see sessionStart; Memories is an unreviewed second source of truth. Prefer `beforeShellExecution` denials and always-applied rules / `AGENTS.md`. The planner comments on Linear; it does not keep a memory file of ratchets.

## When to propose a new ratchet

After checker fail or approver reject, if the mistake is a **recurring class** (not a one-off logic bug):

1. Fix the issue.
2. Add or tighten a hook/rule that would have caught it.
3. Keep the PR focused; explain the ratchet in the PR description.
4. Never weaken existing entries to make the PR green.

The **checker** may require this in `### Review feedback` on the second fail of the same class. The **planner** may comment the same requirement. Neither writes the hook or rule. The **implement** PR lands it. Prefer a hook over a new always-applied rule when a deny/allow gate would have caught it — do not grow `.cursor/rules/` for one-off mistakes.

### Seed package import ratchet (KIT-9)

`scripts/check-import-boundaries.mjs` denies `@kit/db` and `packages/db` imports inside `seed/fkapi/`. Seed mappers talk to Postgres via `DATABASE_URL` only (ADR 0001). Tighten only — do not remove this check without superseding ADR 0001.

### Workflow secret-logging ratchet (KIT-7)

`scripts/check-workflow-secrets.mjs` fails CI when a `.github/workflows` `run:` step echoes or writes to `$GITHUB_OUTPUT` a Coolify deploy webhook / bearer-shaped value without `::add-mask::` in the same step. Prevents repeating the KIT-7 checker fail (unmasked `COOLIFY_DEPLOY_WEBHOOK_URL` in job logs). Tighten only.

### GitHub Actions workflow lint ratchet (KIT-7)

`scripts/lint-workflows.sh` (actionlint) runs in CI on every PR. Fails when a workflow file has invalid YAML, schema, or expression syntax (e.g. `secrets` in a job-level `if:`). Prevents shipping a push-triggered deploy workflow that silently never runs. Tighten only.

### Seed development proof DB ratchet (KIT-16)

`.cursor/hooks/block-seed-substitute-db.sh` denies shell seed CLI / MCP invocations for the development lane when `DATABASE_URL` points at localhost, `127.0.0.1`, or a `*test*` database name, or when the command inline-overrides `DATABASE_URL` to those hosts or pairs `docker run … postgres` with a seed CLI. Prevents repeating the KIT-16 checker fail (proof rows on a substitute Postgres instead of real development). Fixture/recording modes (`SEED_APIFY_FIXTURE`, `SEED_APIFY_RECORDINGS`) and explicit `staging` lane are exempt. Tighten only.

### Coolify MCP control ratchet (KIT-17)

`.cursor/hooks/block-coolify-rest-service-control.sh` denies shell commands that call Coolify REST `/api/v1/services/{uuid}/start|stop|restart` (including bare `curl` to those paths). Season-range runs must use the Coolify MCP `control` tool via `seed/coolify/mcp-call.sh` / `start-apify-job.sh`. Prevents repeating the first KIT-17 checker fail (REST start instead of MCP). Tighten only.

### Code quality ratchet

`biome.json` (format + lint), `oxlint.config.ts` with the vendored plugin under
`tools/oxlint/anti-slop/`, and the CI steps `pnpm typecheck`, `pnpm format:check`,
`pnpm lint:anti-slop`. `typecheck` runs each package's `tsconfig.test.json`, so test
files are typechecked too. Tighten only.

Three rules are deliberately at warn, not error, and are the ratchet targets:

- `lint/style/noNonNullAssertion` (Biome) — the existing `!` sites are mostly
  `const [row] = await …returning()`. Ratchet to error once those reads carry a guard.
- `anti-slop/no-unsafe-dictionary-type` — the remaining sites are the raw Transfermarkt
  and Football Kit Archive payloads that `normalize()` and `normalizeRawKit` exist to
  parse. Ratchet to error once those adapters parse through a schema.
- `anti-slop/no-module-mocking` — `seed/apify/tests/seed-proxy.test.ts` mocks `undici`
  because `seed/apify/src/proxy-config.ts` imports `fetch` and `ProxyAgent` at module
  scope, leaving the test no seam to inject. Ratchet to error once `proxy-config` takes
  those as an injected dependency.

`tools/oxlint/anti-slop/README.md` records which upstream rules we left out and why.

`lint/style/useImportType` is off for `apps/api/src/**`. This is not a ratchet target — do
not turn it on. Nest resolves constructor injection from `emitDecoratorMetadata`, and an
`import type` is erased at compile time, so the emitted `design:paramtypes` degrades to
`Function` and the module fails to build at runtime. Typecheck stays green, so CI only
catches it in the API tests and the container smoke test.

### Ops MCP catalog evidence ratchet (KIT-17)

`.cursor/hooks/block-manual-getmcptools-evidence.sh` denies manual writes under `.cursor/getmcptools-evidence/`. Agents record in-session catalog proof only via `scripts/record-getmcptools-evidence.sh <server>` fed with **this session's** `GetMcpTools` JSON. Prevents repeating the second KIT-17 checker fail (marking MCP-catalog AC complete without catalog evidence). Dashboard registration for Cloud Agents remains human-only (`KIT-18`). Tighten only.

### FK seed test isolation ratchet (KIT-22)

`scripts/check-seed-fkapi-test-isolation.mjs` (CI via `pnpm check:seed-fkapi-tests`) fails when `seed/fkapi/tests/**` hardcodes Transfermarkt `external_id` values in prerequisite INSERTs, defines a local `seedApifyPrerequisites`, or calls `seedApifyPrerequisites` without an allocated `TestFixtureScope` from `seed/fkapi/tests/fixture-scope.ts`. Prevents repeating the KIT-22 checker fail (order-dependent unique-constraint collisions when tests share one DB pool). Tighten only.
