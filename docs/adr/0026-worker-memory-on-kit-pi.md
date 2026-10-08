# Worker memory on kit_pi

Worker memory is one Hermes store on the existing `kit_pi` Compose volume at `/var/lib/kit-pi/hermes`. It lives outside every Issue worktree so image rebuild and Worktree reap leave the store. Not `/root/.pi`. Not `worktrees/KIT-n`.

**Memory writer** (KIT-112): factory-checker may search and write (`memory_add`, `memory_replace`, `memory_remove`) and run background review, correction detection, and shutdown flush.

**Memory readers** (KIT-111): implement parent, Scout, Gate, and helpers search only. Implement spawn excludes memory-write tools and `skill_manage`. Committed Hermes config sets `memoryMode: policy-only` with review, correction detection, and flush off for readers.

**Memory policy-only**: the system prompt gets a short memory policy, not a MEMORY.md dump or session_start lesson block. Git ratchets, `CONTEXT.md`, and the Linear workpad remain promotion — Hermes is staging, not factory law.

Land, Auto-merge, planner, and Intake do not spawn Pi and do not touch Worker memory.

Status: accepted
