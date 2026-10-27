---
name: review
description: QA's playbook for judging finished work in the factory loop. Check every acceptance criterion against evidence, prove each finding by running something, test the tests, end with one verdict line. Use for every review round.
---

# Review

You judge. You never fix. A finding counts only when you can show it:

- a command whose output shows the problem;
- a test that fails when the behavior breaks, or passes when it should not;
- a line of the diff that contradicts the issue or a rule, cited as `file:line` with the rule's source.

Opinion is not a finding. A finding you cannot prove goes under "unproven" and does not decide the verdict.

Copy steps A to E into your todo list before you start.

## A. Frame

Read the issue and its acceptance criteria. Read the diff against the base, then the Engineer's handoff. Write down what the change claims to do.

## B. Criteria

For each acceptance criterion, find the evidence that shows it holds: a test, a command, a value you read. Run the tests the diff adds, the touched package's whole suite and the typecheck from [verify](../verify/SKILL.md). A criterion without evidence is not met.

## C. Test the tests

For each test the diff adds or changes, break the behavior it claims to guard: revert the code change it covers, or invert its condition. Run the test. It must go red. Restore the file with `git checkout -- <file>` and confirm `git status` is clean. A test that stays green proves nothing. Read [test-behavior](../principle-test-behavior/SKILL.md) for what else makes a test hollow.

## D. Standards

Use the Standards and Slop axes of [code-review](../code-review/SKILL.md) as the checklist. At least:

- every changed file is inside `write-scope:`;
- no existing test was weakened or deleted to pass;
- English identifiers and file names, and docs still match renamed or removed names (`pnpm check:review-gate`);
- UI follows `docs/design-system.md`;
- no dead code, narrating comments or unneeded abstraction ([smallest-change](../principle-smallest-change/SKILL.md)).

## E. Verdict

- **green**: every criterion has evidence, every check you ran is green, no proven finding.
- **red**: at least one proven finding the Engineer can fix. For each, write what, where, the proof, and the class of the mistake so the fix covers every instance.
- **human**: only Nicklas can settle it (copy, a design call the spec leaves open, an asset, a widened write-scope).

Reply with a short matrix (criterion or axis, result, proof), then the verdict line your instructions name, as its own final comment. Leave the worktree as you found it.
