# Auto-land trusts Device flows, and a slice's tests travel with it

Nicklas, 2026-10-17. Status: accepted. Settles ADR-0061's "Decision needed" items 1 (`surface:mobile`) and 2 (the 400-line cap), and widens `docs/agents/write-scope.md` by two kinds of companion path. Everything else in ADR-0061 stands, including its factory guard: a diff that touches `.bb/**`, `.github/**`, `factory.config.json` or the enforcement scripts is still `needs-human`.

## Why

With auto-land on (ADR-0063), seven of the eight runs on 2026-10-17 still stopped in `Approval`, and none needed a person's judgment:

- **`surface:mobile`.** Every mobile slice was refused because "the container has no simulator". Since ADR-0059 the hosted `Device flows` run checks a slice's flow on an iOS Simulator, and the review gate that auto-land runs already waits for that status when the PR holds the slice flow.
- **400 lines.** A UI slice with its tests is 800 to 3,000 lines. With this cap the size check sent nearly every slice to a person.
- **Write-scope.** The flow file `apps/mobile/.maestro/slices/<KEY>.yaml` and test files next to code in another module (the contract tests in `packages/api-contract/tests/`) fell outside globs written before the code existed. CI and auto-land both refused them, and the run asked a person to widen the line.

## Decision

1. **`surface:mobile` lands when the diff holds the issue's own slice flow.** The review gate then requires a green `Device flows` status on the head (ADR-0059). A mobile slice that has neither a slice flow nor `no-device-needed` is still `needs-human`.
2. **The diff cap is 4,000 lines** (`MAX_DIFF_LINES`). It is a runaway guard, not a review budget. A binary file counts as 400 lines.
3. **Companion paths** (`isCompanionPath` in `scripts/lib/pr-write-scope.mjs`): test files under `apps/` and `packages/` (`**/tests/**`, `*.test.*`), and the issue's own slice flow, are inside every write-scope. The CI ratchet and auto-land use the same rule. Tests under `scripts/` are not companions: the factory's own tests stay inside the declared scope, so a run cannot weaken a gate's tests without a person.

## Consequences

- A mobile slice with a flow, an independent reviewer, a green gate and green Device flows lands without a person.
- Two runs can still edit the same test file. A clash shows up as a merge conflict in the trial merge or in the queue, not as a scope refusal.
- `Approval` is left for the factory guard (schema, auth, IAP, workflows, factory paths), mobile slices without a flow, a diff over 4,000 lines, code outside the scope, and stop labels.
