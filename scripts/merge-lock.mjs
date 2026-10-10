#!/usr/bin/env node
/**
 * The merge queue lock, shared by every machine (ADR-0054): one PR at a time is synced and merged.
 * The lock is the ref `refs/factory/merge-lock` on origin, moved with `--force-with-lease`.
 *
 * Usage: node scripts/merge-lock.mjs <take|wait|release> <pr> [--force]
 *        node scripts/merge-lock.mjs status
 *   take     take the lock, or say who holds it. The holder taking it again renews it.
 *   wait     retry every MERGE_LOCK_POLL seconds (30) until taken or MERGE_LOCK_WAIT seconds (3600).
 *            Run it in the background; never loop on `take` yourself.
 *   release  give the lock back; only the holder can. `release <pr> --force` is for a human to
 *            clear a crashed holder: it removes the lock whoever holds it, only with the flag.
 *   status   print the holder PR and its age. Exit 0 held, 3 free.
 *   Renew: the holder calls `take <pr>` again; do it right after a sync and before any long wait.
 * Env: MERGE_LOCK_STALE (default 1800): a lock older than this many seconds is taken over.
 * One line out. Exit: 0 taken or released, 3 another PR holds it, 1 cannot work, 2 usage.
 */
import { release, status, take, waitFor } from "./lib/merge-lock.mjs";

const [action, pr] = process.argv.slice(2);
const force = process.argv.includes("--force");
const known = ["take", "wait", "release", "status"].includes(action);
if (!known || (action !== "status" && !/^\d+$/.test(pr ?? "")) || (force && action !== "release")) {
  process.stderr.write(
    "usage: merge-lock.mjs <take|wait|release> <pr number> [--force with release] | status\n",
  );
  process.exit(2);
}
const number = (name, fallback) =>
  /^\d+$/.test(process.env[name] ?? "") ? Number(process.env[name]) : fallback;
const options = { cwd: process.cwd(), pr, force, staleSeconds: number("MERGE_LOCK_STALE", 1800) };
const result =
  action === "status"
    ? status(options)
    : action === "release"
      ? release(options)
      : action === "take"
        ? take(options)
        : await waitFor(options, {
            waitSeconds: number("MERGE_LOCK_WAIT", 3600),
            pollSeconds: number("MERGE_LOCK_POLL", 30),
          });
process.stdout.write(`${result.line}\n`);
process.exit(result.code);
