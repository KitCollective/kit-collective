---
name: signal-up
description: Files an out-of-scope finding as a new Linear Backlog issue with signal-up + needs-triage instead of expanding the current PR. Use during /implement when acceptance criteria do not cover the finding.
---

# Signal-up

1. Do not code it in this PR.
2. Create a Linear issue: `Backlog`, labels `signal-up` + `needs-triage`, same project, related to the origin. `blockedBy` the origin only if it truly cannot start until this lands. Include title, description, acceptance criteria, and why it is out of scope.
3. Do not delegate. Do not apply `ready-for-agent` until a human triages it.
4. Cap **3** per run. Further findings go in the workpad only.
5. Link the new id under workpad `### Signal-up`.

May still fix blockers of *this* issue’s acceptance, and red CI / review on *this* PR.
