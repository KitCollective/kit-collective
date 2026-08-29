/**
 * KIT-91 — Implement UI slices load a headless Chromium Pi package, attach
 * screenshots under workpad Evidence, and skip browser tools elsewhere.
 * Fake the browser adapter. CI never opens Chromium. Do not spawn a model.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { LINEAR_CLI_PIN } from "../boot-env.mjs";
import {
  CHROMIUM_RAM_MB,
  DEFAULT_DISK_FLOOR_MB,
  DEFAULT_RAM_FLOOR_MB,
  evaluateChromiumCapacity,
  floorsFromEnv,
} from "../capacity.mjs";
import { WORKPAD_HEADING } from "../linear-cli.mjs";
import {
  attachWorkpadScreenshot,
  createBrowserAdapter,
  createPiJobRunner,
  IMPLEMENT_BROWSER_PACKAGE,
  IMPLEMENT_BROWSER_SKILL,
  IMPLEMENT_BROWSER_SKILL_PATH,
  isPersonalBrowserProfile,
  isUiImplementSlice,
  linkWorkpadScreenshot,
  piArgsForRole,
  workerChromiumLaunchOptions,
} from "../pi-job.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SKILL_ABS = join(ROOT, IMPLEMENT_BROWSER_SKILL_PATH);

function validWorkerEnv() {
  return {
    CURSOR_API_KEY: "cursor_test",
    LINEAR_CLI_API_KEY: "lin_cli_test",
    LINEAR_WEBHOOK_SECRET: "secret",
    GH_TOKEN: "ghp_test",
    LINEAR_PI_APP_USER_ID: "pi-app-user-1",
    PI_MODEL: "cursor/composer-2.5",
    PI_MODEL_FAST: "cursor/grok-4.6",
    OPENROUTER_API_KEY: "or_test",
    LINEAR_CLI_VERSION: LINEAR_CLI_PIN.version,
  };
}

function fakeWorktree() {
  return {
    async checkout() {
      return { path: "/var/lib/kit-pi/worktrees/KIT-91", branch: "kit-91", lane: "development" };
    },
  };
}

function fakeGh() {
  return {
    async rebase() {},
    async viewPr() {
      return {
        url: "https://github.com/KitCollective/kit-collective/pull/91",
        mergeable: "MERGEABLE",
        checks: [{ conclusion: "success" }],
      };
    },
    async createPr() {
      return {
        url: "https://github.com/KitCollective/kit-collective/pull/91",
        mergeable: "MERGEABLE",
        checks: [{ conclusion: "success" }],
      };
    },
    merge() {
      throw new Error("implement never merges");
    },
  };
}

function workpadLinear({ labels = [], description = "" } = {}) {
  const comments = [
    {
      id: "c1",
      body: `${WORKPAD_HEADING}\n\n### Evidence\n\n- (none)\n`,
    },
  ];
  const attachments = [];
  return {
    comments,
    attachments,
    async getIssue() {
      return { labels, description, identifier: "KIT-91", status: "Implementing" };
    },
    async listComments() {
      return comments;
    },
    async updateWorkpad(input) {
      comments[0].body = input.body;
      return { id: comments[0].id, created: false };
    },
    async setStatus() {},
    async attachFile(input) {
      const url = `https://uploads.linear.app/${input.title}`;
      attachments.push({ ...input, url });
      return { url, title: input.title };
    },
  };
}

function spawnRunner({ linear, spawned, readCapacity }) {
  return createPiJobRunner({
    env: validWorkerEnv(),
    workspace: ROOT,
    worktree: fakeWorktree(),
    gh: fakeGh(),
    linear,
    typecheckTouched: async () => undefined,
    readCapacity,
    spawnProcess(command, args, options) {
      spawned.push({ command, args, options });
      return Promise.resolve({ status: 0 });
    },
  });
}

function browserArgs(args) {
  return args.some(
    (arg) =>
      String(arg).includes("playwright") ||
      String(arg).includes("chromium") ||
      String(arg) === IMPLEMENT_BROWSER_SKILL ||
      String(arg).includes(IMPLEMENT_BROWSER_SKILL_PATH) ||
      String(arg).includes(IMPLEMENT_BROWSER_PACKAGE),
  );
}

test("mobile, web, and admin surfaces are UI slices; api/db write-scope is not", () => {
  assert.equal(isUiImplementSlice({ labels: ["mobile", "Feature"] }), true);
  assert.equal(isUiImplementSlice({ labels: ["web"] }), true);
  assert.equal(isUiImplementSlice({ labels: ["admin"] }), true);
  assert.equal(
    isUiImplementSlice({
      labels: ["api", "Feature"],
      description: "write-scope: apps/mobile/**, apps/api/**",
    }),
    true,
  );
  assert.equal(
    isUiImplementSlice({
      labels: ["api"],
      description: "write-scope: apps/api/**, packages/db/**",
    }),
    false,
  );
  assert.equal(isUiImplementSlice({ labels: ["api"] }), false);
  assert.equal(isUiImplementSlice({}), false);
});

test("UI implement spawn loads the in-repo Playwright Chromium Pi package and not Desktop Chrome", async () => {
  const spawned = [];
  const linear = workpadLinear({ labels: ["mobile", "Feature"] });
  await spawnRunner({
    linear,
    spawned,
    readCapacity: async () => ({ ramFreeMb: 4096, diskFreeMb: 10_240, ready: true }),
  }).run({
    role: "implement",
    identifier: "KIT-91",
    issueId: "issue-91",
    adwFile: ".pi/adw/feature.yaml",
  });

  assert.equal(spawned.length, 1);
  assert.equal(spawned[0].command, "pi");
  assert.equal(browserArgs(spawned[0].args), true);
  assert.equal(spawned[0].args.includes("--skill"), true);
  const skill = spawned[0].args[spawned[0].args.indexOf("--skill") + 1];
  assert.equal(skill, SKILL_ABS);
  assert.equal(
    spawned[0].args.some(
      (arg) => String(arg) === "chrome" || String(arg).includes("google-chrome"),
    ),
    false,
  );

  const manifest = JSON.parse(
    readFileSync(join(ROOT, ".pi/packages/implement-browser/package.json"), "utf8"),
  );
  assert.equal(manifest.name, IMPLEMENT_BROWSER_PACKAGE);
  assert.equal(manifest.keywords.includes("pi-package"), true);
  const skillText = readFileSync(join(ROOT, IMPLEMENT_BROWSER_SKILL_PATH, "SKILL.md"), "utf8");
  assert.match(skillText, /headless/i);
  assert.match(skillText, /chromium/i);
  assert.match(skillText, /never attach to a personal Chrome profile/i);
  assert.match(skillText, /not Desktop Chrome/i);
});

test("api-labelled implement loads browser tools when getIssue write-scope includes apps/mobile and job has no description", async () => {
  const spawned = [];
  const linear = workpadLinear({
    labels: ["api", "Feature"],
    description: "write-scope: apps/mobile/**, apps/api/**",
  });
  await spawnRunner({
    linear,
    spawned,
    readCapacity: async () => ({ ramFreeMb: 4096, diskFreeMb: 10_240, ready: true }),
  }).run({
    role: "implement",
    identifier: "KIT-97",
    issueId: "issue-97",
    adwFile: ".pi/adw/feature.yaml",
  });

  assert.equal(spawned.length, 1);
  assert.equal(browserArgs(spawned[0].args), true);
  assert.equal(spawned[0].args.includes("--skill"), true);
});

test("api/db-only implement omits browser tools so they do not sit in Composer context", async () => {
  const spawned = [];
  await spawnRunner({
    linear: workpadLinear({
      labels: ["api", "Feature"],
      description: "write-scope: apps/api/**, packages/db/**",
    }),
    spawned,
    readCapacity: async () => ({ ramFreeMb: 4096, diskFreeMb: 10_240, ready: true }),
  }).run({
    role: "implement",
    identifier: "KIT-91",
    issueId: "issue-91",
    adwFile: ".pi/adw/feature.yaml",
  });

  assert.equal(spawned.length, 1);
  assert.equal(browserArgs(spawned[0].args), false);
  const skillPaths = spawned[0].args.filter((_arg, index, all) => all[index - 1] === "--skill");
  assert.equal(
    skillPaths.some((path) => String(path).includes("playwright")),
    false,
  );
  assert.ok(skillPaths.some((path) => String(path).includes("tdd/SKILL.md")));
});

test("project settings do not load the browser package for every Pi role", () => {
  const settings = JSON.parse(readFileSync(join(ROOT, ".pi/settings.json"), "utf8"));
  assert.equal(
    settings.packages.some(
      (spec) => String(spec).includes("playwright") || String(spec).includes("implement-browser"),
    ),
    false,
  );
});

test("planner and Intake have no browser tools and do not spawn Pi", async () => {
  const spawned = [];
  const runner = createPiJobRunner({
    env: validWorkerEnv(),
    workspace: ROOT,
    linear: {
      async listDispatch() {
        return {
          implementingState: { id: "s-imp", name: "Implementing" },
          implementingIssues: [],
          issues: [],
        };
      },
      async lookupUser() {
        return { id: "pi-app-user-1", name: "Pi" };
      },
      async listTriage() {
        return {
          teamId: "team-1",
          backlogState: { id: "s-back", name: "Backlog" },
          duplicateState: { id: "s-dup", name: "Duplicate" },
          labels: { "ready-for-agent": "label-rfa" },
          issues: [],
        };
      },
    },
    spawnProcess(command, args) {
      spawned.push({ command, args });
      return Promise.resolve({ status: 0 });
    },
  });

  await runner.run({ role: "planner", identifier: "KIT-1" });
  await runner.run({ role: "intake", identifier: "KIT-80" });

  assert.equal(spawned.length, 0);
  const planner = readFileSync(join(ROOT, ".pi/roles/planner.md"), "utf8");
  assert.match(planner, /No browser tools/i);
  assert.match(planner, /No file tools/i);
  const implement = readFileSync(join(ROOT, ".pi/roles/implement.md"), "utf8");
  assert.match(implement, /Playwright Chromium/i);
  const factoryChecker = piArgsForRole(
    "factory-checker",
    ROOT,
    ".pi/roles/factory-checker.md",
    "cursor/grok-4.6",
    "review",
  );
  assert.equal(browserArgs(factoryChecker), false);
});

test("Chromium spawn is refused when capacity is below the Chromium floor", async () => {
  const floors = floorsFromEnv({});
  assert.equal(CHROMIUM_RAM_MB, 512);
  const tight = evaluateChromiumCapacity({
    ramFreeMb: DEFAULT_RAM_FLOOR_MB,
    diskFreeMb: DEFAULT_DISK_FLOOR_MB + 100,
    ...floors,
  });
  assert.equal(tight.ready, false);

  const plenty = evaluateChromiumCapacity({
    ramFreeMb: 4096,
    diskFreeMb: 10_240,
    ...floors,
  });
  assert.equal(plenty.ready, true);

  const launches = [];
  const adapter = createBrowserAdapter({
    readCapacity: async () => ({
      ramFreeMb: DEFAULT_RAM_FLOOR_MB,
      diskFreeMb: DEFAULT_DISK_FLOOR_MB + 100,
    }),
    floors,
    async launch(input) {
      launches.push(input);
      return { bytes: Buffer.from("png"), filename: "page.png" };
    },
  });
  const refused = await adapter.captureScreenshot({ url: "http://127.0.0.1:3000" });
  assert.deepEqual(refused, { ok: false, reason: "capacity" });
  assert.equal(launches.length, 0);
});

test("UI implement omits browser tools when Chromium capacity is not ready", async () => {
  const spawned = [];
  await spawnRunner({
    linear: workpadLinear({ labels: ["web"] }),
    spawned,
    readCapacity: async () => ({
      ramFreeMb: DEFAULT_RAM_FLOOR_MB,
      diskFreeMb: 10_240,
      ready: true,
    }),
  }).run({
    role: "implement",
    identifier: "KIT-91",
    issueId: "issue-91",
    adwFile: ".pi/adw/feature.yaml",
  });

  assert.equal(spawned.length, 1);
  assert.equal(browserArgs(spawned[0].args), false);
});

test("the worker never attaches to a personal browser profile or Desktop Chrome", async () => {
  const options = workerChromiumLaunchOptions();
  assert.equal(options.browser, "chromium");
  assert.equal(options.headless, true);
  assert.equal(options.channel, undefined);
  assert.equal(options.userDataDir, null);

  assert.equal(
    isPersonalBrowserProfile("/Users/nicklas/Library/Application Support/Google/Chrome"),
    true,
  );
  assert.equal(isPersonalBrowserProfile("/home/nicklas/.config/google-chrome"), true);
  assert.equal(isPersonalBrowserProfile(null), false);

  const launches = [];
  const adapter = createBrowserAdapter({
    readCapacity: async () => ({ ramFreeMb: 4096, diskFreeMb: 10_240 }),
    floors: floorsFromEnv({}),
    async launch(input) {
      launches.push(input);
      return { bytes: Buffer.from("png"), filename: "page.png" };
    },
  });
  const personal = await adapter.captureScreenshot({
    url: "http://127.0.0.1:3000",
    userDataDir: "/Users/nicklas/Library/Application Support/Google/Chrome",
  });
  assert.deepEqual(personal, { ok: false, reason: "personal-profile" });
  const chromeChannel = await adapter.captureScreenshot({
    url: "http://127.0.0.1:3000",
    channel: "chrome",
  });
  assert.deepEqual(chromeChannel, { ok: false, reason: "personal-profile" });
  assert.equal(launches.length, 0);

  const ok = await adapter.captureScreenshot({ url: "http://127.0.0.1:3000" });
  assert.equal(ok.ok, true);
  assert.equal(launches[0].browser, "chromium");
  assert.equal(launches[0].headless, true);
  assert.equal(launches[0].userDataDir, null);
});

test("a screenshot from the fake adapter is uploaded and linked under workpad Evidence", async () => {
  const linear = workpadLinear({ labels: ["admin"] });
  const adapter = createBrowserAdapter({
    readCapacity: async () => ({ ramFreeMb: 4096, diskFreeMb: 10_240 }),
    floors: floorsFromEnv({}),
    async launch() {
      return { bytes: Buffer.from("fake-png"), filename: "kit-91-ui.png" };
    },
  });
  const captured = await adapter.captureScreenshot({ url: "http://127.0.0.1:4173" });
  assert.equal(captured.ok, true);

  const attached = await attachWorkpadScreenshot({
    linear,
    issueId: "issue-91",
    screenshot: captured.screenshot,
    title: "KIT-91 UI evidence",
  });
  assert.equal(attached.url, "https://uploads.linear.app/KIT-91 UI evidence");
  assert.equal(linear.attachments.length, 1);
  assert.match(linear.comments[0].body, /### Evidence/);
  assert.match(linear.comments[0].body, /KIT-91 UI evidence/);
  assert.match(linear.comments[0].body, /uploads\.linear\.app/);

  const linked = linkWorkpadScreenshot(`${WORKPAD_HEADING}\n\n### Evidence\n\n- (none)\n`, {
    title: "KIT-91 UI evidence",
    url: attached.url,
  });
  assert.match(linked, /- KIT-91 UI evidence: https:\/\/uploads\.linear\.app\/KIT-91 UI evidence/);
});
