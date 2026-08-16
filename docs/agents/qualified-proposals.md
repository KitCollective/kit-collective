# Qualified proposals

When you see a **feature or optimisation** worth doing that is outside the current issue, file a proposal. Qualify first: search Linear for an existing issue or spec that already covers it.

Proposals never dispatch until a human triages them.

## When to use

- You observed a concrete improvement while implementing.
- It is not required to close the current issue, and expanding the PR would be wrong.

## When not to use

- Bugs, debt, follow-ups — `docs/agents/signal-up.md`.
- Red CI or review feedback on the current PR — fix or resume.
- Factory gates, workflow states, or promotion policy — surface to the operator; do not file a proposal that widens how the factory judges agents.

## Create contract

New Linear issue only. Do not dual-label with `signal-up`.

**Required**

- Status = `dispatch.state`
- Labels: `proposal` + `needs-triage`
- At most **one** proposal per implement run

**Allowed optional**

- `needs-info` if the operator must clarify

**Forbidden**

- `ready-for-agent`
- Delegate

## Body shape

```markdown
## Proposal
- Origin: <teamKey>-n
- Serves / contradicts spec: <path or Linear project>

## Idea
<what and why, two short paragraphs max>

## Suggested acceptance (optional)
- …
```
