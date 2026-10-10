/**
 * Pure helpers for scripts/wait-for-checks.mjs (ADR-0050): fold the required-check list and the
 * PR's mergeability into one verdict.
 */

export const EXIT = { green: 0, red: 1, pending: 2, notMergeable: 3, unknown: 4 };

/**
 * @param {{ name: string, bucket: string }[]} checks
 * @returns {{ pass: string[], fail: string[], pending: string[], skipped: string[] }}
 */
export function bucketChecks(checks) {
  const out = { pass: [], fail: [], pending: [], skipped: [] };
  for (const check of checks) {
    if (check.bucket === "pass") {
      out.pass.push(check.name);
    } else if (check.bucket === "fail" || check.bucket === "cancel") {
      out.fail.push(check.name);
    } else if (check.bucket === "skipping") {
      out.skipped.push(check.name);
    } else {
      out.pending.push(check.name);
    }
  }
  return out;
}

/**
 * @param {{ name: string, bucket: string }[]} checks
 * @param {{ mergeable?: string, mergeStateStatus?: string }} view
 * @param {{ failFast?: boolean }} [options]
 * @returns {{ done: boolean, code: number, line: string }}
 */
export function verdict(checks, view, options = {}) {
  if (checks.length === 0) {
    return { done: false, code: EXIT.unknown, line: "no required checks reported yet" };
  }
  const { pass, fail, pending, skipped } = bucketChecks(checks);
  const counts = `${pass.length} pass, ${fail.length} fail, ${pending.length} pending, ${skipped.length} skipped`;
  if (fail.length > 0 && (pending.length === 0 || options.failFast)) {
    return { done: true, code: EXIT.red, line: `RED (${counts}): ${fail.join(", ")}` };
  }
  if (pending.length > 0) {
    return { done: false, code: EXIT.pending, line: `PENDING (${counts}): ${pending.join(", ")}` };
  }
  const mergeable = view.mergeable ?? "UNKNOWN";
  if (mergeable === "UNKNOWN") {
    return {
      done: false,
      code: EXIT.unknown,
      line: `checks green (${counts}); mergeability still UNKNOWN`,
    };
  }
  if (mergeable !== "MERGEABLE") {
    return {
      done: true,
      code: EXIT.notMergeable,
      line: `checks green (${counts}) but PR is ${mergeable} (${view.mergeStateStatus ?? "?"})`,
    };
  }
  return { done: true, code: EXIT.green, line: `GREEN (${counts}); PR is MERGEABLE` };
}

const VALUE_OPTIONS = new Set(["--timeout", "--interval", "--also"]);

/**
 * The PR argument: the first plain argument that is not the value of an option, so
 * `--timeout 1800 287` waits on PR 287, not on PR 1800.
 * @param {string[]} args
 * @returns {string | undefined}
 */
export function prArgument(args) {
  for (let i = 0; i < args.length; i += 1) {
    if (VALUE_OPTIONS.has(args[i])) {
      i += 1;
    } else if (/^\d+$/.test(args[i]) || args[i].includes("/pull/")) {
      return args[i];
    }
  }
  return undefined;
}
