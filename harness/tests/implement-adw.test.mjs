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
import { createPiJobRunner } from "../pi-job.mjs";
import {
  createWorktreeAdapter,
  gitArgvContainsSecret,
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
  };
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
  const comments = [{ id: "c1", body: `${WORKPAD_HEADING}\n\n### Status\nImplementing\n` }];
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
      return Promise.resolve({ status: 0 });
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

  const result = await adapter.checkout({ identifier: "KIT-99" });

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

test("production git wrapper keeps GH_TOKEN in env, never argv", async () => {
  const env = { GH_TOKEN: "ghp_secret_token" };
  const child = remoteGitChildEnv(env);
  assert.equal(
    gitArgvContainsSecret(["clone", "--bare", "https://github.com/org/repo.git"], env),
    false,
  );
  assert.equal(child.GH_TOKEN, "ghp_secret_token");
  assert.equal(child.GIT_CONFIG_KEY_1, "http.extraHeader");
  assert.match(child.GIT_CONFIG_VALUE_1, /Bearer ghp_secret_token/);

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
    assert.equal(exec.args.join(" ").includes("ghp_secret_token"), false);
    assert.equal(JSON.stringify(exec.args).includes("Authorization"), false);
    assert.match(exec.env.GIT_CONFIG_VALUE_1, /Bearer ghp_secret_token/);
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
  assert.ok(gitCalls.some((args) => args.includes("fetch") && args.includes("kit-99")));
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

  assert.deepEqual(worktree.calls, [{ identifier: "KIT-99" }]);
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
  assert.equal(
    gh.calls.some((call) => call[0] === "merge"),
    false,
  );
  assert.equal(linear.calls.filter((call) => call[0] === "updateWorkpad").length, 1);
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

test("implement job fails closed when required checks are red and does not move to In Review", async () => {
  const gh = fakeGh({ mergeable: "MERGEABLE", checks: [{ conclusion: "failure" }] });
  const linear = fakeLinear();
  const spawned = [];
  await assert.rejects(
    () =>
      implementRunner({ gh, linear, spawned }).run({
        role: "implement",
        identifier: "KIT-99",
        issueId: "issue-1",
        adwFile: ".pi/adw/feature.yaml",
      }),
    /required GitHub checks/,
  );
  assert.equal(
    linear.calls.some((call) => call[0] === "setStatus"),
    false,
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
      if (command === "gh" && args[0] === "pr" && args[1] === "create") {
        return "https://github.com/KitCollective/kit-collective/pull/52\n";
      }
      return "";
    },
  });
  const linear = fakeLinear();
  const spawned = [];
  await assert.rejects(
    () =>
      implementRunner({
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
      }),
    /timed out waiting for required GitHub checks/,
  );
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
    env: { GH_TOKEN: "ghp_secret_token" },
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
    assert.equal(call.args.join(" ").includes("ghp_secret_token"), false);
    assert.equal(JSON.stringify(call.args).includes("Authorization"), false);
  }
  const gitCalls = calls.filter((call) => call.command === "git");
  assert.ok(gitCalls.length > 0);
  for (const call of gitCalls) {
    assert.match(call.env.GIT_CONFIG_VALUE_1, /Bearer ghp_secret_token/);
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

test("Compose persists kit-pi worktrees and copies implement-exit adapters", () => {
  const dockerfile = readFileSync(join(ROOT, "harness/Dockerfile"), "utf8");
  assert.match(dockerfile, /worktree\.mjs/);
  assert.match(dockerfile, /implement-exit\.mjs/);
  assert.match(dockerfile, /gh-cli\.mjs/);
  assert.match(dockerfile, /corepack prepare pnpm@9\.15\.4/);
  const compose = readFileSync(join(ROOT, "harness/docker-compose.yml"), "utf8");
  assert.match(compose, /kit_pi:\/var\/lib\/kit-pi/);
});
