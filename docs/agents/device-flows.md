# Device flows

Five Maestro flows drive the iOS Simulator build through the Collector journeys, on the approver's Mac, and are the evidence for every slice that touches `apps/mobile/**`. Decisions: `docs/adr/0048-device-flows-as-pr-evidence.md`. Terms (**Device flow**, **Test Collector**, **Evidence run**, **Design finding**): `CONTEXT.md`.

## What runs

| Flow | Signs in as | Steps (one screenshot each) |
| --- | --- | --- |
| `first-session` | signed out, then the Test Collector | `01-splash`, `02-onboard-1`, `03-onboard-2`, `04-onboard-3`, `05-door-register`, `06-door-login`, `07-collection` |
| `add-jersey` | Test Collector | `01-source-sheet`, `02-confirm` (Bekræft with the fixed Vision suggestion), `03-details`, `04-ready-to-save`, `05-saved`, `06-collection`. The system photo picker between the first two is tapped through, not screenshotted |
| `collection` | Test Collector | `01-collection`, `02-shortcut-filter`, `03-own-detail` |
| `search-bid` | Test Collector | `01-typeahead`, `02-catalog-drill`, `03-foreign-detail` (the second test Collector's UserJersey), `04-send-bid`, `05-amount-entered`, `06-bid-sent` |
| `wishlist-paywall` | second test Collector | `01-wishlist`, `02-paywall` |

That is 24 steps. Every flow first calls `POST /v1/e2e/test-data`, so flows are independent and a re-run starts from the same rows. A screenshot is `kc__<flow>__<step>.png`; a recording is `kc__<flow>.mp4`.

Not covered: Android, physical devices, the camera branch of Tilføj trøje, showcase and first photos (unreachable from a cold start today).

## Where things live

| Path | What |
| --- | --- |
| `apps/mobile/.maestro/flows/` | the five flows |
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

## Run the flows

Everything runs on the approver's Mac. Needs Xcode with an iOS Simulator, CocoaPods, a Java runtime and the Maestro CLI (`brew install mobile-dev-inc/tap/maestro openjdk@17 cocoapods`), a local Postgres with a database whose name contains `test`, and `gh` signed in.

```bash
# Terminal 1: local API on a disposable database, fixed Vision, in-memory photos.
apps/mobile/.maestro/local-api.sh

# When apps/mobile, packages or the lockfile changed since the last build: Release build for
# this commit, pointed at the local API, installed on the flows' own simulator.
apps/mobile/.maestro/build-local.sh

# Terminal 2, while iterating: all flows, or one. Output in apps/mobile/.maestro/out/.
apps/mobile/.maestro/run-local.sh
apps/mobile/.maestro/run-local.sh flows/collection.yaml

# For the PR: run the flows and publish the evidence for the current commit.
apps/mobile/.maestro/run-evidence.sh
```

`local-api.sh` drops and recreates `E2E_LOCAL_DATABASE_URL` (default `postgresql://kit:kit@localhost:5432/kit_e2e_test`) and adds the fixture catalog. It never reads a lane `DATABASE_URL`. The values in `local.env.sh` are local-only test values.

The flows own a simulator, "KitCollective Device Flows", created on first use with exactly one photo in its library.

`run-evidence.sh` refuses uncommitted changes under the app, API and package sources, the flows (`apps/mobile/.maestro`) and the evidence scripts (`scripts/e2e`), and refuses when the installed app or the running API was not built from this commit's sources (restart `local-api.sh`, rerun `build-local.sh`). Evidence is keyed by commit. Then:

1. sets the `Device flows` commit status to pending and runs the flows;
2. uploads `kc__*.png` and `kc__*.mp4` to the evidence bucket under `e2e/<sha>/`, pass or fail;
3. on a commit that is on `origin/development` (decided first, so an open promotion PR does not capture the run): records the run as a "before" for later PRs;
4. otherwise, on a branch with a PR: finds "before", compares, reviews the steps that differ, writes the PR comment and the workpad's `### Evidence`;
5. sets the status to success or failure. Only a failed flow makes it red; a run that stops before its verdict sets `error`, never leaves `pending`.

When a mobile slice lands, run it once on `development` (step 3), or the next PR has nothing to compare against. `/land` names this step.

The status belongs to one commit. `development` requires the branch to be up to date, so merging `development` into a PR branch moves the head: run `run-evidence.sh` again on the new head before landing. No rebuild is needed when the merge brought no change under the app, API or package sources or the lockfile.

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

`build-local.sh` needs Xcode 27 or newer: `expo-modules-jsi` does not compile on Xcode 26.3. The app is on `react-native-iap` 16 (StoreKit 2, Nitro) because version 12 could not resolve its pods against the precompiled React Native dependencies (KIT-268). The purchase path on version 16 is typechecked and has not made a purchase.

A clean build takes several GB of disk (Xcode DerivedData) on top of a 16 GB simulator runtime.

## Reading the result

The `Device flows` status on the PR head is the flows: red means a flow failed, and that blocks. The comment lists only the steps whose screenshot differs from "before" (the latest passed `development` run at or before the merge base), each with before, after and a verdict: what changed, whether the issue asked for it, whether it breaks a named design-system rule, and an optional suggestion labelled as opinion. The verdict is advisory. When the `claude` CLI is missing or not signed in, the comment still shows the pairs and says the review is unavailable.

Two runs of one commit should compare as `same` on every step. A step that flaps is a flow bug (a missing wait, a loading state, data that is not reset): fix the flow or the test data, do not raise the tolerance.
