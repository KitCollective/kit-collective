# Write scope

Parallel implement runs stay physically isolated (Cloud Agent VM + one branch per Linear issue). **Write scope** is so two issues do not *logically* fight over the same paths at merge time.

Not a board card. See **Write scope** in `CONTEXT.md`.

## Declare on the Linear issue

A single line in the body (or workpad):

```text
write-scope: apps/api/**, packages/db/**
```

`/to-tickets` should set this when the slice is obviously bounded. `/implement` must not edit files outside the globs when they are present.

## What the factory does

1. **Dispatch** — no concurrency cap. Planner claims every eligible issue (`dispatch.state` + `ready-for-agent` + unblocked, Agent field empty) in Linear priority order. When the next-in-priority issue’s globs overlap an `Implementing` issue, skip it and try the next; leave it in `Backlog` with `ready-for-agent` and comment why. Do not preempt.
2. **Implement** — treat the globs as a hard path boundary. Out of scope → `/signal-up`, not a wider PR.
3. **Checker** — files outside the declared globs are a Spec/Standards finding unless the issue said the scope was unset.

Until an issue declares scope, planner does not skip for path overlap — only `blockedBy` and priority apply.
