# Device flows

Five Maestro flows drive the iOS Simulator build through the Collector journeys, on the approver's Mac, and are the evidence for every slice that touches `apps/mobile/**`. Decisions: `docs/adr/0048-device-flows-as-pr-evidence.md`. Terms (**Device flow**, **Test Collector**, **Evidence run**, **Design finding**): `CONTEXT.md`.

## What runs

| Flow | Signs in as | Steps |
| --- | --- | --- |
| `first-session` | signed out, then the Test Collector | splash, onboard (3), door register, door login, Samling |
| `add-jersey` | Test Collector | source Sheet, gallery, Bekræft with the fixed Vision suggestion, Detaljer, ready to save, Gemt, Samling |
| `collection` | Test Collector | Samling, a shortcut filter, own UserJersey detail |
| `search-bid` | Test Collector | Søg typeahead, catalog drill, the second test Collector's UserJersey, Send bud |
| `wishlist-paywall` | second test Collector | Ønske, the paywall Sheet |

Every flow first calls `POST /v1/e2e/test-data`, so flows are independent and a re-run starts from the same rows. A screenshot is `kc__<flow>__<step>.png`; a recording is `kc__<flow>.mp4`.

Not covered: Android, physical devices, the camera branch of Tilføj trøje, showcase and first photos (unreachable from a cold start today).

## Where things live

| Path | What |
| --- | --- |
| `apps/mobile/.maestro/flows/` | the five flows |
| `apps/mobile/.maestro/subflows/sign-in.yaml` | reset, cold start, sign in |
| `apps/mobile/.maestro/fixtures/` | one drawn shirt photo for the simulator gallery |
| `apps/mobile/.maestro/design-sections.json` | which `docs/design-system.md` sections the review reads per flow |
| `apps/mobile/.maestro/*.sh` | local API, build, run, publish evidence |
| `apps/api/src/e2e/` | test data, its guard, the reset route |
| `apps/api/src/vision/fixed-vision.adapter.ts` | fixed Vision for the Test Collector |
| `scripts/e2e/` | upload, "before" selection, comparison, review, PR comment, workpad evidence |

## A flow needs a `testID`

Flows tap by `testID`, so a copy change does not break a flow. The two tab-bar taps, and the system photo picker, are by label because the native tab bar and the picker take no `testID`. When a slice adds a control a flow must tap, add the `testID` in the same PR. Adding a `testID` is not a UI change; do not restyle a screen to make a flow pass.

## Run the flows

Everything runs on the approver's Mac. Needs Xcode with an iOS Simulator, CocoaPods, a Java runtime and the Maestro CLI (`brew install mobile-dev-inc/tap/maestro openjdk@17 cocoapods`), a local Postgres with a database whose name contains `test`, and `gh` signed in.

```bash
# Terminal 1: local API on a disposable database, fixed Vision, in-memory photos.
apps/mobile/.maestro/local-api.sh

# When apps/mobile or packages changed since the last build: Release build for
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

`run-evidence.sh` refuses uncommitted changes, and refuses when the installed app or the running API was not built from this commit's sources (restart `local-api.sh`, rerun `build-local.sh`). Evidence is keyed by commit. Then:

1. sets the `Device flows` commit status to pending and runs the flows;
2. uploads `kc__*.png` and `kc__*.mp4` to the evidence bucket under `e2e/<sha>/`, pass or fail;
3. on a commit that is on `origin/development` (decided first, so an open promotion PR does not capture the run): records the run as a "before" for later PRs;
4. otherwise, on a branch with a PR: finds "before", compares, reviews the steps that differ, writes the PR comment and the workpad's `### Evidence`;
5. sets the status to success or failure. Only a failed flow makes it red; a run that stops before its verdict sets `error`, never leaves `pending`.

When a mobile slice lands, run it once on `development` (step 3), or the next PR has nothing to compare against.

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

GitHub: make the `Device flows` status required on `development` for PRs that touch `apps/mobile/**` once it has run green.

## Against a lane instead of a local API

Not used today. The reset and the fixed Vision also work on a lane, for a hosted runner later. That lane's API then needs `E2E_TEST_DATA_TOKEN` (24 characters or more; its presence switches `POST /v1/e2e/test-data` on), `E2E_TEST_DATA_TARGET` (`staging` or `development`; `production` is refused, and a process with `NODE_ENV=production` answers 404 regardless), `PRODUCTION_DATABASE_URL` (refused by identity), `E2E_COLLECTOR_EMAIL`, `E2E_COLLECTOR_PASSWORD`, `E2E_PEER_EMAIL`, `E2E_PEER_PASSWORD` and `VISION_FIXED_FOR_TEST_COLLECTOR=on`. Its catalog must have these sides with a linked season, by label or alias: clubs FC København, Brøndby IF, AGF, OB, FC Midtjylland, AaB; national team Danmark. The command names any that are missing and writes nothing. With database access the same routine runs as `pnpm --filter @kit/api e2e:test-data`.

## Building the app

`build-local.sh` needs Xcode 27 or newer: `expo-modules-jsi` does not compile on Xcode 26.3. The app is on `react-native-iap` 16 (StoreKit 2, Nitro) because version 12 could not resolve its pods against the precompiled React Native dependencies (KIT-268). The purchase path on version 16 is typechecked and has not made a purchase.

A clean build takes several GB of disk (Xcode DerivedData) on top of a 16 GB simulator runtime.

## Reading the result

The `Device flows` status on the PR head is the flows: red means a flow failed, and that blocks. The comment lists only the steps whose screenshot differs from "before" (the latest passed `development` run at or before the merge base), each with before, after and a verdict: what changed, whether the issue asked for it, whether it breaks a named design-system rule, and an optional suggestion labelled as opinion. The verdict is advisory. When the `claude` CLI is missing or not signed in, the comment still shows the pairs and says the review is unavailable.

Two runs of one commit should compare as `same` on every step. A step that flaps is a flow bug (a missing wait, a loading state, data that is not reset): fix the flow or the test data, do not raise the tolerance.
