---
name: principle-prove-it-works
description: Apply before you say something is done, works or is fixed. Check the real thing with a command and its output, not a proxy or a self-report.
---

# Prove it works

Adapted from pstack (Lauren Tan, MIT). See [NOTICE](../NOTICE.md).

Every claim of done carries its proof in the same sentence: the command you ran and the line of output that shows it.

- Check the real thing: run the test, read the value, open the rendered file. Not "it compiles", not a file that exists, not another agent's summary.
- A check you could not run is labelled "not verified" with the reason. Never hand QA or a person a check you could have run yourself.
- When a check fails, suspect the check before the system: wrong command, wrong directory, skipped build step ([verify](../verify/SKILL.md)).
- The strongest proof is a command someone else can rerun and get the same answer.
