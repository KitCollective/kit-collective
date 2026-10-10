/**
 * Verify per head with tree-hash reuse (ADR-0055). Suites come from the `checks` table in
 * factory.config.json. A green row is reused when the suite's command and the content of its
 * paths (the git tree at HEAD) are unchanged, so a fix that touches one app does not rerun
 * the others. Pure helpers plus a runner that takes its process spawner as a parameter.
 * Pattern from Optio's verify.sh (see .cursor/skills/NOTICE.md).
 */
import { createHash } from "node:crypto";
import { matchesGlob } from "./pr-write-scope.mjs";

export const VERIFY_EXIT = { ok: 0, failed: 1, usage: 2, incomplete: 3 };

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

/** Suites a change set touches; `null` changed means "all". */
export function suitesFor(changed, suites) {
  if (changed === null) {
    return suites;
  }
  return suites.filter((suite) =>
    changed.some((file) => suite.paths.some((glob) => matchesGlob(file, glob))),
  );
}

/**
 * The part of `git ls-tree -r HEAD` output (mode, type, blob sha, path) that a suite's globs match.
 * Blob shas make the listing change exactly when the content of a matching file changes.
 */
export function treeListing(fullListing, globs) {
  return fullListing
    .split("\n")
    .filter((line) => {
      const path = line.split("\t")[1];
      return path !== undefined && globs.some((glob) => matchesGlob(path, glob));
    })
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
export function suiteKey({ suite, globalPaths = [], fullListing, nodeVersion }) {
  return reuseKey(
    suite.command,
    treeListing(fullListing, suite.paths),
    treeListing(fullListing, globalPaths),
    nodeVersion,
  );
}

/** Paths from `git status --porcelain` (staged, unstaged and untracked; renames give the new path). */
export function dirtyPaths(porcelain) {
  return porcelain
    .split("\n")
    .filter((line) => line.length > 3)
    .map((line) => line.slice(3).split(" -> ").at(-1).replace(/^"|"$/g, ""));
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

/** One verdict from the rows. */
export function verdictOf(rows) {
  const bad = rows.filter((r) => r.status === "fail" || r.status === "timeout");
  if (bad.length > 0) {
    return {
      code: VERIFY_EXIT.failed,
      line: `VERIFY FAIL: ${bad.map((r) => `${r.id} (${r.status})`).join(", ")}`,
    };
  }
  const skipped = rows.filter((r) => r.status === "skipped");
  const dirty = rows.filter((r) => r.uncached).length;
  const counts = `${rows.filter((r) => r.status === "pass").length} ran, ${rows.filter((r) => r.status === "reused").length} reused${dirty > 0 ? `, ${dirty} on uncommitted changes and not cached` : ""}`;
  if (skipped.length > 0) {
    return {
      code: VERIFY_EXIT.incomplete,
      line: `VERIFY INCOMPLETE (${counts}): skipped ${skipped.map((r) => `${r.id} (${r.reason})`).join(", ")}`,
    };
  }
  return { code: VERIFY_EXIT.ok, line: `VERIFY OK (${counts})` };
}
