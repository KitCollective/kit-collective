# Up to three implement slots and one finisher on one worker

The factory runs on one Compose process on kit-harness, not replicas and not a second host. Implement may occupy up to three slots (each its own Issue worktree) when Capacity gate clears per spawn. Factory-checker, Auto-merge, and land share one reserved Finisher slot that jumps queued implement and never becomes a fourth implement. Planner still has no claim cap; write-scope overlap still skips. On 8 GB the second and third implement often wait — Nicklas resizes the box; the worker does not pretend slot count is free RAM.

Status: accepted
