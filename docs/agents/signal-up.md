# Signal-up

When you discover work that is **out of scope** for the current Linear issue, file it as a new issue so a human can triage it. Do not expand the current PR.

## When to use

- You found a bug, debt, or follow-up that is not required to close the current issue.
- Fixing it would widen the diff or acceptance criteria.

## When not to use

- Red CI or review feedback on the current PR — fix or resume the current run.
- A feature or optimisation (not a bug/debt) — use `docs/agents/qualified-proposals.md`.
- Failures that block *this* issue’s acceptance — fix them here.

## Create contract

New Linear issue only. Do not edit issues you did not create. Do not delegate.

**Required**

- Status = `dispatch.state`
- Labels: `signal-up` + `needs-triage`
- Same project as the origin; related to the origin
- Cap: `agent.signalUpCapPerRun` (default 3). Further findings go in the workpad only.

**Forbidden**

- `ready-for-agent`
- `proposal` on the same issue
- Moving it to `Implementing`

A human removes `needs-triage` / shapes the ticket, then may apply `ready-for-agent` and later **delegate**. Dispatch still requires status + delegate + unblocked.

## Body shape

```markdown
## Signal-up
- Origin: <teamKey>-n
- Why out of scope: <1–3 sentences>

## Finding
<what you observed>

## Suggested acceptance (optional)
- …
```

Title: short and actionable. Link the new id under workpad `### Signal-up`.
