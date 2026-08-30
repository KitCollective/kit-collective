/**
 * Pi tool-calls → Linear Agent Activity (human language, no raw CLI).
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  coalesceActivities,
  translatePiToolEnd,
  translatePiToolStart,
} from "../agent-activity-translate.mjs";

test("bash grep becomes Searching the codebase without the raw command", () => {
  const activity = translatePiToolStart({
    toolName: "bash",
    args: { command: "grep -rn 'foo' src/" },
  });
  assert.equal(activity.type, "action");
  assert.equal(activity.action, "Searching the codebase");
  assert.match(activity.parameter, /foo/);
  assert.doesNotMatch(activity.parameter, /grep -rn/);
});

test("bash test suite becomes Running tests", () => {
  const activity = translatePiToolStart({
    toolName: "bash",
    args: { command: "cd /var/lib/kit-pi/worktrees/KIT-125 && pnpm test apps/api/tests/identity.test.ts" },
  });
  assert.equal(activity.action, "Running tests");
  assert.match(activity.parameter, /identity\.test\.ts|apps\/api/);
  assert.doesNotMatch(activity.parameter, /pnpm test/);
});

test("unclassified bash is skipped so CLI does not leak", () => {
  const activity = translatePiToolStart({
    toolName: "bash",
    args: { command: "curl -H 'Authorization: Bearer secret' https://example.test" },
  });
  assert.equal(activity.type, "skip");
});

test("read and edit use file names only", () => {
  const read = translatePiToolStart({
    toolName: "read",
    args: { path: "/var/lib/kit-pi/worktrees/KIT-125/apps/mobile/src/api/me.ts" },
  });
  assert.deepEqual(read, { type: "action", action: "Reading a file", parameter: "me.ts" });
  const edit = translatePiToolStart({
    toolName: "edit",
    args: { path: "apps/mobile/src/api/me.ts" },
  });
  assert.equal(edit.action, "Editing a file");
  assert.equal(edit.parameter, "me.ts");
});

test("subagents become human spawn lines", () => {
  assert.equal(
    translatePiToolStart({ toolName: "subagent", args: { agent: "scout" } }).action,
    "Scouting the codebase",
  );
  assert.equal(
    translatePiToolStart({ toolName: "subagent", args: { agent: "gate" } }).action,
    "Running pre-review checks",
  );
  assert.equal(
    translatePiToolStart({ toolName: "subagent", args: { agent: "expo" } }).parameter,
    "expo",
  );
});

test("memory_search uses the query, never a lesson body", () => {
  const activity = translatePiToolStart({
    toolName: "memory_search",
    args: { query: "raw fontSize", text: "class → lesson dump" },
  });
  assert.equal(activity.action, "Searching worker memory");
  assert.equal(activity.parameter, "raw fontSize");
  assert.doesNotMatch(JSON.stringify(activity), /class → lesson/);
});

test("tool end result is a short facit, not stdout", () => {
  const done = translatePiToolEnd({
    toolName: "bash",
    isError: false,
    result: { stdout: "PASS 42\n".repeat(80) },
  });
  assert.equal(done.result, "Done");
  assert.doesNotMatch(done.result, /PASS 42/);
  const failed = translatePiToolEnd({ toolName: "bash", isError: true, result: { stderr: "boom" } });
  assert.equal(failed.result, "Failed");
});

test("coalesce folds related searches into one action", () => {
  const folded = coalesceActivities([
    {
      type: "action",
      action: "Searching the codebase",
      parameter: "foo",
    },
    {
      type: "action",
      action: "Searching the codebase",
      parameter: "bar",
    },
    { type: "action", action: "Editing a file", parameter: "me.ts" },
  ]);
  assert.equal(folded.length, 2);
  assert.equal(folded[0].action, "Searching the codebase");
  assert.match(folded[0].parameter, /foo/);
  assert.match(folded[0].parameter, /bar/);
  assert.equal(folded[1].parameter, "me.ts");
});
