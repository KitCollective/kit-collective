# Device flows

A slice that touches `apps/mobile/**` proves itself with **its own Device flow**, `apps/mobile/.maestro/slices/<KEY>.yaml`, written in the same PR and run against an iOS Simulator build: by the hosted run on a GitHub macOS runner (what an issue session asks for, ADR-0059), or on the approver's Mac. The five flows that used to be the gate, and three more for the states of the identity block (KIT-284), are the **regression set** under `regression/`: nine flows, run only on request. Decisions: `docs/adr/0048-device-flows-as-pr-evidence.md`, changed by `docs/adr/0049-slice-flows-queue-and-native-cache.md`. Terms (**Device flow**, **Test Collector**, **Evidence run**, **Design finding**): `CONTEXT.md`.

## Write the slice flow

Copy `slices/TEMPLATE.yaml.example` to `slices/KIT-<n>.yaml` (`name: kit-<n>`). Cover only what this issue changes:

- one `takeScreenshot` per Acceptance criterion that a screen can show, named `kc__kit-<n>__NN-what-it-shows`, with a comment above it naming the criterion;
- reach the screen through `../subflows/sign-in.yaml` (Test Collector, data reset) or, for a signed-out slice, reset and launch with `clearState` as that subflow does; do not replay other issues' screens;
- tap by `testID`; a control a step must tap gets its `testID` in this PR (not a UI change);
- the header comment `# design-sections: Sheet, Button dock` names the `docs/design-system.md` sections the review reads besides Color, Typography, Spacing and Layout;
- a flow that picks photos from the library names them in `# simulator-photos: <name>, <name>, ...`, chosen from `fixtures/photos/catalog.json` by what the flow must show (`fixtures/photos/README.md`). Without the line the library holds the one drawn shirt.

A slice with no screen to show (API only, a reducer) has no slice flow and no `Device flows` status; say so in the PR. The checker reads the flow against the Acceptance criteria: a criterion a screen could show with no step behind it, or a step that screenshots a screen the slice did not change, is a Spec finding.

Regression flows (`E2E_FLOWS=regression`): run them at a milestone, before a promotion to `staging`, or when a slice changes something several screens share (a token, a shared component). They cover:

| Flow | Signs in as | Steps (one screenshot each) |
| --- | --- | --- |
| `first-session` | signed out | `01-welcome`, `02-demo-result`, `03-kom-i-gang`, `04-invalid-email`, `05-code` |
| `add-jersey` | Test Collector | `01-source-sheet`, `02-confirm`, `03-size-and-condition`, `04-ready-to-save`, `05-saved`, `06-collection` (the system photo picker between the first two is tapped through, not screenshotted) |
| `add-jersey-low-confidence` | Test Collector, Vision `low-confidence` | `01-block-asks` (Brug forslaget / Vælg selv), `02-suggestion-accepted`, `03-ready-to-save`, `04-saved` |
| `add-jersey-vision-off` | Test Collector | `01-sheet-vision-off`, `02-empty-identity-block` (Vision er slået fra, Vælg), `03-data-drill` (stops there: see below) |
| `add-jersey-vision-failure` | Test Collector, Vision `failure` | `01-empty-identity-block` (Vision fandt ikke trøjen, no reading state left), `02-data-drill`, `03-picked-by-hand` (AaB, 2023/24, Hjemme), `04-ready-to-save`, `05-saved` (Save works by hand) |
| `collection` | Test Collector | `01-collection`, `02-shortcut-filter`, `03-own-detail` |
| `search-bid` | Test Collector | `01-search-home`, `02-typeahead-hits`, `03-not-open-for-bid-no-dock`, `04-foreign-detail-open-for-bid`, `05-send-bid-empty`, `06-send-bid-amount`, `07-bid-sent-toast-and-own-bid-row`, `08-thread-from-own-bid-row` (e2e_peer's two OB jerseys: `...0106` is public but not åben for bud, `...0105` is åben for bud with a player and a Badge; `slices/KIT-294.yaml` copies these steps as `kc__kit-294__NN`) |
| `inbox` | Test Collector | `01-venter-paa-dit-svar`, `02-thread-incoming-bid-card`, `03-accepted-system-line`, `04-indbakke-after-accept`, `05-more-sheet`, `06-empty-thread-jersey-reference`, `07-message-without-bud` (`slices/KIT-300.yaml` copies these steps as `kc__kit-300__NN`) |
| `wishlist-paywall` | second test Collector | `01-wishlist`, `02-paywall` |

The three `add-jersey-*` flows beyond `add-jersey` pick the fixture photo, the newest in the simulator's library. The Data drill that Vælg opens has no `testID` on its club, season and type controls (and the club picker's rows), so `add-jersey-vision-failure` taps them by a pattern on their copy (`.*AaB.*`, `.*2023/24.*`, `.*Hjemme.*`, the drill's `Gem`) and goes on to Save by hand; `add-jersey-vision-off` stops at the opened drill and asserts it by the copy of its first row. Add the testIDs to the drill to replace the copy taps.

Every flow first calls `POST /v1/e2e/test-data`, so flows are independent and a re-run starts from the same rows. A screenshot is `kc__<flow>__<step>.png`; a recording is `kc__<flow>.mp4`.

### The fixed Vision answer

The reset takes an optional JSON body, `{"vision": "<case>"}`, that picks what the fixed Vision of the Test Collector answers until the next reset (the case lives in the API process). `reset-test-data.js` sends it when a `VISION` is defined, and `subflows/sign-in.yaml` passes the `VISION` its caller gives it (none means `{}` and the API's default, `resolved`). It sets no `env:` default of its own: Maestro defines a header `env:` after the caller's value, so a default there overrides every caller.

| `vision` | The Test Collector's Vision answers |
| --- | --- |
| `resolved` (default) | identity confidence 90, photo groups of two at 90 |
| `low-confidence` | identity confidence 60: Confirm asks Brug forslaget / Vælg selv |
| `mixed-grouping` | groups of two photos with confidence 90, 60, 30 in turn: a bound row, a Tjek row, and photos left in the inbox |
| `failure` | every Vision job fails at once |

The reset also deletes the Test Collector's auth sessions, so a case cannot be switched mid-flow: run `../subflows/sign-in.yaml` again with the other `VISION`. `slices/KIT-284.yaml` is the bulk and failure case: 16 photos through the overview with `mixed-grouping` (bound, Tjek and inbox rows, Gem og næste), then four photos with `failure` (Vision svarede ikke, Prøv Vision igen, Sortér selv, the photos kept). A partial upload failure (`overview-upload-failed`) cannot be forced on a simulator; the unit tests cover it.

Not covered: Android, physical devices, the camera branch of Tilføj trøje, showcase and first photos (unreachable from a cold start today).

## Where things live

| Path | What |
| --- | --- |
| `apps/mobile/.maestro/slices/` | one flow per issue, plus `TEMPLATE.yaml.example` |
| `apps/mobile/.maestro/regression/` | the nine regression flows |
| `apps/mobile/.maestro/subflows/` | `sign-in.yaml` (reset, cold start, sign in), `settle.yaml` (a fixed pause for motion Maestro cannot see), `photo-picker-banner.yaml` (waits for the system photo picker, pauses, closes the iOS Private Access banner when it shows), `photo-picker-done.yaml` (taps the picker's `Done` once it is enabled, and again while an enabled `Done` shows) |
| `apps/mobile/.maestro/scripts/` | `reset-test-data.js`, the reset call the flows run first (sends `VISION`, the fixed Vision case, when a flow defines it) |
| `apps/mobile/.maestro/fixtures/` | one drawn shirt photo for the simulator gallery; `photos/` holds the real shirt photos a slice flow can ask for |
| `apps/mobile/.maestro/design-sections.json` | which `docs/design-system.md` sections the review reads per flow |
| `apps/mobile/.maestro/*.sh` | local API, build, run, publish evidence |
| `apps/api/src/e2e/` | test data, its guard, the reset route |
| `apps/api/src/vision/fixed-vision.adapter.ts` | fixed Vision for the Test Collector; the answer is the case the last reset set |
| `scripts/e2e/` | upload, "before" selection, comparison, review, PR comment, workpad evidence |

## A flow needs a `testID`

Flows tap by `testID`, so a copy change does not break a flow. The exceptions, each because the control takes no `testID`:

- the native tab bar: `Søg` and `Ønsker` are tapped by label;
- the app's own upload source sheet option `Fotos` (a system action sheet), by label;
- the system photo picker: the cells by screen point, its iOS "Private Access to Photos" banner by its `Close` button, and its confirm by its `Done` once that is enabled, the last two by accessibility text because the system picker has no `testID` (the banner shows on some runs only and moves the grid down about 162px, so a flow runs `subflows/photo-picker-banner.yaml` before the first cell tap and `subflows/photo-picker-done.yaml` to confirm), on a simulator whose library holds the iOS sample photos and the fixture, which is the newest and so the first cell; a flow with several photos taps the cells by screen point too, three to a row, newest first;
- iOS's "save password" prompt: `Ikke nu` / `Not Now`, by text, when it shows;
- two waits for text: the Saved sheet's count line (`Trøje nr. n i din samling`, which fills in after the sheet opens) and the first row of the Data drill; they assert, they never tap;
- the Data drill's picks (club, season, type) and its `Gem`, which `add-jersey-vision-failure` taps by a pattern on their copy until the drill has testIDs.

When a slice adds a control a flow must tap, add the `testID` in the same PR. Adding a `testID` is not a UI change; do not restyle a screen to make a flow pass.

## Run the flow

### The hosted run (what a session uses)

```bash
node scripts/request-device-flows.mjs <pr> --issue KIT-<n>
```

It puts the `run-device-flows` label on the PR, which starts `.github/workflows/device-flows.yml` on a macOS runner: the same `local-api.sh`, `build-local.sh` and `run-local.sh` as below, on a fresh machine. The run sets the `Device flows` commit status on the PR head (pending, then success, failure or error) with a link to itself, and uploads `apps/mobile/.maestro/out` as the artifact `device-flows-<sha>`. The script asks for nothing when the PR has no slice flow for the issue or the head already has a pending, green or red status (an `error` status, a run that stopped before the flow finished, is asked for again); a new commit is a new head and needs a new request. The AFK developer workflow (`afk-developer`) makes the request itself in front of the pre-review gate, so the run starts as soon as the head exists and goes on while the Reviewer reviews; the pre-review gate does not wait for it. The full review gate (`scripts/gate.mjs review`, after the Reviewer) waits for the status with the checks whenever the PR head holds the slice flow, and the workflow repeats the request in front of every slice of it (ADR-0059, amendment of 2026-10-18). A head whose run ended `error` twice (the one re-request failed too), or whose status is still missing or pending when the wait runs out, has no verdict: the gate closes with `device-flows-no-verdict` (or tags the wait `device-flows-pending`) and the workflow ends `blocked needs-human: run device-run.sh on the Mac on <sha>` in `Approval`, with no fix round (KIT-343). A red flow (`failure`) closes the review gate and is the Engineer's next fix round; the new head is reviewed again.

A slice run on a PR then runs the **visual review** (below). What the hosted run does not do: the upload to the evidence bucket, the R2 before/after comparison, the Claude review, the PR comment and the workpad links. Those need the bucket keys and the approver's logins, and no Actions secret holds them. A hosted run takes about 45 minutes when the native binary has to be built and far less on a cache hit; macOS minutes are billed at ten times the Linux rate.

### The visual review

After the verdict, a slice run on a PR runs the head's slice flow once more on the PR's **merge base** with `development`, so a person sees each screen before and after the change from one run of one head. The base is checked out in a worktree of its own (`$RUNNER_TEMP/base`) with the head's `apps/mobile/.maestro` copied in, gets its own `pnpm install`, its own local API (the database is recreated) and its JavaScript bundle on the cached native binary; then `run-local.sh` runs the same flow. On the base the flow usually stops where the new screens begin (a `testID` the PR adds is missing): every screen reached before that is the "before", and Maestro's screenshot at the stop is shown as the base's last screen. A base whose native code differs from the head's (another native stamp) would need a full Xcode build and is skipped with a note; so is a base whose API does not start. The base pass is capped at 30 minutes, never touches the `Device flows` status, and its failure fails nothing.

`scripts/e2e/visual-review.mjs` then pairs the two passes by step and writes `$RUNNER_TEMP/visual-review`, uploaded as the artifact **`visual-review-<head sha>`** (14 days):

| File | What |
| --- | --- |
| `manifest.json` | `{ version: 1, headSha, baseSha, runUrl, flow, after: {status, failure?}, before: {status, note?, failure?}, steps: [{ id, label, after, before }], videos: {after?, before?}, dropped }`; paths relative to the folder, `null` for a side without that step |
| `after/<step>.png`, `before/<step>.png` | the `kc__<flow>__<step>.png` screenshots of each pass |
| `failure.png` in the `after` or `before` folder | where that run stopped: on the head a bug in the PR, on the base the start of the new screens |
| `after.mp4`, `before.mp4` | the recordings, cut to 720 wide H.264 without sound |

A file over 10 MB (Paperclip's attachment cap) or an empty one is left out and named in `dropped`. The software factory's `visual-review` gate step reads the artifact for the PR head and puts the files on the Paperclip task, where the loop card shows them side by side for the visual approval.

### A flow from a run artifact

The hosted run can also take one flow that is not in the repo, from a named run artifact: the Scenario judge's path (ADR-0060). Two workflows in two repos, each found by the run id its dispatch returns, never by "the newest run" (two dispatches a second apart would swap): the producer `scenario-flow.yml` in the Holdout repo (since KIT-366; its source is `docs/agents/holdout-scenario-flow.yml`, and `kit-collective` has no `scenario-flow.yml`), and `device-flows.yml` here. The scenarios CLI does both, and the Milestone scenarios workflow uses it (`docs/agents/scenarios.md`). A hand-written test flow takes the same path:

```bash
# 1. Put the flow into a run artifact of the Holdout repo, scenario-flow-<name>, holding <name>.yaml.
#    The CLI reads .factory/scenario-flows/<name>.yaml (and deletes it), sends it on stdin with the
#    Holdout token (SCENARIOS_GH_TOKEN, or your gh login on the Mac), waits for the run and prints
#    {"name","run"}.
mkdir -p .factory/scenario-flows && cp flow.yaml .factory/scenario-flows/scenario-smoke.yaml
node scripts/scenarios.mjs flow --name scenario-smoke

# 2. Run it on the hosted iOS Simulator against the commit on development; prints {"run"}.
node scripts/scenarios.mjs run --flow-run <run from step 1> --name scenario-smoke

# 3. Wait for it (exit 3 while it runs) and download its evidence to .factory/scenario-runs/<run>.
node scripts/scenarios.mjs wait --runs <run from step 2> --sha "$(git rev-parse origin/development)" --timeout 480
```

Both dispatches go through `gh api --method POST .../actions/workflows/<file>/dispatches --input -` with `return_run_details: true`, so GitHub answers with the run's id. The producer also has a run name, `Scenario flow <name>`, to find its run by when an answer has no id; `device-flows.yml` has none, so there the CLI stops instead of guessing. The producer is dispatched on the Holdout's `main`, `device-flows.yml` on `development`.

`flow` names the file inside the artifact when it holds more than one. `device-flows.yml` reads the Holdout repo's name from `factory.config.json` (`scenarios.holdoutRepo`) and downloads the artifact from there with the Actions secret `SCENARIO_FLOWS_TOKEN` (a fine-grained token with Actions read on the Holdout repo only; only the download step gets its value, and the step before it, which gets only whether it is set, stops the run in seconds naming `scripts/holdout-flows-wizard.sh` when it is empty), into `apps/mobile/.maestro/external/` (one level under `.maestro`, so `../subflows/sign-in.yaml` resolves). From there it is a slice run: the same Postgres, local API, build and `run-local.sh`, signed in as the Test Collector, with the photos the flow's `# simulator-photos:` line names. The `Run the flows` step gives Maestro's iOS driver 5 minutes to start (`MAESTRO_DRIVER_STARTUP_TIMEOUT=300000`; Maestro's default is 2 minutes): a cold runner missed the default in run 38801470319, and a run that fails with no screenshot at all is a `hosted-run-error`, never a verdict (`docs/agents/scenarios.md`). It sets no `Device flows` status, has no permission to push and never commits the flow; several artifact runs on one commit do not cancel each other.

Unlike a slice run, an artifact run leaves no flow text in `kit-collective` (KIT-366): Maestro's console, which prints every step, goes to `$RUNNER_TEMP/flows-console.log` on the runner and is never uploaded (the log shows only the exit code); then `node scripts/scenarios.mjs evidence --dir apps/mobile/.maestro/out` keeps only the `kc__*.png` screenshots and `kc__*.mp4` recordings (Maestro's failure screenshots renamed to `kc__<flow>__failure-NN.png`, everything else deleted: `commands.json`, logs, `screen-hierarchy/`), and only that folder is uploaded as `device-flows-<sha>`, without the API log. If `evidence` fails, nothing is uploaded. Debugging a broken artifact run therefore means running the flow on the Mac (below), not reading the hosted log. Slice, regression and nightly runs are unchanged. The flow's own copy is the producer's artifact in the Holdout repo, kept 1 day.

### On the approver's Mac

The rest of this section runs on the approver's Mac, for the full evidence or while iterating on a flow. Needs Xcode with an iOS Simulator, CocoaPods, a Java runtime and the Maestro CLI (`brew install mobile-dev-inc/tap/maestro openjdk@17 cocoapods`), a local Postgres with a database whose name contains `test`, and `gh` signed in.

```bash
# What an issue session runs: queue, API, app, flow, evidence. One command.
apps/mobile/.maestro/device-run.sh

# The nine regression flows instead.
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

The flows own a simulator, "KitCollective Device Flows", created on first use with the fixture shirt added to the iOS sample photos in its library; the fixture is the newest, so it is the picker's first cell. A slice flow that needs other photos names them in its header (`# simulator-photos: fck-white-home-front, fck-white-home-back`), from the 131 real shirt photos in `apps/mobile/.maestro/fixtures/photos/` (`catalog.json`, `README.md` there); it then runs on a simulator of its own with exactly those photos, named after the list.

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

GitHub: `development` has the `lane-development` ruleset (pull request required, `test` required). `Device flows` is not added to it, because a required status cannot be limited to PRs that touch `apps/mobile/**` and would block every other PR. It blocks through the review gate, which waits for the status when the PR head holds the issue's slice flow, and through the checker, which fails a mobile PR whose head has no green `Device flows` status (`.cursor/agents/checker.md`).

## Outside the local API

Not used today, and not possible through a deployed API: the API image runs with `NODE_ENV=production` on staging and production alike, and such a process answers 404 on `POST /v1/e2e/test-data` and ignores `VISION_FIXED_FOR_TEST_COLLECTOR`. A hosted runner would need a way to tell staging from production first.

What does work is the command, from a shell with database access and without `NODE_ENV=production`: `pnpm --filter @kit/api e2e:test-data` with `E2E_TEST_DATA_TARGET` (`staging` or `development`; `production` is refused) and the four test Collector credentials. It also refuses a `DATABASE_URL` that names production, or that equals `PRODUCTION_DATABASE_URL` when the shell already has that variable; do not copy a production URL into a lane's environment for this. The catalog must have these sides with a linked season, by label or alias: clubs FC København, Brøndby IF, AGF, OB, FC Midtjylland, AaB; national team Danmark. The command names any that are missing and writes nothing.

The second test Collector's jersey `...0105` (OB, åben for bud) also carries a player and a Badge (KIT-294), so the catalog must hold them too, by label: a player labelled `Mads Vestergaard` (with a squad number on OB's latest season) and a Badge (patch) labelled `Pokalfinale 2023`. The command names any that are missing and writes nothing.

## Building the app

A Release app is a native binary plus one Hermes bytecode file. `build-local.sh` caches the binary in `~/.cache/kit-e2e/native/<hash>/` (override with `E2E_NATIVE_CACHE`), shared by every worktree, newest two kept. The hash covers the lockfile, `patches`, `apps/mobile/package.json`, `app.json`, `app.config.js` and Xcode's version. On a hit it bundles the JavaScript (`expo export:embed`), compiles it with the pinned `hermesc`, swaps it into a copy of the cached app, signs it ad hoc and installs it: no Xcode, no extra disk. A miss runs the full Xcode build once (`E2E_FORCE_NATIVE_BUILD=1` forces it) and stores the result. It refuses to start a full build under 12 GB free (`E2E_NATIVE_MIN_FREE_GB`) and deletes nothing: each issue worktree's generated `apps/mobile/ios` is about 2 GB and can be removed.

A full build needs Xcode 27 or newer: `expo-modules-jsi` does not compile on Xcode 26.3. The app is on `react-native-iap` 16 (StoreKit 2, Nitro) because version 12 could not resolve its pods against the precompiled React Native dependencies (KIT-268). The purchase path on version 16 is typechecked and has not made a purchase.
