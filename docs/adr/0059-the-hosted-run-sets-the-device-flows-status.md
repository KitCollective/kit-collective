# The hosted run sets the Device flows status

ADR-0048 put the Device flows on the approver's Mac: EAS wanted a paid plan, and the local run could lean on the Mac's simulator and logins. The `Device flows` commit status was the local run's verdict, and the checker failed a mobile PR without it.

That made the Mac a station in every mobile issue. On 2026-10-12 and 13 three issues (KIT-283, KIT-286, KIT-295) were built on the bb-harness container, which has no simulator, and each stopped for a person to run `device-run.sh`. Every review before that run came back red on the missing status, so the reviews were paid for and could not pass. A run started on the Mac instead could not build either: `device-run.sh` wants a full Xcode build of about 12 GB and the disk had 11.

A hosted run already existed as a draft (`.github/workflows/device-flows.yml`, KIT-267 follow-up): the same scripts on a GitHub macOS runner, nightly for the regression flows and on the `run-device-flows` label for a slice. It deliberately set no status.

## Decision

1. **The hosted run sets the `Device flows` status** on the PR head for a slice run started by the label: pending when it starts, then success, failure or error, each with a link to the run. Its last step always writes a verdict, so a run that stops early does not leave the head pending. The nightly and manual runs set no status.
2. **An issue session asks for the hosted run and does not run `device-run.sh`.** `node scripts/request-device-flows.mjs <pr> --issue KIT-n` sets the label. It asks for nothing when the PR has no slice flow for the issue, or when the head already has a pending, green or red `Device flows` status: a macOS run is not free, and a red flow is fixed by a commit, which is a new head.
3. **The pre-review gate waits for the status** with the required checks, whenever the PR head holds `apps/mobile/.maestro/slices/<KEY>.yaml` (`wait-for-checks --also "Device flows"`). So a Reviewer is never spawned on a head whose flow has not passed. The `kit-issue` workflow puts the request in front of that gate itself, in the gate's own runner.
4. **The local run stays**, as the approver's tool. It sets the same status and is still the only run that uploads to the evidence bucket, compares with the "before" run, asks for the Claude review and writes the PR comment and the workpad links.
5. **The native binary cache is saved right after the build.** `actions/cache` saves only when the whole job succeeds, and every hosted run so far had a red flow, so each run rebuilt the native binary for about 41 minutes. Restore and save are now separate steps.

## What this costs

- **A hosted verdict comes without the comparison.** No "before" picture, no review column, no PR comment: the Reviewer downloads the run's artifact and reads the screenshots against the issue and the design system. ADR-0048 wanted a reviewer to see what a change did to a real screen; with a hosted run they see the screen, not the change. Moving the bucket upload and the comparison to the runner needs the bucket keys as Actions secrets, which only the approver can add; the Claude review needs a credential of its own.
- **macOS minutes**, billed at ten times the Linux rate. About 45 minutes for a run that builds the native binary, far less on a cache hit; not measured yet with a warm cache.
- **The gate's wait is 40 minutes** (5 slices of 480 s). A hosted run that has to build the native binary can take longer; the run then stops as `ci-pending` and a resume picks it up once the status is there.
- **The status is still not a required check** (ADR-0048: it cannot be limited to mobile PRs). It blocks through the gate and the checker.

## Not settled

- **The hosted run is not yet reliable.** Of its three nightly runs, one was cancelled and two had a red flow. The red flow of 2026-10-13 was a defect in the app (KIT-345, fixed the same day); the two red flows of 2026-10-11 were not looked into.
- **A flow that needs more than one photo cannot pass anywhere but a hand-made simulator.** `simulator.sh` gives the library one photo; the slice flows of KIT-282 and KIT-283 need four. The spec gives that fixture to KIT-284, which is blocked by KIT-283: KIT-283 cannot get a green flow before the fixture exists.
- **No hosted slice run has happened.** The label trigger has never fired on a real PR.

## The first hosted slice run (PR #316, 2026-10-13)

The label started the run, the run set `pending` on the head at once, and when the job was cancelled its last step set `error`: the three status steps work. The run never reached the flow. The native build took 58 minutes this time (41 in the nightly run that morning) and the job's 60 minute limit cancelled it in the flow step, after the binary had been saved to the cache.

Two changes follow. The job's limit is 90 minutes. And `error` is no longer a state that `request-device-flows.mjs` leaves alone: it means the run stopped before the flow finished, so the next request asks again; `failure` (a red flow) still waits for a new commit.

Status: accepted; revisit after the first hosted slice run that reaches a verdict.

## Amendment: Device flows run beside the review (Nicklas, 2026-10-18)

Decision 3 is amended; its text above stays as written. Waiting for the hosted run in the pre-review gate held the Reviewer back for the whole run, about 13 to 14 minutes per head against about 3 for the ordinary checks. KIT-291 spent about 45 minutes in pre-review on 2026-10-18, waiting on two Device flows runs.

- **`gate.mjs pre-review` waits for the ordinary checks only.** It no longer passes `--also "Device flows"` and neither settles nor folds the status. The AFK developer workflow still asks for the hosted run in the pre-review gate's own runner, right after the PR head exists, so the run goes on while the Reviewer reviews.
- **`gate.mjs review` waits for the status** on a head that holds the slice flow, with all of the handling decision 3 and KIT-343 gave the pre-review gate: a first `error` is held for its re-request, `device-flows-no-verdict` and an exhausted `device-flows-pending` end `blocked needs-human` in `Approval` with no fix round. The workflow repeats the request in front of every slice of the review gate.
- **A review gate closed by a red flow is an Engineer fix round**, as a red pre-review check is: the Engineer gets the failing line, fixes, pushes and asks for the run again; the new head goes through the pre-review gate and a fresh Reviewer, and the round counts toward the round cap. A green review of one head never counts for the next.
- **The Engineer asks for the run and does not wait for it** before returning `ready` (`/implement` pre-review gate row 9).

What this costs: "a Reviewer is never spawned on a head whose flow has not passed" no longer holds. A Reviewer pass can be spent on a head whose flow then turns red, the cost KIT-295 met; the Reviewer is told the status is not its to wait for or judge. No head reaches the receipt or auto-land without a green flow (ADR-0064 decision 1 is unchanged).
