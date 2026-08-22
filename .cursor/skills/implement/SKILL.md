---
name: implement
description: Implement a delegated Linear issue. TDD at spec seams, spawn domain helpers, open a PR into the integration lane. Use for delegated Backlog issues and for resuming Implementing.
disable-model-invocation: true
---

# Implement

Load `factory.config.json` then `WORKFLOW.md`. Resolve names from [../_shared/factory.md](../_shared/factory.md). If `linear.setup.json` is missing, stop and run `/bootstrap-linear`.

Implement the work on Linear issue `{{ issue.identifier }}` (spec + tickets + comments).

Use `/tdd` where possible, at the seams already listed in the spec’s Testing Decisions (`/codebase-design` vocabulary). Do not quiz for seams during an unattended run. A hard repro with no loop yet → `/diagnosing-bugs` first, then TDD at the seam.

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

Once done, use `/code-review` on the diff against `origin/<lanes.integration>`. Fix hard failures before opening or updating the PR.

Do not treat “commit to the current branch” as done. The factory exit is a PR into the integration lane, proof on Linear, and status `In Review`.

## Unattended run

1. Status must be `Implementing`. If it is `dispatch.state`, stop — planner claims, you do not. Resume when a branch/PR already exists (checker or land sent work back). Same branch.
2. Every run: Linear `get_issue` **and** `list_comments` on this issue. `get_issue` does not return comments. Find the workpad (`agent.workpadHeading`). If a GitHub PR is attached, also read PR review comments.
3. On resume, treat `### Review feedback` and other issue/PR comments as the change request. Do not start a new branch.
4. One workpad comment. Start: branch from `origin/<lanes.integration>`. One issue, one PR **into that lane**. Title `<teamKey>-n: …`.
5. Out of scope → `/signal-up` (cap `agent.signalUpCapPerRun`).
6. Upload VM screenshots/recordings to this Linear issue, then comment and link under `### Evidence`.
7. After the PR is attached: clear addressed review feedback, move to `In Review`. Do not merge. Do not move to `Done`.
8. If `### Review feedback` required a ratchet, land it in this PR (`docs/agents/error-ratcheting.md`). Tighten only.

## Domain helpers

`/tdd` lists `paths.helpers` and spawns matches from each file’s YAML `description`. Do not hardcode helper names here.

When the slice is labelled `mobile` or touches `apps/mobile`, Expo Router, React Native, or EAS, the matching helper (`react-expo`, and `devops` for EAS) must load vendor Expo skills under `.cursor/skills/expo/`: `expo-overview` first, then the matching leaf. Record those skill names in the workpad under `### Domain helpers used`. Product docs win if they conflict with a vendor Expo default.

This implementer still owns the workpad, the branch, `/signal-up`, the PR, and the move to `In Review`. Planner owns claim. Helpers must not do those.
