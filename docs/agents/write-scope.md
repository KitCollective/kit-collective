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

1. **Dispatch** — `agent.maxConcurrent` still caps parallel runs. Planner still uses Linear priority among eligible issues. When the next-in-priority issue’s globs overlap an `Implementing` issue, skip it and try the next; leave it in `Backlog` (delegated) and comment why. Do not preempt.
2. **Implement** — treat the globs as a hard path boundary. Out of scope → `/signal-up`, not a wider PR.
3. **Checker** — files outside the declared globs are a Spec/Standards finding unless the issue said the scope was unset.

Until an issue declares scope, dispatch stays concurrency-only.
