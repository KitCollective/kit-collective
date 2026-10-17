import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { LOCK_REF, release, status, take, waitFor } from "../lib/merge-lock.mjs";
import { auditStillValid, syncBound, syncBranch } from "../lib/sync-pr.mjs";

// Hostile environment: no identity anywhere and no auto-detection, as on CI and in the bb container.
// The lib calls get this process.env; only the test helper below carries an identity, for its own commits.
const emptyHome = mkdtempSync(join(tmpdir(), "home-"));
for (const name of [
  "GIT_AUTHOR_NAME",
  "GIT_AUTHOR_EMAIL",
  "GIT_COMMITTER_NAME",
  "GIT_COMMITTER_EMAIL",
  "EMAIL",
]) {
  delete process.env[name];
}
Object.assign(process.env, {
  HOME: emptyHome,
  XDG_CONFIG_HOME: emptyHome,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
  GIT_CONFIG_COUNT: "1",
  GIT_CONFIG_KEY_0: "user.useConfigOnly",
  GIT_CONFIG_VALUE_0: "true",
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

test("merge lock: a push that fails for another reason is CLOSED with git's line, not HELD", () => {
  const { clone, origin } = fixture();
  const a = clone("a");
  // The read works, the write cannot (no credentials, no permission, the network all look like this to git).
  git(a, "remote", "set-url", "--push", "origin", join(origin, "no-such-remote.git"));
  const taken = take({ cwd: a, pr: "1", now: 5000 });
  assert.equal(taken.code, 1);
  assert.match(taken.line, /^CLOSED \(merge-lock\): fatal: /);
  assert.doesNotMatch(taken.line, /HELD|Command failed/);
  assert.equal(status({ cwd: a, now: 5000 }).code, 3, "status still reads the real remote: free");
});

test("merge lock: a lease rejection in the push itself (race after the read) is HELD, not CLOSED", () => {
  const { clone } = fixture();
  const a = clone("a");
  const rival = clone("rival");
  // The rival's lock commit, built ahead of time, so the shim only has to push it.
  const rivalCommit = git(
    rival,
    "commit-tree",
    "4b825dc642cb6eb9a060e54bf8d69288fbee4904",
    "-m",
    "merge-lock pr=2 at=5000",
  );
  // A `git` shim that lets the rival take the lock just before a's own push: after a's read saw it free.
  const shimDir = dir("shim");
  const realGit = execFileSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).trim();
  const shim = join(shimDir, "git");
  writeFileSync(
    shim,
    `#!/bin/sh
if [ "$1" = push ] && [ ! -e "${shimDir}/raced" ]; then
  : > "${shimDir}/raced"
  "${realGit}" -C "${rival}" push --quiet origin "${rivalCommit}:${LOCK_REF}" || exit 99
fi
exec "${realGit}" "$@"
`,
  );
  chmodSync(shim, 0o755);
  const path = process.env.PATH;
  process.env.PATH = `${shimDir}:${path}`;
  try {
    const result = take({ cwd: a, pr: "1", now: 5000 });
    assert.equal(result.code, 3);
    assert.equal(result.line, "HELD (merge-lock): another PR took it first");
  } finally {
    process.env.PATH = path;
  }
  assert.match(
    git(a, "ls-remote", "origin", LOCK_REF),
    new RegExp(`^${rivalCommit}\\s`),
    "the rival holds it",
  );
});

test("merge lock: a server-side push rejection with no remote output is CLOSED with an error line, not git's To line", () => {
  const { clone, origin } = fixture();
  const a = clone("a");
  // The server declines the ref update without printing anything: git then shows `To <url>` first.
  const hook = join(origin, "hooks", "pre-receive");
  writeFileSync(hook, "#!/bin/sh\nexit 1\n");
  chmodSync(hook, 0o755);
  const taken = take({ cwd: a, pr: "1", now: 5000 });
  assert.equal(taken.code, 1);
  assert.match(taken.line, /^CLOSED \(merge-lock\): error: failed to push some refs/);
  assert.doesNotMatch(taken.line, /HELD|Command failed|CLOSED \(merge-lock\): To /);
});

test("merge lock wait: stops at once on a CLOSED verdict instead of polling", async () => {
  const { clone, origin } = fixture();
  const a = clone("a");
  git(a, "remote", "set-url", "--push", "origin", join(origin, "no-such-remote.git"));
  let sleeps = 0;
  const result = await waitFor(
    { cwd: a, pr: "1" },
    { waitSeconds: 3600, pollSeconds: 30, sleep: async () => (sleeps += 1) },
  );
  assert.equal(result.code, 1);
  assert.match(result.line, /^CLOSED \(merge-lock\): fatal: /);
  assert.equal(sleeps, 0);
});

test("merge lock: status and release keep their verdicts when the remote cannot be read", () => {
  const { clone } = fixture();
  const a = clone("a");
  git(a, "remote", "set-url", "origin", join(a, "missing.git"));
  for (const result of [status({ cwd: a }), release({ cwd: a, pr: "1" })]) {
    assert.equal(result.code, 1);
    assert.match(result.line, /^CLOSED \(merge-lock\): fatal: /);
  }
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

test("sync: a merge that fails without a conflict reports git's own reason", () => {
  const f = fixture();
  const work = f.clone("work");
  git(work, "checkout", "--orphan", "unrelated");
  git(work, "rm", "-rf", ".");
  writeFileSync(join(work, "z.txt"), "z\n");
  git(work, "add", "-A");
  git(work, "commit", "-m", "unrelated root");
  const result = syncBranch({ cwd: work, base: "development" });
  assert.equal(result.code, 1);
  assert.match(result.line, /^CLOSED \(sync\): merge failed: .*unrelated histories/);
  assert.doesNotMatch(result.line, /merge --abort/);
});

test("syncBound: the checkout must be the PR head by SHA", () => {
  const a = "a".repeat(40);
  const b = "b".repeat(40);
  assert.equal(syncBound({ head: a, prHead: a }).ok, true);
  const bad = syncBound({ head: a, prHead: b });
  assert.equal(bad.ok, false);
  assert.equal(
    bad.line,
    "CLOSED (sync): local HEAD is aaaaaaaa, the PR head is bbbbbbbb; pull or run from the PR worktree",
  );
  assert.match(
    syncBound({ head: a, prHead: b, verb: "AUDIT-STALE" }).line,
    /^AUDIT-STALE: local HEAD/,
  );
  assert.equal(syncBound({ head: a, prHead: "" }).ok, false);
});

test("merge lock status: free, then held with the holder and age", () => {
  const { clone } = fixture();
  const a = clone("a");
  assert.equal(status({ cwd: a }).code, 3);
  take({ cwd: a, pr: "7", now: 1000 });
  const held = status({ cwd: a, now: 1000 + 600 });
  assert.equal(held.code, 0);
  assert.equal(held.line, "HELD (merge-lock): PR 7 for 10 min");
});

test("merge lock release --force clears a crashed holder; plain release by another PR does not", () => {
  const { clone } = fixture();
  const a = clone("a");
  const b = clone("b");
  take({ cwd: a, pr: "7", now: 1000 });
  assert.equal(release({ cwd: b, pr: "9" }).code, 3);
  const forced = release({ cwd: b, pr: "9", force: true });
  assert.equal(forced.code, 0);
  assert.match(forced.line, /cleared by force, PR 7 held it/);
  assert.equal(status({ cwd: b }).code, 3);
});
