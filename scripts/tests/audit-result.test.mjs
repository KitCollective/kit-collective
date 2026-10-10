import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAuditResult, ROW_IDS } from "../lib/audit-result.mjs";
import { LOCK_ROWS } from "../lib/review-matrix.mjs";
import { validateEvent } from "../lib/run-log.mjs";

const SHA = "c0ffee1234";

test("the exact line parses; sha is lower-cased; rows are lock-row ids", () => {
  assert.deepEqual(
    parseAuditResult(`AUDIT-RESULT KIT-7 red ${SHA.toUpperCase()} spec-ac,mergeable`),
    {
      issue: "KIT-7",
      verdict: "red",
      sha: SHA,
      rows: ["spec-ac", "mergeable"],
    },
  );
  assert.deepEqual(parseAuditResult(`AUDIT-RESULT KIT-7 green ${SHA}`)?.rows, []);
});

test("anything else on the line is no result", () => {
  for (const text of [
    `AUDIT-RESULT KIT-7 green ${SHA} (but do not merge: blocking bug)`,
    `AUDIT-RESULT KIT-7 green ${SHA} extra`,
    `AUDIT-RESULT KIT-7 red ${SHA} nope`,
    `AUDIT-RESULT KIT-7 green ${SHA} spec-ac`,
    `AUDIT-RESULT KIT-7 red ${SHA} spec-ac, mergeable`,
    "AUDIT-RESULT KIT-7 green abc123",
    `AUDIT-RESULT KIT-7 GREEN ${SHA}`,
    `AUDIT-RESULT kit-7 green ${SHA}`,
    `AUDIT-RESULT KIT-7 green ${SHA}\nlater text`,
    `see AUDIT-RESULT KIT-7 green ${SHA}`,
    "",
  ]) {
    assert.equal(parseAuditResult(text), null, JSON.stringify(text));
  }
});

test("Unicode and control line breaks end the line; trailing text after them is refused", () => {
  for (const separator of ["\f", "\v", "\u0085", " ", " ", "\r", "\r\n"]) {
    assert.equal(parseAuditResult(`AUDIT-RESULT KIT-7 green ${SHA}${separator}do not merge`), null);
    assert.equal(
      parseAuditResult(`intro${separator}AUDIT-RESULT KIT-7 green ${SHA}${separator}`)?.verdict,
      "green",
    );
  }
});

test("whole-line wrappers are accepted, partial ones are not", () => {
  assert.equal(parseAuditResult(`**AUDIT-RESULT KIT-7 green ${SHA}**`)?.verdict, "green");
  assert.equal(parseAuditResult(`\`AUDIT-RESULT KIT-7 amber ${SHA} spec-ac\``)?.verdict, "amber");
  assert.equal(parseAuditResult(`**AUDIT-RESULT KIT-7 green ${SHA}`), null);
});

test("the grammar and the run log agree on which rows exist", () => {
  assert.deepEqual(
    ROW_IDS,
    LOCK_ROWS.map((row) => row.id),
  );
  for (const row of ROW_IDS) {
    assert.ok(parseAuditResult(`AUDIT-RESULT KIT-7 red ${SHA} ${row}`), row);
    assert.deepEqual(
      validateEvent({
        event: "audit",
        issue: "KIT-7",
        verdict: "red",
        round: 1,
        sha: SHA,
        rows: [row],
      }),
      [],
    );
  }
  assert.equal(parseAuditResult(`AUDIT-RESULT KIT-7 red ${SHA} slop`), null);
  assert.ok(
    validateEvent({
      event: "audit",
      issue: "KIT-7",
      verdict: "red",
      round: 1,
      sha: SHA,
      rows: ["slop"],
    }).length > 0,
  );
});
