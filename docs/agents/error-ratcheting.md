# Error ratcheting

When the same class of mistake recurs, land the fix as a **committed, reviewable constraint** in the repo — a Cursor hook or an always-applied rule — in the **same PR** as the code fix. The approver approves the constraint together with the code.

This is not a memory store. Wrong lessons are reverted with git.

## Tighten only

- Agents may **add** or **strengthen** hooks and rules.
- Agents must **never** loosen, delete, empty, or bypass an existing ratchet.
- If a ratchet blocks legitimate work, open a `signal-up` Linear issue (`docs/agents/signal-up.md`) instead of editing the hook to get past it.

## Where constraints live

| Path | Role |
| --- | --- |
| `.cursor/hooks.json` | Which events run which scripts |
| `.cursor/hooks/*.sh` | Command hooks (deny/allow) |
| `.cursor/rules/*.mdc` | Always-applied agent rules |
| `docs/agents/error-ratcheting.md` | This contract |

## Default factory ratchet

Command hooks on `beforeShellExecution` (fail closed). Scripts must print `{"permission":"allow"}` or `{"permission":"deny"}` on stdout — empty output is a hook failure.

1. `block-dangerous-git.sh` — no force-push, hard reset, `clean -f`, branch `-D`
2. `block-reward-hacks.sh` — no shell deletion of tests or `.github/workflows`
3. `protect-ratchet.sh` — no shell removal/emptying of `.cursor/hooks*`

Do **not** put factory learning in `sessionStart` context injection or in Cursor Automations **Memories** (`MEMORIES.md`). Cloud Agents may never see sessionStart; Memories is an unreviewed second source of truth. Prefer `beforeShellExecution` denials and always-applied rules / `AGENTS.md`. The planner comments on Linear; it does not keep a memory file of ratchets.

## When to propose a new ratchet

After checker fail or approver reject, if the mistake is a **recurring class** (not a one-off logic bug):

1. Fix the issue.
2. Add or tighten a hook/rule that would have caught it.
3. Keep the PR focused; explain the ratchet in the PR description.
4. Never weaken existing entries to make the PR green.

The **checker** may require this in `### Review feedback` on the second fail of the same class. The **planner** may comment the same requirement. Neither writes the hook or rule. The **implement** PR lands it. Prefer a hook over a new always-applied rule when a deny/allow gate would have caught it — do not grow `.cursor/rules/` for one-off mistakes.

### Seed package import ratchet (KIT-9)

`scripts/check-import-boundaries.mjs` denies `@kit/db` and `packages/db` imports inside `seed/fkapi/`. Seed mappers talk to Postgres via `DATABASE_URL` only (ADR 0001). Tighten only — do not remove this check without superseding ADR 0001.
