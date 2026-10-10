import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { LOCK_REF, release, take, waitFor } from "../lib/merge-lock.mjs";
import { auditStillValid, syncBranch } from "../lib/sync-pr.mjs";

// CI has no git identity; the lib calls git with process.env, so the identity goes there.
Object.assign(process.env, {
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@t",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@t",
});
const env = {
  ...process.env,
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@t",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@t",
};
const git = (cwd, ...args) => execFileSync("git", args, { cwd, env, encoding: "utf8" }).trim();
const dir = (name) => mkdtempSync(join(tmpdir(), `${name}-`));

/** A bare origin with a `development` branch and two clones of it (two machines). */
function fixture() {
  const origin = dir("origin");
  git(origin, "init", "--bare", "-b", "development");
  const seed = dir("seed");
  git(seed, "init", "-b", "development");
  writeFileSync(join(seed, "a.txt"), "a\n");
  git(seed, "add", "-A");
  git(seed, "commit", "-m", "init");
  git(seed, "remote", "add", "origin", origin);
  git(seed, "push", "origin", "development");
  const clone = (name) => {
    const c = dir(name);
    git(c, "clone", origin, ".");
    return c;
  };
  return { origin, seed, clone };
}

test("merge lock: one holder across two clones, renew, release, stale takeover", () => {
  const { clone } = fixture();
  const mac = clone("mac");
  const box = clone("box");
  assert.equal(take({ cwd: mac, pr: "10", now: 1000 }).code, 0);
  const held = take({ cwd: box, pr: "11", now: 1100 });
  assert.equal(held.code, 3);
  assert.match(held.line, /PR 10 holds it/);
  assert.equal(take({ cwd: mac, pr: "10", now: 1200 }).code, 0, "the holder renews");
  assert.equal(release({ cwd: box, pr: "11" }).code, 3, "only the holder releases");
  assert.equal(release({ cwd: mac, pr: "10" }).code, 0);
  assert.equal(take({ cwd: box, pr: "11", now: 1300 }).code, 0);
  const stale = take({ cwd: mac, pr: "12", now: 1300 + 1801 });
  assert.equal(stale.code, 0);
  assert.match(stale.line, /stale PR 11/);
  assert.equal(git(mac, "ls-remote", "origin", LOCK_REF).length > 0, true);
});

test("merge lock: a lost race is HELD, not an error", () => {
  const { clone } = fixture();
  const a = clone("a");
  const b = clone("b");
  assert.equal(take({ cwd: a, pr: "1", now: 5000 }).code, 0);
  assert.equal(take({ cwd: b, pr: "2", now: 5000 }).code, 3);
});

test("merge lock wait: retries until the holder releases", async () => {
  const { clone } = fixture();
  const a = clone("a");
  const b = clone("b");
  take({ cwd: a, pr: "1", now: Math.floor(Date.now() / 1000) });
  let sleeps = 0;
  const result = await waitFor(
    { cwd: b, pr: "2" },
    {
      waitSeconds: 100,
      pollSeconds: 1,
      sleep: async () => {
        sleeps += 1;
        release({ cwd: a, pr: "1" });
      },
    },
  );
  assert.equal(result.code, 0);
  assert.equal(sleeps, 1);
  const timeout = await waitFor(
    { cwd: a, pr: "3" },
    { waitSeconds: 2, pollSeconds: 1, sleep: async () => {} },
  );
  assert.equal(timeout.code, 3);
});

function branchFixture() {
  const f = fixture();
  const work = f.clone("work");
  git(work, "checkout", "-b", "feature");
  writeFileSync(join(work, "feature.txt"), "f\n");
  git(work, "add", "-A");
  git(work, "commit", "-m", "feature");
  git(work, "push", "origin", "feature");
  return { ...f, work };
}

function advanceBase(f, file, text) {
  writeFileSync(join(f.seed, file), text);
  git(f.seed, "add", "-A");
  git(f.seed, "commit", "-m", `base ${file}`);
  git(f.seed, "push", "origin", "development");
}

test("sync: CURRENT, then SYNCED after the lane moves, and the audit stays valid", () => {
  const f = branchFixture();
  assert.match(syncBranch({ cwd: f.work, base: "development" }).line, /^CURRENT/);
  const audited = git(f.work, "rev-parse", "HEAD");
  advanceBase(f, "other.txt", "o\n");
  const synced = syncBranch({ cwd: f.work, base: "development" });
  assert.equal(synced.code, 0);
  assert.match(synced.line, /^SYNCED/);
  assert.equal(git(f.work, "rev-parse", "HEAD"), git(f.origin, "rev-parse", "feature"), "pushed");
  const valid = auditStillValid({ cwd: f.work, audited, base: "development" });
  assert.equal(valid.code, 0, valid.line);
});

test("sync: a conflict is reported, nothing is left half-merged", () => {
  const f = branchFixture();
  writeFileSync(join(f.work, "a.txt"), "feature edit\n");
  git(f.work, "commit", "-am", "edit a");
  advanceBase(f, "a.txt", "base edit\n");
  const result = syncBranch({ cwd: f.work, base: "development" });
  assert.equal(result.code, 1);
  assert.match(result.line, /^CONFLICT.*a\.txt/);
  assert.equal(git(f.work, "status", "--porcelain"), "");
});

test("sync refuses uncommitted files", () => {
  const f = branchFixture();
  writeFileSync(join(f.work, "dirty.txt"), "x");
  assert.match(syncBranch({ cwd: f.work, base: "development" }).line, /^CLOSED.*uncommitted/);
});

test("audit is stale after new work or a hand-edited merge", () => {
  const f = branchFixture();
  const audited = git(f.work, "rev-parse", "HEAD");
  writeFileSync(join(f.work, "more.txt"), "m\n");
  git(f.work, "add", "-A");
  git(f.work, "commit", "-m", "more work");
  assert.match(
    auditStillValid({ cwd: f.work, audited, base: "development" }).line,
    /^AUDIT-STALE.*not a merge/,
  );

  // a merge of the lane with an extra hand edit folded into the merge commit
  const g = branchFixture();
  const auditedG = git(g.work, "rev-parse", "HEAD");
  advanceBase(g, "other.txt", "o\n");
  git(g.work, "fetch", "origin");
  git(g.work, "merge", "--no-commit", "--no-ff", "origin/development");
  writeFileSync(join(g.work, "sneaky.txt"), "hand edit\n");
  git(g.work, "add", "-A");
  git(g.work, "commit", "-m", "merge with hand edit");
  assert.match(
    auditStillValid({ cwd: g.work, audited: auditedG, base: "development" }).line,
    /^AUDIT-STALE.*hand edits/,
  );
});
