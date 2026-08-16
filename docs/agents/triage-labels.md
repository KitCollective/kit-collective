# Triage labels

Canonical Matt Pocock roles, plus factory extras. Names must match `factory.config.json` / `linear.setup.json`. Linear **label groups** are layout only — agents still match the leaf name.

Dispatch is **not** a label. Dispatch = `dispatch.state` + delegated to `linear.delegateAgentName` + unblocked. Linear priority is claim order among eligible issues, not eligibility.

Linear **Triage** (Sentry inbox) and **Duplicate** are Linear product states. They are not this label group and not factory dispatch statuses. See `docs/agents/issue-tracker.md`.

## Issue groups

| Group | Labels | Who applies them |
| --- | --- | --- |
| Triage | `needs-triage`, `needs-info`, `ready-for-human`, `ready-for-agent`, `wontfix`, `signal-up`, `proposal` | signal-up / proposals; `/to-spec` / `/to-tickets`; humans |
| Spec | `kickoff` | `/to-spec` kickoff |
| Type | `Bug`, `Feature`, `Improvement` | humans; `/to-spec` feature reuses `Feature` |
| Surface | `surface:<name>` from `labels.surfaces` | `/to-tickets` — helper hint, **not** a horizontal split |
| Work | `seed` and other `labels.extra` | humans / specs |

`ready-for-agent` is ticket quality, **not** dispatch. `signal-up` and `proposal` must also have `needs-triage`. Never put both `signal-up` and `proposal` on the same issue.

## Project groups (EP filter)

Linear **projects** (kickoff), not issues. Never split a vertical slice by these.

| Group | Labels |
| --- | --- |
| Craft | `craft:design`, `craft:frontend`, `craft:backend` |
