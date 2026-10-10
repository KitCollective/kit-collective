/**
 * Verify per head with tree-hash reuse (ADR-0055). Suites come from the `checks` table in
 * factory.config.json. A green row is reused when the suite's command and the content of its
 * paths (the git tree at HEAD) are unchanged, so a fix that touches one app does not rerun
 * the others. Pure helpers plus a runner that takes its process spawner as a parameter.
 * Pattern from Optio's verify.sh (see .cursor/skills/NOTICE.md).
 */
import { createHash } from "node:crypto";
import { matchesGlob } from "./pr-write-scope.mjs";

export const VERIFY_EXIT = { ok: 0, failed: 1, usage: 2, incomplete: 3, nothing: 4 };

/**
 * Checks table shape (`globalPaths` are inputs shared by every suite: lockfile, compiler and
 * runner config; their tree listing is part of every suite's key):
 * { "defaults": { "timeoutSeconds": 900 },
 *   "suites": [{ "id": "admin", "paths": ["apps/admin/**"], "command": "pnpm ...",
 *                "timeoutSeconds": 600, "needs": ["postgres"] }] }
 * @returns {string[]} problems; empty when the table is usable
 */
export function validateChecks(checks) {
  const problems = [];
  if (!checks || !Array.isArray(checks.suites) || checks.suites.length === 0) {
    return ["checks.suites must be a non-empty array"];
  }
  if (
    checks.globalPaths !== undefined &&
    !(Array.isArray(checks.globalPaths) && checks.globalPaths.every((g) => typeof g === "string"))
  ) {
    problems.push("checks.globalPaths must be an array of globs");
  }
  const seen = new Set();
  for (const suite of checks.suites) {
    const where = `suite ${suite?.id ?? "?"}`;
    if (typeof suite?.id !== "string" || !/^[a-z][a-z0-9-]*$/.test(suite.id)) {
      problems.push(`${where}: id must be kebab-case`);
    } else if (seen.has(suite.id)) {
      problems.push(`${where}: duplicate id`);
    }
    seen.add(suite?.id);
    if (
      !Array.isArray(suite?.paths) ||
      suite.paths.length === 0 ||
      suite.paths.some((p) => typeof p !== "string")
    ) {
      problems.push(`${where}: paths must be a non-empty array of globs`);
    }
    if (typeof suite?.command !== "string" || suite.command.trim() === "") {
      problems.push(`${where}: command must be a non-empty string`);
    }
    if (
      suite?.timeoutSeconds !== undefined &&
      !(Number.isInteger(suite.timeoutSeconds) && suite.timeoutSeconds > 0)
    ) {
      problems.push(`${where}: timeoutSeconds must be a positive integer`);
    }
    if (
      suite?.needs !== undefined &&
      !(Array.isArray(suite.needs) && suite.needs.every((n) => typeof n === "string"))
    ) {
      problems.push(`${where}: needs must be an array of capability names`);
    }
  }
  return problems;
}

/**
 * Suites a change set touches; `null` changed means "all". A changed global path (lockfile,
 * compiler config) is an input of every suite, so it selects all of them.
 */
export function suitesFor(changed, suites, globalPaths = []) {
  if (changed === null) {
    return suites;
  }
  if (changed.some((file) => globalPaths.some((glob) => matchesGlob(file, glob)))) {
    return suites;
  }
  return suites.filter((suite) =>
    changed.some((file) => suite.paths.some((glob) => matchesGlob(file, glob))),
  );
}

/**
 * The entries of `git ls-tree -r -z HEAD` (see `lsTree` in git-files.mjs) that a suite's globs
 * match, as stable lines: mode, type, blob sha and the exact path bytes. The blob shas make the
 * listing change exactly when the content of a matching file changes; the path is matched as UTF-8
 * but hashed from its raw bytes, so a non-UTF-8 name still keys correctly.
 * @param {{ mode: string, type: string, sha: string, path: string, raw: Buffer }[]} entries
 * @param {string[]} globs
 */
export function treeListing(entries, globs) {
  return entries
    .filter((entry) => globs.some((glob) => matchesGlob(entry.path, glob)))
    .map((entry) => `${entry.mode} ${entry.type} ${entry.sha}\t${entry.raw.toString("latin1")}`)
    .join("\n");
}

/**
 * Key a green row is reused under: the command plus every input listing (the suite's paths, the
 * global paths, the node version). A change in any of them is a different key.
 */
export function reuseKey(command, ...inputs) {
  const hash = createHash("sha256").update(command);
  for (const input of inputs) {
    hash.update("\0").update(input);
  }
  return hash.digest("hex");
}

/** The key of one suite for a committed tree listing. */
export function suiteKey({ suite, globalPaths = [], entries, nodeVersion }) {
  return reuseKey(
    suite.command,
    treeListing(entries, suite.paths),
    treeListing(entries, globalPaths),
    nodeVersion,
  );
}

/**
 * Paths from `git status --porcelain -z --untracked-files=all` (staged, unstaged, untracked).
 * A rename or copy keeps BOTH sides: the old path is a change to the suite that lost the file.
 * With -z no path is quoted, so spaces and non-ASCII names need no unescaping.
 * @param {string} porcelainZ
 */
export function dirtyPaths(porcelainZ) {
  const entries = porcelainZ.split("\0").filter((entry) => entry !== "");
  const paths = [];
  for (let i = 0; i < entries.length; i += 1) {
    const status = entries[i].slice(0, 2);
    paths.push(entries[i].slice(3));
    if (/[RC]/.test(status)) {
      i += 1;
      if (entries[i] !== undefined) {
        paths.push(entries[i]);
      }
    }
  }
  return paths;
}

/** Whether uncommitted changes touch the suite's own paths or the global paths. */
export function suiteIsDirty(dirty, suite, globalPaths = []) {
  return dirty.some((file) =>
    [...suite.paths, ...globalPaths].some((glob) => matchesGlob(file, glob)),
  );
}

/** Merges this run's fresh results into the current cache file contents (last writer per suite wins). */
export function mergeCache(current, rows) {
  const merged = { ...current };
  for (const row of rows) {
    if (row.key && !row.uncached && ["pass", "fail", "timeout"].includes(row.status)) {
      merged[row.id] = { key: row.key, status: row.status };
    }
  }
  return merged;
}

/**
 * @param {{
 *   suites: object[], defaults?: { timeoutSeconds?: number }, capabilities: string[],
 *   cache: Record<string, { key: string, status: string }>, noReuse?: boolean,
 *   isDirty?: (suite: object) => boolean, keyOf: (suite: object) => string,
 *   exec: (suite: object, timeoutSeconds: number) => Promise<{ status: "pass" | "fail" | "timeout", durationMs: number, tail?: string }>,
 * }} o
 * One suite at a time, in table order.
 */
export async function runSuites({
  suites,
  defaults = {},
  capabilities,
  cache,
  noReuse = false,
  isDirty = () => false,
  keyOf,
  exec,
}) {
  const rows = [];
  for (const suite of suites) {
    const missing = (suite.needs ?? []).filter((n) => !capabilities.includes(n));
    if (missing.length > 0) {
      rows.push({ id: suite.id, status: "skipped", reason: `needs ${missing.join(", ")}` });
      continue;
    }
    const key = keyOf(suite);
    // The command runs in the working tree but the key reads the committed tree: with uncommitted
    // changes under the suite a result must not be reused, and must not be cached for the commit.
    const uncached = isDirty(suite);
    if (
      !noReuse &&
      !uncached &&
      cache[suite.id]?.key === key &&
      cache[suite.id]?.status === "pass"
    ) {
      rows.push({ id: suite.id, status: "reused", key });
      continue;
    }
    const result = await exec(suite, suite.timeoutSeconds ?? defaults.timeoutSeconds ?? 900);
    rows.push({ id: suite.id, key, ...result, ...(uncached ? { uncached: true } : {}) });
    if (!uncached) {
      cache[suite.id] = { key, status: result.status };
    }
  }
  return rows;
}

const shortHead = (head) => (head ? head.slice(0, 8) : "the checked commit");

/**
 * One verdict from the rows. A run with uncommitted changes says so in every line it prints, pass
 * or fail, because the result is not for the commit.
 * @param {object[]} rows
 * @param {{ head?: string }} [o]
 */
export function verdictOf(rows, { head } = {}) {
  const uncached = rows.filter((r) => r.uncached).length;
  const note = uncached > 0 ? `dirty: not for ${shortHead(head)}` : "";
  const bad = rows.filter((r) => r.status === "fail" || r.status === "timeout");
  if (bad.length > 0) {
    return {
      code: VERIFY_EXIT.failed,
      line: `VERIFY FAIL${note ? ` (${note})` : ""}: ${bad.map((r) => `${r.id} (${r.status})`).join(", ")}`,
    };
  }
  const skipped = rows.filter((r) => r.status === "skipped");
  const ran = rows.filter((r) => r.status === "pass").length;
  const reused = rows.filter((r) => r.status === "reused").length;
  const counts = `${note ? `${note}; ` : ""}${ran} ran, ${reused} reused${uncached > 0 ? `, ${uncached} on uncommitted changes and not cached` : ""}`;
  if (skipped.length > 0) {
    return {
      code: VERIFY_EXIT.incomplete,
      line: `VERIFY INCOMPLETE (${counts}): skipped ${skipped.map((r) => `${r.id} (${r.reason})`).join(", ")}`,
    };
  }
  return { code: VERIFY_EXIT.ok, line: `VERIFY OK (${counts})` };
}

/** What `--changed` reports when no suite matches: never the text or code of a real pass. */
export function nothingToDo({ dirty = false, head } = {}) {
  return {
    code: VERIFY_EXIT.nothing,
    line: `VERIFY NOTHING TO DO${dirty ? ` (dirty: not for ${shortHead(head)})` : ""} (no suite matches the diff; nothing was run, this is not a pass)`,
  };
}
