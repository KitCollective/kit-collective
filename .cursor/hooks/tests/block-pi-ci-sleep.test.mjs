import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HOOK = join(dirname(fileURLToPath(import.meta.url)), "..", "block-pi-ci-sleep.sh");

function runHook(command) {
  const result = spawnSync("bash", [HOOK], {
    input: JSON.stringify({ command }),
    encoding: "utf8",
  });
  let body;
  try {
    body = JSON.parse(result.stdout || "{}");
  } catch {
    body = { permission: "invalid", stdout: result.stdout };
  }
  return { status: result.status, permission: body.permission, message: body.user_message };
}

test("allows a single gh pr checks snapshot", () => {
  const result = runHook("gh pr checks 131");
  assert.equal(result.permission, "allow");
  assert.equal(result.status, 0);
});

test("allows short sleep without GitHub polling", () => {
  const result = runHook("sleep 1");
  assert.equal(result.permission, "allow");
});

test("denies sleep of 10 seconds or more", () => {
  const result = runHook("sleep 30");
  assert.equal(result.permission, "deny");
  assert.equal(result.status, 2);
  assert.match(result.message, /harness waits/i);
});

test("denies sleep chained with gh pr checks", () => {
  const result = runHook("sleep 5 && gh pr checks 131");
  assert.equal(result.permission, "deny");
  assert.match(result.message, /do not sleep or poll/i);
});

test("denies gh pr checks --watch", () => {
  const result = runHook("gh pr checks 131 --watch");
  assert.equal(result.permission, "deny");
});

test("denies a for-loop that polls gh pr checks", () => {
  const result = runHook(
    'for i in 1 2 3; do echo "--- poll $i ---"; gh pr checks 131; sleep 30; done',
  );
  assert.equal(result.permission, "deny");
});

test("denies a while-loop that polls gh pr checks", () => {
  const result = runHook("while true; do gh pr checks 131; done");
  assert.equal(result.permission, "deny");
});
