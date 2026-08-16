# Rules

1. Do not code it in this PR.
2. Create a Linear issue: status `dispatch.state`, labels `signal-up` + `needs-triage`, same project, related to the origin. `blockedBy` the origin only if it truly cannot start until this lands. Include title, description, acceptance criteria, and why it is out of scope.
3. Do not delegate. Do not apply `ready-for-agent` until a human triages it.
4. Cap `agent.signalUpCapPerRun` (default 3). Further findings go in the workpad only.
5. Link the new id under workpad `### Signal-up`.

May still fix blockers of *this* issue’s acceptance, and red CI / review on *this* PR.
