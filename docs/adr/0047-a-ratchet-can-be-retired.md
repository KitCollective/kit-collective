# A ratchet can be retired when its cause is gone

Error ratcheting is tighten-only with no exit, so hooks outlive the systems they guard: `block-pi-ci-sleep.sh` still denies any wait for GitHub checks after the Pi worker it protected was archived on 2026-09-01, while the pre-review gate tells the implement runtime to wait for those checks. A hook that blocks legitimate work teaches agents to route around hooks, which weakens the ones that matter.

Proposal: a ratchet may be **retired**. Tighten-only still holds for everything else: no loosening, emptying or bypassing a ratchet to get a PR green.

A retirement is valid only when all of these hold:

1. One of the grounds applies, and the PR names it:
   - **Gone**: the system or path the ratchet guards no longer exists in this repo.
   - **Superseded**: a CI check or a stricter ratchet enforces the same thing, and the retiring one adds no earlier or cheaper signal worth its cost.
   - **Blocks legitimate work**: it denies work another committed rule requires.
2. The approver makes the change. An agent may propose a retirement and name the ground; it does not delete or unwire a hook itself, and a retirement never rides inside an implementation PR.
3. The retirement is recorded in `docs/agents/error-ratcheting.md` under a **Retired ratchets** table with the date, the ground and what covers the original mistake now.

Ratchets that guard something irreversible (destructive git, a shared database, a lane) are not retired on the **Superseded** ground alone: a CI check runs after the damage.

If accepted, this supersedes the "never delete" clause of `docs/agents/error-ratcheting.md` for retirements made this way.

## First candidates

| Ratchet | Ground | What covers the mistake now |
| --- | --- | --- |
| `block-pi-ci-sleep.sh` (KIT-118) | Gone, and blocks legitimate work: no harness waits for checks any more, and `.cursor/rules/pre-review-gate.mdc` step 3 requires the implement runtime to wait | The pre-review gate |
| `block-push-behind-development.sh` (KIT-23) | Superseded: it denies every push once `development` has moved, including the push that fixes the branch | Pre-review gate step 1 (`MERGEABLE` before In Review) and GitHub's mergeable state on the PR |

Retiring one means: delete the script and its test, remove its entry from `.cursor/hooks.json`, remove its `node --test` step from `.github/workflows/ci.yml`, and move its section in `error-ratcheting.md` to the Retired table.

Reviewed and kept, although they came from single incidents: `block-coolify-rest-service-control.sh`, `block-manual-getmcptools-evidence.sh`, `block-manual-seed-development-proof.sh`, `block-hand-typed-seed-db-counts.sh`. The systems they guard (Coolify, the seed proof path) still exist, so none of the grounds applies.

Status: proposed. Not in force until the approver accepts it.
