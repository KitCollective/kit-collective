# Hung coding jobs move to Parked

Idle timeout used to leave the issue in Implementing, In Review, or Merging, so the next webhook could resume into another hang. After a hung Pi child is killed, the worker writes `### Review feedback` and moves the issue to Parked. Planner still never claims Parked. A human unparks when they want a retry. The worker is a second writer of Parked, and only on this path.

Status: accepted
