# Device flows

A slice that touches `apps/mobile/**` proves itself with **its own Device flow**, `apps/mobile/.maestro/slices/<KEY>.yaml`, written in the same PR and run on the approver's Mac against an iOS Simulator build. The five flows that used to be the gate are the **regression set** under `regression/`, run only on request. Decisions: `docs/adr/0048-device-flows-as-pr-evidence.md`, changed by `docs/adr/0049-slice-flows-queue-and-native-cache.md`. Terms (**Device flow**, **Test Collector**, **Evidence run**, **Design finding**): `CONTEXT.md`.

## Write the slice flow

Copy `slices/TEMPLATE.yaml.example` to `slices/KIT-<n>.yaml` (`name: kit-<n>`). Cover only what this issue changes:

- one `takeScreenshot` per Acceptance criterion that a screen can show, named `kc__kit-<n>__NN-what-it-shows`, with a comment above it naming the criterion;
- reach the screen through `../subflows/sign-in.yaml` (Test Collector, data reset) or, for a signed-out slice, reset and launch with `clearState` as that subflow does; do not replay other issues' screens;
- tap by `testID`; a control a step must tap gets its `testID` in this PR (not a UI change);
- the header comment `# design-sections: Sheet, Button dock` names the `docs/design-system.md` sections the review reads besides Color, Typography, Spacing and Layout.

A slice with no screen to show (API only, a reducer) has no slice flow and no `Device flows` status; say so in the PR. The checker reads the flow against the Acceptance criteria: a criterion a screen could show with no step behind it, or a step that screenshots a screen the slice did not change, is a Spec finding.

Regression flows (`E2E_FLOWS=regression`): run them at a milestone, before a promotion to `staging`, or when a slice changes something several screens share (a token, a shared component). They cover:

| Flow | Signs in as | Steps (one screenshot each) |
| --- | --- | --- |
| `first-session` | signed out | `01-welcome`, `02-demo-result`, `03-door`, `04-door-invalid-email`, `05-code` |
| `add-jersey` | Test Collector | `01-source-sheet`, `02-confirm`, `03-details`, `04-ready-to-save`, `05-saved`, `06-collection` (the system photo picker between the first two is tapped through, not screenshotted) |
| `collection` | Test Collector | `01-collection`, `02-shortcut-filter`, `03-own-detail` |
| `search-bid` | Test Collector | `01-typeahead`, `02-catalog-drill`, `03-foreign-detail`, `04-send-bid`, `05-amount-entered`, `06-bid-sent` |
| `wishlist-paywall` | second test Collector | `01-wishlist`, `02-paywall` |

Every flow first calls `POST /v1/e2e/test-data`, so flows are independent and a re-run starts from the same rows. A screenshot is `kc__<flow>__<step>.png`; a recording is `kc__<flow>.mp4`.

Not covered: Android, physical devices, the camera branch of Tilføj trøje, showcase and first photos (unreachable from a cold start today).

## Where things live

| Path | What |
| --- | --- |
| `apps/mobile/.maestro/slices/` | one flow per issue, plus `TEMPLATE.yaml.example` |
| `apps/mobile/.maestro/regression/` | the five regression flows |
| `apps/mobile/.maestro/subflows/` | `sign-in.yaml` (reset, cold start, sign in), `settle.yaml` (a fixed pause for motion Maestro cannot see) |
| `apps/mobile/.maestro/scripts/` | `reset-test-data.js`, the reset call the flows run first |
| `apps/mobile/.maestro/fixtures/` | one drawn shirt photo for the simulator gallery |
| `apps/mobile/.maestro/design-sections.json` | which `docs/design-system.md` sections the review reads per flow |
| `apps/mobile/.maestro/*.sh` | local API, build, run, publish evidence |
| `apps/api/src/e2e/` | test data, its guard, the reset route |
| `apps/api/src/vision/fixed-vision.adapter.ts` | fixed Vision for the Test Collector |
| `scripts/e2e/` | upload, "before" selection, comparison, review, PR comment, workpad evidence |

## A flow needs a `testID`

Flows tap by `testID`, so a copy change does not break a flow. The exceptions, each because the control takes no `testID`:

- the native tab bar: `Søg` and `Ønsker` are tapped by label;
- the app's own upload source sheet option `Fotos` (a system action sheet), by label;
- the system photo picker: the first cell and its confirm button, by screen point, on a simulator whose library holds exactly one photo;
- iOS's "save password" prompt: `Ikke nu` / `Not Now`, by text, when it shows;
- Send bud: a tap on the photo, by screen point, to dismiss the number pad that covers the form (KIT-270).

When a slice adds a control a flow must tap, add the `testID` in the same PR. Adding a `testID` is not a UI change; do not restyle a screen to make a flow pass.

## Run the flow

Everything runs on the approver's Mac. Needs Xcode with an iOS Simulator, CocoaPods, a Java runtime and the Maestro CLI (`brew install mobile-dev-inc/tap/maestro openjdk@17 cocoapods`), a local Postgres with a database whose name contains `test`, and `gh` signed in.

```bash
# What an issue session runs: queue, API, app, flow, evidence. One command.
apps/mobile/.maestro/device-run.sh

# The five regression flows instead.
E2E_FLOWS=regression apps/mobile/.maestro/device-run.sh
```

`device-run.sh` is the only entry for a session. It waits in the **queue** (a lock in the clone's common git directory, `kit-device-flows.lock`: the flows share one simulator, port 3000 and one database that `local-api.sh` drops), starts the local API, runs `build-local.sh`, runs `run-evidence.sh`, stops the API and lets the next session in. A lock whose owner has stopped is taken over; `E2E_LOCK_MAX_WAIT_SECONDS` (default 5400) ends a wait. The branch name gives the issue key (`claude/kit-279-…` is `KIT-279`), or set `E2E_ISSUE=KIT-279`.

By hand, while iterating on a flow (each of the three takes the same lock):

```bash
apps/mobile/.maestro/local-api.sh                      # terminal 1
apps/mobile/.maestro/build-local.sh                    # when apps/mobile, packages or the lockfile changed
apps/mobile/.maestro/run-local.sh                      # terminal 2: this issue's slice flow
apps/mobile/.maestro/run-local.sh slices/KIT-279.yaml  # or a named flow; output in apps/mobile/.maestro/out/
apps/mobile/.maestro/run-evidence.sh                   # the slice flow, plus publishing
```

`local-api.sh` drops and recreates `E2E_LOCAL_DATABASE_URL` (default `postgresql://kit:kit@localhost:5432/kit_e2e_test`) and adds the fixture catalog. It never reads a lane `DATABASE_URL`. The values in `local.env.sh` are local-only test values.

The flows own a simulator, "KitCollective Device Flows", created on first use with exactly one photo in its library.

`run-evidence.sh` refuses uncommitted changes under the app, API and package sources, the flows (`apps/mobile/.maestro`) and the evidence scripts (`scripts/e2e`), refuses a branch with no slice flow (unless `E2E_FLOWS=regression`), and refuses when the installed app or the running API was not built from this commit's sources. Evidence is keyed by commit. Then:

1. sets the `Device flows` commit status to pending and runs the flow;
2. uploads `kc__*.png` and `kc__*.mp4` to the evidence bucket under `e2e/<sha>/`, pass or fail;
3. on a commit that is on `origin/development` (a regression run recorded there is a "before" for later runs): records the run;
4. otherwise, on a branch with a PR: finds a "before" for the flows it ran (a slice flow has none, so its steps are `new`), reviews the steps that differ or are new against the issue and the design sections the flow names, writes the PR comment and the workpad's `### Evidence`;
5. sets the status to success or failure. Only a failed flow makes it red; a run that stops before its verdict sets `error`, never leaves `pending`.

The status belongs to one commit. `development` requires the branch to be up to date, so merging `development` into a PR branch moves the head: run `device-run.sh` again on the new head before landing. The native binary is cached, so that costs a JavaScript bundle, not an Xcode build.

## Settings

`run-evidence.sh` reads the main checkout's `.env` (or `E2E_ENV_FILE`). Never in git:

| Variable | Value |
| --- | --- |
| `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | the R2 account, as the API names them; the key must have read and write on the evidence bucket |
| `E2E_R2_BUCKET` | `kc-e2e-evidence`. Required: evidence never goes to a lane bucket (`R2_BUCKET` is not used) |
| `E2E_EVIDENCE_BASE_URL` | the bucket's public address plus `/e2e`, e.g. `https://pub-….r2.dev/e2e` |
| `E2E_LINEAR_API_KEY` | reads the issue body, writes the workpad's `### Evidence` |
| `E2E_REVIEW_MODEL` | optional: Claude Code model alias for the review (default `sonnet`) |

GitHub access is the `gh` login on the Mac. The review is a headless Claude Code run (`claude -p`) on the Mac's Claude subscription, with the Read tool only and no settings or MCP servers; it needs the `claude` CLI signed in, and no API key.

R2 (Cloudflare dashboard, `kc-e2e-evidence`): public access through the r2.dev address, and one lifecycle rule that deletes objects after 30 days. The bucket holds test Collectors and drawn shirts only.

GitHub: `development` has the `lane-development` ruleset (pull request required, `test` required). `Device flows` is not added to it, because a required status cannot be limited to PRs that touch `apps/mobile/**` and would block every other PR. It blocks through the checker, which fails a mobile PR whose head has no green `Device flows` status (`.cursor/agents/checker.md`).

## Outside the local API

Not used today, and not possible through a deployed API: the API image runs with `NODE_ENV=production` on staging and production alike, and such a process answers 404 on `POST /v1/e2e/test-data` and ignores `VISION_FIXED_FOR_TEST_COLLECTOR`. A hosted runner would need a way to tell staging from production first.

What does work is the command, from a shell with database access and without `NODE_ENV=production`: `pnpm --filter @kit/api e2e:test-data` with `E2E_TEST_DATA_TARGET` (`staging` or `development`; `production` is refused) and the four test Collector credentials. It also refuses a `DATABASE_URL` that names production, or that equals `PRODUCTION_DATABASE_URL` when the shell already has that variable; do not copy a production URL into a lane's environment for this. The catalog must have these sides with a linked season, by label or alias: clubs FC København, Brøndby IF, AGF, OB, FC Midtjylland, AaB; national team Danmark. The command names any that are missing and writes nothing.

## Building the app

A Release app is a native binary plus one Hermes bytecode file. `build-local.sh` caches the binary in `~/.cache/kit-e2e/native/<hash>/` (override with `E2E_NATIVE_CACHE`), shared by every worktree, newest two kept. The hash covers the lockfile, `patches`, `apps/mobile/package.json`, `app.json`, `app.config.js` and Xcode's version. On a hit it bundles the JavaScript (`expo export:embed`), compiles it with the pinned `hermesc`, swaps it into a copy of the cached app, signs it ad hoc and installs it: no Xcode, no extra disk. A miss runs the full Xcode build once (`E2E_FORCE_NATIVE_BUILD=1` forces it) and stores the result. It refuses to start a full build under 12 GB free (`E2E_NATIVE_MIN_FREE_GB`) and deletes nothing: each issue worktree's generated `apps/mobile/ios` is about 2 GB and can be removed.

A full build needs Xcode 27 or newer: `expo-modules-jsi` does not compile on Xcode 26.3. The app is on `react-native-iap` 16 (StoreKit 2, Nitro) because version 12 could not resolve its pods against the precompiled React Native dependencies (KIT-268). The purchase path on version 16 is typechecked and has not made a purchase.
