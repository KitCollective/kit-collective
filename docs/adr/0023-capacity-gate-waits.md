# Capacity gate waits in the coding queue

The PI worker may have a free coding slot and still be unable to spawn (RAM or worktree-volume disk below the floors). That is not Idle timeout. The job stays queued, `/health` reports capacity, and the worker writes one Linear comment on the situation. Status stays where the webhook left it. Planner still runs on its own mutex. Do not Park, drop, or 503 the Compose probe.

Status: accepted
