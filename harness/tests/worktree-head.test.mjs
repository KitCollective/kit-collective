/**
 * KIT-105 — Checkout sits on the issue PR head. Never review development
 * because origin/kit-n is missing. Fake git + PR list at this seam.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { selectOpenIssuePrs } from "../gh-cli.mjs";
import { createWorktreeAdapter, resolveIssueGitHead } from "../worktree.mjs";

test("resolveIssueGitHead prefers the single open PR head over a missing kit-n", () => {
  const resolved = resolveIssueGitHead({
    canonicalBranch: "kit-47",
    lane: "development",
    canonicalOnRemote: false,
    openPrHeads: ["nicklas/kit-47-bulk-uredigerede-faner-og-gem-og-naeste"],
    mode: "reuse",
  });
  assert.deepEqual(resolved, {
    branch: "nicklas/kit-47-bulk-uredigerede-faner-og-gem-og-naeste",
    startPoint: "origin/nicklas/kit-47-bulk-uredigerede-faner-og-gem-og-naeste",
  });
});

test("resolveIssueGitHead uses origin/kit-n when that is the only head", () => {
  const resolved = resolveIssueGitHead({
    canonicalBranch: "kit-99",
    lane: "development",
    canonicalOnRemote: true,
    openPrHeads: [],
    mode: "reuse",
  });
  assert.deepEqual(resolved, {
    branch: "kit-99",
    startPoint: "origin/kit-99",
  });
});

test("resolveIssueGitHead prefers the open PR head when it differs from kit-n", () => {
  const resolved = resolveIssueGitHead({
    canonicalBranch: "kit-47",
    lane: "development",
    canonicalOnRemote: true,
    openPrHeads: ["nicklas/kit-47-bulk"],
    mode: "reuse",
  });
  assert.equal(resolved.branch, "nicklas/kit-47-bulk");
});

test("resolveIssueGitHead lets implement start kit-n from the lane when no PR exists", () => {
  const resolved = resolveIssueGitHead({
    canonicalBranch: "kit-99",
    lane: "development",
    canonicalOnRemote: false,
    openPrHeads: [],
    mode: "implement",
  });
  assert.deepEqual(resolved, {
    branch: "kit-99",
    startPoint: "origin/development",
  });
});

test("resolveIssueGitHead refuses reuse when there is no kit-n and no PR", () => {
  assert.throws(
    () =>
      resolveIssueGitHead({
        canonicalBranch: "kit-47",
        lane: "development",
        canonicalOnRemote: false,
        openPrHeads: [],
        mode: "reuse",
      }),
    /no issue head/,
  );
});

test("resolveIssueGitHead refuses two open PR heads", () => {
  assert.throws(
    () =>
      resolveIssueGitHead({
        canonicalBranch: "kit-47",
        lane: "development",
        canonicalOnRemote: false,
        openPrHeads: ["nicklas/kit-47-a", "nicklas/kit-47-b"],
        mode: "reuse",
      }),
    /multiple open PRs/,
  );
});

test("selectOpenIssuePrs matches KIT-47 and not KIT-470", () => {
  const rows = [
    { title: "KIT-47: Bulk bind", headRefName: "nicklas/kit-47-bulk", url: "https://example/45" },
    { title: "KIT-470: Other", headRefName: "kit-470", url: "https://example/99" },
  ];
  const matched = selectOpenIssuePrs(rows, "KIT-47");
  assert.deepEqual(matched, [rows[0]]);
});

test("reuse checkout without kit-n or PR does not add a worktree from development", async () => {
  const gitCalls = [];
  const adapter = createWorktreeAdapter({
    mirrorDir: "/var/lib/kit-pi/mirror.git",
    worktreesDir: "/var/lib/kit-pi/worktrees",
    existsSync: (path) => path === "/var/lib/kit-pi/mirror.git",
    mkdirSync() {},
    async findOpenIssuePr() {
      return null;
    },
    async runGit(args) {
      gitCalls.push(args);
      if (args.includes("kit-47") && args.includes("fetch")) {
        throw new Error("issue branch not on origin");
      }
      if (args.some((arg) => String(arg).includes("refs/remotes/origin/kit-47"))) {
        throw new Error("issue branch not on origin");
      }
      return { stdout: "", status: 0 };
    },
  });

  await assert.rejects(
    () => adapter.checkout({ identifier: "KIT-47", mode: "reuse" }),
    /no issue head/,
  );
  assert.equal(
    gitCalls.some(
      (args) =>
        args.includes("worktree") && args.includes("add") && args.includes("origin/development"),
    ),
    false,
  );
});

test("reuse checkout adds the worktree from the open PR head", async () => {
  const gitCalls = [];
  const adapter = createWorktreeAdapter({
    mirrorDir: "/var/lib/kit-pi/mirror.git",
    worktreesDir: "/var/lib/kit-pi/worktrees",
    existsSync: (path) => path === "/var/lib/kit-pi/mirror.git",
    mkdirSync() {},
    async findOpenIssuePr() {
      return {
        head: "nicklas/kit-47-bulk-uredigerede-faner-og-gem-og-naeste",
        url: "https://github.com/KitCollective/kit-collective/pull/45",
      };
    },
    async runGit(args) {
      gitCalls.push(args);
      if (args.includes("kit-47") && !String(args.join(" ")).includes("nicklas/")) {
        throw new Error("canonical kit-47 missing");
      }
      return { stdout: "ok\n", status: 0 };
    },
  });

  const result = await adapter.checkout({ identifier: "KIT-47", mode: "reuse" });
  assert.equal(result.branch, "nicklas/kit-47-bulk-uredigerede-faner-og-gem-og-naeste");
  assert.ok(
    gitCalls.some(
      (args) =>
        args.includes("worktree") &&
        args.includes("add") &&
        args.includes("origin/nicklas/kit-47-bulk-uredigerede-faner-og-gem-og-naeste"),
    ),
  );
});

test("stale kit-n worktree checks out the open PR head", async () => {
  const gitCalls = [];
  const adapter = createWorktreeAdapter({
    mirrorDir: "/var/lib/kit-pi/mirror.git",
    worktreesDir: "/var/lib/kit-pi/worktrees",
    existsSync: (path) =>
      path === "/var/lib/kit-pi/mirror.git" || path === "/var/lib/kit-pi/worktrees/KIT-47",
    mkdirSync() {},
    async findOpenIssuePr() {
      return {
        head: "nicklas/kit-47-bulk",
        url: "https://github.com/KitCollective/kit-collective/pull/45",
      };
    },
    async runGit(args) {
      gitCalls.push(args);
      if (
        args.includes("fetch") &&
        args.includes("kit-47") &&
        !args.includes("nicklas/kit-47-bulk")
      ) {
        throw new Error("canonical missing");
      }
      return { stdout: "ok\n", status: 0 };
    },
  });

  const result = await adapter.checkout({ identifier: "KIT-47", mode: "reuse" });
  assert.equal(result.branch, "nicklas/kit-47-bulk");
  assert.equal(
    gitCalls.some((args) => args.includes("worktree") && args.includes("add")),
    false,
  );
  assert.ok(
    gitCalls.some(
      (args) =>
        args.includes("-C") &&
        args.includes("/var/lib/kit-pi/worktrees/KIT-47") &&
        args.includes("checkout") &&
        args.includes("nicklas/kit-47-bulk"),
    ),
  );
});

test("reuse checkout of a dirty worktree force-resets onto the PR head", async () => {
  const gitCalls = [];
  const adapter = createWorktreeAdapter({
    mirrorDir: "/var/lib/kit-pi/mirror.git",
    worktreesDir: "/var/lib/kit-pi/worktrees",
    existsSync: (path) =>
      path === "/var/lib/kit-pi/mirror.git" || path === "/var/lib/kit-pi/worktrees/KIT-126",
    mkdirSync() {},
    async findOpenIssuePr() {
      return { head: "kit-126", url: "https://github.com/KitCollective/kit-collective/pull/105" };
    },
    async runGit(args) {
      gitCalls.push(args);
      return { stdout: "ok\n", status: 0 };
    },
  });

  await adapter.checkout({ identifier: "KIT-126", mode: "reuse" });
  assert.ok(
    gitCalls.some(
      (args) =>
        args.includes("-C") &&
        args.includes("/var/lib/kit-pi/worktrees/KIT-126") &&
        args.includes("reset") &&
        args.includes("--hard"),
    ),
  );
  assert.ok(
    gitCalls.some(
      (args) =>
        args.includes("checkout") &&
        args.includes("-f") &&
        args.includes("-B") &&
        args.includes("kit-126") &&
        args.includes("origin/kit-126"),
    ),
  );
});

test("fetch of an issue branch writes refs/remotes/origin so reuse can see a missing kit-n", async () => {
  const gitCalls = [];
  const adapter = createWorktreeAdapter({
    mirrorDir: "/var/lib/kit-pi/mirror.git",
    worktreesDir: "/var/lib/kit-pi/worktrees",
    existsSync: (path) => path === "/var/lib/kit-pi/mirror.git",
    mkdirSync() {},
    async findOpenIssuePr() {
      return { head: "kit-126", url: "https://github.com/KitCollective/kit-collective/pull/105" };
    },
    async runGit(args) {
      gitCalls.push(args);
      return { stdout: "ok\n", status: 0 };
    },
  });

  await adapter.checkout({ identifier: "KIT-126", mode: "reuse" });
  assert.ok(
    gitCalls.some((args) =>
      args.includes("kit-126:refs/remotes/origin/kit-126"),
    ),
    "expected fetch refspec that updates refs/remotes/origin/kit-126",
  );
});
