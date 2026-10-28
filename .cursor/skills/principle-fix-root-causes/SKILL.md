---
name: principle-fix-root-causes
description: Apply to a bug, a red gate or a QA finding. Fix the first place the system went wrong, and every other place with the same fault, not the place the symptom showed.
---

# Fix root causes

Adapted from pstack (Lauren Tan, MIT). See [NOTICE](../NOTICE.md).

The symptom is where a wrong state became visible. The root cause is the first place the code did something it should not, or failed to handle a state it should handle.

- Reproduce first, with a red test where you can.
- Ask "why" at each step until the answer is a wrong decision in the code, not a consequence of an earlier one.
- Read the actual error and the actual state. Do not guess.
- Is the state that triggered the symptom legitimate? If yes, the code that broke on it is the fault: handle it there. If no, a guard where it broke hides the bug: find what produced the state.
- Guards, retries, swallowed errors and clamped values are the usual ways to hide a bug.
- Fix the class, not the instance. A QA finding or a red gate names one place: grep for every place with the same mistake and fix them all.
