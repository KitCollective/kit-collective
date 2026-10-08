# Write scope

Parallel implement runs stay physically isolated (Cloud Agent VM + one branch per Linear issue). **Write scope** is so two issues do not *logically* fight over the same paths at merge time.

Not a board card. See **Write scope** in `CONTEXT.md`.

## Declare on the Linear issue

A single line in the body (or workpad):

```text
write-scope: apps/api/**, packages/db/**
```

`/to-tickets` should set this when the slice is obviously bounded. `/implement` must not edit files outside the globs when they are present.

## Ratchet exception

When `### Review feedback` or a planner comment on **this** issue requires a ratchet per `docs/agents/error-ratcheting.md`, these paths are in-scope for that PR even if they sit outside the issue’s globs:

- `.cursor/hooks/**`, `.cursor/hooks.json`, `.cursor/rules/**`
- `docs/agents/error-ratcheting.md`
- `scripts/` check scripts that implement the ratchet
- `.pi/first-pass-classes.json` when feedback requires a first-pass registry class
- `.github/workflows/**` only to add a CI step that runs the new check, or when feedback named a specific workflow (missing boot env, etc.)

Do not use this exception to expand product features. Checker must not treat these ratchet files as a write-scope miss.

## What the factory does

1. **Dispatch** — no concurrency cap. Planner claims every eligible issue (`dispatch.state` + `ready-for-agent` + unblocked, Agent field empty) in Linear priority order. When the next-in-priority issue’s globs overlap an `Implementing` issue, skip it and try the next; leave it in `Backlog` with `ready-for-agent` and comment why. Do not preempt.
2. **Implement** — treat the globs as a hard path boundary. Out of scope → `/signal-up`, not a wider PR. Ratchet exception above applies when checker/planner required it. `implement-exit` uses the image allowlist as the floor; a worktree `scripts/lib/pr-write-scope.mjs` may waive only new `scripts/check-*.mjs` / `scripts/tests/check-*.test.mjs` paths so a ratchet added on that PR is not retried against a stale image copy. Product and harness paths stay violations.
3. **Checker** — files outside the declared globs are a Spec/Standards finding unless the issue said the scope was unset, or the file is a required ratchet (exception above).

Until an issue declares scope, planner does not skip for path overlap — only `blockedBy` and priority apply.
