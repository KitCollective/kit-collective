/**
 * Live checks: named, reviewed checks that need the owner's machine (the bb server, where Optio runs)
 * and so cannot run inside an AFK developer run. An issue names them on a `live-check:` line; after the
 * merge, Max's live-check automation (staff/max/live-checks.js) runs each one from the main checkout
 * and writes the result on the issue. On 2026-10-17 KIT-359 and KIT-361 each waited for a person to
 * reload Optio and run one command.
 *
 * A check is a fixed list of argv steps: nothing comes from Linear text or a model, so adding a check
 * is a reviewed change to this file. `{thread}` is the one placeholder: a thread id on the runs
 * machine, given by the caller and validated before it is used.
 */

/** @type {Record<string, { what: string, needsThread?: boolean, steps: string[][] }>} */
export const LIVE_CHECKS = {
  "optio-reload": {
    what: "Optio builds from this checkout and reloads in the bb server",
    steps: [
      ["pnpm", "install", "--frozen-lockfile", "--filter", "@kit/bb-plugin-optio..."],
      ["bb", "plugin", "build", "plugins/factory"],
      ["bb", "plugin", "reload", "optio"],
      ["bb", "optio", "list"],
    ],
  },
  "optio-host-probe": {
    what: "Optio's host bundle runs the fixed probe script in a runs-machine thread's worktree",
    needsThread: true,
    steps: [["bb", "optio", "host-probe", "{thread}"]],
  },
  "optio-board": {
    what: "Optio's Board answers with its plan",
    steps: [["bb", "optio", "board", "--json"]],
  },
  "optio-inbox": {
    what: "Optio's Inbox answers with its cards",
    steps: [["bb", "optio", "inbox", "--json"]],
  },
};

const THREAD = /^thr_[a-z0-9]+$/;

/** The check names on an issue's `live-check:` line (plain or in backticks), in order, without repeats. */
export function parseLiveChecks(description) {
  const line = /^\s*`?live-check:`?\s*(.+)$/im.exec(String(description ?? ""));
  if (!line) return [];
  const names = line[1]
    .split(",")
    .map((name) => name.replace(/[`\\]/g, "").trim())
    .filter(Boolean);
  return [...new Set(names)];
}

/**
 * The argv steps of a check, with `{thread}` filled in. Throws on an unknown name or a missing or
 * malformed thread, so nothing runs that is not in LIVE_CHECKS.
 */
export function liveCheckSteps(name, { thread } = {}) {
  const check = Object.hasOwn(LIVE_CHECKS, name) ? LIVE_CHECKS[name] : null;
  if (!check) throw new Error(`unknown live check ${name}`);
  if (check.needsThread && !THREAD.test(String(thread ?? ""))) {
    throw new Error(`live check ${name} needs a runs-machine thread id (thr_...)`);
  }
  return check.steps.map((step) => step.map((arg) => (arg === "{thread}" ? thread : arg)));
}
