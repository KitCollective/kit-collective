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
| `.pi/generated/implement-context.md` | Generated PI implement overlay from `.cursor` — edit sources, run `node scripts/generate-pi-implement-context.mjs`; never hand-edit |
| `biome.json` / `oxlint.config.ts` | Format, lint, and anti-slop gates run in CI |
| `.pi/first-pass-classes.json` | Optional first-pass scanners (tighten only; empty `{ "classes": [] }` is the default) |
| `docs/agents/error-ratcheting.md` | This contract |

## Default factory ratchet

Command hooks on `beforeShellExecution` (fail closed). Scripts must print `{"permission":"allow"}` or `{"permission":"deny"}` on stdout — empty output is a hook failure.

1. `block-dangerous-git.sh` — no force-push, hard reset, `clean -f`, branch `-D`
2. `block-reward-hacks.sh` — no shell deletion of tests or `.github/workflows`
3. `protect-ratchet.sh` — no shell removal/emptying of `.cursor/hooks*`
4. `block-pi-ci-sleep.sh` — no `sleep` ≥ 10s, no `gh pr checks --watch`, no for/while poll of `gh pr checks`
5. `block-migration-prefix-collision.sh` — no `git add`/`commit` of `packages/db/migrations/NNNN_*.sql` when `origin/development` already has that prefix under another name

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

`scripts/check-seed-scope-isolation-test.mjs` (CI via `pnpm check:seed-scope-isolation-test`) fails when `seed/apify/tests/scope-isolation.test.ts` drops the cross-season isolation coverage (`runSeed` must not mutate `player_club_season` rows outside the requested scope). Prevents repeating the KIT-34 checker round-4 fail (2017/18 skip run mutating 2016/17). Tighten only.

`.cursor/hooks/block-seed-apify-test-on-shared-db.sh` denies `@kit/seed-apify` vitest/test invocations when `DATABASE_URL` points at the shared development Postgres and `SEED_APIFY_TEST_DATABASE_URL` is not set to a disposable test database. `scripts/check-seed-apify-test-database-isolation.mjs` (CI via `pnpm check:seed-apify-test-database-isolation`) fails when any `seed/apify/tests/**` file that calls `resetDatabase` reads `process.env.DATABASE_URL` for `resetDatabase`/`createDb`. Prevents repeating the KIT-34 checker round-6 fail (shared dev Postgres wiped by `resetDatabase` during local test runs). Tighten only.

### Code quality ratchet

`biome.json` (format + lint), `oxlint.config.ts` with the vendored plugin under
`tools/oxlint/anti-slop/`, and the CI steps `pnpm typecheck`, `pnpm format:check`,
`pnpm lint:anti-slop`. `typecheck` runs each package's `tsconfig.test.json`, so test
files are typechecked too. Tighten only.

Two rules are deliberately at warn, not error, and are the ratchet targets:

- `lint/style/noNonNullAssertion` (Biome) — the existing `!` sites are mostly
  `const [row] = await …returning()`. Ratchet to error once those reads carry a guard.
- `anti-slop/no-unsafe-dictionary-type` — the remaining sites are the raw Transfermarkt
  and Football Kit Archive payloads that `normalize()` and `normalizeRawKit` exist to
  parse. Ratchet to error once those adapters parse through a schema.

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

`scripts/check-workflow-api-boot-env.mjs` (CI via `pnpm check:workflow-api-boot-env`) fails when a `.github/workflows` `run:` step `docker run`s the API image (`kit-api` / `kit-deploy-api`) without `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL`. Prevents repeating the KIT-23 checker fail #4 class (deployable image cannot boot because Identity requires those names at Nest bootstrap). Tighten only — extend `REQUIRED_DOCKER_ENV` when new vars become mandatory at boot. Do not list `JWT_SECRET`; Nest no longer reads it.

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

### Mobile peer stub typography ratchet (KIT-121)

`scripts/check-mobile-peer-stub-typography.mjs` (CI via `pnpm check:mobile-peer-stub-typography`) fails when `ListPeerStubRow` in `apps/mobile/src/components/profile-ui.tsx` uses `typography.body` instead of locked `typography.headingSm` for the collector handle or initial badge (docs/design-system.md Type table — Thread row, conversation header, Detaljer stub parity). `scripts/tests/check-mobile-peer-stub-typography.test.mjs` imports `checkMobilePeerStubTypography` from the real script and mutation-tests that swapping either `{handle}` or `{initial}` to `typography.body` fails. Prevents repeating the KIT-121 checker fail (Detaljer stub handle on `type.body` while Thread row uses `headingSm`). Tighten only.

### Mobile semantic color key ratchet (KIT-42)

`scripts/check-mobile-design-tokens.mjs` also fails when `apps/mobile/src/theme/tokens.ts` `lightColor` or `darkColor` defines a semantic color key outside the closed allow-list matching `docs/design-system.md` Tokens (e.g. invented `tabBarFill` / `tabBarBorder` roles). Prevents repeating the KIT-42 checker round 6 fail (undocumented tab-bar color tokens in the semantic layer). Tighten only — extend the allow-list only when `/to-design` amends the locked Tokens table.

### Mobile tab-bar pixel-reserve ratchet (KIT-42)

`scripts/check-mobile-design-tokens.mjs` also fails when `apps/mobile/src/theme/tab-bar-layout.ts` exists or when any `apps/mobile/src/theme/**` file (except `tokens.ts`) exports `floatingTabBarLayout` / `tabBarReserve`. Prevents repeating the KIT-42 checker round 7 fail (named pixel-reserve token contradicting `docs/design-system.md` Layout constraints). Tighten only.

`scripts/check-mobile-design-tokens.mjs` also fails when any exported function under `apps/mobile/src/components/**` or `apps/mobile/app/**` composes three or more `space.*` tokens into a returned offset/reserve value **and** is imported by two or more `apps/mobile/app/(tabs)/**` screens — shape-based detection, not a name/path allow-list. `scripts/tests/check-mobile-design-tokens.test.mjs` (CI via `node --test`) imports `findComposedPixelReserveViolations` / `isComposedPixelReserveExport` from the real script and mutation-tests that a relocated `useTabBarContentPadding`-shaped helper reused across tab screens fails. Prevents repeating the KIT-42 checker round 8 fail (pixel-reserve constant evading the round-7 theme-path ratchet by moving to `shortcut-chip-row.tsx`). Tighten only.

### Mobile icon-button hit-target ratchet (KIT-42)

`scripts/check-mobile-design-tokens.mjs` also fails when an `apps/mobile/src/components/**` file has an icon-only `Pressable` (`accessibilityRole="button"` + `hitSlop={8}` + `<Ionicons`) without an explicit `minWidth`/`minHeight` 44 style — use `IconButton` or inline 44×44. Prevents repeating the KIT-42 checker round 7 fail (`Sheet` close button ~40×40). Tighten only.

### Vision log save-action ratchet (KIT-27)

`packages/api-contract/tests/vision-save-action.test.ts` (CI via `pnpm test`) fails when `resolveVisionSaveAction` does not return a `userAction` for every `VisionJobStatus`. `scripts/check-vision-log-save-action.mjs` (CI via `pnpm check:vision-log-save-action`) fails when `apps/mobile/app/(tabs)/add.tsx` does not call the shared resolver. `apps/api/tests/collection.test.ts` integration case **"sets VisionLog userAction when Save enqueues vision without client visionJobId"** fails when the server-side fallback enqueue path leaves `vision_log.user_action` null (lost/never-sent `visionJobId`). Prevents repeating the KIT-27 checker fail (VisionLog rows left with `userAction: null` at Save). Tighten only.

### Mobile collection UI evidence ratchet (KIT-43)

`scripts/check-mobile-collection-ui-evidence.mjs` (CI via `pnpm check:mobile-collection-ui-evidence`) fails when `apps/mobile/src/components/genveje-sheet.tsx` exists without the paired pure-logic module `apps/mobile/src/components/genveje-sheet-logic.ts`, vitest file `apps/mobile/tests/genveje-sheet.test.ts` importing that module with locked AC markers (Sheet titles `Genveje` / `Ny genvej`, Gem disabled until club, edit club label seed, manage-row `Flyt` name, delete-active fallback to Alle), or when the sheet omits `accessibilityLabel="Flyt"` on the manage drag-handle. `scripts/tests/check-mobile-collection-ui-evidence.test.mjs` (CI via `node --test`) mutation-tests the ratchet. Prevents repeating the KIT-43 checker round-2 fail (UI ACs ticked without mechanical evidence around the expo-sqlite-on-web blocker). Tighten only.

### Mobile wishlist UI evidence ratchet (KIT-133)

`apps/mobile/src/testing/wishlist-ui-evidence.ts` with vitest in `apps/mobile/tests/wishlist-ui-evidence.test.ts` (CI via `pnpm --filter @kit/mobile test -- wishlist-ui-evidence`) fails when `apps/mobile/src/components/wishlist-sheet.tsx` exists without the paired pure-logic module `apps/mobile/src/components/wishlist-sheet-logic.ts`, vitest file `apps/mobile/tests/wishlist-sheet.test.ts` importing that module with locked AC markers (Sheet titles `Ønske` / `Ny ønskerække`, empty-state one-sentence body via `resolveWishlistEmptyBody`, Gem disabled until a criterion), when the sheet uses an empty `EmptyState` body, a nested Sheet for season pick instead of `SeasonPickerOverlay` + `ListRow`, omits `borderSubtle` hairlines between grouped manage rows, when `apps/api/src/wishlist/wishlist.service.ts` `writeToValues` mints dummy `id`/`userId` or returns `WishlistRow` instead of criteria-only values, or when `packages/domain/src/wishlist.ts` carries narrating JSDoc on `hasWishlistCriterion` / `buildWishlistAndMeta` / `buildWishlistAutoName`. The same vitest file mutation-tests the ratchet via `checkMobileWishlistUiEvidence` overrides. Prevents repeating the KIT-133 checker fail (empty-state anatomy, nested season Sheet, list-row hairlines, API slop). Tighten only.

### Mobile custom drag-reorder ratchet (KIT-44)

`scripts/check-mobile-drag-reorder.mjs` (CI via `pnpm check:mobile-drag-reorder`) fails when `apps/mobile/src/components/genveje-sheet.tsx` uses `PanResponder`, omits `react-native-gesture-handler` + `react-native-reanimated` + `useSharedValue` for drag offset, when `styles.dragHandle` lacks `minWidth`/`minHeight` 44, or when `Gesture.Pan().onUpdate` calls `runOnJS`/`scheduleOnRN` (per-frame RN-runtime bridge). `scripts/tests/check-mobile-drag-reorder.test.mjs` (CI via `node --test`) mutation-tests the ratchet. Prevents repeating the KIT-44 checker round-2/3 fails (undersized drag handle, banned `PanResponder`/per-frame `setState`, and per-frame `runOnJS` in `onUpdate` on the same reorder surface). Tighten only.

### Mobile add form-wiring ratchet (KIT-48)

`scripts/check-mobile-add-form-wiring.mjs` (CI via `pnpm check:mobile-add-form-wiring`) fails when a `TextInput` under `apps/mobile/app/(tabs)/add/**` is bound to local `useState` but never wired to capture-session `mutate`/save, when `apps/mobile/app/(tabs)/add/confirm.tsx` saves photos with one route-level `defaultPhotoSource` instead of per-photo `photo.source`, or when the Flere detaljer notes field is not stored on the capture-session draft via `setDraftNotes`/`draft.notes`. `scripts/tests/check-mobile-add-form-wiring.test.mjs` (CI via `node --test`) mutation-tests the ratchet. Prevents repeating the KIT-48 checker round-3 fail (notes TextInput silently disconnected; gallery-first photos mislabeled as camera at Save). Tighten only.

### Mobile add confirm-redirect ratchet (KIT-48)

`scripts/check-mobile-add-confirm-redirect.mjs` (CI via `pnpm check:mobile-add-confirm-redirect`) fails when `apps/mobile/app/(tabs)/add/confirm.tsx` redirects on `!state` before `usePersistedCaptureSession` exposes `isSessionResolved`, when the hook omits synchronous `loadPersistedCaptureSession` on first render, or when `apps/mobile/tests/confirm-redirect.test.ts` drops the regression case for redirect deferred until session lookup resolves. `scripts/tests/check-mobile-add-confirm-redirect.test.mjs` (CI via `node --test`) mutation-tests the ratchet. Prevents repeating the KIT-48 checker round-4 fail (Confirm self-redirects to the chooser on every mount before the persisted session loads). Tighten only.

### Mobile add upload-files ratchet (KIT-48)

`scripts/check-mobile-add-upload-files.mjs` (CI via `pnpm check:mobile-add-upload-files`) fails when `apps/mobile/app/(tabs)/add/index.tsx` bypasses `pickUploadFiles` for Upload filer, when `apps/mobile/src/capture/pickUploadFiles.ts` omits a `pickDocumentImages` branch, when `apps/mobile/src/capture/pickDocumentImages.ts` does not use `expo-document-picker`, or when `apps/mobile/tests/pick-upload-files.test.ts` drops the Files/documents regression case. `scripts/tests/check-mobile-add-upload-files.test.mjs` (CI via `node --test`) mutation-tests the ratchet. Prevents repeating the KIT-48 checker round-4 fail (Upload filer only opens the Photos library). Tighten only.

### Mobile add camera-resume ratchet (KIT-48)

`scripts/check-mobile-add-camera-resume.mjs` (CI via `pnpm check:mobile-add-camera-resume`) fails when `apps/mobile/app/(tabs)/add/capture.tsx` does not resolve a resumable camera session on mount, pass resumed photos into `CaptureCameraSession` `initialPhotos`, or clear the active camera pointer when navigating to Confirm; when `apps/mobile/src/capture/captureSessionPersistence.ts` omits `resolveResumableCameraSession` or does not mark the active in-progress session when persisting camera shots; when `apps/mobile/src/capture/captureSessionActivePointer.ts` omits `getActiveCameraCaptureSessionId`; when `apps/mobile/src/capture/CaptureCameraSession.tsx` omits `initialPhotos`; or when `apps/mobile/tests/capture-session-persistence.test.ts` drops the camera-resume or atomic-replace regression cases. Prevents repeating the KIT-48 checker round-6 fail (SQLite writes per shot but CaptureScreen remount could not recover them). Tighten only.

### Mobile capture dead-export ratchet (KIT-48)

`scripts/check-mobile-capture-dead-exports.mjs` (CI via `pnpm check:mobile-capture-dead-exports`) fails when `apps/mobile/src/capture/captureFlow.ts` keeps dead `createPersistedCaptureSessionFromPhotos` after the persistence refactor or places re-exports between import blocks instead of grouping imports at the top. Prevents repeating the KIT-48 checker round-1/round-6 fail (leftover dead code after capture refactors). Tighten only.

### Mobile paywall IAP ratchet (KIT-134)

`scripts/check-mobile-paywall-iap.mjs` (CI via `node scripts/check-mobile-paywall-iap.mjs`) fails when `apps/mobile/package.json` omits a declared `react-native-iap` dependency while `apps/mobile/src/components/paywall-sheet.tsx` exists, when `apps/mobile/src/premium/react-native-iap.d.ts` hand-rolled ambient stub remains, when `apps/mobile/src/premium/native-store-billing.ts` omits a SAFETY-justified `require("react-native-iap")`, when the paywall dock uses the wrong Button variants (Månedlig primary, Årlig secondary, Gendan køb tertiary — not secondary for Restore), when paywall source hardcodes kroner display prices, omits `typography.mono` for store prices, or when `apps/mobile/src/premium/store-billing-client.ts` `require`s the native IAP module without a `SAFETY:` justification. `scripts/tests/check-mobile-paywall-iap.test.mjs` (CI via `node --test`) mutation-tests the ratchet. Prevents repeating the KIT-134 checker fail (dropped store SDK seam, ambient declare-module stub, wrong Button dock variants, hardcoded prices, and anti-slop SAFETY miss on native IAP require). Tighten only.

### Mobile inbox conversation chrome ratchet (KIT-118)

`apps/mobile/tests/inbox-conversation-chrome.test.ts` and `apps/mobile/tests/message-composer-field-border.test.ts` (CI via `pnpm test` / `@kit/mobile` vitest) fail when wide inbox Samtale on `apps/mobile/app/(tabs)/inbox/index.tsx` auto-selects `conversations[0]`, races `loadConversations()` in parallel with GET detail on open, omits `setConversationVisible` / `refreshUnreadCount` wiring, when `apps/mobile/src/components/floating-tab-bar.tsx` does not hide on `conversationVisible`, when `apps/mobile/src/components/conversation-view.tsx` omits `onConversationOpened`, or when `apps/mobile/src/components/message-composer.tsx` omits locked focus tokens via `composerFieldBorder`. Prevents repeating the KIT-118 checker fail (wide Samtale kept the Tab bar, auto-marked read, stale unread badge, composer focus tokens). Tighten only.

### Implement ADW production gh ratchet (KIT-54)

`harness/tests/implement-adw.test.mjs` drives `createGhClient` / `createTypecheckTouched` with fake `runCommand` only (not injected `fakeGh`). Coverage that must stay:

- **"production createGhClient pushes the rebased head, waits through pending required checks, and ignores optional pending"** — rebase is followed by a push of the issue branch, `gh pr create` has `--head` and non-empty `--body` (non-interactive `gh` requires both `--title` and `--body`), a first pending required-check snapshot never becomes green before Linear `setStatus`, optional pending checks must not block.
- **"resolvePrCreateBody and createPr always send non-empty --body (non-interactive gh)"** — omitting `body` still passes `--body` with a default; blank body is rejected in favor of the default (KIT-150: `must provide --title and --body`).
- **"production createGhClient does not move to In Review on MERGEABLE empty rollup when required checks are pending"** — `MERGEABLE` + empty `statusCheckRollup` + `gh pr checks --required` throw (exit 8) must **not** call `setStatus`.
- **"typecheckTouched skips pnpm when the diff has no workspace packages"** — empty touched set does not spawn `pnpm`.
- **"typecheckTouched fails closed when pnpm is missing and workspace packages are touched"** — missing `pnpm` (ENOENT) fails closed when packages are in the diff.
- **"completeImplementAdw skips worker typecheck when the open PR is MERGEABLE and required checks are already green"** — do not spawn worker `pnpm typecheck` when GitHub `test` is already SUCCESS (KIT-116 parked on local typecheck despite green CI).
- **"completeImplementAdw still moves to In Review when worker typecheck fails and GitHub required checks are green"** — a throwing worker typecheck does not abort implement-exit; GitHub required checks remain the gate.

`scripts/check-implement-adw-production-gh.mjs` (CI via `node` in `.github/workflows/ci.yml`) fails when that coverage is deleted. `scripts/tests/check-implement-adw-production-gh.test.mjs` mutation-tests the ratchet. Prevents repeating KIT-54 checker fail #2 (job-seam fakes skipped production push/wait) and fail #3 (empty rollup / exit 8 fail-open; pnpm spawned on harness-only diffs), and KIT-150 (PR create without `--body` in non-interactive `gh`). Tighten only.

### Factory CI test-job ratchet (KIT-75)

`scripts/check-factory-ci-tests.mjs` (CI via `pnpm check:factory-ci-tests` in `.github/workflows/ci.yml`) fails when the required GitHub `test` job omits harness node tests or webhook-router / land-policy factory-script tests, or when existing mobile check-scripts leave that job. Needles are asserted on expanded `run:` / script bodies only — a step title that names `land-policy` does not satisfy coverage if the script body dropped it. `scripts/tests/check-factory-ci-tests.test.mjs` mutation-tests the ratchet. Prevents repeating the KIT-75 checker fail (colocating the check-script under `.github/workflows/` and matching factory needles from the step name). Tighten only.

### Checker pass workpad ratchet (KIT-106)

`harness/tests/checker.test.mjs` (`clean workpad + MERGEABLE + green checks moves to Ready for merge`) and `factory-checker workpad records Grok token counts` in `harness/tests/token-use.test.mjs` keep these locks:

- Checker pass updates the existing workpad (same comment) with `All good — checker pass` under `### Status`.
- `### Review feedback` stays exactly the three-axis pass lines (`- Spec: (none)`, `- Standards: (none)`, `- Slop: (none)`) so `reviewFeedbackIsClean` remains true.
- Checker pass keeps `### Loop counters` (preserves counts, or writes `ciFailCycles: 0` / `reviewLoops: 0` when Pi stripped the heading) so Auto-merge can parse the cap.
- Factory-checker token use lands on that same workpad after pass.

Prevents repeating the KIT-105 silent pass (status flip only, no durable note or token line). Tighten only.

### Factory checker spawn ratchet (KIT-56)

`scripts/check-factory-checker-spawn.mjs` (CI via `pnpm check:factory-checker-spawn`) fails when factory-checker loses mechanical spawn allowlist (`harness/checker-spawn.mjs` + `harness/factory-checker-tools.ts`), `linear_cli` host-tool wiring, explicit three-axis pass verdict guard (`reviewFeedbackIsClean`), missing Slop axis guard (`reviewFeedbackMissingSlopAxis`), three-axis pass lines (`REVIEW_PASS_FEEDBACK_LINES`), read-only Slop sub-agent (`.pi/agents/slop.md` + `SLOP_AGENT_MEMORY_EXCLUDED_TOOLS`), `subagent` on parent allowlist, missing-PR fail-move, or GitHub wait timeout fail-move. Prevents repeating the KIT-56 checker fail (prompt-only tool deny and silent pass on missing/empty `### Review feedback`). Tighten only.

### Factory checker Slop axis ratchet (KIT-126)

`harness/tests/checker.test.mjs` (`missing Slop axis fails`, `three-axis pass`, `Slop findings preserved with Spec and Standards`, `factory-checker allowlist includes subagent and Slop child excludes memory writes`, `slopAgentToolArgs excludes memory writes`) and `scripts/tests/check-factory-checker-spawn.test.mjs` keep these locks:

- `/code-review` runs Spec, Standards, and Slop in one pass — not as a pre-gate.
- `reviewFeedbackIsClean` requires exactly `- Spec: (none)`, `- Standards: (none)`, `- Slop: (none)`; bare `- (none)` is rejected.
- `applyCheckerFailWorkpad` never falls back to legacy `- (none)` — use `REVIEW_FEEDBACK_HARNESS_INCOMPLETE` instead.
- Read-only Slop child: `applySlopAgentSpawnEnv()` calls `slopAgentToolArgs()` at factory-checker spawn; `harness/slop-agent-tools.ts` (via `.pi/agents/slop.md` `subagentOnlyExtensions`) and `harness/factory-checker-tools.ts` consume `SLOP_AGENT_MEMORY_EXCLUDED_TOOLS` + `SLOP_AGENT_PI_ARGS`.
- **`SLOP_AGENT_PI_ARGS` is newline-joined, never NUL** — Node `spawn` rejects env values with `\0` (KIT-116 factory-checker never started). `"applySlopAgentSpawnEnv calls slopAgentToolArgs and wires both env keys"` asserts no null byte and round-trips via `split("\\n")`.

Prevents repeating the KIT-126 checker fail (dead `SLOP_AGENT_MEMORY_EXCLUDED_TOOLS` export, stale `- (none)` fail fallback, incomplete spawn-ratchet doc). Tighten only.

### Webhook mem_limit (KIT-116 OOM)

`harness/tests/compose-worker.test.mjs` (`docker-compose runs webhook + one replica`) requires `mem_limit: 5g` and forbids `768m`. `harness/host.md` names **mem_limit 5g**. Prevents repeating the KIT-116 factory-checker `pi exited null` (cgroup OOM while implement KIT-119 was live). Tighten only.

### Implement write-scope retry (KIT-119)

`harness/tests/implement-ci-retry.test.mjs` (`job-queue re-runs implement on write-scope retry until In Review`) keeps the slot on `{ writeScopeRetry: true }` the same way as CI retry. The cheap-retry bound **yields** the slot instead of a retry-cap hold. Prevents repeating KIT-119 sitting Implementing with an empty slot after an out-of-glob path (`apps/admin/...`) while resume skipped it for write-scope overlap. Tighten only.

### Implement Gate format-check and cheap retry

`scripts/check-implement-cheap-retry.mjs` (CI via `node` in `.github/workflows/ci.yml`) plus `harness/tests/implement-adw.test.mjs` / `harness/tests/implement-ci-retry.test.mjs` / `harness/tests/resume.test.mjs` keep these locks:

- Gate (`.pi/agents/gate.md`) runs `pnpm format:check` or `biome ci .`. Format-fail is red. Do not treat format as typecheck. Typecheck may be yellow.
- Worker image installs global `@biomejs/biome@2.5.10` so Gate does not need worktree `node_modules`.
- `completeImplementAdw` format-check is a safety net after Pi: a throwing `formatCheck` runs Mechanical close (`formatApply` / `biome check --write`) first. Apply success + re-check green reaches In Review without `formatRetry`. Apply missing or still-red stays Implementing (`formatRetry: true`) even when GitHub required checks are green, **except** maxBuffer / ENOBUFS (`isFormatInfraError`) which is infra — not format-red — and still reaches In Review when GitHub is green (KIT-125 / KIT-130).
- A CONFLICTING PR during the GitHub wait is rebased in-process (`conflictRebase`, cap 3). After the cap or a real conflict abort, implement-exit writes conflict feedback and `ciRetry` with `ciFailureClass: "logic"` (full Builder, not slim). A required-check log that is biome/`format:check` only is applied in-process (`classifyCiFailure` → `format`). Outdated lockfile (`ERR_PNPM_OUTDATED_LOCKFILE`) is applied in-process (`classifyCiFailure` → `lockfile` → `pnpm install --lockfile-only`). Logic / unknown CI still retries Pi; `shouldSlimCheapRetry` keeps slim context only for mechanical classes (format/lockfile/migration) and write-scope/first-pass — not logic/unknown.
- Green light (pre-Gh-wait): format mechanical + lockfile mechanical + clean-tree before rebase; workpad honesty claims are verified against git/CI before In Review.
- Stuck Review feedback (same fingerprint ≥ `STUCK_FEEDBACK_CAP`) parks the issue (`Parked` + `ready-for-human`). Checker Spec-green requires Evidence/Validation/AC ticks (`evaluateSpecEvidenceFloor`).
- First-pass pack (`harness/first-pass.mjs` + `.pi/first-pass-classes.json`): ticket/workpad slice brief + Hermes top-3 in implement append (slim append on cheap/first-pass resume); `collectFirstPassViolations` before In Review uses **registry scanners only** → `firstPassRetry`. Checker tags `[first-pass:<id>]` when registry matches; 2× same Standards/Slop class bumps `### First-pass candidates` and requires a JSON ratchet land. Checker-fail that is only tagged first-pass uses First-pass resume (Skip Scout/helpers). Do not spawn Gate — Mechanical close owns format/typecheck. Helpers spawn one at a time (nest → drizzle → expo → ui-ux).
- First implement run still Scout → helpers → Gate. `{ ciRetry: true }` / `{ writeScopeRetry: true }` / `{ formatRetry: true }` retries **Skip Scout** and skip helpers. Prompt includes workpad `### Review feedback` and requires the CI excerpt, pointing at the class (format vs lockfile vs migration prefix). Cheap retry is the **same Implementing stay**, not a new try.
- Cheap retries do **not** increment `reviewLoops` / `ciFailCycles`, do **not** post `implementRetryCapComment`, and do **not** make resume skip. After the cheap-retry bound the slot yields; resume may enqueue again. Stale retry-cap comments do not hold Implementing.

Prevents repeating KIT-125 (five false format cheap-retries → retry-cap hold, never In Review while GitHub was green). Tighten only.

### Implement checker-fail resume findings (KIT-116)

`scripts/check-implement-checker-fail-resume.mjs` (CI via `node` in `.github/workflows/ci.yml`) plus `harness/tests/implement-ci-retry.test.mjs` / `harness/tests/role-comments.test.mjs` / `harness/tests/checker.test.mjs` keep these locks:

- Checker-fail implement resume uses the same `extractReviewFeedback` as cheap CI retry and **inlines** `### Review feedback` in the Composer prompt. Fix **every** workpad axis (Spec / Standards / Tests / Slop). GitHub `[factory-checker/slop]` threads are a subset.
- Bounce from Review is **Builder resume from Review**: Skip Scout; Skip Draft unless a new write-scope scaffold is required; spawn only helpers the findings need. Cheap retry (`{ ciRetry: true }` / `{ writeScopeRetry: true }` / `{ formatRetry: true }`) still Skip Scout/helpers entirely.
- Spawn `ui-ux` when write-scope touches `apps/mobile` / `apps/web` / `apps/admin`, or when findings mention tokens, typography, or layout. The box reads `.pi/roles/implement.md` — not Cursor skills.
- `checkerFailComment` includes the finding lines under Spec / Standards / … headings (KIT-116-class 2–5 findings verbatim; huge dumps truncate with a workpad pointer). One role comment per transition. Linear Agent stays empty.

Prevents repeating KIT-116 loop 2 (resume prompt was only «fix the class»; GitHub Slop showed unused; Nicklas could not read Standards on Linear). Tighten only.

### Factory checker Slop GitHub threads ratchet (KIT-127)

`scripts/check-factory-checker-spawn.mjs` and `scripts/tests/check-factory-checker-spawn.test.mjs` keep these locks:

- `completeChecker` fail with a linked PR always calls `syncSlopReviewThreadsSafely` (empty Slop findings still resolve stale `[factory-checker/slop]` threads).
- `syncSlopReviewThreadsSafely` isolates GitHub sync errors so Linear still moves to Implementing or Ready for merge.
- `harness/slop-review.mjs` posts inline comments only for postable Slop hunks (`isPostableSlopFinding`); pathless `Slop/` lines still trigger stale-thread resolve.
- `resolveReviewThread` / `gh_cli resolve_thread` refuse non-marker review threads.

`harness/tests/checker.test.mjs` and `harness/tests/slop-review.test.mjs` cover fail sync with clean Slop axis, sync throw isolation, pathless findings, and non-marker resolve refusal. Prevents repeating the KIT-127 checker fail (empty-findings skip, unisolated GitHub throws, pathless Slop gating, resolve without marker check). Tighten only.

### Issue PR head checkout ratchet (KIT-105)

`harness/tests/worktree-head.test.mjs` plus `implement ADW reuses the open issue PR and does not create a second` in `harness/tests/implement-adw.test.mjs` keep these locks:

- Checker reuse without `origin/kit-n` and without an open issue PR throws `no issue head` and must not `worktree add` from `origin/development`.
- A single open PR head (`nicklas/kit-n-…`) is the checkout start point; a stale `KIT-n` worktree is moved onto that head.
- Two open PRs whose titles start with the identifier fail closed.
- `completeImplementAdw` reuses `findOpenIssuePr` and must not call `createPr` when that issue already has an open `development` PR.
- Implement checkout and `gh.rebase` fetch the integration lane with `+development:refs/remotes/origin/development` (and `+kit-n:refs/remotes/origin/kit-n` for the issue head) so a stale local tracking ref does not fail closed on non-fast-forward.

Prevents repeating the KIT-47 checker that reviewed a local `kit-47` cut from `development` while PR #45 lived on `nicklas/kit-47-…`, and a second PR after `gh pr view` in that tree saw nothing. Tighten only.

### PR lane ratchet (KIT-102)

`.cursor/hooks/block-pr-lane.sh` denies `gh pr create` without `--base development`, and denies `--base production` / `--base staging` except the promotion pairs (`--head development` → staging, `--head staging` → production). Prevents repeating the KIT-101/KIT-100 land onto `production` when that was the repo default. GitHub default branch is `development`; rulesets `lane-development` / `lane-staging` / `lane-production` require a PR (production also requires one approving review). Tighten only.

### Pi helper model pin (Kimi default)

Unpinned `.pi/agents` (nest/expo/drizzle/ui-ux/devops/slop) made Pi bill OpenRouter `moonshotai/kimi-k2.6` via `KIT-Pi-harness`. `scripts/generate-pi-implement-context.mjs` and `.pi/agents/slop.md` pin `model: cursor/composer-2.5`. `harness/tests/implement-adw.test.mjs` and `scripts/tests/check-pi-implement-context-generated.test.mjs` lock the pin. Prevents repeating 89 Kimi generations after the Hy3 Scout/Gate pin already shipped. Tighten only.

### Pi Scout/Gate Hy4 (workspace guardrail)

OpenRouter workspace guardrail allows only `tencent/hy4-preview` on every workspace key. Scout and Gate pin `openrouter/tencent/hy4-preview` (`thinking: off`, `fallbackModels: cursor/composer-2.5`). `tencent/hy3` is ineligible and Composer-fallbacks. `harness/tests/implement-adw.test.mjs` locks the slug. Tighten only.

### Pi Scout/Gate Hy3 with MiMo-Pro crossed fallback

`KIT-Pi-harness` key allowlist includes Hy3 and MiMo-V2.5-Pro. Scout pins `openrouter/tencent/hy3` (`thinking: off`) with `fallbackModels: openrouter/xiaomi/mimo-v2.5-pro, cursor/composer-2.5`. Gate pins `openrouter/xiaomi/mimo-v2.5-pro` with `fallbackModels: openrouter/tencent/hy3, cursor/composer-2.5`. Hy4 stays off the pin. `harness/tests/implement-adw.test.mjs` locks both slugs and fallback order. Tighten only.

### Drizzle migration prefix collision (KIT-125)

`scripts/lib/migration-prefix.mjs` (`findMigrationPrefixCollisions`, `nextMigrationPrefix`) plus `scripts/check-migration-prefixes.mjs` (CI via `node` in `.github/workflows/ci.yml`) fail when a PR adds `packages/db/migrations/NNNN_*.sql` whose prefix already exists on `origin/development` under a different filename. CI fetches `origin/development` and fails closed when added SQL has no lane listing. `harness/implement-exit.mjs` checks the **worktree** (`git ls-files`) before rebase/CI wait — not `gh pr diff` — so a local rename is not a false collision against a stale remote PR. Cheap-retry (`migrationRetry`) names the next prefix and requires a commit; rebase then force-with-lease pushes. `.cursor/hooks/block-migration-prefix-collision.sh` denies a colliding `git add`/`commit`, including `git add packages/db/migrations`. `.cursor/agents/db-drizzle.md` requires `git ls-tree origin/development` and a commit. Prevents repeating KIT-125 sitting CONFLICTING after KIT-123 landed `0009_user_jersey_favorite.sql` while the open PR still had `0009_user_account_fields.sql`, and the loop where implement renamed locally to `0011_` but exit kept reading the remote 0009. Tighten only.

### Mobile profile settings hub ratchet (KIT-125)

`scripts/check-mobile-profile-settings-hub.mjs` (CI via `node scripts/check-mobile-profile-settings-hub.mjs` in `.github/workflows/ci.yml`; logic covered by `scripts/tests/check-mobile-profile-settings-hub.test.mjs`) fails when `apps/mobile/app/(tabs)/profile/indstillinger.tsx` drops one of the four locked `SettingsSectionLabel` strings from `docs/design-system.md` §5, when `kontoindstillinger.tsx` omits email `Skift` → `skift-email` or phone trailing `Skift`, or when live prefs drill screens use factory jargon. Prevents repeating the KIT-125 checker fail (missing hub section label, no-op email Skift, inline phone field, lock-speak helper, factory-jargon prefs copy). Tighten only.

### Implement write-scope worktree allowlist

`scripts/lib/pr-write-scope.mjs` (`resolveWriteScopeViolations`, `isRatchetShapedPath`) plus `harness/implement-exit.mjs` (`loadWriteScopeEvaluator`) keep this lock: the webhook image allowlist is the floor; a worktree copy of `pr-write-scope.mjs` may waive only `scripts/check-*.mjs` and `scripts/tests/check-*.test.mjs`. `package.json`, `harness/**`, and other product paths stay violations even if the worktree finder returns `[]`. `harness/tests/implement-adw.test.mjs` and `scripts/tests/check-pr-write-scope.test.mjs` cover the waiver and the non-waiver. Prevents repeating the KIT-118 write-scope retry loop (branch added a new inbox-chrome ratchet to `RATCHET_SCRIPT_PATHS`; GitHub CI used the branch copy and passed; implement-exit used the stale image copy and retried). Tighten only.

### Pi CI-sleep hook

`.cursor/hooks/block-pi-ci-sleep.sh` (wired in `.cursor/hooks.json`, tests in `.cursor/hooks/tests/block-pi-ci-sleep.test.mjs`, CI via `node --test` in `.github/workflows/ci.yml`) denies `sleep` of 10 seconds or more, any `sleep` chained with `gh pr checks`, `gh pr checks --watch`, and `for`/`while` loops that call `gh pr checks`. A single `gh pr checks` snapshot stays allowed. Prevents repeating KIT-118 implement sessions that `sleep 30/60/90` and poll checks instead of exiting so the harness can wait. Tighten only.

### English code identifiers (Pi implement / helper / checker)

`.cursor/rules/code-english.mdc` is always-applied and listed in `harness/implement-context.mjs` `ALWAYS_RULES`, so Pi first-run / checker-fail injects it via `.pi/generated/implement-context.md`. Implement and factory-checker role files plus the first-run / checker-fail prompts repeat the one-liner. Generated Pi helpers get the same sentence. Checker `/code-review` Standards treats new Danish identifiers as a hard finding. `.cursor/hooks/block-danish-code-identifiers.sh` denies `git add`/`commit` whose diff vs `HEAD` adds a declaration whose name includes a Danish stem (`indstillinger`, `fødselsdag`, `adgangskode`, …). UI copy and shipped Expo route slugs stay Danish. Prevents repeating Pi writing Danish into symbols while Nicklas’s Cursor user rule was Desktop-only. Tighten only.

### PR write-scope ratchet (KIT-39)

`scripts/check-pr-write-scope.mjs` (CI via direct `node` invocation in `.github/workflows/ci.yml`; pure logic in `scripts/lib/pr-write-scope.mjs`, covered by `scripts/tests/check-pr-write-scope.test.mjs`) fails when a pull request's changed files (vs `origin/development` via two-dot `..`, not three-dot `...`, so merge-commits from the base are excluded) fall outside the `write-scope:` globs declared in the PR body, except ratchet-exception paths (`.cursor/hooks/**`, `.cursor/rules/**`, `docs/agents/error-ratcheting.md`, `.github/workflows/**` for CI wiring, and the named ratchet script paths in `RATCHET_SCRIPT_PATHS`). When no `write-scope:` line is present, the check skips cleanly (exit 0) — write-scope is optional per `docs/agents/write-scope.md`. On `push` to feature branches without PR env vars, resolves scope from the open PR via `gh pr view` with `GITHUB_TOKEN`. Prevents repeating the KIT-39 checker fail (gratuitous edits outside declared issue scope, e.g. `seed/fkapi/tests/seed.test.ts` bundled into an admin slice) and the KIT-117 implement fail (merge-commits from `development` inflated PR #119 to 84 files while the issue diff was 22). Tighten only.

### Factory lock docs ratchet (KIT-114)

`harness/tests/harness-docs-locks.test.mjs` fails when generated `AGENTS.md` / `CONTEXT.md` orchestration omit empty Linear Agent, one role comment per transition, description AC on checker pass, or Auto-merge without Pi; when `WORKFLOW.md` still skips Implementing without Pi or keys Auto-merge on Pi delegate; when ADR-0025 loses its supersession note; or when `docs/agents/automations.md` omits land success/fail role comments. Prevents repeating the KIT-114 checker fails (Pi-delegate leftovers in factory locks, unregenerated `AGENTS.md`, rewritten ADR body, land-fail lock missing a role comment). Tighten only.
