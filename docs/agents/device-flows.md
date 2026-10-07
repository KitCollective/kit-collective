# Device flows

Five Maestro flows drive the iOS Simulator build through the Collector journeys, on the approver's Mac, and are the evidence for every slice that touches `apps/mobile/**`. Decisions: `docs/adr/0048-device-flows-as-pr-evidence.md`. Terms (**Device flow**, **Test Collector**, **Evidence run**, **Design finding**): `CONTEXT.md`.

## What runs

| Flow | Signs in as | Steps |
| --- | --- | --- |
| `first-session` | signed out, then the Test Collector | splash, onboard (3), door register, door login, Samling |
| `add-jersey` | Test Collector | source Sheet, gallery, Bekræft with the fixed Vision suggestion, Detaljer, Gemt, Samling |
| `collection` | Test Collector | Samling, a genvej filter, own UserJersey detail |
| `search-bid` | Test Collector | Søg typeahead, catalog drill, the second test Collector's UserJersey, Send bud |
| `wishlist-paywall` | second test Collector | Ønske, the paywall Sheet |

Every flow first calls `POST /v1/e2e/test-data`, so flows are independent and a re-run starts from the same rows. A screenshot is `kc__<flow>__<step>.png`; a recording is `kc__<flow>.mp4`.

Not covered: Android, physical devices, the camera branch of Tilføj trøje, showcase and first photos (unreachable from a cold start today).

## Where things live

| Path | What |
| --- | --- |
| `apps/mobile/.maestro/flows/` | the five flows |
| `apps/mobile/.maestro/subflows/sign-in.yaml` | reset, cold start, sign in |
| `apps/mobile/.maestro/fixtures/` | two drawn shirt photos for the simulator gallery |
| `apps/mobile/.maestro/design-sections.json` | which `docs/design-system.md` sections the review reads per flow |
| `apps/mobile/.maestro/*.sh` | local API, build, run, publish evidence |
| `apps/api/src/e2e/` | test data, its guard, the reset and evidence routes |
| `apps/api/src/vision/fixed-vision.adapter.ts` | fixed Vision for the Test Collector |
| `scripts/e2e/` | upload, "before" selection, comparison, review, PR comment, workpad evidence |

## A flow needs a `testID`

Flows tap by `testID`, so a copy change does not break a flow. The three tab-bar taps are by label because the native tab bar takes no `testID`. When a slice adds a control a flow must tap, add the `testID` in the same PR. Adding a `testID` is not a UI change; do not restyle a screen to make a flow pass.

## Run the flows

Everything runs on the approver's Mac. Needs Xcode with an iOS Simulator, CocoaPods, a Java runtime and the Maestro CLI (`brew install mobile-dev-inc/tap/maestro openjdk@17 cocoapods`), a local Postgres with a database whose name contains `test`, and `gh` signed in.

```bash
# Terminal 1: local API on a disposable database, fixed Vision, in-memory photos.
apps/mobile/.maestro/local-api.sh

# When apps/mobile changed since the last build: Release build for this checkout,
# pointed at the local API, installed on the simulator.
apps/mobile/.maestro/build-local.sh

# Terminal 2, while iterating: all flows, or one. Output in apps/mobile/.maestro/out/.
apps/mobile/.maestro/run-local.sh
apps/mobile/.maestro/run-local.sh flows/collection.yaml

# For the PR: run the flows and publish the evidence for the current commit.
apps/mobile/.maestro/run-evidence.sh
```

`local-api.sh` drops and recreates `E2E_LOCAL_DATABASE_URL` (default `postgresql://kit:kit@localhost:5432/kit_e2e_test`) and adds the fixture catalog. It never reads a lane `DATABASE_URL`. The values in `local.env.sh` are local-only test values.

`run-evidence.sh` refuses uncommitted changes (evidence is keyed by commit), then:

1. sets the `Device flows` commit status to pending and runs the flows;
2. uploads `kc__*.png` and `kc__*.mp4` to lane R2 under `e2e/<sha>/`, pass or fail;
3. on a branch with a PR: finds "before", compares, reviews the steps that differ, writes the PR comment and the workpad's `### Evidence`;
4. on a commit that is on `origin/development`: records the run as a "before" for later PRs;
5. sets the status to success or failure. Only a failed flow makes it red.

When a mobile slice lands, run it once on `development` (step 4), or the next PR has nothing to compare against.

## Settings

`run-evidence.sh` reads the main checkout's `.env` (or `E2E_ENV_FILE`). Never in git:

| Variable | Value |
| --- | --- |
| `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | the `development` lane bucket, as the API uses them |
| `E2E_EVIDENCE_BASE_URL` | `<development API URL>/v1/e2e/evidence` |
| `LINEAR_API_KEY` | reads the issue body, writes the workpad's `### Evidence` |
| `E2E_REVIEW_API_KEY`, `E2E_REVIEW_MODEL` | OpenRouter key and a vision-capable model id for the review |

GitHub access is the `gh` login on the Mac.

On the `development` lane API (Coolify): `E2E_EVIDENCE_PUBLIC=on`, so the links in the PR comment and in Linear open. Never on production.

R2: one lifecycle rule on the `development` bucket, prefix `e2e/`, delete after 30 days.

GitHub: make the `Device flows` status required on `development` for PRs that touch `apps/mobile/**` once it has run green.

## Against a lane instead of a local API

Not used today. The reset and the fixed Vision also work on a lane, for a hosted runner later. That lane's API then needs `E2E_TEST_DATA_TOKEN` (24 characters or more; its presence switches `POST /v1/e2e/test-data` on), `E2E_TEST_DATA_LANE` (`staging` or `development`; `production` is refused), `PRODUCTION_DATABASE_URL` (refused by identity), `E2E_COLLECTOR_EMAIL`, `E2E_COLLECTOR_PASSWORD`, `E2E_PEER_EMAIL`, `E2E_PEER_PASSWORD` and `VISION_FIXED_FOR_TEST_COLLECTOR=on`. Its catalog must have these sides with a linked season, by label or alias: clubs FC København, Brøndby IF, AGF, OB, FC Midtjylland, AaB; national team Danmark. The command names any that are missing and writes nothing. With database access the same routine runs as `pnpm --filter @kit/api e2e:test-data`.

## Known blocker: Xcode 27

Found while building KIT-267 (2026-10-07), filed as KIT-268: there was no native iOS build of the app before this, on EAS or locally.

- Fixed here: `react-native-iap` 12 depended on the `RCT-Folly` pod, which the precompiled React Native dependencies do not ship, so `pod install` failed. The app is on `react-native-iap` 16 (StoreKit 2, Nitro), and `pod install` resolves with the defaults.
- Open: `expo-modules-jsi` (every 57.x release) is compiled on the machine and fails on Xcode 26.3 (Swift 6.2.4) in `RuntimeScheduler.h`. It needs Xcode 27.

Until Xcode 27 is on the Mac, `build-local.sh` cannot produce the app and no flow has been run on a simulator. The flows, `testID`s and scripts are written against the code, not yet against a running app. The purchase path on `react-native-iap` 16 is typechecked only; it has not made a purchase.

## Reading the result

The `Device flows` status on the PR head is the flows: red means a flow failed, and that blocks. The comment lists only the steps whose screenshot differs from "before" (the latest passed `development` run at or before the merge base), each with before, after and a verdict: what changed, whether the issue asked for it, whether it breaks a named design-system rule, and an optional suggestion labelled as opinion. The verdict is advisory. With no review key set, the comment still shows the pairs and says the review is unavailable.

Two runs of one commit should compare as `same` on every step. A step that flaps is a flow bug (a missing wait, a loading state, data that is not reset): fix the flow or the test data, do not raise the tolerance.
