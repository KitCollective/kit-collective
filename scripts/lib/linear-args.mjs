/**
 * Argument helpers for scripts/linear.mjs.
 */
import { existsSync, readFileSync } from "node:fs";

/** The text of a body file, or null when it does not exist. */
export const readBodyFile = (path) => (existsSync(path) ? readFileSync(path, "utf8") : null);

/**
 * The value after a flag, or null when the flag is absent or has no value.
 * @param {string[]} args
 * @param {string} flag
 * @returns {string | null}
 */
export function optionValue(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1) {
    return null;
  }
  const value = args[index + 1];
  return value && !value.startsWith("--") ? value : null;
}

const IDENTIFIER = /^[A-Z][A-Z0-9]*-\d+$/;

/**
 * An issue identifier such as KIT-272, upper-cased; null when it is not one.
 * @param {string | null | undefined} value
 * @returns {string | null}
 */
export function issueIdentifier(value) {
  const upper = value?.trim().toUpperCase() ?? "";
  return IDENTIFIER.test(upper) ? upper : null;
}

/**
 * Arguments of `block <KIT-n> --by <KIT-m>`: the blocked issue and its blocker, or null when
 * either is missing or malformed, or when an issue would block itself.
 * @param {string[]} args
 * @returns {{ issue: string, by: string } | null}
 */
export function blockArgs(args) {
  const issue = issueIdentifier(args[0]);
  const by = issueIdentifier(optionValue(args, "--by"));
  return issue && by && issue !== by ? { issue, by } : null;
}

/**
 * The label ids after swapping one label for another in a single set, for the Triage label
 * group, which allows one child label per issue. Returns null when `from` is not on the issue.
 * @param {Iterable<string>} current ids on the issue
 * @param {string} fromId
 * @param {string} toId
 * @returns {string[] | null}
 */
export function swapLabelIds(current, fromId, toId) {
  const ids = new Set(current);
  if (!ids.has(fromId)) {
    return null;
  }
  ids.delete(fromId);
  ids.add(toId);
  return [...ids];
}
