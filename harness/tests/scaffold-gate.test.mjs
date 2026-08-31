/**
 * Scaffold diff-gate unit tests (P2.4).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatScaffoldEmptyFeedback,
  scaffoldDiffOk,
  scaffoldTouchedFiles,
} from "../scaffold-gate.mjs";

test("scaffoldDiffOk is true when a write-scope file is added", () => {
  assert.equal(
    scaffoldDiffOk({
      beforeFiles: ["README.md"],
      afterFiles: ["README.md", "apps/mobile/src/x.tsx"],
      writeScopeGlobs: ["apps/mobile/**"],
    }),
    true,
  );
});

test("scaffoldDiffOk is false when only out-of-scope files change", () => {
  assert.equal(
    scaffoldDiffOk({
      beforeFiles: [],
      afterFiles: ["docs/readme.md"],
      writeScopeGlobs: ["apps/mobile/**"],
    }),
    false,
  );
});

test("scaffoldDiffOk treats any touch as ok when write-scope is empty", () => {
  assert.equal(
    scaffoldDiffOk({
      beforeFiles: [],
      afterFiles: ["scratch.tmp"],
      writeScopeGlobs: [],
    }),
    true,
  );
});

test("scaffoldTouchedFiles includes removals", () => {
  assert.deepEqual(
    scaffoldTouchedFiles(["a.ts", "b.ts"], ["a.ts"]),
    ["b.ts"],
  );
});

test("formatScaffoldEmptyFeedback distinguishes re-draft", () => {
  assert.match(formatScaffoldEmptyFeedback({}).join("\n"), /re-draft once/i);
  assert.match(
    formatScaffoldEmptyFeedback({ reDraftAttempted: true }).join("\n"),
    /after one re-draft/i,
  );
});
