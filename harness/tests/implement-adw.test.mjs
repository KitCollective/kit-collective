import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { LINEAR_CLI_PIN } from "../boot-env.mjs";
import { createGhClient } from "../gh-cli.mjs";
import {
  completeImplementAdw,
  createTypecheckTouched,
  evaluateWriteScopeExit,
  formatWriteScopeViolationFeedback,
  IMPLEMENTING,
  IN_REVIEW,
  requiredChecksGreen,
  WORKPAD_HEADING,
} from "../implement-exit.mjs";
import {
  COMMENT_CREATE_MUTATION,
  COMMENT_UPDATE_MUTATION,
  createLinearCliClient,
  ISSUE_UPDATE_STATE_MUTATION,
} from "../linear-cli.mjs";
import {
  createPiJobRunner,
  IMPLEMENT_MEMORY_EXCLUDED_TOOLS,
  WORKER_MEMORY_DIR,
} from "../pi-job.mjs";
import {
  createWorktreeAdapter,
  gitArgvContainsSecret,
  gitAuthExtraHeader,
  remoteGitChildEnv,
  worktreeBranch,
  worktreePath,
} from "../worktree.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function validWorkerEnv() {
  return {
    CURSOR_API_KEY: "cursor_test",
    LINEAR_CLI_API_KEY: "lin_cli_test",
    LINEAR_WEBHOOK_SECRET: "secret",
    GH_TOKEN: "ghp_test",
    LINEAR_CLI_VERSION: LINEAR_CLI_PIN.version,
    LINEAR_PI_APP_USER_ID: "pi-app-user-1",
    PI_MODEL: "cursor/composer-2.5",
    PI_MODEL_FAST: "cursor/grok-4.6",
    OPENROUTER_API_KEY: "or_test",
  };
}

function agentFrontmatter(relative) {
  const text = readFileSync(join(ROOT, relative), "utf8");
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  return { text, frontmatter: match ? match[1] : "" };
}

function fakeWorktree({ path = "/var/lib/kit-pi/worktrees/KIT-99", branch = "kit-99" } = {}) {
  const calls = [];
  return {
    calls,
    async checkout(input) {
      calls.push(input);
      return { path, branch, lane: "development" };
    },
  };
}

function fakeGh({ mergeable = "MERGEABLE", checks = [{ conclusion: "success" }] } = {}) {
  const calls = [];
  let opened = false;
  return {
    calls,
    async rebase(input) {
      calls.push(["rebase", input]);
    },
    async viewPr(input) {
      calls.push(["viewPr", input]);
      if (!opened) {
        return { url: undefined, mergeable: "UNKNOWN", checks: [] };
      }
      return {
        url: "https://github.com/KitCollective/kit-collective/pull/52",
        mergeable,
        checks,
      };
    },
    async findOpenIssuePr(input) {
      calls.push(["findOpenIssuePr", input]);
      return null;
    },
    async createPr(input) {
      calls.push(["createPr", input]);
      opened = true;
      return {
        url: "https://github.com/KitCollective/kit-collective/pull/52",
        mergeable,
        checks,
      };
    },
    merge() {
      calls.push(["merge"]);
      throw new Error("implement never merges");
    },
  };
}

function fakeLinear() {
  const calls = [];
  const comments = [
    {
      id: "c1",
      body: `${WORKPAD_HEADING}\n\n### Status\nImplementing\n\n### Notes\n\n- Role comments and description AC on checker pass\n`,
    },
  ];
  return {
    calls,
    comments,
    async listComments() {
      calls.push(["listComments"]);
      return comments;
    },
    async updateWorkpad(input) {
      calls.push(["updateWorkpad", input]);
      const current = comments[0];
      if (current) {
        current.body = input.body;
        return { id: current.id, created: false };
      }
      comments.push({ id: "c-new", body: input.body });
      return { id: "c-new", created: true };
    },
    async commentIssue(input) {
      calls.push(["commentIssue", input]);
    },
    async setStatus(input) {
      calls.push(["setStatus", input]);
    },
  };
}

function implementRunner({
  gh,
  linear,
  worktree,
  typecheckTouched,
  spawned,
  now,
  sleep,
  waitTimeoutMs,
  waitIntervalMs,
  spawnStatus = 0,
}) {
  return createPiJobRunner({
    env: validWorkerEnv(),
    workspace: ROOT,
    worktree: worktree ?? fakeWorktree(),
    gh,
    linear,
    typecheckTouched:
      typecheckTouched ??
      (async (input) => {
        gh.calls.push(["typecheckTouched", input]);
      }),
    spawnProcess(command, args, options) {
      spawned.push({ command, args, options });
      return Promise.resolve({ status: spawnStatus });
    },
    now,
    sleep,
    waitTimeoutMs,
    waitIntervalMs,
  });
}

test("worktree adapter checks out origin/development under /var/lib/kit-pi/worktrees/KIT-n", async () => {
  const gitCalls = [];
  const adapter = createWorktreeAdapter({
    mirrorDir: "/var/lib/kit-pi/mirror.git",
    worktreesDir: "/var/lib/kit-pi/worktrees",
    remoteUrl: "https://github.com/KitCollective/kit-collective.git",
    existsSync: () => false,
    mkdirSync() {},
    async runGit(args) {
      gitCalls.push(args);
      if (args.includes("kit-99") && args.includes("fetch")) {
        throw new Error("issue branch not on origin");
      }
      if (args.some((arg) => String(arg).includes("refs/remotes/origin/kit-99"))) {
        throw new Error("issue branch not on origin");
      }
      return { stdout: "", status: 0 };
    },
  });

  const result = await adapter.checkout({ identifier: "KIT-99", mode: "implement" });

  assert.equal(result.path, "/var/lib/kit-pi/worktrees/KIT-99");
  assert.equal(result.branch, "kit-99");
  assert.equal(result.lane, "development");
  assert.equal(worktreePath("KIT-99"), "/var/lib/kit-pi/worktrees/KIT-99");
  assert.equal(worktreeBranch("KIT-99"), "kit-99");
  assert.ok(gitCalls.some((args) => args.includes("clone") && args.includes("--bare")));
  assert.ok(
    gitCalls.some(
      (args) => args.includes("fetch") && args.includes("origin") && args.includes("development"),
    ),
  );
  assert.ok(
    gitCalls.some(
      (args) =>
        args.includes("worktree") &&
        args.includes("add") &&
        args.includes("/var/lib/kit-pi/worktrees/KIT-99") &&
        args.includes("origin/development"),
    ),
  );
});

test("production git wrapper keeps GH_TOKEN in env via Basic header, never argv", async () => {
  const env = { GH_TOKEN: "harness_git_auth_test_token" };
  const child = remoteGitChildEnv(env);
  assert.equal(
    gitArgvContainsSecret(["clone", "--bare", "https://github.com/org/repo.git"], env),
    false,
  );
  assert.equal(child.GH_TOKEN, "harness_git_auth_test_token");
  assert.equal(child.GIT_CONFIG_KEY_1, "http.extraHeader");
  assert.equal(child.GIT_CONFIG_VALUE_1, gitAuthExtraHeader("harness_git_auth_test_token"));

  const execs = [];
  const adapter = createWorktreeAdapter({
    env,
    mirrorDir: "/var/lib/kit-pi/mirror.git",
    worktreesDir: "/var/lib/kit-pi/worktrees",
    existsSync: () => false,
    mkdirSync() {},
    async execFileImpl(command, args, options) {
      execs.push({ command, args, env: options.env });
      return { stdout: "" };
    },
  });
  await adapter.checkout({ identifier: "KIT-99" });
  assert.ok(execs.length > 0);
  for (const exec of execs) {
    assert.equal(exec.args.join(" ").includes("harness_git_auth_test_token"), false);
    assert.equal(JSON.stringify(exec.args).includes("Authorization"), false);
    assert.equal(exec.env.GIT_CONFIG_KEY_1, "http.extraHeader");
    assert.equal(exec.env.GIT_CONFIG_VALUE_1, gitAuthExtraHeader("harness_git_auth_test_token"));
  }
});

test("worktree adapter refuses identifiers that would escape the worktrees dir", async () => {
  const adapter = createWorktreeAdapter({
    existsSync: () => false,
    mkdirSync() {},
    async runGit() {
      throw new Error("git must not run for an invalid identifier");
    },
  });

  await assert.rejects(
    () => adapter.checkout({ identifier: "../etc" }),
    /invalid issue identifier/,
  );
  await assert.rejects(
    () => adapter.checkout({ identifier: "KIT-99/../KIT-1" }),
    /invalid issue identifier/,
  );
});

test("worktree adapter reuses an existing issue worktree (one issue, one branch)", async () => {
  const gitCalls = [];
  const adapter = createWorktreeAdapter({
    mirrorDir: "/var/lib/kit-pi/mirror.git",
    worktreesDir: "/var/lib/kit-pi/worktrees",
    existsSync: (path) =>
      path === "/var/lib/kit-pi/mirror.git" || path === "/var/lib/kit-pi/worktrees/KIT-99",
    mkdirSync() {},
    async runGit(args) {
      gitCalls.push(args);
      return { stdout: "", status: 0 };
    },
  });

  const result = await adapter.checkout({ identifier: "KIT-99" });
  assert.equal(result.path, "/var/lib/kit-pi/worktrees/KIT-99");
  assert.equal(result.branch, "kit-99");
  assert.equal(
    gitCalls.some((args) => args.includes("worktree") && args.includes("add")),
    false,
  );
  assert.ok(
    gitCalls.some(
      (args) =>
        args.includes("-C") &&
        args.includes("/var/lib/kit-pi/worktrees/KIT-99") &&
        args.includes("checkout") &&
        args.includes("kit-99"),
    ),
  );
});

test("worktree adapter creates from origin/issue-branch when implement has pushed the PR branch", async () => {
  const gitCalls = [];
  const adapter = createWorktreeAdapter({
    mirrorDir: "/var/lib/kit-pi/mirror.git",
    worktreesDir: "/var/lib/kit-pi/worktrees",
    existsSync: (path) => path === "/var/lib/kit-pi/mirror.git",
    mkdirSync() {},
    async runGit(args) {
      gitCalls.push(args);
      return { stdout: "abc\n", status: 0 };
    },
  });

  const result = await adapter.checkout({ identifier: "KIT-99" });
  assert.equal(result.path, "/var/lib/kit-pi/worktrees/KIT-99");
  assert.equal(result.branch, "kit-99");
  assert.ok(
    gitCalls.some(
      (args) => args.includes("fetch") && args.includes("kit-99:refs/remotes/origin/kit-99"),
    ),
  );
  assert.ok(
    gitCalls.some(
      (args) =>
        args.includes("worktree") &&
        args.includes("add") &&
        args.includes("/var/lib/kit-pi/worktrees/KIT-99") &&
        args.includes("origin/kit-99"),
    ),
  );
  assert.equal(
    gitCalls.some(
      (args) =>
        args.includes("worktree") && args.includes("add") && args.includes("origin/development"),
    ),
    false,
  );
});

test("Feature ADW job opens a PR, updates the workpad, moves to In Review, and never merges", async () => {
  const worktree = fakeWorktree();
  const gh = fakeGh();
  const linear = fakeLinear();
  const spawned = [];
  const runner = implementRunner({
    gh,
    linear,
    worktree,
    spawned,
    typecheckTouched: async (input) => {
      gh.calls.push(["typecheckTouched", input]);
    },
  });

  await runner.run({
    role: "implement",
    identifier: "KIT-99",
    issueId: "issue-1",
    adwFile: ".pi/adw/feature.yaml",
  });

  assert.deepEqual(worktree.calls, [{ identifier: "KIT-99", mode: "implement" }]);
  assert.equal(spawned.length, 1);
  assert.equal(spawned[0].options.cwd, "/var/lib/kit-pi/worktrees/KIT-99");
  assert.equal(spawned[0].args.includes("-a"), true);
  assert.equal(
    spawned[0].args.some((arg) => String(arg).endsWith(".pi/roles/implement.md")),
    true,
  );
  assert.equal(
    spawned[0].args.some((arg) => String(arg).endsWith(".pi/roles/factory-checker.md")),
    false,
  );
  assert.equal(
    gh.calls.some((call) => call[0] === "rebase"),
    true,
  );
  assert.equal(
    gh.calls.some((call) => call[0] === "typecheckTouched"),
    true,
  );
  assert.equal(
    gh.calls.some((call) => call[0] === "createPr" && call[1].base === "development"),
    true,
  );
  assert.equal(
    linear.calls.some((call) => call[0] === "updateWorkpad"),
    true,
  );
  const workpad = linear.calls.find((call) => call[0] === "updateWorkpad")[1];
  assert.match(workpad.body, /## Agent Workpad/);
  assert.match(workpad.body, /pull\/52/);
  assert.equal(workpad.commentId, "c1");
  assert.deepEqual(linear.calls.find((call) => call[0] === "setStatus")[1], {
    issueId: "issue-1",
    status: IN_REVIEW,
  });
  const inReviewComment = linear.calls.find((call) => call[0] === "commentIssue")[1];
  assert.match(inReviewComment.body, /In Review/);
  assert.match(inReviewComment.body, /pull\/52/);
  assert.match(inReviewComment.body, /Role comments and description AC on checker pass/);
  assert.equal(
    gh.calls.some((call) => call[0] === "merge"),
    false,
  );
  assert.equal(linear.calls.filter((call) => call[0] === "updateWorkpad").length, 1);
});

test("implement Pi non-zero still runs implement-exit and moves In Review when checks are green", async () => {
  const gh = fakeGh();
  gh.viewPr = async () => ({
    url: "https://github.com/KitCollective/kit-collective/pull/52",
    mergeable: "MERGEABLE",
    checks: [{ name: "test", conclusion: "success", isRequired: true }],
  });
  const linear = fakeLinear();
  const spawned = [];
  const result = await implementRunner({ gh, linear, spawned, spawnStatus: 1 }).run({
    role: "implement",
    identifier: "KIT-126",
    issueId: "issue-126",
    adwFile: ".pi/adw/feature.yaml",
  });

  assert.equal(spawned.length, 1);
  assert.equal(result.status, IN_REVIEW);
  assert.deepEqual(linear.calls.find((call) => call[0] === "setStatus")[1], {
    issueId: "issue-126",
    status: IN_REVIEW,
  });
});

test("completeImplementAdw skips rebase when the open PR is already MERGEABLE", async () => {
  const calls = [];
  const gh = {
    calls,
    async rebase(input) {
      calls.push(["rebase", input]);
    },
    async syncToRemoteBranch(input) {
      calls.push(["syncToRemoteBranch", input]);
    },
    async findOpenIssuePr(input) {
      calls.push(["findOpenIssuePr", input]);
      return {
        url: "https://github.com/KitCollective/kit-collective/pull/105",
        head: "kit-126",
      };
    },
    async viewPr(input) {
      calls.push(["viewPr", input]);
      return {
        url: "https://github.com/KitCollective/kit-collective/pull/105",
        mergeable: "MERGEABLE",
        checks: [{ name: "test", conclusion: "success", isRequired: true }],
      };
    },
    async createPr() {
      calls.push(["createPr"]);
      throw new Error("must not create a second PR");
    },
    merge() {
      throw new Error("implement never merges");
    },
  };
  const linear = fakeLinear();
  const result = await completeImplementAdw({
    job: { identifier: "KIT-126", issueId: "issue-126", adwFile: ".pi/adw/feature.yaml" },
    checkout: { path: "/var/lib/kit-pi/worktrees/KIT-126", branch: "kit-126" },
    gh,
    linear,
    typecheckTouched: async () => {},
    adwText: readFileSync(join(ROOT, ".pi/adw/feature.yaml"), "utf8"),
    now: (() => {
      let t = 0;
      return () => {
        t += 1;
        return t;
      };
    })(),
    sleep: async () => {},
    waitTimeoutMs: 2,
    waitIntervalMs: 1,
  });

  assert.equal(
    calls.some((call) => call[0] === "rebase"),
    false,
  );
  assert.equal(
    calls.some(
      (call) =>
        call[0] === "syncToRemoteBranch" &&
        call[1].branch === "kit-126" &&
        call[1].cwd === "/var/lib/kit-pi/worktrees/KIT-126",
    ),
    true,
  );
  assert.equal(result.status, IN_REVIEW);
});

test("production gh.rebase aborts a conflicted rebase instead of leaving the tree wedged", async () => {
  const calls = [];
  const gh = createGhClient({
    env: { GH_TOKEN: "ghp_secret_token" },
    async runCommand(command, args) {
      calls.push({ command, args });
      if (command === "git" && args.includes("rebase") && !args.includes("--abort")) {
        throw new Error("CONFLICT (content): Merge conflict in harness/pi-job.mjs");
      }
      return "";
    },
  });

  await assert.rejects(
    () => gh.rebase({ cwd: "/tmp/KIT-126", onto: "origin/development", branch: "kit-126" }),
    /Merge conflict/,
  );
  assert.equal(
    calls.some(
      (call) =>
        call.command === "git" && call.args.includes("rebase") && call.args.includes("--abort"),
    ),
    true,
  );
  assert.equal(
    calls.some((call) => call.command === "git" && call.args.includes("push")),
    false,
  );
});

test("production gh.syncToRemoteBranch fetches the issue refspec and resets hard", async () => {
  const calls = [];
  const gh = createGhClient({
    env: { GH_TOKEN: "ghp_secret_token" },
    async runCommand(command, args) {
      calls.push({ command, args });
      return "";
    },
  });
  await gh.syncToRemoteBranch({ cwd: "/tmp/KIT-126", branch: "kit-126" });
  assert.ok(
    calls.some(
      (call) =>
        call.command === "git" &&
        call.args.includes("fetch") &&
        call.args.includes("kit-126:refs/remotes/origin/kit-126"),
    ),
  );
  assert.ok(
    calls.some(
      (call) =>
        call.command === "git" &&
        call.args.includes("reset") &&
        call.args.includes("--hard") &&
        call.args.includes("origin/kit-126"),
    ),
  );
});

test("implement ADW reuses the open issue PR and does not create a second", async () => {
  const existingUrl = "https://github.com/KitCollective/kit-collective/pull/45";
  const calls = [];
  const gh = {
    calls,
    async rebase(input) {
      calls.push(["rebase", input]);
    },
    async findOpenIssuePr(input) {
      calls.push(["findOpenIssuePr", input]);
      return {
        url: existingUrl,
        head: "nicklas/kit-47-bulk",
        mergeable: "MERGEABLE",
        checks: [{ conclusion: "success" }],
      };
    },
    async viewPr(input) {
      calls.push(["viewPr", input]);
      return { url: undefined, mergeable: "UNKNOWN", checks: [] };
    },
    async createPr(input) {
      calls.push(["createPr", input]);
      throw new Error("must not create a second PR");
    },
    merge() {
      throw new Error("implement never merges");
    },
  };
  const linear = fakeLinear();
  await completeImplementAdw({
    job: { identifier: "KIT-47", issueId: "issue-47", adwFile: ".pi/adw/feature.yaml" },
    checkout: { path: "/var/lib/kit-pi/worktrees/KIT-47", branch: "kit-47" },
    gh,
    linear,
    typecheckTouched: async () => {},
    adwText: readFileSync(join(ROOT, ".pi/adw/feature.yaml"), "utf8"),
    now: (() => {
      let t = 0;
      return () => {
        t += 1;
        return t;
      };
    })(),
    sleep: async () => {},
    waitTimeoutMs: 2,
    waitIntervalMs: 1,
  });

  assert.equal(
    calls.some((call) => call[0] === "createPr"),
    false,
  );
  const workpad = linear.calls.find((call) => call[0] === "updateWorkpad")[1];
  assert.match(workpad.body, /pull\/45/);
});

test("Bug and Improvement ADW jobs also open a PR and move to In Review", async () => {
  for (const adwFile of [".pi/adw/bug.yaml", ".pi/adw/improvement.yaml"]) {
    const gh = fakeGh();
    const linear = fakeLinear();
    const spawned = [];
    await implementRunner({ gh, linear, spawned }).run({
      role: "implement",
      identifier: "KIT-99",
      issueId: "issue-1",
      adwFile,
    });
    assert.equal(
      gh.calls.some((call) => call[0] === "createPr"),
      true,
      adwFile,
    );
    assert.equal(
      linear.calls.some((call) => call[0] === "setStatus" && call[1].status === IN_REVIEW),
      true,
      adwFile,
    );
    assert.equal(
      gh.calls.some((call) => call[0] === "merge"),
      false,
      adwFile,
    );
  }
});

test("implement job stays Implementing when required checks are red and does not move to In Review", async () => {
  const gh = fakeGh({ mergeable: "MERGEABLE", checks: [{ conclusion: "failure" }] });
  const linear = fakeLinear();
  const spawned = [];
  const result = await implementRunner({ gh, linear, spawned }).run({
    role: "implement",
    identifier: "KIT-99",
    issueId: "issue-1",
    adwFile: ".pi/adw/feature.yaml",
  });
  assert.equal(result.ciRetry, true);
  assert.equal(result.status, IMPLEMENTING);
  assert.equal(
    linear.calls.some((call) => call[0] === "setStatus"),
    false,
  );
  assert.equal(
    linear.calls.some((call) => call[0] === "updateWorkpad"),
    true,
  );
});

test("planner job does not check out a worktree, open a PR, or merge", async () => {
  const worktree = fakeWorktree();
  const gh = fakeGh();
  const linear = {
    async lookupUser() {
      return { id: "pi-app-user-1", name: "Pi" };
    },
    async listDispatch() {
      return { implementingState: { id: "s-impl", name: "Implementing" }, issues: [] };
    },
    async claimIssue() {
      throw new Error("planner test must not claim");
    },
    async commentIssue() {},
  };
  const spawned = [];
  await implementRunner({ gh, linear, worktree, spawned }).run({
    role: "planner",
    identifier: "KIT-99",
  });
  assert.equal(worktree.calls.length, 0);
  assert.equal(spawned.length, 0);
  assert.equal(
    gh.calls.some((call) => call[0] === "createPr" || call[0] === "merge"),
    false,
  );
});

test("updateWorkpad edits the existing workpad and does not create a second comment", async () => {
  const calls = [];
  const linear = createLinearCliClient({
    env: validWorkerEnv(),
    async runCommand(command, args) {
      calls.push({ command, query: args[1] });
      if (args[1].includes("IssueComments")) {
        return JSON.stringify({
          data: {
            issue: {
              comments: {
                nodes: [{ id: "c1", body: `${WORKPAD_HEADING}\n\nold\n` }],
              },
            },
          },
        });
      }
      return JSON.stringify({ data: { commentUpdate: { success: true } } });
    },
  });

  const result = await linear.updateWorkpad({
    issueId: "issue-1",
    body: `${WORKPAD_HEADING}\n\nupdated\n`,
  });
  assert.equal(result.created, false);
  assert.equal(result.id, "c1");
  assert.equal(
    calls.some((call) => call.query === COMMENT_UPDATE_MUTATION),
    true,
  );
  assert.equal(
    calls.some((call) => call.query === COMMENT_CREATE_MUTATION),
    false,
  );
});

test("setStatus moves the issue to In Review via Linear issueUpdate", async () => {
  const calls = [];
  const linear = createLinearCliClient({
    env: validWorkerEnv(),
    async runCommand(_command, args) {
      calls.push(args[1]);
      if (args[1].includes("IssueTeamStates")) {
        return JSON.stringify({
          data: {
            issue: {
              team: {
                states: { nodes: [{ id: "s-review", name: "In Review" }] },
              },
            },
          },
        });
      }
      return JSON.stringify({ data: { issueUpdate: { success: true } } });
    },
  });
  const result = await linear.setStatus({ issueId: "issue-1", status: IN_REVIEW });
  assert.deepEqual(result, { issueId: "issue-1", status: IN_REVIEW });
  assert.equal(calls.includes(ISSUE_UPDATE_STATE_MUTATION), true);
});

test("empty required-check list is not green; all-optional checks do not block", () => {
  assert.equal(requiredChecksGreen([]), false);
  assert.equal(requiredChecksGreen(undefined), false);
  assert.equal(
    requiredChecksGreen([{ name: "Cursor Bugbot", isRequired: false, status: "IN_PROGRESS" }]),
    true,
  );
});

test("typecheckTouched skips pnpm when the diff has no workspace packages", async () => {
  const calls = [];
  const typecheckTouched = createTypecheckTouched({
    async runCommand(command, args) {
      calls.push([command, ...args]);
      if (command === "git") {
        return "harness/implement-exit.mjs\n.pi/roles/implement.md\n";
      }
      throw new Error("pnpm must not run when the touched set is empty");
    },
  });
  await typecheckTouched({ cwd: "/var/lib/kit-pi/worktrees/KIT-99" });
  assert.equal(
    calls.some((call) => call[0] === "pnpm"),
    false,
  );
  assert.equal(
    calls.some((call) => call[0] === "git"),
    true,
  );
});

test("typecheckTouched fails closed when pnpm is missing and workspace packages are touched", async () => {
  const typecheckTouched = createTypecheckTouched({
    async runCommand(command) {
      if (command === "git") {
        return "apps/api/src/main.ts\n";
      }
      const err = new Error("spawn pnpm ENOENT");
      err.code = "ENOENT";
      throw err;
    },
  });
  await assert.rejects(
    () => typecheckTouched({ cwd: "/var/lib/kit-pi/worktrees/KIT-99" }),
    (err) => err?.code === "ENOENT",
  );
});

test("typecheckTouched typechecks only touched workspace packages and never pnpm test", async () => {
  const calls = [];
  const typecheckTouched = createTypecheckTouched({
    async runCommand(command, args) {
      calls.push([command, ...args]);
      if (command === "git") {
        return "apps/api/src/main.ts\npackages/db/src/index.ts\nharness/server.mjs\n";
      }
      return "";
    },
  });
  await typecheckTouched({ cwd: "/var/lib/kit-pi/worktrees/KIT-99" });
  const pnpmCalls = calls.filter((call) => call[0] === "pnpm");
  assert.equal(pnpmCalls.length, 2);
  assert.equal(
    pnpmCalls.some((call) => call.includes("./apps/api") && call.includes("typecheck")),
    true,
  );
  assert.equal(
    pnpmCalls.some((call) => call.includes("./packages/db") && call.includes("typecheck")),
    true,
  );
  assert.equal(
    calls.some((call) => call.includes("test")),
    false,
  );
});

test("production createGhClient pushes the rebased head, waits through pending required checks, and ignores optional pending", async () => {
  const calls = [];
  let viewCount = 0;
  let requiredCount = 0;
  const gh = createGhClient({
    env: { GH_TOKEN: "ghp_secret_token" },
    async runCommand(command, args) {
      calls.push({ command, args });
      if (command === "gh" && args[0] === "pr" && args[1] === "view") {
        viewCount += 1;
        if (viewCount === 1) {
          throw new Error("no pull request");
        }
        const requiredPending = viewCount === 2;
        return JSON.stringify({
          url: "https://github.com/KitCollective/kit-collective/pull/52",
          mergeable: "MERGEABLE",
          statusCheckRollup: [
            {
              name: "test",
              conclusion: requiredPending ? "" : "SUCCESS",
              status: requiredPending ? "IN_PROGRESS" : "COMPLETED",
            },
            {
              name: "Cursor Bugbot",
              conclusion: "",
              status: "IN_PROGRESS",
            },
          ],
        });
      }
      if (command === "gh" && args[0] === "pr" && args[1] === "checks") {
        requiredCount += 1;
        return JSON.stringify([{ name: "test", state: requiredCount === 1 ? "pending" : "pass" }]);
      }
      if (command === "gh" && args[0] === "pr" && args[1] === "list") {
        return "[]";
      }
      if (command === "gh" && args[0] === "pr" && args[1] === "create") {
        return "https://github.com/KitCollective/kit-collective/pull/52\n";
      }
      return "";
    },
  });
  const linear = fakeLinear();
  const spawned = [];
  await implementRunner({
    gh,
    linear,
    spawned,
    typecheckTouched: async () => undefined,
    sleep: async () => undefined,
    waitIntervalMs: 0,
    waitTimeoutMs: 60_000,
  }).run({
    role: "implement",
    identifier: "KIT-99",
    issueId: "issue-1",
    adwFile: ".pi/adw/feature.yaml",
  });

  const rebaseIdx = calls.findIndex(
    (call) => call.command === "git" && call.args.includes("rebase"),
  );
  const pushAfterRebase = calls
    .slice(rebaseIdx)
    .find((call) => call.command === "git" && call.args.includes("push"));
  assert.ok(pushAfterRebase, "rebase must be followed by git push");
  assert.equal(
    pushAfterRebase.args.some((arg) => String(arg).includes("kit-99")),
    true,
  );
  const create = calls.find(
    (call) => call.command === "gh" && call.args[0] === "pr" && call.args[1] === "create",
  );
  assert.ok(create);
  assert.equal(create.args.includes("--head"), true);
  assert.equal(create.args.includes("kit-99"), true);
  assert.equal(create.args.includes("--base"), true);
  assert.equal(create.args.includes("development"), true);
  assert.equal(viewCount >= 3, true, "must poll viewPr until required checks are green");
  assert.equal(
    linear.calls.some((call) => call[0] === "setStatus" && call[1].status === IN_REVIEW),
    true,
  );
  assert.equal(
    calls.some((call) => call.command === "gh" && call.args.includes("merge")),
    false,
  );
});

test("production createGhClient does not move to In Review on MERGEABLE empty rollup when required checks are pending", async () => {
  const calls = [];
  const gh = createGhClient({
    env: { GH_TOKEN: "ghp_secret_token" },
    async runCommand(command, args) {
      calls.push({ command, args });
      if (command === "gh" && args[0] === "pr" && args[1] === "view") {
        return JSON.stringify({
          url: "https://github.com/KitCollective/kit-collective/pull/52",
          mergeable: "MERGEABLE",
          statusCheckRollup: [],
        });
      }
      if (command === "gh" && args[0] === "pr" && args[1] === "checks") {
        const err = new Error("checks pending");
        err.code = 8;
        throw err;
      }
      if (command === "gh" && args[0] === "pr" && args[1] === "list") {
        return "[]";
      }
      if (command === "gh" && args[0] === "pr" && args[1] === "create") {
        return "https://github.com/KitCollective/kit-collective/pull/52\n";
      }
      return "";
    },
  });
  const linear = fakeLinear();
  const spawned = [];
  const result = await implementRunner({
    gh,
    linear,
    spawned,
    typecheckTouched: async () => undefined,
    sleep: async () => undefined,
    waitIntervalMs: 0,
    waitTimeoutMs: 0,
  }).run({
    role: "implement",
    identifier: "KIT-99",
    issueId: "issue-1",
    adwFile: ".pi/adw/feature.yaml",
  });
  assert.equal(result.ciRetry, true);
  assert.equal(result.status, IMPLEMENTING);
  assert.equal(
    linear.calls.some((call) => call[0] === "setStatus"),
    false,
  );
  assert.equal(
    calls.some((call) => call.command === "gh" && call.args.includes("--required")),
    true,
  );
});

test("production gh client keeps GH_TOKEN in env, exposes merge that throws, and implement never calls it", async () => {
  const calls = [];
  const gh = createGhClient({
    env: { GH_TOKEN: "harness_git_auth_test_token" },
    async runCommand(command, args, options) {
      calls.push({ command, args, env: options.env });
      if (command === "gh" && args[0] === "pr" && args[1] === "view") {
        return JSON.stringify({
          url: "https://github.com/KitCollective/kit-collective/pull/52",
          mergeable: "MERGEABLE",
          statusCheckRollup: [{ conclusion: "SUCCESS", status: "COMPLETED" }],
        });
      }
      if (command === "gh" && args[0] === "pr" && args[1] === "create") {
        return "";
      }
      return "";
    },
  });
  assert.equal(typeof gh.merge, "function");
  assert.throws(() => gh.merge(), /implement never merges/);
  await gh.rebase({ cwd: "/tmp/KIT-99", onto: "origin/development", branch: "kit-99" });
  await gh.createPr({
    cwd: "/tmp/KIT-99",
    base: "development",
    head: "kit-99",
    title: "KIT-99: implement",
  });
  for (const call of calls) {
    assert.equal(call.args.join(" ").includes("harness_git_auth_test_token"), false);
    assert.equal(JSON.stringify(call.args).includes("Authorization"), false);
  }
  const gitCalls = calls.filter((call) => call.command === "git");
  assert.ok(gitCalls.length > 0);
  for (const call of gitCalls) {
    assert.equal(call.env.GIT_CONFIG_KEY_1, "http.extraHeader");
    assert.equal(call.env.GIT_CONFIG_VALUE_1, gitAuthExtraHeader("harness_git_auth_test_token"));
  }
  assert.equal(
    calls.some((call) => call.command === "gh" && call.args.includes("merge")),
    false,
  );
});

test("completeImplementAdw refuses to run full pnpm test on the worker", async () => {
  const gh = fakeGh();
  gh.viewPr = async () => ({
    url: "https://github.com/KitCollective/kit-collective/pull/52",
    mergeable: "MERGEABLE",
    checks: [{ conclusion: "success" }],
  });
  await assert.rejects(
    () =>
      completeImplementAdw({
        job: { identifier: "KIT-99", issueId: "issue-1", adwFile: ".pi/adw/feature.yaml" },
        checkout: { path: "/tmp/KIT-99", branch: "kit-99" },
        gh,
        linear: fakeLinear(),
        typecheckTouched: async () => undefined,
        runPnpmTest: async () => undefined,
        adwText: "steps:\n  - pr\n  - in-review\nnever:\n  - merge\n",
      }),
    /GitHub Actions/,
  );
});

test("implement job fails closed when OPENROUTER_API_KEY is missing and does not spawn Pi", async () => {
  const spawned = [];
  const env = validWorkerEnv();
  delete env.OPENROUTER_API_KEY;
  const runner = createPiJobRunner({
    env,
    workspace: ROOT,
    worktree: fakeWorktree(),
    gh: fakeGh(),
    linear: fakeLinear(),
    typecheckTouched: async () => undefined,
    spawnProcess(command, args, options) {
      spawned.push({ command, args, options });
      return Promise.resolve({ status: 0 });
    },
  });
  await assert.rejects(
    () =>
      runner.run({
        role: "implement",
        identifier: "KIT-99",
        issueId: "issue-1",
        adwFile: ".pi/adw/feature.yaml",
      }),
    /OPENROUTER_API_KEY/,
  );
  assert.equal(spawned.length, 0);
});

test("implement parent spawn stays Composer and is not Hy3", async () => {
  const spawned = [];
  await implementRunner({
    gh: fakeGh(),
    linear: fakeLinear(),
    spawned,
  }).run({
    role: "implement",
    identifier: "KIT-99",
    issueId: "issue-1",
    adwFile: ".pi/adw/feature.yaml",
  });
  const modelIdx = spawned[0].args.indexOf("--model");
  assert.equal(spawned[0].args[modelIdx + 1], "cursor/composer-2.5");
  assert.equal(
    spawned[0].args.some((arg) => String(arg).includes("tencent/hy3")),
    false,
  );
  assert.equal(spawned[0].options.env.OPENROUTER_API_KEY, "or_test");
  assert.equal(String(spawned[0].args.join(" ")).includes("or_test"), false);
});

test("implement spawn excludes memory-write tools and skill_manage", async () => {
  const spawned = [];
  await implementRunner({
    gh: fakeGh(),
    linear: fakeLinear(),
    spawned,
  }).run({
    role: "implement",
    identifier: "KIT-99",
    issueId: "issue-1",
    adwFile: ".pi/adw/feature.yaml",
  });
  const args = spawned[0].args;
  const excludeIdx = args.indexOf("--exclude-tools");
  assert.notEqual(excludeIdx, -1);
  const excluded = String(args[excludeIdx + 1]).split(",");
  for (const tool of IMPLEMENT_MEMORY_EXCLUDED_TOOLS) {
    assert.ok(excluded.includes(tool), `missing exclude ${tool}`);
  }
  assert.equal(spawned[0].options.env.KIT_PI_HERMES, WORKER_MEMORY_DIR);
});

test("Scout and Gate pin Hy3 no-think; helpers omit a model pin", () => {
  const scout = agentFrontmatter(".pi/agents/scout.md");
  const gate = agentFrontmatter(".pi/agents/gate.md");
  for (const agent of [scout, gate]) {
    assert.match(agent.frontmatter, /^model:\s+openrouter\/tencent\/hy3\s*$/m);
    assert.match(agent.frontmatter, /^thinking:\s+off\s*$/m);
    assert.doesNotMatch(agent.frontmatter, /cursor\/composer-2\.5/);
    assert.doesNotMatch(agent.frontmatter, /stealth|ox-alpha/i);
    assert.doesNotMatch(agent.frontmatter, /^fallbackModels:/m);
    assert.match(agent.text, /Exacto/);
    assert.match(agent.text, /not a hard fail|do not fail/i);
    assert.match(agent.text, /do not fall back to stealth\/ox-alpha/i);
    assert.doesNotMatch(agent.frontmatter, /memory_add|memory_replace|memory_remove|skill_manage/);
  }
  assert.match(scout.frontmatter, /^tools:\s+read,\s*grep,\s*find,\s*ls\s*$/m);
  assert.doesNotMatch(scout.frontmatter, /^tools:.*\b(edit|write|bash)\b/m);
  assert.doesNotMatch(gate.frontmatter, /^tools:.*\blinear/i);
  assert.match(gate.text, /rebase/i);
  assert.match(gate.text, /typecheck/i);
  assert.match(gate.text, /GitHub checks/i);
  assert.match(gate.text, /conflict/i);
  assert.match(gate.text, /never calls Linear/i);
  assert.match(gate.text, /never .*In Review/i);
  assert.match(gate.text, /this worktree's PR only|this worktree’s PR only/i);
  assert.match(gate.text, /Do not mention sibling/i);
  assert.doesNotMatch(gate.text, /KIT-99/);
  for (const relative of [
    ".pi/agents/nest.md",
    ".pi/agents/expo.md",
    ".pi/agents/drizzle.md",
    ".pi/agents/ui-ux.md",
  ]) {
    const helper = agentFrontmatter(relative);
    assert.doesNotMatch(helper.frontmatter, /^model:/m);
    assert.doesNotMatch(helper.text, /tencent\/hy3|stealth|ox-alpha/i);
  }
});

test("implement role requires Scout then helpers then Gate; parent owns In Review from a green Gate report", () => {
  const implement = readFileSync(join(ROOT, ".pi/roles/implement.md"), "utf8");
  assert.match(implement, /Scout/i);
  assert.match(implement, /Gate/);
  assert.match(implement, /### Validation/);
  assert.match(implement, /In Review/);
  assert.match(implement, /only when Gate is green|Gate is green/i);
  assert.match(implement, /Implementing/);
  assert.match(implement, /this job's identifier|this job’s identifier/i);
  assert.match(implement, /Do not mention sibling KIT issues/i);
  assert.match(implement, /this PR only/i);
  assert.doesNotMatch(implement, /^model:.*stealth|^fallbackModels:.*stealth/m);
  const checker = readFileSync(join(ROOT, ".pi/roles/factory-checker.md"), "utf8");
  const land = readFileSync(join(ROOT, ".pi/roles/land.md"), "utf8");
  const planner = readFileSync(join(ROOT, ".pi/roles/planner.md"), "utf8");
  for (const role of [checker, land, planner]) {
    assert.doesNotMatch(role, /tencent\/hy3/);
    assert.doesNotMatch(role, /^model:.*stealth|^fallbackModels:.*ox-alpha/m);
  }
});

test("evaluateWriteScopeExit skips when the issue has no write-scope line", () => {
  const result = evaluateWriteScopeExit("What to build\n\nNo scope.", [
    "apps/api/src/main.ts",
    "packages/db/schema.ts",
  ]);
  assert.equal(result.enforce, false);
  assert.deepEqual(result.violations, []);
});

test("evaluateWriteScopeExit names paths outside declared globs", () => {
  const description =
    "write-scope: harness/implement-exit.mjs, harness/tests/implement-adw.test.mjs";
  const result = evaluateWriteScopeExit(description, [
    "harness/implement-exit.mjs",
    "apps/api/src/main.ts",
  ]);
  assert.equal(result.enforce, true);
  assert.deepEqual(result.violations, ["apps/api/src/main.ts"]);
});

test("evaluateWriteScopeExit allows ratchet-exception paths outside globs", () => {
  const description = "write-scope: harness/implement-exit.mjs";
  const result = evaluateWriteScopeExit(description, [
    "harness/implement-exit.mjs",
    ".cursor/rules/write-scope.mdc",
    "scripts/check-pr-write-scope.mjs",
  ]);
  assert.equal(result.enforce, true);
  assert.deepEqual(result.violations, []);
});

test("formatWriteScopeViolationFeedback lists each out-of-glob path", () => {
  const lines = formatWriteScopeViolationFeedback(["apps/api/src/main.ts", "apps/web/page.astro"]);
  assert.match(lines.join("\n"), /Write-scope/);
  assert.match(lines.join("\n"), /apps\/api\/src\/main\.ts/);
  assert.match(lines.join("\n"), /apps\/web\/page\.astro/);
});

function fakeLinearWithIssue(description) {
  const linear = fakeLinear();
  linear.getIssue = async () => ({ description });
  return linear;
}

function completeImplementWithChangedFiles({ description, changedFiles, linear, gh }) {
  return completeImplementAdw({
    job: { identifier: "KIT-108", issueId: "issue-108", adwFile: ".pi/adw/feature.yaml" },
    checkout: { path: "/var/lib/kit-pi/worktrees/KIT-108", branch: "kit-108" },
    gh: gh ?? fakeGh(),
    linear: linear ?? fakeLinearWithIssue(description),
    typecheckTouched: async () => undefined,
    listChangedFiles: async () => changedFiles,
    adwText: readFileSync(join(ROOT, ".pi/adw/feature.yaml"), "utf8"),
    sleep: async () => undefined,
    waitIntervalMs: 0,
    waitTimeoutMs: 60_000,
  });
}

test("implement-exit with out-of-glob diffs stays Implementing and writes Review feedback paths", async () => {
  const description =
    "write-scope: harness/implement-exit.mjs, harness/tests/implement-adw.test.mjs";
  const linear = fakeLinearWithIssue(description);
  const result = await completeImplementWithChangedFiles({
    description,
    changedFiles: ["harness/implement-exit.mjs", "apps/mobile/App.tsx"],
    linear,
  });

  assert.equal(result.status, IMPLEMENTING);
  assert.equal(result.writeScopeRetry, true);
  assert.equal(
    linear.calls.some((call) => call[0] === "setStatus" && call[1].status === IN_REVIEW),
    false,
  );
  const workpad = linear.calls.find((call) => call[0] === "updateWorkpad")[1];
  assert.match(workpad.body, /### Review feedback/);
  assert.match(workpad.body, /apps\/mobile\/App\.tsx/);
  assert.doesNotMatch(workpad.body, /harness\/implement-exit\.mjs/);
});

test("implement-exit with only in-glob and ratchet-exception paths may move to In Review", async () => {
  const description =
    "write-scope: harness/implement-exit.mjs, harness/tests/implement-adw.test.mjs";
  const linear = fakeLinearWithIssue(description);
  const result = await completeImplementWithChangedFiles({
    description,
    changedFiles: [
      "harness/implement-exit.mjs",
      "harness/tests/implement-adw.test.mjs",
      ".cursor/rules/write-scope.mdc",
    ],
    linear,
  });

  assert.equal(result.status, IN_REVIEW);
  assert.equal(result.writeScopeRetry, false);
  assert.deepEqual(linear.calls.find((call) => call[0] === "setStatus")[1], {
    issueId: "issue-108",
    status: IN_REVIEW,
  });
});

test("implement-exit without write-scope does not fail on out-of-glob paths", async () => {
  const linear = fakeLinearWithIssue("What to build\n\nNo write-scope line.");
  const result = await completeImplementWithChangedFiles({
    description: "What to build\n\nNo write-scope line.",
    changedFiles: ["apps/api/src/main.ts", "packages/db/schema.ts"],
    linear,
  });

  assert.equal(result.status, IN_REVIEW);
  assert.equal(result.writeScopeRetry, false);
});

test("Compose persists kit-pi worktrees and copies implement-exit adapters", () => {
  const dockerfile = readFileSync(join(ROOT, "harness/Dockerfile"), "utf8");
  assert.match(dockerfile, /worktree\.mjs/);
  assert.match(dockerfile, /implement-exit\.mjs/);
  assert.match(dockerfile, /gh-cli\.mjs/);
  assert.match(dockerfile, /delegate-gate\.mjs/);
  assert.match(dockerfile, /worktree\.mjs/);
  assert.match(dockerfile, /corepack prepare pnpm@9\.15\.4/);
  const compose = readFileSync(join(ROOT, "harness/docker-compose.yml"), "utf8");
  assert.match(compose, /kit_pi:\/var\/lib\/kit-pi/);
});
