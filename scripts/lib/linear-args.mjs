/**
 * Argument helpers for scripts/linear.mjs.
 */

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
