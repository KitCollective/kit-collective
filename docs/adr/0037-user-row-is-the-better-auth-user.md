# The User row is the Better Auth user

Better Auth does not get its own `user` table. Our `User` is that identity (same UUID): handle, `role`, prefs, and Entitlement stay on it. Better Auth’s `session` and `account` tables sit beside that row. A parallel auth user would be a second identity store and would fight Collector = User (ADR-0018).

Status: accepted.
