import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  CHECKER_EXIT_PATH,
  ERROR_RATCHET_PATH,
  missingImplementWorkpadThreeAxisCoverage,
  RULE_PATH,
} from "../check-implement-workpad-three-axis.mjs";

function loadSources() {
  return {
    rule: readFileSync(RULE_PATH, "utf8"),
    errorRatchet: readFileSync(ERROR_RATCHET_PATH, "utf8"),
    checkerExit: readFileSync(CHECKER_EXIT_PATH, "utf8"),
  };
}

test("implement workpad three-axis ratchet coverage is present", () => {
  assert.deepEqual(missingImplementWorkpadThreeAxisCoverage(loadSources()), []);
});

test("implement workpad three-axis ratchet fails when the rule drops Slop axis", () => {
  const sources = loadSources();
  sources.rule = sources.rule.replace(/- Slop: \(none\)/, "- Slop axis omitted");
  const missing = missingImplementWorkpadThreeAxisCoverage(sources);
  assert.ok(missing.some((item) => item.includes("Slop: (none)")));
});

test("implement workpad three-axis ratchet fails when error-ratcheting drops KIT-136", () => {
  const sources = loadSources();
  sources.errorRatchet = sources.errorRatchet.replace(/KIT-136/g, "KIT-000");
  const missing = missingImplementWorkpadThreeAxisCoverage(sources);
  assert.ok(missing.some((item) => item.includes("KIT-136")));
});
