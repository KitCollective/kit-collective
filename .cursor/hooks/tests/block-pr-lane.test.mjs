import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HOOK = join(dirname(fileURLToPath(import.meta.url)), "..", "block-pr-lane.sh");

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

test("allows non-pr commands", () => {
  const result = runHook("git status");
  assert.equal(result.permission, "allow");
  assert.equal(result.status, 0);
});

test("denies gh pr create without --base", () => {
  const result = runHook("gh pr create --title demo --body hi");
  assert.equal(result.permission, "deny");
  assert.equal(result.status, 2);
  assert.match(result.message, /--base development/);
});

test("denies gh pr create --base production from a feature head", () => {
  const result = runHook(
    "gh pr create --base production --head nicklas/kit-101 --title demo",
  );
  assert.equal(result.permission, "deny");
  assert.match(result.message, /development/);
});

test("allows issue land onto development", () => {
  const result = runHook(
    "gh pr create --base development --head nicklas/kit-102 --title demo",
  );
  assert.equal(result.permission, "allow");
  assert.equal(result.status, 0);
});

test("allows milestone promotion development to staging", () => {
  const result = runHook("gh pr create --base staging --head development --title promote");
  assert.equal(result.permission, "allow");
});

test("allows release staging to production", () => {
  const result = runHook("gh pr create --base production --head staging --title release");
  assert.equal(result.permission, "allow");
});

test("denies --base staging without --head development", () => {
  const result = runHook("gh pr create --base staging --title demo");
  assert.equal(result.permission, "deny");
});
