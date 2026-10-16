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

const KIT348_OLD =
  'test("Bash: process substitution and redirections cannot smuggle a Holdout path past the CLI", () => {';
const KIT348_NEW =
  'test("Bash: process substitution cannot smuggle a Holdout path past the CLI, and redirections carry no Holdout path", () => {';
const KIT351_OLD =
  'test("the guard lets a lone `titles --issue` through and still denies it when chained", () => {';
const KIT351_NEW =
  'test("the guard lets `titles --issue` through alone and runner-wrapped, and still denies a direct gh read of the Holdout", () => {';

const testFile = "+++ b/scripts/tests/guard.test.mjs";

test("KIT-367: the KIT-348 fix (8a051734), a reworded test title, is light", () => {
  const verdict = classifyFixDiff(
    diff("+++ b/scripts/tests/holdout-guard.test.mjs", `-${KIT348_OLD}`, `+${KIT348_NEW}`),
  );
  assert.equal(verdict.kind, "light");
  assert.match(verdict.reason, /test title/);
});

test("KIT-367: the KIT-351 fix (69ff9738), a double-quoted title with backticks, is light", () => {
  const verdict = classifyFixDiff(
    diff("+++ b/scripts/tests/scenarios.test.mjs", `-${KIT351_OLD}`, `+${KIT351_NEW}`),
  );
  assert.equal(verdict.kind, "light");
});

test("KIT-367: it and describe titles, with a modifier, are light", () => {
  const verdict = classifyFixDiff(
    diff(
      testFile,
      '-  it("does a thing", () => {',
      '+  it("does the thing well", () => {',
      '-describe.skip("group", () => {',
      '+describe.skip("the group", () => {',
    ),
  );
  assert.equal(verdict.kind, "light");
});

test("KIT-367: a title change plus another change on the same line is full", () => {
  const verdict = classifyFixDiff(diff(testFile, '-test("a", () => {', '+test("b", async () => {'));
  assert.equal(verdict.kind, "full");
});

test("KIT-367: a title change plus a changed body line is full", () => {
  const verdict = classifyFixDiff(
    diff(
      testFile,
      '-test("a", () => {',
      '+test("b", () => {',
      "-  assert.equal(a, 1);",
      "+  assert.equal(a, 2);",
    ),
  );
  assert.equal(verdict.kind, "full");
});

test("KIT-367: a new test is full", () => {
  const verdict = classifyFixDiff(diff(testFile, '+test("new", () => {', "+  run();", "+});"));
  assert.equal(verdict.kind, "full");
});

test("KIT-367: a removed test is full", () => {
  const verdict = classifyFixDiff(diff(testFile, '-test("old", () => {', "-  run();", "-});"));
  assert.equal(verdict.kind, "full");
});

test("KIT-367: a string change in a non-test call is full", () => {
  const verdict = classifyFixDiff(diff(testFile, '-  run("a", x);', '+  run("b", x);'));
  assert.equal(verdict.kind, "full");
});

test("KIT-367: a title string change in a non-test file is full", () => {
  const verdict = classifyFixDiff(
    diff("+++ b/scripts/lib/thing.mjs", '-test("a", () => {', '+test("b", () => {'),
  );
  assert.equal(verdict.kind, "full");
});

test("KIT-367: a template-literal title gaining an interpolation is full", () => {
  const verdict = classifyFixDiff(
    diff(testFile, "-test(`a`, () => {", `+test(\`a \${name}\`, () => {`),
  );
  assert.equal(verdict.kind, "full");
});

test("KIT-367: a different call name with the same title is full", () => {
  const verdict = classifyFixDiff(diff(testFile, '-test("a", () => {', '+it("b", () => {'));
  assert.equal(verdict.kind, "full");
});
