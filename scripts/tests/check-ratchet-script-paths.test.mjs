import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  listCommittedCheckRatchetPaths,
  missingRatchetScriptPaths,
} from "./check-ratchet-script-paths.mjs";

test("repo check ratchets are registered in RATCHET_SCRIPT_PATHS", () => {
  assert.deepEqual(missingRatchetScriptPaths("."), []);
});

test("listCommittedCheckRatchetPaths discovers scripts/check and scripts/tests/check files", () => {
  const root = mkdtempSync(join(tmpdir(), "ratchet-paths-"));
  mkdirSync(join(root, "scripts"));
  mkdirSync(join(root, "scripts/tests"));
  writeFileSync(join(root, "scripts/check-alpha.mjs"), "");
  writeFileSync(join(root, "scripts/tests/check-beta.test.mjs"), "");
  writeFileSync(join(root, "scripts/tests/check-gamma.mjs"), "");
  writeFileSync(join(root, "scripts/tests/land-policy.test.mjs"), "");
  assert.deepEqual(listCommittedCheckRatchetPaths(root), [
    "scripts/check-alpha.mjs",
    "scripts/tests/check-beta.test.mjs",
    "scripts/tests/check-gamma.mjs",
  ]);
});
