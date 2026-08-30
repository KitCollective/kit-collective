import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HOOK = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "block-migration-prefix-collision.sh",
);

/**
 * @param {string} cwd
 * @param {string} command
 */
function runHook(cwd, command) {
  const result = spawnSync("bash", [HOOK], {
    input: JSON.stringify({ command }),
    encoding: "utf8",
    cwd,
  });
  let body;
  try {
    body = JSON.parse(result.stdout || "{}");
  } catch {
    body = { permission: "invalid", stdout: result.stdout };
  }
  return { status: result.status, permission: body.permission, message: body.user_message };
}

function makeLaneWith0009() {
  const cwd = mkdtempSync(join(tmpdir(), "kc-migration-prefix-"));
  execFileSync("git", ["init"], { cwd, encoding: "utf8" });
  mkdirSync(join(cwd, "packages/db/migrations"), { recursive: true });
  writeFileSync(join(cwd, "packages/db/migrations/0009_user_jersey_favorite.sql"), "-- lane\n");
  execFileSync("git", ["add", "packages/db/migrations/0009_user_jersey_favorite.sql"], {
    cwd,
  });
  execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-m", "lane"], {
    cwd,
  });
  execFileSync("git", ["update-ref", "refs/remotes/origin/development", "HEAD"], { cwd });
  return cwd;
}

test("allows git status", () => {
  const result = runHook(process.cwd(), "git status");
  assert.equal(result.permission, "allow");
});

test("allows adding a non-migration path", () => {
  const result = runHook(process.cwd(), "git add packages/db/src/schema/index.ts");
  assert.equal(result.permission, "allow");
});

test("denies adding a colliding NNNN_ filename vs origin/development", () => {
  const cwd = makeLaneWith0009();
  try {
    const result = runHook(cwd, "git add packages/db/migrations/0009_user_account_fields.sql");
    assert.equal(result.permission, "deny");
    assert.equal(result.status, 2);
    assert.match(result.message, /0009/);
    assert.match(result.message, /next prefix/i);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("allows adding the same filename that already exists on the lane", () => {
  const cwd = makeLaneWith0009();
  try {
    const result = runHook(cwd, "git add packages/db/migrations/0009_user_jersey_favorite.sql");
    assert.equal(result.permission, "allow");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("allows adding the next prefix", () => {
  const cwd = makeLaneWith0009();
  try {
    const result = runHook(cwd, "git add packages/db/migrations/0010_user_account_fields.sql");
    assert.equal(result.permission, "allow");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
