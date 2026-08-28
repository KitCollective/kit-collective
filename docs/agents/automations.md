# Factory runtime

The dispatch runtime is the **PI worker** on kit-harness: Docker Compose + `gh` + Linear CLI. `.pi/mcp.json` is empty — Linear MCP is not installed on that box. Do **not** treat Cursor Cloud Agents as factory dispatch.

Product Coolify MCP and `kc_seed_mcp` stay Desktop or Cloud Agent wiring. They are not default PI-worker MCP.

`linear.setup.json` must exist. When the PI planner job is Active, keep any Cursor Automations planner cron **Inactive** so two planners cannot claim the same issue. The Cursor Automations paste-blocks below are a fallback cookbook, not the live worker.

**Do not** use Linear Assignee → Agents → Cursor as dispatch: that starts a Cloud Agent immediately. Assignee stays the human; Agent stays **No agent**. Planner claims on `ready-for-agent`. Implement and checker wake on **status**.

Each role must read `factory.config.json` and `WORKFLOW.md` from the checkout. Do not paste a second copy of policy into a one-off prompt.

Checkout: `github.ownerRepo`, branch `lanes.integration`. Planner is Linear-only (no product edits).

Linear `get_issue` does **not** return comments. Every runtime that acts on an issue must also `list_comments` (Linear CLI on the PI worker). The workpad is one comment; `### Review feedback` is why a pass was not good enough.

## Handshake (implement ↔ checker)

There is no “same Cloud Agent”. Each run is a new Pi job. **Same work** means: same Linear issue, same git branch, same PR, same workpad.

```text
planner:    Backlog + ready-for-agent + unblocked → Implementing (priority order)
intake:     hourly Triage scan on the planner mutex → Backlog / Duplicate / comment
implement:  Implementing (no PR) → branch + code + PR + pre-review gate → In Review
checker:    In Review → complete review → Ready for merge
            or Implementing + full ### Review feedback (no drip-feed)
implement:  Implementing (PR exists) → same branch, fix the class → In Review
auto-merge: Ready for merge → Merging when MERGEABLE, checks green, loop cap clear
approver:   Ready for merge → Merging (still allowed)
land:       merge to lanes.integration → Done
```

Checker must **not** start implement. Planner must **not** write code. Implement must **not** claim from Backlog.

## Linear evidence

Screenshots, recordings, and other files from the worker belong on the **Linear issue**, not only in the job log.

1. `prepare_attachment_upload` on the issue (filename, contentType, size)
2. PUT the raw bytes to the signed URL (headers verbatim)
3. `create_attachment_from_upload`
4. `save_comment` on the issue with what the file shows
5. Link it under workpad `### Evidence`

Redact secrets. Never attach `.env`, cookies, or `Authorization` headers.

## Who moves status

| Move | Who |
| --- | --- |
| Triage → `Backlog` (shaped) / Duplicate (leftovers) | **Intake** (hourly, Linear CLI) |
| `dispatch.state` → `Implementing` | **Planner** (claim + one role comment) |
| `Implementing` → `In Review` | **Implement** (PR + proof on Linear + one role comment) |
| `In Review` → `Ready for merge` | **Checker** (pass + description AC + one role comment) |
| `In Review` / `Ready for merge` / `Merging` → `Implementing` | **Checker** or **land** (fail + one role comment on checker fail) |
| `Ready for merge` → `Merging` | **Auto-merge** when MERGEABLE + green checks + loop cap clear (+ one role comment) or **approver** |
| `Merging` → `Done` | **Land** (merge succeeded + one role comment with SHA) |
| Merge to integration | **Land** |

---

## 0. Planner (dispatch)

| Field | Value |
| --- | --- |
| Trigger | Every 5 minutes (`*/5 * * * *`) |
| Tools | **Linear CLI** on the PI worker. Not Linear MCP on kit-harness. |
| Eligibility | `dispatch.state` + `ready-for-agent` + no unresolved `blockedBy` + not `signal-up` + Agent field empty |
| Action | No concurrency cap. Claim **all** currently eligible issues in `dispatch.priorityOrder`. Blocking is the limiter. No code. |
| Instruction | See prompt below. |

### Cursor UI checklist

| Setting | Value |
| --- | --- |
| Environment / checkout | `KitCollective/kit-collective`, branch **`development`** (`lanes.integration`). Never `production`. The agent must read `factory.config.json`, `WORKFLOW.md`, and `.cursor/agents/planner.md` from that branch. |
| Trigger | Custom schedule `*/5 * * * *` |
| Model | A cheap/fast model is fine (dispatcher, not coder) |
| Tools | **Linear** connected to workspace KitCollective. Remove **Open Pull Request**. Remove **Memories**. Do not add Slack/Teams. |
| Memories | Leave empty. Do not use. Factory truth is git + Linear, not a private `MEMORIES.md`. |
| Status | Keep Inactive until `development` has `planner.md` and you have implement + checker ready to wake. If the Instruction was pasted before the priority-order contract, **re-paste** the planner block below. |

`MEMORIES.md` is a second source of truth the planner would write outside review. Recurring mistakes go on the Linear issue (comment) and into a ratchet in the **implement PR**. Wrong lessons are reverted with git.

```text
You are the planner. Read factory.config.json then WORKFLOW.md. Follow .cursor/agents/planner.md.

Linear only. No product code. No PRs. No .cursor/hooks or .cursor/rules edits.

Every run:
1. List KIT issues in dispatch.state with label ready-for-agent, unblocked, not signal-up. Unresolved blockedBy = blocker is not Done or Canceled. Skip any issue whose Linear Agent field is set (native Cursor execute); comment and leave it.
2. There is no concurrency cap. Blocking is the limiter.
3. Claim all currently eligible issues in dispatch.priorityOrder (Urgent 1, High 2, Medium 3, Low 4, None 0). Same rank: oldest first. Unset/None is last. Skip write-scope overlap with an Implementing issue (leave it in dispatch.state with ready-for-agent, comment why). Do not preempt Implementing. That is the only status move you make.
4. If the same ### Review feedback class has failed twice on an Implementing issue, comment that the next implement pass must land a ratchet (docs/agents/error-ratcheting.md). Do not write the ratchet.

Never claim Triage or Duplicate. Intake (hourly, planner mutex) may shape Triage; planner does not. Never move to In Review, Ready for merge, Merging, Done, Parked, or Canceled.
```

---

## 0b. Intake (Triage)

| Field | Value |
| --- | --- |
| Trigger | Every hour (`PI_INTAKE_POLL_MS`, default 1 hour) on the **planner mutex** |
| Tools | **Linear CLI** on the PI worker. Not Pi. Not the coding slot. |
| Action | List open KIT Triage. Promote well-formed slices (Linear Type, write-scope, What to build, AC) to Backlog with `ready-for-agent` and without `signal-up`. Shape leftovers that have an inferable repo path onto the **same** issue (Type, What to build, AC, `write-scope:`). One finding stays one ticket — do not lump leftovers into `Tech: paths`. Unshaped Sentry or leftovers with no path stay in Triage with one comment updated in place. Never set delegate or Linear Agent. |
| Never | Implementing, In Review, Merging, Done. Never set Linear Agent to Cursor. |

---

## 1. Implement (start + resume)

| Field | Value |
| --- | --- |
| Trigger | Linear status changed **to** `Implementing`. PI worker also wakes orphans on boot and the resume poller. |
| Tools | Linear CLI + `gh` (PR + checks). Browser if the slice is UI. Not Linear MCP on kit-harness. |
| Eligibility (start) | Status `Implementing`, **no** branch/PR yet (planner just claimed) |
| Eligibility (resume) | Status `Implementing` **with** an existing branch/PR (checker or land sent it back) |
| Action | Follow `/implement`. Same issue, same branch, same PR. Never claim from Backlog. |
| Instruction | See prompt below. |

### Cursor UI checklist

| Setting | Value |
| --- | --- |
| Environment / checkout | `KitCollective/kit-collective`, branch **`development`**. Never `production`. New feature branches are cut **from** this checkout. |
| Trigger | Linear: issue **status changed to `Implementing`**. Team **Engineering** (`KIT`). Not a cron. Not “any status change”. |
| Model | A coding model (not the cheap dispatcher). Implement writes the PR. |
| Tools | **Linear** (KitCollective). **Open Pull Request** + **Comment on Pull Request**. Browser / computer use if the slice is UI. |
| Do not add | Memories. Slack/Teams. Request Reviewers (approver reads the PR; that is not a GitHub review request). |
| Memories | Off. Empty. Same reason as planner. |
| Instruction | Paste the block below. Keep `{{ issue.identifier }}` — Linear-triggeren fylder den. |
| Status | Inactive until planner + checker exist, and `development` has `/implement` + `WORKFLOW.md`. If the Instruction was pasted before the KIT-23/KIT-24 pre-review gate, **re-paste** the implement block below. |

The Linear trigger is what makes checker-fail → `Implementing` wake **this** automation on the **same issue**. A new VM each time; same branch/PR because the workpad and the attached PR say so. On kit-harness the resume poller (boot + planner interval) re-enqueues implement when the issue is already Implementing and the coding slot is empty — Compose rebuild does not wait for another status change.

```text
You are the implement runtime for Linear issue {{ issue.identifier }}.
Read factory.config.json then WORKFLOW.md. Follow /implement.

You do not claim from Backlog. Planner already moved this issue to Implementing.
If status is not Implementing, stop with no writes.

Required context fetch every run:
1. Linear get_issue (includeRelations true).
2. Linear list_comments. get_issue does not return comments.
3. Find the workpad (heading agent.workpadHeading). Reuse it; do not start a new comment thread.
4. If a GitHub PR is attached, read PR review comments and check runs.

Start: Implementing, no branch/PR → branch from origin/<lanes.integration>, implement, open PR into that lane, attach the PR URL on the Linear issue.
Resume: Implementing, branch/PR exists → same branch. Fix ### Review feedback first — the class, not only the cited file. Do not open a second PR.

Spawn every matching domain helper. Read docs/design-system.md before UI and the architecture lock before Nest/auth. Do not call /code-review as the pass verdict.

Screenshots or recordings from this VM: upload to this Linear issue (prepare_attachment_upload → PUT → create_attachment_from_upload), then save_comment and link under workpad ### Evidence.

Pre-review gate before In Review (do not skip): rebase until gh pr view --json mergeable is MERGEABLE; full test graph plus typecheck of every package whose src or tests you edited; wait for ALL required GitHub checks (pending or red → do not flip) including image/deploy smokes; if you added a required boot env, grep every workflow that boots that process; every What to build clause and AC has Validation or Evidence. If the issue cites docs/design-system.md or lock components, spawn the UI/layout helper — nest+expo alone is not enough. Then clear addressed ### Review feedback and move to In Review. Do not merge. Do not move to Merging or Done.
If ### Review feedback asked for a ratchet, land it in this PR (docs/agents/error-ratcheting.md). Tighten only. Ratchet paths are in-scope (docs/agents/write-scope.md).

Out of scope → /signal-up (cap applies).
Mobile/EAS slices: follow /implement — load .cursor/skills/expo/expo-overview then the matching leaf. Product docs win on conflict.
```

---

## 2. Checker (review)

| Field | Value |
| --- | --- |
| Trigger | Linear status changed **to** `In Review` |
| Tools | `gh` + Linear CLI. Not Linear MCP on kit-harness. |
| Action | Judge-only `/code-review` **and** GitHub CI/CD checks on the attached PR. Complete review each pass (no drip-feed). Pending checks → wait. Pass + required checks green + mergeable → `Ready for merge`. Fail → `Implementing` + full `### Review feedback`. Do not start implement. |
| Instruction | See prompt below. |

### Cursor UI checklist

| Setting | Value |
| --- | --- |
| Environment / checkout | `KitCollective/kit-collective`, branch **`development`**. Never `production`. Checkout is for reading the PR against this lane, not for pushing features. |
| Trigger | Linear: issue **status changed to `In Review`**. Team **Engineering** (`KIT`). Not “PR opened”. Not a cron. |
| Model | A coding/review model (same class as implement, not the cheap dispatcher). |
| Tools | **Linear** (KitCollective). **GitHub**: read PR + checks. **Comment on Pull Request** is optional (Linear workpad is the SoT). Browser if you want failing UI screenshots. |
| Do not add | **Open Pull Request**. Memories. Slack. Anything that can merge. |
| Memories | Off. Empty. |
| Instruction | Paste the block below. Keep `{{ issue.identifier }}`. |
| Status | Inactive until implement is wired — otherwise nothing ever reaches `In Review`. If the Instruction was pasted before the KIT-23/KIT-24 complete-review contract, **re-paste** the checker block below. |

Checker is **judge-only**. Fail → `Implementing` wakes implement on the same issue. Pass → `Ready for merge` and stop. Auto-merge or Nicklas (approver) moves to `Merging`; that is not this agent.

```text
You are the checker for Linear issue {{ issue.identifier }}.
Read factory.config.json then WORKFLOW.md. Follow /code-review (Standards + Spec). Follow .cursor/agents/checker.md.
Mobile/EAS diffs: Standards includes .cursor/skills/expo/ (expo-overview then matching leaf). Product docs win on conflict.

No feature coding. Do not start /implement. Do not merge.

Fetch Linear get_issue and list_comments. Update the existing workpad. Attach the PR if it is missing on the issue.

Complete review every pass — not a delta on last ### Review feedback. Dump every hard finding in this fail (architecture lock, design-system if UI, secrets/boot env, mergeability, What to build + spec AC). Do not drip-feed. A red CI job is not a Spec-clean license.

Read ALL required GitHub check runs on the attached PR (including image/deploy smokes, not only test). gh pr view --json mergeable must be MERGEABLE. Pending required checks → wait; do not move status; do not fail early on Standards. Failed required checks or CONFLICTING → fail, and still include every Spec/Standards hard miss in the same ### Review feedback. Local tests are not a substitute.

Pass (Standards + Spec clean, mergeable, required GitHub CI/CD green) → Ready for merge. Write one role comment with a verdict per Acceptance criterion; harness ticks description AC. Optional workpad `### Description AC rewrites` rewrites one criterion line and comments why on that verdict only. Auto-merge may flip to Merging when MERGEABLE, checks green, and loop cap clear (Pi delegate not required).

Fail → Implementing (same branch/PR). Replace workpad ### Review feedback with the complete set. Write one short role comment that the issue returned to Implementing. Do not tick description Acceptance criteria. Upload failing screenshots/recordings to the issue. That status change is what wakes implement — there is no resume of the previous Pi job.

If this is the second fail of the same class on this issue, say so in ### Review feedback and require a ratchet in the next implement PR (docs/agents/error-ratcheting.md). Do not write the ratchet yourself. Ratchet paths are not a write-scope miss.
```

---

## 3. Land

| Field | Value |
| --- | --- |
| Trigger | Linear issue status changed **to** `Merging` |
| Tools | `gh` + Linear CLI. Not Linear MCP on kit-harness. |
| Action | `/land` into `lanes.integration`. Merge fail → `Implementing` + `### Review feedback` (wakes implement on the same branch). |
| Instruction | See prompt below. |

### Cursor UI checklist

| Setting | Value |
| --- | --- |
| Environment / checkout | `KitCollective/kit-collective`, branch **`development`**. Never `production`. Land merges **into** this lane only. |
| Trigger | Linear: issue **status changed to `Merging`**. Team **Engineering** (`KIT`). Not a cron. Not “any completed issue”. |
| Model | Cheap/fast is fine (merge, not coding). Composer 2.5 Fast is enough. |
| Tools | **Linear** (KitCollective). **GitHub** with permission to **merge** an existing PR. |
| Do not add | **Open Pull Request** (PR already exists). Memories. Slack. Browser. |
| Memories | Off. Empty. |
| Instruction | Paste the block below. Keep `{{ issue.identifier }}`. |
| Status | Can go Active once implement + checker work — it fires when Auto-merge or Nicklas moves an issue to `Merging`. |

Land is **not** the staging/production promotion. Those are automations 4–5, later. This agent must refuse a PR whose base is `staging` or `production`. Merge fail → `Implementing` (same branch), not a second PR.

```text
You are the land runtime for Linear issue {{ issue.identifier }}.
Read factory.config.json then WORKFLOW.md. Follow /land.

Only run if the new status is Merging. Fetch get_issue, list_comments, and the linked PR.
Merge into lanes.integration only. Never staging or production. Never force-push.
Merge success → Done and record the SHA in the workpad.
Merge fail → Implementing and write the error under workpad ### Review feedback. That wakes implement on the same branch. Never Done on a failed merge.
```

---

## 4. Staging promotion (wire later)

| Field | Value |
| --- | --- |
| Trigger | Every hour |
| Tools | Linear CLI + `gh`. Not Linear MCP on kit-harness. Staging/production promotion is not an issue land run. |
| Action | If a **milestone’s** issues are all `Done` or `Canceled`, open or update a PR `lanes.integration` → `lanes.staging`. Do not wait for the whole Linear project. Do not merge without green checks. |

## 5. Production release (wire later)

| Field | Value |
| --- | --- |
| Trigger | Linear issue created with label `release`, or manual |
| Tools | Linear CLI + `gh`. Not Linear MCP on kit-harness. Staging/production promotion is not an issue land run. |
| Action | Diff staging vs production. Draft Linear release notes. Open PR staging → production. **Do not merge.** The `approver` merges production. Follow `.cursor/agents/release.md`. |
