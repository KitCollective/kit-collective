# Cursor Automations (Kit Collective)

Wire these in Cursor after Linear MCP points at the **Kit Collective** workspace (not Mercflow) and `linear.setup.json` exists.

Cursor’s Linear trigger fires on issue created / status changed / end of cycle — **not** on delegate. Dispatch therefore uses a short cron that re-checks eligibility. Status-change automations cover the rest.

Each automation must read `WORKFLOW.md` from the checked-out repo. Do not paste a second copy of policy into the prompt.

Repo / branch for checkouts: `eskobar95/kit-collective`, branch `development`.

## 1. Implement (dispatch)

| Field | Value |
| --- | --- |
| Trigger | Every 5 minutes |
| Tools | Linear MCP, GitHub (PR + checks) |
| Eligibility | `Backlog` + delegated to Cursor + no `blockedBy` |
| Action | Follow `/implement`. Claim → `Implementing` first. Stop if ineligible. |

Prompt sketch: “Read WORKFLOW.md. List KIT issues in Backlog delegated to Cursor. Skip blocked. For each, run the implement flow. Cap concurrent claims at 3.”

## 2. Checker

| Field | Value |
| --- | --- |
| Trigger | GitHub pull request opened (ignore drafts if you want only ready PRs — we open ready PRs, not drafts, once proof exists) |
| Tools | GitHub, Linear MCP |
| Action | Judge-only `/code-review`. Pass + CI green → `Ready for merge`. Fail → `Rework`. |

## 3. Land

| Field | Value |
| --- | --- |
| Trigger | Linear issue status changed |
| Tools | GitHub, Linear MCP |
| Action | If new status is `Done`, run `/land` into `development`. If merge fails, `Rework`. Ignore other statuses. |

## 4. Staging promotion

| Field | Value |
| --- | --- |
| Trigger | Every hour (or Linear status changed as a wake-up) |
| Tools | Linear MCP, GitHub |
| Action | If a project’s issues are all `Done` or `Canceled`, open or update a PR `development` → `staging` and require staging CI. Do not merge to staging without green checks. Comment on the Linear project. |

## 5. Production release

| Field | Value |
| --- | --- |
| Trigger | Linear issue created with label `release` **or** manual / webhook |
| Tools | Linear MCP, GitHub |
| Action | Diff `staging` vs `production`. Draft Linear release notes + changelog. Open PR `staging` → `production`. **Do not merge.** Nick approves and merges, or moves a release issue to `Done` only after reading the PR — then a dedicated land-to-production path may merge. Default: human merges production. |

Until GitHub Environments `development` / `staging` / `production` exist, automations 4–5 must comment the blocker on the Linear project and stop — they must not invent a fourth lane.
