# Hy3 Scout and Gate

Feature spec on Linear project **PI**, milestone **Worker**. Parent spec: [PI — Agent harness](https://linear.app/kitcollective/document/pi-agent-harness-80518c1ef233). Domain nouns: `CONTEXT.md`. Decision: ADR-0021. Grill lock: Implement parent stays Composer; Scout and Gate use Hy3.

## Problem Statement

Every implement job on `kit-harness` is one Composer session. Scout recon and the mechanical half of pre-review burn input tokens on a coding model. Nicklas wants that tool-calling work on a cheap OpenRouter model without giving Scout or Gate the In Review move, and without sending whole files, the workpad, or collector photos to Tencent.

## Solution

The Implement parent remains `PI_MODEL` Composer. Every implement job spawns Scout, then matching helpers (they inherit Composer), then Gate. Scout and Gate pin Hy3 (no-think) in Pi agent frontmatter. `OPENROUTER_API_KEY` lives on the box; missing it fails the implement job closed. Gate returns a green or red report. The parent writes `### Validation` and is the only session that may move to In Review. Exacto routing is preferred when the client allows it, not a hard fail.

## User Stories

1. As Nicklas, I want the Implement parent to stay Composer, so that product code and helper red→green are not Hy3.
2. As Nicklas, I want Scout and Gate on Hy3, so that recon and mechanical pre-review stop paying Grok/Composer rates.
3. As the Implement parent, I want to spawn Scout before any writes, so that the first map of files, seams, and risks exists.
4. As Scout, I want read/grep/find/ls only, so that recon cannot edit the worktree.
5. As Scout, I want to send paths and grep snippets only, so that whole files never go to OpenRouter.
6. As Scout, I do not want the workpad in my prompt, so that secrets and Linear prose stay off Tencent.
7. As Scout, I want to return a short brief (files, seams, risks), so that the parent can act without a dump.
8. As the implement job, I want Scout to be required, so that a missing OpenRouter key cannot silently skip recon.
9. As the implement job, I want a missing `OPENROUTER_API_KEY` to fail closed, so that we never pretend Hy3 ran on Composer.
10. As nest/expo/drizzle/ui-ux helpers, I want no model pin, so that I inherit the Implement parent.
11. As a helper, I want to keep writing the failing test and the minimal green, so that cheap tool-calling does not own TDD.
12. As Gate, I want to attempt rebase onto the integration lane, so that a clean tree is mechanical.
13. As Gate, I want a rebase conflict to be a red report, so that I never resolve conflict markers.
14. As the Implement parent, I want to resolve rebase conflicts, so that merge markers stay on the coding model.
15. As Gate, I want to typecheck touched packages on the box, so that the parent does not spend Composer on that loop.
16. As Gate, I want to wait for required GitHub checks, so that CI wait is not Composer.
17. As Gate, I want to return green or red with check names and typecheck output, so that the parent can write Validation.
18. As Gate, I do not want Linear CLI, so that Hy3 never sees or writes the workpad.
19. As Gate, I do not want to move In Review, so that a cheap model cannot pass the factory handshake.
20. As the Implement parent, I want to copy the Gate report into `### Validation`, so that evidence stays on the workpad.
21. As the Implement parent, I want to move to In Review only when Gate is green, so that a red mechanical gate cannot be ignored.
22. As the Implement parent, I want a red Gate to keep the issue Implementing, so that checker does not wake on a dirty tree.
23. As factory-checker, I want to stay a separate Pi process on In Review, so that Gate is not a substitute review.
24. As planner, I want to stay on `PI_MODEL_FAST` Grok, so that this slice does not retarget dispatch.
25. As land, I want to stay on Grok, so that merge/Done is not Hy3.
26. As Nicklas, I want `OPENROUTER_API_KEY` named in env example and required on `kit-harness`, so that the secret is not invented at boot.
27. As the worker, I want `CURSOR_API_KEY` still required, so that the parent and helpers keep using the Cursor SDK.
28. As the worker, I want `PI_MODEL` to remain Composer for implement spawn, so that Hy3 is never the job `--model`.
29. As Pi, I want Scout and Gate frontmatter `thinking` off, so that Hy3 does not spend default chain-of-thought on grep.
30. As Pi, I want the Hy3 model id to be OpenRouter `tencent/hy3`, so that we do not pin a stealth slug.
31. As Nicklas, I do not want stealth/ox-alpha as a fallback, so that anonymous retain cannot enter the worker.
32. As Vision, I want collector photos to stay off OpenRouter, so that this slice does not reverse the photo-subprocessor lock.
33. As Nicklas, I want Exacto preferred when the OpenRouter client can set provider sort, so that tool-calling accuracy is nudged without a Pi fork.
34. As the slice, I want Exacto absence not to fail the job, so that default routing to `tencent/hy3` is enough.
35. As damage-control, I want Gate bash still blocked from `.env`, `rm -rf`, and `DROP DATABASE`, so that a mechanical agent cannot widen bash.
36. As the implement worktree, I want Scout and Gate cwd to be that issue tree, so that recon and rebase hit the same branch as the parent.
37. As Nicklas, I want one implement job still (one Pi process), so that we do not add a second worker container for Hy3.
38. As tests, I want no live OpenRouter call, so that CI never spends Tencent quota.
39. As `/tdd`, I want the existing implement-job seam, so that we do not invent a second public interface for routing.
40. As KIT-54, I want this slice not to reopen ADW/PR/In Review acceptance, so that Hy3 is routing inside an already-green implement job.
41. As write-scope, I want worker harness, Pi agent/role files, and env example names only, so that product apps are untouched.
42. As Nicklas, I want HITL install of `OPENROUTER_API_KEY` on the box after files land, so that git never holds the value.

## Implementation Decisions

- **Linear:** Feature on existing project PI. Attaches to existing milestone Worker. No second project. No new milestone (not its own product staging increment).
- **ADR:** ADR-0021 — OpenRouter Hy3 for Scout and Gate only.
- **Glossary:** Implement parent, Scout, Gate, Hy3 as in `CONTEXT.md`.
- **Modules:** Worker boot env (secret names) and the implement job runner (existing). Pi agent frontmatter and the implement role prompt are configuration behind that job, not a second module.
- **Implement parent:** Spawn still `PI_MODEL` = `cursor/composer-2.5`. Owns helpers, PR, workpad, In Review.
- **Scout:** Required. Read-only tools. Hy3, thinking off. Brief only. No Linear, no edits, no PR.
- **Gate:** New Pi agent. Hy3, thinking off. Rebase + typecheck + required checks. Conflict = red. Structured report to parent. No Linear CLI. No In Review.
- **Helpers:** nest, expo, drizzle, ui-ux omit `model` (inherit).
- **Fast roles:** planner, factory-checker, land stay `PI_MODEL_FAST` Grok. Unchanged spawn.
- **Secrets:** `OPENROUTER_API_KEY` name in env example and worker required set. Value on `kit-harness` only. `CURSOR_API_KEY` remains. `DATABASE_URL` still forbidden.
- **Routing:** Prefer OpenRouter Exacto when the client exposes provider sort. Do not fail the job if it does not.
- **Payloads:** paths, grep snippets, check names. Not whole worktree files, not the workpad, not collector photos.
- **Fail closed:** missing OpenRouter key → implement job throws. No Composer fallback for Scout/Gate.
- **Write scope:** `harness/**`, `.pi/**`, `.env.example`.
- **Factory checker:** still not a child of implement.

## Testing Decisions

Tests cover external behaviour at the highest public interface. They do not assert Pi TUI internals, OpenRouter HTTP, Tencent payloads, or live `pi` sessions.

**Good test:** Given a fake spawn and a worker env, assert the implement job still passes Composer as `--model`; Scout and Gate configuration pin Hy3 with thinking off; helpers omit model; missing `OPENROUTER_API_KEY` throws; env example names the key; implement role still forbids Gate from In Review (parent-only). Do not call OpenRouter.

**Seam (one):** Worker boot env + implement job runner — the same interface KIT-53/KIT-54 already test. Callers and tests cross that job: env invariants, spawn argv/env, and the configuration files the job requires (roles, Pi agents). Role and agent markdown are configuration behind the job, not a second seam.

**Adapters behind the seam (not the test surface):** real `pi` vs fake spawn; real OpenRouter vs absent network. Two spawn adapters already exist in harness tests.

**Do not add a seam** for Exacto, for a second Pi process, or for Linear MCP. Gate must not grow a Linear client in this slice.

**Modules tested:** worker boot env; implement job runner; Pi agent/role configuration the job requires.

**Prior art:** harness tests that already assert `PI_MODEL` / `PI_MODEL_FAST`, required worker secrets, Scout agent presence, and implement ADW In Review at the job seam. Extend those; do not start a new test graph.

`/tdd` will not re-quiz this seam.

## Out of Scope

- Changing `PI_MODEL` to Hy3 (Implement parent stays Composer).
- Hy3 for planner, factory-checker, or land.
- Hy3 for nest/expo/drizzle/ui-ux helpers.
- stealth/ox-alpha or any anonymous stealth slug.
- OpenRouter for Vision / collector photos.
- Gate writing the workpad or calling Linear CLI.
- Gate resolving rebase conflicts.
- Exacto as a hard fail if Pi cannot set provider sort.
- A second Docker service or parallel Pi job for Hy3.
- Factory-checker as a child of implement.
- Product apps (`apps/*`), `packages/db`, Coolify, EAS.
- Reopening KIT-54 ADW/PR acceptance.

## Linear

- **Project:** PI
- **Mode:** feature
- **Lead:** Nicklas
- **Priority:** None (not named)
- **Milestones** (each is one staging increment — a handful of issues, not the whole product):
  1. Worker — CX33 Compose worker already runs webhook + one Pi job and implement can open a PR. This feature completes when an implement job on that box spawns Hy3 Scout and Gate under a Composer parent, fails closed without `OPENROUTER_API_KEY`, and still only the parent may move to In Review. Demo: one implement run shows Scout/Gate model pins and a Gate report on the workpad. Not a separate product staging increment.

## Further Notes

- Glossary: `CONTEXT.md`. ADR-0021. Parent: Linear document PI — Agent harness.
- Linear document: https://linear.app/kitcollective/document/hy3-scout-and-gate-f762d85e11f3
- Signal-up [KIT-67](https://linear.app/kitcollective/issue/KIT-67/hy3-scout-and-gate-runner-under-composer-implement) is the related finding. `/to-tickets` shapes dispatch issues; this skill does not.
- Blocked on KIT-54 landing only insofar as write-scope overlaps; do not reopen that issue’s AC.
- Next slash: `/to-tickets` under Worker. Do not invent issues from this skill.
