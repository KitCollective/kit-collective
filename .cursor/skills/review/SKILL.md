---
name: review
description: QA's playbook for judging finished work in the factory loop. Run the fixed checks, check every acceptance criterion against evidence, prove each finding by running something, test the tests, end with one verdict line. Use for every review round.
---

# Review

You judge. You never fix. A finding counts only when you can show it:

- a command whose output shows the problem;
- a test that stays green when the behavior breaks;
- a line of the diff that contradicts the issue or a rule, cited as `file:line` with the rule's source.

Opinion is not a finding. A finding you cannot prove goes under "unproven" and does not decide the verdict.

Copy steps A to E into your todo list, with every checkbox, before you start.

## A. Fixed checks

Run every line from the repo root. Any red line is a proven finding.

- [ ] `git diff --name-only <base>..HEAD` lists only files inside the issue's `write-scope:`.
- [ ] `git diff <base>..HEAD -- '*test*'` deletes or loosens no existing assertion, unless the issue changes that behavior.
- [ ] The touched package's whole suite: `cd apps/mobile && pnpm exec vitest run` (other areas: [verify](../verify/SKILL.md)).
- [ ] Typecheck: `cd apps/mobile && pnpm exec tsc -p tsconfig.json --noEmit` (other areas: [verify](../verify/SKILL.md)).
- [ ] `pnpm format:check`
- [ ] `pnpm lint:anti-slop`
- [ ] `pnpm check:review-gate`

## B. Frame

- [ ] Read the issue and its acceptance criteria, the diff against the base, and the Engineer's handoff. Write down what the change claims to do.

## C. Criteria

- [ ] For each acceptance criterion, find the evidence that shows it holds: a test, a command, a value you read. Check it covers every field the criterion names and its reverse case. A criterion without evidence is not met.

## D. Test the tests

- [ ] For each test the diff adds or changes, break the behavior it guards: revert the code change it covers, or invert its condition. Run the test. It must go red.
- [ ] Restore with `git checkout -- <file>` and confirm `git status` is clean.

A test that stays green proves nothing. Read [test-behavior](../principle-test-behavior/SKILL.md) for what else makes a test hollow. Also check UI against `docs/design-system.md`, and the code for dead branches, narrating comments and unneeded abstraction ([smallest-change](../principle-smallest-change/SKILL.md)).

## E. Verdict

- **green**: every fixed check is green, every criterion has evidence, no proven finding.
- **red**: at least one proven finding the Engineer can fix. For each, write what, where, the proof, and the class of the mistake so the fix covers every instance.
- **human**: only Nicklas can settle it (copy, a design call the spec leaves open, an asset, a write-scope that must widen).

Reply with a short matrix (check or criterion, result, proof), then the verdict line your instructions name, as its own final comment. Leave the worktree as you found it.
