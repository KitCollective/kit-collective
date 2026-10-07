# Device flows on the iOS Simulator are the evidence for mobile slices

Nothing tested the app end to end on a device, and evidence on issues was "after" only, taken from a headless browser on the web target, so a reviewer could not see what a change did to a real screen and an agent could change design nobody asked for without it showing. Five **Device flows** (Maestro, under `apps/mobile/.maestro/flows/`) now run on an iOS Simulator build for every PR that touches `apps/mobile/**` and for every push to `development`, as an EAS Workflow with the `maestro` job (alpha). The decisions are Nicklas's from KIT-267 (2026-10-07):

- **Where it runs:** EAS Workflows. The same flows run locally with the Maestro CLI against a local API and a disposable database (`docs/agents/device-flows.md`).
- **Platform:** iOS Simulator only. No Android, no physical device, no camera branch.
- **Backend:** the `e2e` build talks to the `staging` lane API. No fourth lane.
- **Blocking:** a red flow blocks (the workflow's check on the PR). A **Design finding** from the review is advisory: it is reported and never fails the check.
- **Storage:** screenshots and recordings go to lane R2 under `e2e/<sha>/<flow>/`, with a 30-day lifecycle. Not in git.

Four things were decided while building it, because the first decisions did not settle them:

1. **Two test Collectors, not one.** The paywall Sheet only shows to a Collector with no live Entitlement and a spent trial, and Tilføj trøje needs access. The **Test Collector** (Comp Entitlement) signs in for four flows; the second test Collector, who also owns the åben-for-bud UserJersey, signs in for the Ønske and paywall flow.
2. **Staging is reset before every flow, through the API.** Flows change data (Tilføj adds a UserJersey, Send bud leaves a bid), so two runs of one commit only compare as `same` when each starts from the same rows. `POST /v1/e2e/test-data` runs the same idempotent routine as the `e2e:test-data` command. It answers 404 on any lane that does not set `E2E_TEST_DATA_TOKEN`, needs that token as a bearer, refuses `E2E_TEST_DATA_LANE=production` and a `DATABASE_URL` that equals `PRODUCTION_DATABASE_URL`, and writes only rows owned by, or pointing at, the two test Collectors. Lane database URLs carry no lane marker (an IP and one database name), so a URL alone cannot prove it is not production; that is why the lane must be declared.
3. **Fixed Vision is scoped by Collector, not by lane.** With `VISION_FIXED_FOR_TEST_COLLECTOR=on` the test Collector's Vision jobs go to a fixed adapter that returns one suggestion from the lane's own catalog; every other Collector on staging, and unsigned Vision, stays on the live adapter. There is no switch that changes Vision for real Collectors.
4. **Evidence is served by the staging API.** A PR comment and a Linear issue need links that open without a session for 30 days, and a presigned R2 URL lasts 7 at most while a public bucket would expose every Collector's photos. `GET /v1/e2e/evidence/<sha>/<flow>/<file>` serves only `e2e/` objects, which show the test Collectors and drawn shirts only.

"Before" for a PR is the latest passed `development` run at or before the PR's merge base; "after" is the PR head. The comparison is a pixel difference with a small tolerance and no model call; the iOS status bar strip is not compared. Only steps marked `changed`, `new` or `removed` go to the review, which gets the pair, the issue's What to build and write-scope, and the matching sections of `docs/design-system.md`. A changed screen the issue did not ask for is a finding by itself. The reviewer flags; it never edits UI.

The first-session flow covers what a Collector can reach today (splash, onboard, door, Samling). Showcase and first photos are in the code but unreachable from a cold start, so no flow covers them.

Status: accepted.
