import assert from "node:assert/strict";
import { test } from "node:test";
import { LOCK_ROWS, parseMatrix, planRecheck, validateMatrix } from "../lib/review-matrix.mjs";

function workpad(overrides = {}) {
  const lines = LOCK_ROWS.map((lock) => {
    const row = { status: "checked", evidence: "read the diff", ...overrides[lock.id] };
    return `| ${lock.id} | ${row.status} | ${row.evidence} | abc1234 |`;
  });
  return `### Notes\n\n- x\n\n### Review matrix\n\n| row | status | evidence | at |\n| --- | --- | --- | --- |\n${lines.join("\n")}\n\n### Evidence\n\n- none\n`;
}

test("parseMatrix reads every row and stops at the next heading", () => {
  const rows = parseMatrix(workpad());
  assert.equal(rows.length, LOCK_ROWS.length);
  assert.deepEqual(rows[0], {
    id: "spec-ac",
    status: "checked",
    evidence: "read the diff",
    at: "abc1234",
  });
});

test("validateMatrix accepts a complete matrix", () => {
  assert.deepEqual(validateMatrix(parseMatrix(workpad())), []);
});

test("validateMatrix names a missing row, a bad status and empty evidence", () => {
  const text = workpad({
    architecture: { status: "maybe" },
    "design-system": { evidence: "" },
  }).replace(/\| names-english .*\n/, "");
  const problems = validateMatrix(parseMatrix(text));
  assert.ok(problems.some((p) => p.includes("names-english") && p.includes("missing")));
  assert.ok(problems.some((p) => p.includes("architecture") && p.includes("maybe")));
  assert.ok(problems.some((p) => p.includes("design-system") && p.includes("no evidence")));
});

test("a workpad without a matrix has no rows, so every row is re-checked", () => {
  const rows = parseMatrix("### Notes\n- none");
  assert.deepEqual(rows, []);
  assert.equal(planRecheck(rows, []).recheck.length, LOCK_ROWS.length);
});

test("planRecheck re-checks state rows and touched rows, inherits the rest", () => {
  const rows = parseMatrix(workpad());
  const plan = planRecheck(rows, ["docs/agents/device-flows.md"]);
  assert.ok(plan.recheck.includes("spec-ac"));
  assert.ok(plan.recheck.includes("mergeable"));
  assert.ok(plan.recheck.includes("docs-sync"));
  assert.ok(plan.inherit.includes("architecture"));
  assert.ok(plan.inherit.includes("design-system"));
  assert.ok(plan.inherit.includes("state-machine"));
});

test("planRecheck re-opens a mobile reducer change across design, device flow and state machine", () => {
  const rows = parseMatrix(workpad());
  const plan = planRecheck(rows, ["apps/mobile/src/profile-prompt/dismissal.ts"]);
  for (const id of ["design-system", "device-flow", "state-machine", "names-english"]) {
    assert.ok(plan.recheck.includes(id), id);
  }
  assert.ok(plan.inherit.includes("architecture"));
});

test("a row that is still a finding is re-checked even when untouched", () => {
  const rows = parseMatrix(workpad({ architecture: { status: "finding" } }));
  assert.ok(planRecheck(rows, []).recheck.includes("architecture"));
});
