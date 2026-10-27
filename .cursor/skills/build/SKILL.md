---
name: build
description: The Engineer's playbook for one issue in the factory loop. Frame the change, write a failing behavior test, make the smallest change that turns it green, prove it, subtract, hand off. Use for every build round and every fix round.
---

# Build

You own one issue in its own worktree. Gates and an independent QA on another model judge the result. Your job is a change that is correct, small and proven.

Copy steps A to F into your todo list before you start. A step you skip stays in the list with `skip: <reason>`.

Read before step A: the issue (What to build, Acceptance criteria, `write-scope:`), [verify](../verify/SKILL.md), and each principle below when its trigger fires.

| Principle | Read it when |
| --- | --- |
| [test-behavior](../principle-test-behavior/SKILL.md) | You write, change or keep a test. |
| [smallest-change](../principle-smallest-change/SKILL.md) | You size the change, or want a new abstraction, flag or layer. |
| [fix-root-causes](../principle-fix-root-causes/SKILL.md) | A bug, a red gate or a QA finding. |
| [model-the-domain](../principle-model-the-domain/SKILL.md) | Logic with state or many branches. |
| [prove-it-works](../principle-prove-it-works/SKILL.md) | Before you say a thing is done. |

## A. Frame

No code yet.

1. Write two lines in your notes. The goal the issue's user sees, and the smallest change you expect to meet it.
2. Map each acceptance criterion to one observable behavior and the seam where a test can see it: a function's return, a hook's state, a component's props, an HTTP response, a row written. A criterion with no testable seam goes in the handoff as such. Do not invent one.
3. Read the code at those seams and the tests next to them. Name the data shape you change.
4. Fix round: read the red reason first. Find the class of the failure, then grep for every other place the same mistake can live.

## B. Red

For each mapped behavior, write the test first, through the seam's public interface. Run only that file. It must fail, and for the reason the issue describes. An import error, a typo or a missing export is not red yet: fix the test until the assertion is what fails. Keep the failing assertion line for the handoff.

- A bug: the red test reproduces it.
- No fast test can see it (pure styling, copy, a native-only effect): say why in one line and take the closest proof from [verify](../verify/SKILL.md).
- Never assert on source text (`readFileSync` plus a regex) when a seam exists. Move the logic into `src/` and test it there.

## C. Green

Write the smallest code that turns the red tests green. No abstraction, option or layer the issue does not need. Stay inside `write-scope:`. A file you need outside it: stop and say so in the handoff.

## D. Prove

Run what [verify](../verify/SKILL.md) lists for every area you touched: the package's whole test suite, typecheck, format and lint. All green before you hand off. A red check you did not cause: show it is red on the base commit too, and name it in the handoff.

## E. Subtract

Read your whole diff against the base. Delete what the behavior does not need: dead branches, unused exports, comments that narrate the code, guards for states that cannot happen, debug logging. Run the tests again.

## F. Hand off

Commit with a message that says what changed and why. Push and open or update the PR, as the loop's instructions say. Post one handoff comment:

- the goal, in one line;
- each criterion: its test as `file :: test name`, the red line from step B, now green;
- the checks you ran and their result;
- what you could not prove, and why.

Then post the report line your instructions name, as its own final comment.

## Never

- Edit an existing test so it passes, unless the issue changes that behavior. Then say so in the handoff.
- Wait for CI or a deploy. The gates wait.
- Change issue state, labels or assignee.
