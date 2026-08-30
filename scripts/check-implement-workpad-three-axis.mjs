#!/usr/bin/env node
/**
 * CI ratchet: implement workpad must carry Spec / Standards / Slop axes before In Review.
 * Prevents repeating KIT-136 checker park (workpad missing three-axis Review feedback;
 * factory-checker mechanical gate fails on reviewFeedbackMissingSlopAxis).
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(import.meta.dirname, "..");

export const RULE_PATH = ".cursor/rules/implement-workpad-three-axis.mdc";
export const ERROR_RATCHET_PATH = "docs/agents/error-ratcheting.md";
export const CHECKER_EXIT_PATH = "harness/checker-exit.mjs";

/**
 * @param {Record<string, string>} sources
 * @returns {string[]}
 */
export function missingImplementWorkpadThreeAxisCoverage(sources) {
  const missing = [];
  const rule = sources.rule ?? "";
  if (!/### Review feedback/.test(rule)) {
    missing.push(`${RULE_PATH} must document ### Review feedback`);
  }
  if (!/- Spec: \(none\)/.test(rule)) {
    missing.push(`${RULE_PATH} must show - Spec: (none) pass line`);
  }
  if (!/- Standards: \(none\)/.test(rule)) {
    missing.push(`${RULE_PATH} must show - Standards: (none) pass line`);
  }
  if (!/- Slop: \(none\)/.test(rule)) {
    missing.push(`${RULE_PATH} must show - Slop: (none) pass line`);
  }
  if (!/reviewFeedbackMissingSlopAxis/.test(rule)) {
    missing.push(`${RULE_PATH} must name reviewFeedbackMissingSlopAxis`);
  }

  const errorRatchet = sources.errorRatchet ?? "";
  if (!/KIT-136/.test(errorRatchet)) {
    missing.push(
      `${ERROR_RATCHET_PATH} must document KIT-136 implement workpad three-axis ratchet`,
    );
  }
  if (!/check-implement-workpad-three-axis/.test(errorRatchet)) {
    missing.push(`${ERROR_RATCHET_PATH} must name check-implement-workpad-three-axis.mjs`);
  }

  const checkerExit = sources.checkerExit ?? "";
  if (!/REVIEW_PASS_FEEDBACK_LINES/.test(checkerExit)) {
    missing.push(`${CHECKER_EXIT_PATH} must declare REVIEW_PASS_FEEDBACK_LINES`);
  }
  if (!/reviewFeedbackMissingSlopAxis/.test(checkerExit)) {
    missing.push(`${CHECKER_EXIT_PATH} must export reviewFeedbackMissingSlopAxis`);
  }

  return missing;
}

function isCli() {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  return resolve(entry) === fileURLToPath(import.meta.url);
}

if (isCli()) {
  const sources = {
    rule: readFileSync(join(root, RULE_PATH), "utf8"),
    errorRatchet: readFileSync(join(root, ERROR_RATCHET_PATH), "utf8"),
    checkerExit: readFileSync(join(root, CHECKER_EXIT_PATH), "utf8"),
  };
  const missing = missingImplementWorkpadThreeAxisCoverage(sources);
  if (missing.length > 0) {
    console.error("check-implement-workpad-three-axis: missing required coverage:");
    for (const item of missing) {
      console.error(`  - ${item}`);
    }
    process.exit(1);
  }
  console.log("check-implement-workpad-three-axis: ok");
}
