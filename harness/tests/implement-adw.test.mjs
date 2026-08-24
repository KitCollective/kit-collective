import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { LINEAR_CLI_PIN } from "../boot-env.mjs";
import { createPiJobRunner } from "../pi-job.mjs";
import { createWorktreeAdapter, worktreeBranch, worktreePath } from "../worktree.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function validWorkerEnv() {
  return {
    CURSOR_API_KEY: "cursor_test",
    LINEAR_CLI_API_KEY: "lin_cli_test",
    LINEAR_WEBHOOK_SECRET: "secret",
    GH_TOKEN: "ghp_test",
    LINEAR_CLI_VERSION: LINEAR_CLI_PIN.version,
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
      return { stdout: "", status: 0 };
    },
  });

  const result = await adapter.checkout({ identifier: "KIT-99" });

  assert.equal(result.path, "/var/lib/kit-pi/worktrees/KIT-99");
  assert.equal(result.branch, "kit-99");
  assert.equal(result.lane, "development");
  assert.equal(worktreePath("KIT-99"), "/var/lib/kit-pi/worktrees/KIT-99");
  assert.equal(worktreeBranch("KIT-99"), "kit-99");
  assert.ok(
    gitCalls.some((args) => args.includes("clone") && args.includes("--bare")),
    "first checkout clones a bare mirror",
  );
  assert.ok(
    gitCalls.some(
      (args) => args.includes("fetch") && args.includes("origin") && args.includes("development"),
    ),
    "checkout fetches origin/development",
  );
  assert.ok(
    gitCalls.some(
      (args) =>
        args.includes("worktree") &&
        args.includes("add") &&
        args.includes("/var/lib/kit-pi/worktrees/KIT-99") &&
        args.includes("origin/development"),
    ),
    "checkout adds one worktree from origin/development",
  );
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
});

test("implement job checks out a worktree then runs a full coding Pi session there", async () => {
  const worktree = fakeWorktree();
  const spawned = [];
  const gh = {
    calls: [],
    merge(args) {
      this.calls.push(["merge", args]);
      return { ok: true };
    },
  };
  const runner = createPiJobRunner({
    env: validWorkerEnv(),
    workspace: ROOT,
    worktree,
    gh,
    spawnProcess(command, args, options) {
      spawned.push({ command, args, options });
      return Promise.resolve({ status: 0 });
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
  assert.equal(spawned[0].command, "pi");
  assert.equal(spawned[0].options.cwd, "/var/lib/kit-pi/worktrees/KIT-99");
  assert.ok(spawned[0].args.includes("-p"));
  assert.ok(spawned[0].args.includes("cursor/composer-2.5"));
  assert.ok(spawned[0].args.some((arg) => String(arg).endsWith(".pi/roles/implement.md")));
  assert.equal(spawned[0].args.includes(".pi/roles/factory-checker.md"), false);
  const prompt = spawned[0].args.at(-1);
  assert.match(prompt, /ADW \.pi\/adw\/feature\.yaml/);
  assert.match(prompt, /In Review/);
  assert.match(prompt, /Never merge/i);
  assert.equal(gh.calls.length, 0);
});

test("planner job does not check out a worktree and does not merge", async () => {
  const worktree = fakeWorktree();
  const spawned = [];
  const gh = {
    calls: [],
    merge() {
      this.calls.push(["merge"]);
    },
  };
  const runner = createPiJobRunner({
    env: validWorkerEnv(),
    workspace: ROOT,
    worktree,
    gh,
    spawnProcess(command, args, options) {
      spawned.push({ command, args, options });
      return Promise.resolve({ status: 0 });
    },
  });

  await runner.run({ role: "planner", identifier: "KIT-99" });

  assert.equal(worktree.calls.length, 0);
  assert.equal(spawned[0].options.cwd, ROOT);
  assert.equal(gh.calls.length, 0);
});

test("Feature Bug and Improvement ADWs open a PR, move to In Review, and never merge", () => {
  for (const name of ["feature", "bug", "improvement"]) {
    const adw = readFileSync(join(ROOT, `.pi/adw/${name}.yaml`), "utf8");
    assert.match(adw, /^ {2}- pr$/m);
    assert.match(adw, /^ {2}- in-review$/m);
    assert.match(adw, /In Review/);
    assert.match(adw, /workpad/i);
    assert.match(adw, /^ {2}- merge$/m);
    assert.match(adw, /factory-checker-subagent/);
    assert.match(adw, /github-actions/);
  }
});

test("Compose persists kit-pi worktrees and the image copies the worktree adapter", () => {
  const dockerfile = readFileSync(join(ROOT, "harness/Dockerfile"), "utf8");
  assert.match(dockerfile, /worktree\.mjs/);
  const compose = readFileSync(join(ROOT, "harness/docker-compose.yml"), "utf8");
  assert.match(compose, /kit_pi:\/var\/lib\/kit-pi/);
  assert.match(compose, /KIT_PI_WORKTREES:\s*"\/var\/lib\/kit-pi\/worktrees"/);
  assert.match(compose, /KIT_PI_MIRROR:\s*"\/var\/lib\/kit-pi\/mirror\.git"/);
});

test("implement role is a full coding session that updates the workpad and never spawns factory-checker", () => {
  const role = readFileSync(join(ROOT, ".pi/roles/implement.md"), "utf8");
  for (const tool of ["read", "edit", "write", "bash", "git", "gh", "Linear CLI"]) {
    assert.match(role, new RegExp(tool));
  }
  assert.match(role, /scout/);
  assert.match(role, /nest/);
  assert.match(role, /expo/i);
  assert.match(role, /drizzle/i);
  assert.match(role, /ui-ux/);
  assert.match(role, /\.cursor\/skills\/expo/);
  assert.match(role, /\.cursor\/skills\/tdd/);
  assert.match(role, /existing workpad/i);
  assert.match(role, /instead of posting a new comment per tool/i);
  assert.match(role, /rebase/i);
  assert.match(role, /typecheck/i);
  assert.match(role, /required GitHub checks/i);
  assert.match(role, /GitHub Actions/);
  assert.match(role, /Never merge/i);
  assert.match(role, /In Review/);
  assert.match(role, /not a child/i);
  assert.match(role, /factory checker/i);

  const agentNames = readdirSync(join(ROOT, ".pi/agents"));
  assert.equal(agentNames.includes("factory-checker.md"), false);
  assert.deepEqual([...agentNames].sort(), [
    "drizzle.md",
    "expo.md",
    "nest.md",
    "scout.md",
    "ui-ux.md",
  ]);
  assert.equal(existsSync(join(ROOT, ".pi/roles/factory-checker.md")), true);
});
