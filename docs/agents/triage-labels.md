# Triage labels

Canonical Matt Pocock roles, plus Kit Collective extras. Names must match `linear.setup.json`.

| Role | Label | Who applies it |
| --- | --- | --- |
| Needs triage | `needs-triage` | signal-up; humans clearing inbox |
| Needs info | `ready-for-human` | agent when a human decision is required |
| Ready for agent | `ready-for-agent` | `/to-spec`, `/to-tickets` — quality of the ticket, **not** dispatch |
| Won't fix | `wontfix` | humans |

Dispatch is **not** a label. Dispatch = `Backlog` + delegated to Cursor + unblocked.

| Extra | Meaning |
| --- | --- |
| `signal-up` | Out of scope for the current issue. Must also have `needs-triage`. |
| `kickoff` | Spec created a new Linear project. |
| `feature` | Spec against an existing project. |
| `surface:mobile` / `surface:web` / `surface:admin` / `surface:api` / `seed` | Hint for `/implement` which helper sub-agents to spawn. Still one vertical issue. |
