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

The **checker** may require this in `### Review feedback` on the second fail of the same class. The **planner** may comment the same requirement. Neither writes the hook or rule. The **implement** PR lands it. Ratchet files use the write-scope exception in `docs/agents/write-scope.md` — they are not a write-scope miss on that issue. Prefer a hook over a new always-applied rule when a deny/allow gate would have caught it — do not grow `.cursor/rules/` for one-off mistakes.

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

### Seed development proof DB ratchet (KIT-34)

`.cursor/hooks/block-manual-seed-development-proof.sh` denies manual writes under `seed/mcp/proof-output/`. Agents record development-lane seed proof only via `scripts/record-seed-development-proof.sh`, which runs the committed `seed/mcp/scripts/verify-development-db.mjs` and `run-seed-apify-mcp-path.mjs` against the injected `DATABASE_URL` and writes `latest.txt`. `scripts/check-seed-development-proof-scripts.mjs` (CI via `pnpm check:seed-development-proof-scripts`) fails when those scripts are missing. Prevents repeating the KIT-34 checker fail (hand-typed dev-Postgres row counts in workpad/PR without a committed, executed verify path). Tighten only.

`.cursor/hooks/block-hand-typed-seed-db-counts.sh` denies `git commit` messages on seed-proof branches that hand-type squad/club count patterns without referencing `verify-dev-catalog` or `kit-34-verify-output.json`. Use `seed/mcp/scripts/verify-dev-catalog.mjs` (or the record script above) and paste its JSON output — do not type counts by hand. Tighten only.

### Seed FK development proof ratchet (KIT-35)

`scripts/record-seed-fk-development-proof.sh` records the chat-path `seed_fk` proof for Superliga 2017/18: baseline `verify-dev-catalog.mjs` (now includes kit/photo counts), two `run-seed-fk-mcp-path.mjs` invocations (live FK fetch + idempotent upsert), and post-verify catalog JSON. Requires `DATABASE_URL`, `FKAPI_BASE_URL`, and lane `R2_*` credentials — not fixture JSON. `scripts/check-seed-development-proof-scripts.mjs` also requires `run-seed-fk-mcp-path.mjs` and the FK record script. `.cursor/hooks/block-manual-seed-development-proof.sh` allows only the committed record scripts to write `seed/mcp/proof-output/`. Tighten only.

`scripts/check-seed-scope-isolation-test.mjs` (CI via `pnpm check:seed-scope-isolation-test`) fails when `seed/apify/tests/scope-isolation.test.ts` drops the cross-season isolation coverage (`runSeed` must not mutate `player_club_season` rows outside the requested scope). Prevents repeating the KIT-34 checker round-4 fail (2017/18 skip run mutating 2016/17). Tighten only.

`.cursor/hooks/block-seed-apify-test-on-shared-db.sh` denies `@kit/seed-apify` vitest/test invocations when `DATABASE_URL` points at the shared development Postgres and `SEED_APIFY_TEST_DATABASE_URL` is not set to a disposable test database. `scripts/check-seed-apify-test-database-isolation.mjs` (CI via `pnpm check:seed-apify-test-database-isolation`) fails when any `seed/apify/tests/**` file that calls `resetDatabase` reads `process.env.DATABASE_URL` for `resetDatabase`/`createDb`. Prevents repeating the KIT-34 checker round-6 fail (shared dev Postgres wiped by `resetDatabase` during local test runs). Tighten only.

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

### Admin stamdata navigation ratchet (KIT-39)

`scripts/check-admin-stamdata-navigation.mjs` (CI via direct `node` invocation in `.github/workflows/ci.yml`) fails when `apps/admin/src/pages/StamdataPage.tsx` `openRow` does not call `navigate(` for every `ADMIN_STAMDATA_LIST_ENTITY_TYPES` value (scoped to the `openRow` function body, not render-time branches), when `apps/admin/src/App.tsx` omits a drill route for club, season, kit, or club-season rows, or when an admin Data table page (`StamdataPage`, `CollectorsPage`) replaces the whole table (including `<thead>`) on loading/empty instead of only the `<tbody>` body. Prevents repeating the KIT-39 checker fails (plain club/season rows were a silent no-op on click; Stamdata loading/empty dropped the table header). Tighten only.

### Admin design-token ratchet (KIT-39)

`scripts/check-admin-design-tokens.mjs` (CI via direct `node` invocation in `.github/workflows/ci.yml`) fails when `apps/admin/src/styles/admin.css` omits `--border-focus` or `--scrim` tokens, lacks a `:focus-visible` rule referencing `var(--border-focus)`, sets invented effective `font-size`/`font-weight`/`line-height` triples outside the four locked `type.*` roles (including font-weight-only overrides that inherit body size/line-height), uses the wrong semantic token on the active Top tab underline (`fill.primary`, not `content.primary`), omits nested-radius shrink on `.login-card .field input`, uses non-compact chip inset (`space.inset.sm`), caps `.drill-page` to the Astro 960px column, or uses raw hex/`rgb`/`rgba` literals outside `:root`. Prevents repeating the KIT-39 checker fails on invented admin typography, missing focus rings, untokenized scrim, and wrong spacing/radius roles (passes 1, 3, and 5). Tighten only.

### Ops MCP catalog evidence ratchet (KIT-17)

`.cursor/hooks/block-manual-getmcptools-evidence.sh` denies manual writes under `.cursor/getmcptools-evidence/`. Agents record in-session catalog proof only via `scripts/record-getmcptools-evidence.sh <server>` fed with **this session's** `GetMcpTools` JSON. Prevents repeating the second KIT-17 checker fail (marking MCP-catalog AC complete without catalog evidence). Dashboard registration for Cloud Agents remains human-only (`KIT-18`). Tighten only.

### Implement/checker loop ratchet (KIT-23, tightened KIT-24)

`.cursor/rules/pre-review-gate.mdc` — implement must pass the mechanical gate (mergeable against the integration lane, full test graph, typecheck of packages whose tests you edited, all required GitHub checks including image/deploy smokes, boot-env class, matching helpers including the UI/layout helper when the issue cites the design lock, lock reads, AC/What-to-build evidence) before `In Review`. Checker must dump every hard finding in one fail (no drip-feed). A red CI job is not a Spec-clean license; pending checks are not a Standards-early-fail. Spec source is the whole issue body. Prevents repeating the KIT-23 five-round loop and the KIT-24 seven-round loop. Tighten only.

### FK seed test isolation ratchet (KIT-22)

`scripts/check-seed-fkapi-test-isolation.mjs` (CI via `pnpm check:seed-fkapi-tests`) fails when `seed/fkapi/tests/**` hardcodes Transfermarkt `external_id` values in prerequisite INSERTs, defines a local `seedApifyPrerequisites`, or calls `seedApifyPrerequisites` without an allocated `TestFixtureScope` from `seed/fkapi/tests/fixture-scope.ts`. Prevents repeating the KIT-22 checker fail (order-dependent unique-constraint collisions when tests share one DB pool). Tighten only.

### Push behind development ratchet (KIT-23)

`.cursor/hooks/block-push-behind-development.sh` denies `git push` when the current branch is behind `origin/development`. Prevents repeating the KIT-23 checker fail (unmergeable PR because the feature branch was never rebased after `development` moved). Pushes to `development`, `staging`, and `production` are exempt. Tighten only.

### Seed DB proof evidence ratchet (KIT-34)

`.cursor/hooks/block-hand-typed-seed-db-counts.sh` denies `git commit` messages on seed-proof work that hand-type development-lane squad/club row counts (e.g. `476 rows`, `14/14 clubs`, `fetched:0, skipped:14`) without referencing `verify-dev-catalog` or `kit-34-verify-output.json`. Run `seed/mcp/scripts/verify-dev-catalog.mjs` and paste its JSON output as evidence instead. Prevents repeating the KIT-34 checker fail (Linear/PR claims that contradict the live `DATABASE_URL`). Tighten only.

`scripts/check-seed-scope-isolation-test.mjs` (CI via `pnpm check:seed-scope-isolation-test`) fails when `seed/apify/tests/scope-isolation.test.ts` drops the cross-season isolation coverage (`runSeed` must not mutate `player_club_season` rows outside the requested scope). Prevents repeating the KIT-34 checker round-4 fail (2017/18 skip run mutating 2016/17). Tighten only.

`.cursor/hooks/block-seed-apify-test-on-shared-db.sh` denies `@kit/seed-apify` vitest/test invocations when `DATABASE_URL` points at the shared development Postgres and `SEED_APIFY_TEST_DATABASE_URL` is not set to a disposable test database. `scripts/check-seed-apify-test-database-isolation.mjs` (CI via `pnpm check:seed-apify-test-database-isolation`) fails when any `seed/apify/tests/**` file that calls `resetDatabase` reads `process.env.DATABASE_URL` for `resetDatabase`/`createDb`. Prevents repeating the KIT-34 checker round-6 fail (shared dev Postgres wiped by `resetDatabase` during local test runs). Tighten only.

### Mobile design-system inventory ratchet (KIT-23)

`.cursor/rules/design-system.mdc` requires flagging (not inventing) any `apps/mobile` screen or component not named in `docs/design-system.md` Scope §Included or Components inventory before writing it. Prevents repeating the KIT-23 checker fail (invented primitives like `Screen`/`FieldLabel` and unflagged auth-screen gaps). Tighten only.

### Workflow API boot env ratchet (KIT-23)

`scripts/check-workflow-api-boot-env.mjs` (CI via `pnpm check:workflow-api-boot-env`) fails when a `.github/workflows` `run:` step `docker run`s the API image (`kit-api` / `kit-deploy-api`) without `JWT_SECRET`. Prevents repeating the KIT-23 checker fail #4 (deployable image cannot boot because `IdentityModule` requires `JWT_SECRET` at Nest bootstrap). Tighten only — extend `REQUIRED_DOCKER_ENV` when new vars become mandatory at boot.

### Mobile tab bar anatomy ratchet (KIT-23)

`scripts/check-mobile-tab-bar.mjs` (CI via `pnpm check:mobile-tab-bar`) fails when `apps/mobile/app/(tabs)/_layout.tsx` omits `tabBarIcon` on Collection/Add tabs. Prevents repeating the KIT-23 checker fail #4 (text-only tabs against the locked icon+label Tab bar anatomy). Tighten only.

### Mobile design-token ratchet (KIT-24)

`scripts/check-mobile-design-tokens.mjs` (CI via `pnpm check:mobile-design-tokens`) fails when any `apps/mobile` `.ts`/`.tsx` file outside `src/theme/tokens.ts` contains a raw hex or `rgb`/`rgba` color literal. Prevents repeating the KIT-24 checker fails (invented Banner hex colors in round 3; unflagged Sheet scrim `rgba` and `surface.raised` gap in round 4). Tighten only.

### Mobile static color import ratchet (KIT-42)

`scripts/check-mobile-design-tokens.mjs` also fails when a collection-chrome `apps/mobile/src/components/**` file (except legacy capture allowlist entries), `apps/mobile/app/(auth)/**`, or any `apps/mobile/app/(tabs)/**` screen imports the static light-only `color` export from `@/theme/tokens` instead of `useTheme()` / `getThemeColors()`. Prevents repeating the KIT-42 checker round 2 fail (`Chip` Alle shortcut chip ignored dark mode). Tighten only — remove allowlist entries as capture/auth surfaces migrate.

### Mobile webfont fallback ratchet (KIT-42)

`scripts/check-mobile-design-tokens.mjs` also fails when a theme-aware collection-chrome file uses `fontFamily: type.*.fontFamily` or `fontSize: type.*.fontSize` in a StyleSheet instead of `useTypography()` from `@/theme/brand-fonts`, and when `apps/mobile/src/theme/brand-fonts.tsx` omits `resolveTypeRoles` / `useTypography`. Theme-aware scope includes `apps/mobile/app/(auth)/**` and all `apps/mobile/app/(tabs)/**` screens (no `add/` carve-out). Typography checks use a **separate** allowlist from the static-color import carve-out (`STATIC_TYPOGRAPHY_ALLOWLIST` vs `STATIC_COLOR_IMPORT_ALLOWLIST` in the script) so a file cannot dodge font-fallback enforcement by sitting on the color-migration allowlist. `apps/mobile/tests/brand-fonts.test.ts` asserts `resolveTypeRoles(false)` yields `system-ui` for every role. Prevents repeating the KIT-42 checker round 3 fail (webfont fallback dead code) and round 5 fail (allowlist reuse hid `photo-slot.tsx` regression). Tighten only.

### Mobile tab bar icon ratchet (KIT-42)

`scripts/check-mobile-tab-bar.mjs` also fails when `apps/mobile/src/components/floating-tab-bar.tsx` does not have exactly five icon render sites: four `renderSlot(` calls plus one center-plus `<Ionicons name="add"`. `scripts/tests/check-mobile-tab-bar.test.mjs` (CI via `node --test` in `.github/workflows/ci.yml`) imports `countIconRenderSites` and `checkMobileTabBar` from the real script (mirroring `check-pr-write-scope.test.mjs` → `scripts/lib/pr-write-scope.mjs`) and mutation-tests that removing a `renderSlot` call drops the count below five and fails `checkMobileTabBar({ barSource })`. Prevents repeating the KIT-42 checker round 3 fail (ratchet weakened to accessible-name substring match only) and round 6 fail (hand-duplicated counting logic in the self-test). Tighten only.

### Mobile semantic color key ratchet (KIT-42)

`scripts/check-mobile-design-tokens.mjs` also fails when `apps/mobile/src/theme/tokens.ts` `lightColor` or `darkColor` defines a semantic color key outside the closed allow-list matching `docs/design-system.md` Tokens (e.g. invented `tabBarFill` / `tabBarBorder` roles). Prevents repeating the KIT-42 checker round 6 fail (undocumented tab-bar color tokens in the semantic layer). Tighten only — extend the allow-list only when `/to-design` amends the locked Tokens table.

### Mobile tab-bar pixel-reserve ratchet (KIT-42)

`scripts/check-mobile-design-tokens.mjs` also fails when `apps/mobile/src/theme/tab-bar-layout.ts` exists or when any `apps/mobile/src/theme/**` file (except `tokens.ts`) exports `floatingTabBarLayout` / `tabBarReserve`. Prevents repeating the KIT-42 checker round 7 fail (named pixel-reserve token contradicting `docs/design-system.md` Layout constraints). Tighten only.

`scripts/check-mobile-design-tokens.mjs` also fails when any exported function under `apps/mobile/src/components/**` or `apps/mobile/app/**` composes three or more `space.*` tokens into a returned offset/reserve value **and** is imported by two or more `apps/mobile/app/(tabs)/**` screens — shape-based detection, not a name/path allow-list. `scripts/tests/check-mobile-design-tokens.test.mjs` (CI via `node --test`) imports `findComposedPixelReserveViolations` / `isComposedPixelReserveExport` from the real script and mutation-tests that a relocated `useTabBarContentPadding`-shaped helper reused across tab screens fails. Prevents repeating the KIT-42 checker round 8 fail (pixel-reserve constant evading the round-7 theme-path ratchet by moving to `shortcut-chip-row.tsx`). Tighten only.

### Mobile icon-button hit-target ratchet (KIT-42)

`scripts/check-mobile-design-tokens.mjs` also fails when an `apps/mobile/src/components/**` file has an icon-only `Pressable` (`accessibilityRole="button"` + `hitSlop={8}` + `<Ionicons`) without an explicit `minWidth`/`minHeight` 44 style — use `IconButton` or inline 44×44. Prevents repeating the KIT-42 checker round 7 fail (`Sheet` close button ~40×40). Tighten only.

### Vision log save-action ratchet (KIT-27)

`packages/api-contract/tests/vision-save-action.test.ts` (CI via `pnpm test`) fails when `resolveVisionSaveAction` does not return a `userAction` for every `VisionJobStatus`. `scripts/check-vision-log-save-action.mjs` (CI via `pnpm check:vision-log-save-action`) fails when `apps/mobile/app/(tabs)/add.tsx` does not call the shared resolver. `apps/api/tests/collection.test.ts` integration case **"sets VisionLog userAction when Save enqueues vision without client visionJobId"** fails when the server-side fallback enqueue path leaves `vision_log.user_action` null (lost/never-sent `visionJobId`). Prevents repeating the KIT-27 checker fail (VisionLog rows left with `userAction: null` at Save). Tighten only.

### PR write-scope ratchet (KIT-39)

`scripts/check-pr-write-scope.mjs` (CI via direct `node` invocation in `.github/workflows/ci.yml`; pure logic in `scripts/lib/pr-write-scope.mjs`, covered by `scripts/tests/check-pr-write-scope.test.mjs`) fails when a pull request's changed files (vs `origin/development`) fall outside the `write-scope:` globs declared in the PR body, except ratchet-exception paths (`.cursor/hooks/**`, `.cursor/rules/**`, `docs/agents/error-ratcheting.md`, `.github/workflows/**` for CI wiring, and the named ratchet script paths in `RATCHET_SCRIPT_PATHS`). When no `write-scope:` line is present, the check skips cleanly (exit 0) — write-scope is optional per `docs/agents/write-scope.md`. On `push` to feature branches without PR env vars, resolves scope from the open PR via `gh pr view` with `GITHUB_TOKEN`. Prevents repeating the KIT-39 checker fail (gratuitous edits outside declared issue scope, e.g. `seed/fkapi/tests/seed.test.ts` bundled into an admin slice). Tighten only.
