---
name: build
description: The Engineer's playbook for one issue in the factory loop. Frame the change, run a failing behavior test, make the smallest change that turns it green, run the fixed checks, subtract, hand off. Use for every build round and every fix round.
---

# Build

You own one issue in its own worktree. Gates and an independent QA on another model judge the result. Your job is a change that is correct, small, inside its write-scope and proven.

Copy steps A to F into your todo list, with every checkbox, before you start. A step you skip stays in the list with `skip: <reason>`.

Read each principle when its trigger fires:

| Principle | Read it when |
| --- | --- |
| [test-behavior](../principle-test-behavior/SKILL.md) | You write, change or keep a test. |
| [smallest-change](../principle-smallest-change/SKILL.md) | You size the change, or want a new abstraction, flag or layer. |
| [fix-root-causes](../principle-fix-root-causes/SKILL.md) | A bug, a red gate or a QA finding. |
| [model-the-domain](../principle-model-the-domain/SKILL.md) | Logic with state or many branches. |
| [prove-it-works](../principle-prove-it-works/SKILL.md) | Before you say a thing is done. |

## A. Frame

No code yet.

- [ ] Two lines in your notes: the goal the issue's user sees, and the smallest change you expect to meet it.
- [ ] Copy the issue's `write-scope:` globs into your notes. Every file you change must match one.
- [ ] Map each acceptance criterion to one observable behavior and the seam where a test can see it: a function's return, a hook's state, a component's props, an HTTP response, a row written. A criterion with no testable seam goes in the handoff as such.
- [ ] Read the code at those seams and the tests next to them. Name the data shape you change.
- [ ] Fix round: read the red reason first, name the class of the mistake, and grep for every other place it can live.

## B. Red

- [ ] For each mapped behavior, write the test first, through the seam's public interface.
- [ ] Cover the whole criterion: every field it names, and the reverse case when it says one thing must not affect another. State that spans items (two jerseys, two tabs) is tested by switching between them and coming back.
- [ ] Run only that file, with the one-file command for its area from the repo's [verify](../verify/SKILL.md) skill.
- [ ] It fails on the assertion, for the reason the issue describes. An import error or a missing export is not red: fix the test until the assertion is what fails.
- [ ] Paste the failing assertion line into your notes. **No production code before this line exists.**

No fast test can see the behavior (pure styling, copy, a native-only effect): say why in one line and take the closest proof from [verify](../verify/SKILL.md). Never assert on source text (`readFileSync` plus a regex) when a seam exists.

## C. Green

- [ ] Write the smallest code that turns the red tests green. No abstraction, option or layer the issue does not need.
- [ ] A file you need is outside `write-scope:`. The loop's scope policy adds it on its own when it is a test or fixture, or a source file, in a package the scope already touches (for example `apps/web` or `packages/api`), it is not a high-risk path (`.github`, `.cursor`, `.claude`, `scripts`, `paperclip`, migrations, Docker files), and no other live issue holds it, up to 8 files. Then change it and list it under **Scope additions** in the handoff, with why. Any other file: do not edit it. Hand off `blocked`, naming the file and why.

## D. Prove

Run every line from the repo root. All must pass before you hand off.

- [ ] `git diff --name-only $(git merge-base HEAD <base>)` lists only files inside `write-scope:` or under **Scope additions**. `<base>` is the loop's base ref, named in [verify](../verify/SKILL.md).
- [ ] API or database code changed: load this issue's own database first, as [verify](../verify/SKILL.md) says.
- [ ] The diff adds a migration: prove it on the issue's database with the migration commands in [verify](../verify/SKILL.md). Paste their report in the handoff.
- [ ] The touched package's whole suite ([verify](../verify/SKILL.md)).
- [ ] The touched package's typecheck ([verify](../verify/SKILL.md)).
- [ ] Every repo-wide check [verify](../verify/SKILL.md) lists before a push.

A red line you did not cause: show it is red on the base commit too, and name it in the handoff. A red line you caused: fix it and run the whole list again.

## E. Subtract

- [ ] Read your whole diff against the base. Delete what the behavior does not need: dead branches, unused exports, comments that narrate the code, guards for states that cannot happen, debug logging.
- [ ] Run step D again.

## F. Hand off

- [ ] Commit with a message that says what changed and why. Push and open or update the PR, as the loop's instructions say.
- [ ] Post one handoff comment:
  - the goal, in one line;
  - each criterion: its test as `file :: test name`, the red line from step B, now green;
  - each line of step D with its result;
  - **Scope additions**: each file outside `write-scope:` you changed, and why;
  - the principles that changed a decision, and which decision;
  - what you could not prove, and why.
- [ ] Post the report line your instructions name, as its own final comment.

## Never

- Edit an existing test so it passes, unless the issue changes that behavior. Then say so in the handoff.
- Wait for CI or a deploy. The gates wait.
- Change issue state, labels or assignee.
