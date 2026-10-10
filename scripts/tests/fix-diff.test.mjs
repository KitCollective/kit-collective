import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyFixDiff } from "../lib/fix-diff.mjs";

const diff = (...lines) => lines.join("\n");

test("a docs-only fix is light", () => {
  const verdict = classifyFixDiff(
    diff("+++ b/docs/agents/device-flows.md", "-old step", "+new step"),
  );
  assert.equal(verdict.kind, "light");
});

test("the KIT-272 review 4 fix, a consistent rename, is light", () => {
  const verdict = classifyFixDiff(
    diff(
      "+++ b/apps/mobile/src/door.tsx",
      "-export function KomIGangFace(props: Props) {",
      "+export function DoorFace(props: Props) {",
      "+++ b/apps/mobile/src/door.test.tsx",
      "-import { KomIGangFace } from './door';",
      "+import { DoorFace } from './door';",
    ),
  );
  assert.equal(verdict.kind, "light");
  assert.match(verdict.reason, /KomIGangFace -> DoorFace/);
});

test("a comment correction in code is light", () => {
  const verdict = classifyFixDiff(
    diff(
      "+++ b/scripts/e2e/compare.mjs",
      "-// the strip is skipped because A",
      "+// the strip is skipped because B",
    ),
  );
  assert.equal(verdict.kind, "light");
});

test("a changed condition is full", () => {
  const verdict = classifyFixDiff(diff("+++ b/src/a.ts", "-if (a > 1) {", "+if (a > 2) {"));
  assert.equal(verdict.kind, "full");
});

test("added code lines are full", () => {
  const verdict = classifyFixDiff(diff("+++ b/src/a.ts", "+const guard = true;"));
  assert.equal(verdict.kind, "full");
});

test("one name renamed two different ways is full", () => {
  const verdict = classifyFixDiff(
    diff(
      "+++ b/src/a.ts",
      "-const fooBar = 1;",
      "+const barBaz = 1;",
      "-use(fooBar);",
      "+use(quxQux);",
    ),
  );
  assert.equal(verdict.kind, "full");
});

test("a test that lost lines is full even if the rest is a rename", () => {
  const verdict = classifyFixDiff(
    diff(
      "+++ b/src/a.test.ts",
      "-expect(a).toBe(1);",
      "-expect(b).toBe(2);",
      "+expect(a).toBe(1);",
    ),
  );
  assert.equal(verdict.kind, "full");
});

test("an empty diff is full", () => {
  assert.equal(classifyFixDiff("").kind, "full");
});

test("a swapped literal, keyword or string is not a rename", () => {
  const cases = [
    ["  if (ok === true) return;", "  if (ok === false) return;"],
    ["  return value ?? null;", "  return value ?? undefined;"],
    ["  const x = 1;", "  var x = 1;"],
    ['  const label = "Cancel";', '  const label = "Delete";'],
  ];
  for (const [before, after] of cases) {
    const verdict = classifyFixDiff(diff("+++ b/src/x.ts", `-${before}`, `+${after}`));
    assert.equal(verdict.kind, "full", `${before.trim()} -> ${after.trim()}`);
  }
});

test("a rename that leaves the old name in use is full", () => {
  const change = diff("+++ b/src/x.ts", "-  arm(a);", "+  arm(b);");
  assert.equal(classifyFixDiff(change, { isStillUsed: () => true }).kind, "full");
  assert.equal(classifyFixDiff(change, { isStillUsed: () => false }).kind, "light");
});
