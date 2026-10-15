import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const HOOK = join(dirname(fileURLToPath(import.meta.url)), "..", "block-push-behind-development.sh");

function git(cwd, ...args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

function commit(cwd, name) {
  writeFileSync(join(cwd, name), name);
  git(cwd, "add", name);
  git(cwd, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", name);
}

function runHook(input, hookCwd) {
  const result = spawnSync("bash", [HOOK], {
    input: typeof input === "string" ? input : JSON.stringify(input),
    encoding: "utf8",
    cwd: hookCwd,
  });
  let body;
  try {
    body = JSON.parse(result.stdout || "{}");
  } catch {
    body = { permission: "invalid", stdout: result.stdout };
  }
  return { status: result.status, permission: body.permission, message: body.user_message };
}

let root;
let mainDir; // main checkout, branch `main-work`, one commit behind origin/development after setup
let freshWt; // worktree on `fresh`, up to date with origin/development
let staleWt; // worktree on `stale`, one commit behind origin/development
let current; // checkout with a branch that is up to date (main checkout stand-in for "current")

before(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "push-behind-")));
  const bare = join(root, "origin.git");
  mainDir = join(root, "main");
  execFileSync("git", ["init", "-q", "--bare", "-b", "development", bare]);
  execFileSync("git", ["clone", "-q", bare, mainDir]);
  git(mainDir, "checkout", "-q", "-b", "development");
  commit(mainDir, "base");
  git(mainDir, "push", "-q", "origin", "development");
  git(mainDir, "checkout", "-q", "-b", "main-work");

  // Worktrees cut from the current development tip.
  mkdirSync(join(root, "wt"));
  freshWt = join(root, "wt", "fresh");
  staleWt = join(root, "wt", "stale");
  git(mainDir, "worktree", "add", "-q", "-b", "fresh", freshWt, "development");
  git(mainDir, "worktree", "add", "-q", "-b", "stale", staleWt, "development");

  // development moves on: another clone pushes a new commit. Only `fresh` is brought up to date.
  const other = join(root, "other");
  execFileSync("git", ["clone", "-q", bare, other]);
  commit(other, "moved-on");
  git(other, "push", "-q", "origin", "HEAD:development");
  git(mainDir, "fetch", "-q", "origin", "development");
  git(freshWt, "merge", "-q", "--ff-only", "origin/development");

  // A second checkout that is current and a stand-in for "main checkout is up to date".
  current = join(root, "current");
  execFileSync("git", ["clone", "-q", bare, current]);
  git(current, "checkout", "-q", "-b", "current-work", "origin/development");
});

after(() => {
  rmSync(root, { recursive: true, force: true });
});

const push = (command, extra = {}) => ({ tool_name: "Bash", tool_input: { command }, ...extra });

test("(a) up-to-date worktree cwd is allowed although the main checkout is behind", () => {
  const result = runHook(push("git push origin HEAD", { cwd: freshWt }), mainDir);
  assert.equal(result.permission, "allow");
  assert.equal(result.status, 0);
});

test("(b) behind worktree cwd is denied although the hook runs in a current checkout", () => {
  const result = runHook(push("git push", { cwd: staleWt }), current);
  assert.equal(result.permission, "deny");
  assert.equal(result.status, 2);
  assert.match(result.message, /1 commit\(s\) behind/);
});

test("deny message names the directory and branch that were evaluated", () => {
  const result = runHook(push("git push", { cwd: staleWt }), current);
  assert.ok(result.message.includes(staleWt));
  assert.ok(result.message.includes("branch stale"));
});

test("(c) push from the behind main checkout is denied", () => {
  const result = runHook(push("git push", { cwd: mainDir }), mainDir);
  assert.equal(result.permission, "deny");
  assert.ok(result.message.includes("main-work"));
});

test("(d) git -C <behind worktree> push from an up-to-date cwd is denied", () => {
  const result = runHook(push(`git -C ${staleWt} push origin HEAD`, { cwd: freshWt }), freshWt);
  assert.equal(result.permission, "deny");
  assert.ok(result.message.includes(staleWt));
});

test("(d2) cd <behind worktree> && git push is denied", () => {
  const result = runHook(push(`cd ${staleWt} && git push`, { cwd: freshWt }), freshWt);
  assert.equal(result.permission, "deny");
});

test("(d3) a quoted git -C directory is parsed", () => {
  const result = runHook(push(`git -C "${staleWt}" push`, { cwd: freshWt }), freshWt);
  assert.equal(result.permission, "deny");
});

test("(d4) git -C relative to cwd is resolved", () => {
  const result = runHook(push("git -C ../stale push", { cwd: freshWt }), freshWt);
  assert.equal(result.permission, "deny");
  assert.ok(result.message.includes(staleWt));
});

test("(d5) an undeterminable directory falls back to the base directory", () => {
  const behindBase = runHook(push("git -C $TARGET push", { cwd: staleWt }), current);
  assert.equal(behindBase.permission, "deny");
  const freshBase = runHook(push("git -C $TARGET push", { cwd: freshWt }), mainDir);
  assert.equal(freshBase.permission, "allow");
});

test("(e) a refspec naming a behind branch is denied from an up-to-date checkout", () => {
  for (const command of ["git push origin stale", "git push origin stale:refs/heads/x", "git push origin +stale:x"]) {
    const result = runHook(push(command, { cwd: mainDir }), current);
    // main-work is also behind, so use the up-to-date worktree as cwd where `stale` is visible by name.
    const fromFresh = runHook(push(command, { cwd: freshWt }), current);
    assert.equal(fromFresh.permission, "deny", command);
    assert.equal(result.permission, "deny", command);
  }
});

test("(e2) a refspec naming an up-to-date branch is allowed even when HEAD is behind", () => {
  const result = runHook(push("git push origin fresh", { cwd: staleWt }), mainDir);
  assert.equal(result.permission, "allow");
});

test("(e3) HEAD:refs/heads/x checks HEAD of the evaluated directory", () => {
  const behind = runHook(push("git push origin HEAD:refs/heads/x", { cwd: staleWt }), current);
  assert.equal(behind.permission, "deny");
  const fresh = runHook(push("git push origin HEAD:refs/heads/x", { cwd: freshWt }), mainDir);
  assert.equal(fresh.permission, "allow");
});

test("a detached HEAD is checked as HEAD", () => {
  const detached = join(root, "wt", "detached");
  git(mainDir, "worktree", "add", "-q", "--detach", detached, "stale");
  const result = runHook(push("git push origin HEAD:refs/heads/x", { cwd: detached }), current);
  assert.equal(result.permission, "deny");
  assert.ok(result.message.includes("branch HEAD"));
});

test("(f) deleting a branch is allowed", () => {
  for (const command of ["git push origin --delete stale", "git push origin -d stale", "git push origin :stale"]) {
    const result = runHook(push(command, { cwd: staleWt }), staleWt);
    assert.equal(result.permission, "allow", command);
  }
});

test("(g) a push on development is allowed", () => {
  git(current, "checkout", "-q", "-B", "development", "origin/development~1");
  try {
    const result = runHook(push("git push origin development", { cwd: current }), current);
    assert.equal(result.permission, "allow");
    const bare = runHook(push("git push", { cwd: current }), current);
    assert.equal(bare.permission, "allow");
  } finally {
    git(current, "checkout", "-q", "current-work");
  }
});

test("(h) no cwd in the input evaluates the hook working directory", () => {
  assert.equal(runHook(push("git push"), staleWt).permission, "deny");
  assert.equal(runHook(push("git push"), freshWt).permission, "allow");
  assert.equal(runHook({ command: "git push" }, staleWt).permission, "deny");
});

test("(i) malformed or empty JSON is allowed", () => {
  assert.equal(runHook("not json", staleWt).permission, "allow");
  assert.equal(runHook("", staleWt).permission, "allow");
  assert.equal(runHook({}, staleWt).permission, "allow");
});

test("(j) a non-push command is allowed quickly", () => {
  const started = Date.now();
  for (const command of ["git status", "git fetch origin", "pnpm test", "echo git pushy", 'git commit -m "fix push bug"']) {
    const result = runHook(push(command, { cwd: staleWt }), staleWt);
    assert.equal(result.permission, "allow", command);
  }
  assert.ok(Date.now() - started < 4000, "four non-push commands should be fast");
});

test("a failed fetch or a missing origin/development allows", () => {
  const lone = join(root, "lone");
  mkdirSync(lone);
  execFileSync("git", ["init", "-q", lone]);
  assert.equal(runHook(push("git push", { cwd: lone }), lone).permission, "allow");
});
