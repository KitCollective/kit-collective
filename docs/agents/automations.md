# Cursor Automations

Wire **planner + implement + checker + land** first. Staging/production later.

Linear MCP must point at the workspace in `factory.config.json`. `linear.setup.json` must exist.

Cursor’s Linear trigger fires on issue created / status changed / end of cycle — **not** on delegate. Planner therefore uses a short cron. Implement and checker wake on **status**, so they talk through Linear, not through a shared Cloud Agent session.

Each automation must read `factory.config.json` and `WORKFLOW.md` from the checkout. Do not paste a second copy of policy into the prompt. The **Instruction** field is what you paste into Cursor Automations.

Checkout: `github.ownerRepo`, branch `lanes.integration`. Planner can be Linear-only (no product edits).

Linear `get_issue` does **not** return comments. Every runtime that acts on an issue must also `list_comments`. The workpad is one comment; `### Review feedback` is why a pass was not good enough.

## Handshake (implement ↔ checker)

There is no “same Cloud Agent”. Each run is a new VM. **Same work** means: same Linear issue, same git branch, same PR, same workpad.

```text
planner:    Backlog + delegated + unblocked → Implementing (priority order)
implement:  Implementing (no PR) → branch + code + PR on Linear → In Review
checker:    In Review → Ready for merge
            or Implementing + ### Review feedback (+ attachments)
implement:  Implementing (PR exists) → same branch, fix feedback → In Review
approver:   Done
land:       merge to lanes.integration
```

Checker must **not** start implement. Planner must **not** write code. Implement must **not** claim from Backlog.

## Linear evidence

Screenshots, recordings, and other files from the Cloud Agent VM belong on the **Linear issue**, not only in the VM log.

1. `prepare_attachment_upload` on the issue (filename, contentType, size)
2. PUT the raw bytes to the signed URL (headers verbatim)
3. `create_attachment_from_upload`
4. `save_comment` on the issue with what the file shows
5. Link it under workpad `### Evidence`

Redact secrets. Never attach `.env`, cookies, or `Authorization` headers.

## Who moves status

| Move | Who |
| --- | --- |
| `dispatch.state` → `Implementing` | **Planner** (claim) |
| `Implementing` → `In Review` | **Implement** (PR + proof on Linear) |
| `In Review` → `Ready for merge` | **Checker** (pass) |
| `In Review` / `Ready for merge` → `Implementing` | **Checker** or **land** (fail) |
| → `Done` | **Approver only** |
| Merge to integration | **Land** |

---

## 0. Planner (dispatch)

| Field | Value |
| --- | --- |
| Trigger | Every 5 minutes (`*/5 * * * *`) |
| Tools | **Linear MCP only** |
| Eligibility | `dispatch.state` + delegated to `linear.delegateAgentName` + no `blockedBy` + not `signal-up` |
| Action | Cap `agent.maxConcurrent`. Claim the next eligible issue in `dispatch.priorityOrder`. No code. |
| Instruction | See prompt below. |

### Cursor UI checklist

| Setting | Value |
| --- | --- |
| Environment / checkout | `KitCollective/kit-collective`, branch **`development`** (`lanes.integration`). Never `production`. The agent must read `factory.config.json`, `WORKFLOW.md`, and `.cursor/agents/planner.md` from that branch. |
| Trigger | Custom schedule `*/5 * * * *` |
| Model | A cheap/fast model is fine (dispatcher, not coder) |
| Tools | **Linear** connected to workspace KitCollective. Remove **Open Pull Request**. Remove **Memories**. Do not add Slack/Teams. |
| Memories | Leave empty. Do not use. Factory truth is git + Linear, not a private `MEMORIES.md`. |
| Status | Keep Inactive until `development` has `planner.md` and you have implement + checker ready to wake. If the Instruction was pasted before this priority change, **re-paste** the block below. |

`MEMORIES.md` is a second source of truth the planner would write outside review. Recurring mistakes go on the Linear issue (comment) and into a ratchet in the **implement PR**. Wrong lessons are reverted with git.

```text
You are the planner. Read factory.config.json then WORKFLOW.md. Follow .cursor/agents/planner.md.

Linear only. No product code. No PRs. No .cursor/hooks or .cursor/rules edits.

Every run:
1. List KIT issues in dispatch.state that are delegated to linear.delegateAgentName, unblocked, not signal-up.
2. Count issues already in Implementing. Do not exceed agent.maxConcurrent.
3. Among remaining eligible issues, claim in dispatch.priorityOrder (Urgent 1, High 2, Medium 3, Low 4, None 0). Same rank: oldest first. Skip write-scope overlap with an Implementing issue. Do not preempt Implementing. That is the only status move you make.
4. If the same ### Review feedback class has failed twice on an Implementing issue, comment that the next implement pass must land a ratchet (docs/agents/error-ratcheting.md). Do not write the ratchet.

Never claim Triage or Duplicate. Never move to In Review, Ready for merge, Done, Parked, or Canceled.
```

---

## 1. Implement (start + resume)

| Field | Value |
| --- | --- |
| Trigger | Linear status changed **to** `Implementing` |
| Tools | Linear MCP, GitHub (PR + checks), browser if the slice is UI |
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
| Status | Inactive until planner + checker exist, and `development` has `/implement` + `WORKFLOW.md`. |

The Linear trigger is what makes checker-fail → `Implementing` wake **this** automation on the **same issue**. A new VM each time; same branch/PR because the workpad and the attached PR say so.

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
Resume: Implementing, branch/PR exists → same branch. Fix ### Review feedback first. Do not open a second PR.

Screenshots or recordings from this VM: upload to this Linear issue (prepare_attachment_upload → PUT → create_attachment_from_upload), then save_comment and link under workpad ### Evidence.

When the PR is up and proof is on Linear: clear addressed ### Review feedback, move to In Review. Do not merge. Do not move to Done.
If ### Review feedback asked for a ratchet, land it in this PR (docs/agents/error-ratcheting.md). Tighten only.

Out of scope → /signal-up (cap applies).
```

---

## 2. Checker (review)

| Field | Value |
| --- | --- |
| Trigger | Linear status changed **to** `In Review` |
| Tools | GitHub, Linear MCP |
| Action | Judge-only `/code-review`. Pass + CI green → `Ready for merge`. Fail → `Implementing` + workpad `### Review feedback`. Do not start implement. |
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
| Status | Inactive until implement is wired — otherwise nothing ever reaches `In Review`. |

Checker is **judge-only**. Fail → `Implementing` wakes implement on the same issue. Pass → `Ready for merge` and stop. Nicklas (approver) moves to `Done`; that is not this agent.

```text
You are the checker for Linear issue {{ issue.identifier }}.
Read factory.config.json then WORKFLOW.md. Follow /code-review (Standards + Spec). Follow .cursor/agents/checker.md.

No feature coding. Do not start /implement. Do not merge.

Fetch Linear get_issue and list_comments. Update the existing workpad. Attach the PR if it is missing on the issue.

Pass + CI green → Ready for merge. Comment on Linear that the issue is waiting for the approver.

Fail → Implementing (same branch/PR). Replace workpad ### Review feedback with what failed, file/criterion, and what done looks like. save_comment on the issue so the next implement run sees it. Upload failing screenshots/recordings to the issue. That status change is what wakes implement — there is no way to resume the previous Cloud Agent VM.

If this is the second fail of the same class on this issue, say so in ### Review feedback and require a ratchet in the next implement PR (docs/agents/error-ratcheting.md). Do not write the ratchet yourself.
```

---

## 3. Land

| Field | Value |
| --- | --- |
| Trigger | Linear issue status changed **to** `Done` |
| Tools | GitHub, Linear MCP |
| Action | `/land` into `lanes.integration`. Merge fail → `Implementing` + `### Review feedback` (wakes implement on the same branch). |
| Instruction | See prompt below. |

### Cursor UI checklist

| Setting | Value |
| --- | --- |
| Environment / checkout | `KitCollective/kit-collective`, branch **`development`**. Never `production`. Land merges **into** this lane only. |
| Trigger | Linear: issue **status changed to `Done`**. Team **Engineering** (`KIT`). Not a cron. Not “any completed issue”. |
| Model | Cheap/fast is fine (merge, not coding). Composer 2.5 Fast is enough. |
| Tools | **Linear** (KitCollective). **GitHub** with permission to **merge** an existing PR. |
| Do not add | **Open Pull Request** (PR already exists). Memories. Slack. Browser. |
| Memories | Off. Empty. |
| Instruction | Paste the block below. Keep `{{ issue.identifier }}`. |
| Status | Can go Active once implement + checker work — it only fires when **you** move an issue to `Done`. |

Land is **not** the staging/production promotion. Those are automations 4–5, later. This agent must refuse a PR whose base is `staging` or `production`. Merge fail → `Implementing` (same branch), not a second PR.

```text
You are the land runtime for Linear issue {{ issue.identifier }}.
Read factory.config.json then WORKFLOW.md. Follow /land.

Only run if the new status is Done. Fetch get_issue, list_comments, and the linked PR.
Merge into lanes.integration only. Never staging or production. Never force-push.
Merge fail → Implementing and write the error under workpad ### Review feedback. That wakes implement on the same branch.
```

---

## 4. Staging promotion (wire later)

| Field | Value |
| --- | --- |
| Trigger | Every hour |
| Tools | Linear MCP, GitHub |
| Action | If a **milestone’s** issues are all `Done` or `Canceled`, open or update a PR `lanes.integration` → `lanes.staging`. Do not wait for the whole Linear project. Do not merge without green checks. |

## 5. Production release (wire later)

| Field | Value |
| --- | --- |
| Trigger | Linear issue created with label `release`, or manual |
| Tools | Linear MCP, GitHub |
| Action | Diff staging vs production. Draft Linear release notes. Open PR staging → production. **Do not merge.** The `approver` merges production. Follow `.cursor/agents/release.md`. |
