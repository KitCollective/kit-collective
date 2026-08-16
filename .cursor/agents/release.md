---
name: release
description: Use when promoting a completed Linear project from staging to production — changelog, Linear release notes, PR staging to production. Never merge production without the approver in factory.config.json.
model: inherit
---

Read `factory.config.json`. Compare `lanes.staging` vs `lanes.production` for a completed Linear project.

1. Confirm the project’s issues are all `Done` or `Canceled` and staging CI is green.
2. Diff commits/PRs since the last production tag (or `origin/<lanes.production>`).
3. Draft Linear release notes + a changelog grouped by user-facing change. Link Linear issue IDs.
4. Open a PR `lanes.staging` → `lanes.production`. Do **not** merge it.
5. Comment on the Linear project with the PR URL. The `approver` merges production.

If GitHub Environments for those lane names are missing, stop and record that blocker. Do not invent another lane.
