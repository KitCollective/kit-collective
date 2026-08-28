/**
 * Serial Pi job runner and package boot check (KIT-53).
 * KIT-54: implement checks out a worktree, then runs a coding Pi session there.
 */
import { execFile as execFileCb, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { completeAutoMerge } from "./auto-merge.mjs";
import {
  DEFAULT_CAPACITY_POLL_MS,
  evaluateChromiumCapacity,
  floorsFromEnv,
  waitForCapacity,
} from "./capacity.mjs";
import { completeChecker, createCheckerGh } from "./checker-exit.mjs";
import { factoryCheckerPiArgs } from "./checker-spawn.mjs";
import { createDelegateGateConfig } from "./delegate-gate.mjs";
import { completeImplementAdw, createTypecheckTouched } from "./implement-exit.mjs";
import { runIntake } from "./intake.mjs";
import { completeLand, createLandGh } from "./land.mjs";
import { createLinearCliClient, WORKPAD_HEADING } from "./linear-cli.mjs";
import {
  createPiEventStreamConsumer,
  pipeReadableJsonLines,
  STREAMING_ROLES,
} from "./pi-event-stream.mjs";
import { runPlanner } from "./planner.mjs";
import { createWorktreeAdapter } from "./worktree.mjs";

const execFile = promisify(execFileCb);

export const REQUIRED_PI_PACKAGES = [
  "npm:pi-subagents",
  "npm:@ghoseb/pi-damage-control",
  "npm:pi-cursor-sdk",
  "npm:pi-hermes-memory",
];

/** Worker memory store on the kit_pi volume — outside Issue worktrees (KIT-111). */
export const WORKER_MEMORY_DIR = "/var/lib/kit-pi/hermes";

/** Relative to PI_WORKSPACE; holds committed hermes-memory-config.json. */
export const HERMES_AGENT_DIR_REL = ".pi/agent";

/** Implement parent and subagents are Memory readers — no writes or skill_manage (KIT-111). */
export const IMPLEMENT_MEMORY_EXCLUDED_TOOLS = [
  "memory_add",
  "memory_replace",
  "memory_remove",
  "skill_manage",
];

/** In-repo Pi package. Loaded via `--skill` on UI implement only — not `.pi/settings.json`. */
export const IMPLEMENT_BROWSER_PACKAGE = "kit-implement-browser";
export const IMPLEMENT_BROWSER_SKILL = "playwright-chromium";
export const IMPLEMENT_BROWSER_SKILL_PATH =
  ".pi/packages/implement-browser/skills/playwright-chromium";
export const UI_SURFACE_LABELS = ["mobile", "web", "admin"];
export const UI_WRITE_SCOPE_PREFIXES = ["apps/mobile", "apps/web", "apps/admin"];

const PERSONAL_BROWSER_PROFILE_MARKERS = [
  "Application Support/Google",
  "google-chrome",
  "Google/Chrome",
  "AppData/Local/Google/Chrome",
  "AppData\\Local\\Google\\Chrome",
];

const ROLE_FILES = {
  planner: ".pi/roles/planner.md",
  implement: ".pi/roles/implement.md",
  "factory-checker": ".pi/roles/factory-checker.md",
  land: ".pi/roles/land.md",
};

const FAST_ROLES = new Set(["planner", "factory-checker", "land"]);
const CAPACITY_GATED_ROLES = new Set(["implement", "factory-checker"]);

export const DEFAULT_JOB_IDLE_MS = 45 * 60 * 1000;
export const TIMEOUT_PARK_STATUS = "Parked";
export const TOKEN_USE_HEADING = "### Token use";
export const UNKNOWN_TOKEN_COUNT = "unknown";

const TOKEN_ROLE_MODELS = {
  implement: "Composer",
  "factory-checker": "Grok",
  scout: "Hy3",
  gate: "Hy3",
};

const TOKEN_ROLE_LABELS = {
  implement: "Implement",
  "factory-checker": "Factory-checker",
  scout: "Scout",
  gate: "Gate",
};

const TOKEN_SUBAGENT_ROLES = new Set(["scout", "gate"]);

/**
 * @param {string | undefined} description
 * @returns {string}
 */
export function parseWriteScopeLine(description = "") {
  const match = String(description).match(/^write-scope:\s*(.+)$/m);
  return match ? match[1] : "";
}

/**
 * UI slice: Surface label mobile/web/admin, or write-scope touching those apps.
 *
 * @param {{ labels?: string[], description?: string }} [slice]
 */
export function isUiImplementSlice({ labels = [], description = "" } = {}) {
  const names = Array.isArray(labels) ? labels : [];
  if (names.some((label) => UI_SURFACE_LABELS.includes(label))) {
    return true;
  }
  const scope = parseWriteScopeLine(description);
  return UI_WRITE_SCOPE_PREFIXES.some((prefix) => scope.includes(prefix));
}

/**
 * @param {unknown} userDataDir
 */
export function isPersonalBrowserProfile(userDataDir) {
  if (typeof userDataDir !== "string" || userDataDir.length === 0) {
    return false;
  }
  return PERSONAL_BROWSER_PROFILE_MARKERS.some((marker) => userDataDir.includes(marker));
}

export function workerChromiumLaunchOptions() {
  return {
    browser: "chromium",
    headless: true,
    channel: undefined,
    userDataDir: null,
  };
}

/**
 * Fake-able Chromium adapter. CI injects `launch`; production never uses Desktop Chrome.
 *
 * @param {{
 *   readCapacity?: () => Promise<{ ramFreeMb: number, diskFreeMb: number, ready?: boolean }>,
 *   floors?: { ramFloorMb: number, diskFloorMb: number },
 *   launch?: (input: object) => Promise<{ bytes?: Buffer, filename?: string }>,
 * }} [deps]
 */
export function createBrowserAdapter({ readCapacity, floors, launch } = {}) {
  return {
    /**
     * @param {{ url?: string, userDataDir?: string, channel?: string }} [input]
     */
    async captureScreenshot(input = {}) {
      if (input.channel === "chrome" || isPersonalBrowserProfile(input.userDataDir)) {
        return { ok: false, reason: "personal-profile" };
      }
      const raw =
        typeof readCapacity === "function" ? await readCapacity() : { ramFreeMb: 0, diskFreeMb: 0 };
      const capacity = evaluateChromiumCapacity({
        ramFreeMb: raw.ramFreeMb,
        diskFreeMb: raw.diskFreeMb,
        ...floorsFromEnv({}),
        ...floors,
      });
      if (!capacity.ready) {
        return { ok: false, reason: "capacity" };
      }
      if (typeof launch !== "function") {
        return { ok: false, reason: "no-adapter" };
      }
      const screenshot = await launch({
        ...workerChromiumLaunchOptions(),
        url: input.url,
      });
      return { ok: true, screenshot };
    },
  };
}

/**
 * @param {string | undefined} current
 * @param {{ title: string, url: string }} evidence
 */
export function linkWorkpadScreenshot(current, { title, url }) {
  const base =
    typeof current === "string" && current.includes(WORKPAD_HEADING)
      ? current.trimEnd()
      : WORKPAD_HEADING;
  const line = `- ${title}: ${url}`;
  if (base.includes(url)) {
    return `${base}\n`;
  }
  if (base.includes("### Evidence")) {
    if (base.includes("- (none)")) {
      return `${base.replace("### Evidence\n\n- (none)", `### Evidence\n\n${line}`)}\n`;
    }
    return `${base.replace("### Evidence", `### Evidence\n${line}`)}\n`;
  }
  return `${base}\n\n### Evidence\n\n${line}\n`;
}

/**
 * @param {{
 *   linear: {
 *     attachFile: (input: object) => Promise<{ url?: string, title?: string }>,
 *     listComments?: (issueId: string) => Promise<Array<{ id: string, body?: string }>>,
 *     updateWorkpad?: (input: object) => Promise<unknown>,
 *   },
 *   issueId: string,
 *   screenshot: { bytes?: Buffer, filename?: string },
 *   title: string,
 * }} input
 */
export async function attachWorkpadScreenshot({ linear, issueId, screenshot, title }) {
  if (!linear || typeof linear.attachFile !== "function") {
    throw new Error("screenshot evidence requires linear.attachFile");
  }
  const uploaded = await linear.attachFile({
    issueId,
    title,
    filename: screenshot?.filename,
    bytes: screenshot?.bytes,
  });
  const url = uploaded?.url;
  if (typeof url !== "string" || url.length === 0) {
    throw new Error("screenshot evidence upload missing url");
  }
  if (typeof linear.listComments === "function" && typeof linear.updateWorkpad === "function") {
    const comments = await linear.listComments(issueId);
    const existing = comments.find((comment) => comment.body?.includes(WORKPAD_HEADING));
    await linear.updateWorkpad({
      issueId,
      body: linkWorkpadScreenshot(existing?.body, { title, url }),
      commentId: existing?.id,
    });
  }
  return { url, title };
}

/**
 * @param {unknown} value
 * @returns {value is number}
 */
export function isTokenCount(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/**
 * Fail closed for numbers: non-numeric usage becomes unknown. Do not invent 0.
 *
 * @param {unknown} usage
 * @returns {{ input: number | "unknown", output: number | "unknown" }}
 */
export function readUsageCounts(usage) {
  if (usage === null || typeof usage !== "object") {
    return { input: UNKNOWN_TOKEN_COUNT, output: UNKNOWN_TOKEN_COUNT };
  }
  const record = /** @type {Record<string, unknown>} */ (usage);
  return {
    input: isTokenCount(record.input) ? record.input : UNKNOWN_TOKEN_COUNT,
    output: isTokenCount(record.output) ? record.output : UNKNOWN_TOKEN_COUNT,
  };
}

/**
 * @param {{ role: string, model: string, input: number | "unknown", output: number | "unknown" }} line
 */
export function formatTokenUseLine(line) {
  const label = TOKEN_ROLE_LABELS[line.role] ?? line.role;
  return `- ${label} (${line.model}): input ${line.input}, output ${line.output}`;
}

/**
 * Public token snapshot for the workpad and `/health`. Numbers or unknown only.
 *
 * @param {{
 *   role: string,
 *   identifier: string,
 *   lines: Array<{ role: string, model: string, input: number | "unknown", output: number | "unknown" }>,
 * }} input
 */
export function publicTokenSnapshot(input) {
  return {
    role: input.role,
    identifier: input.identifier,
    lines: input.lines.map((line) => ({
      role: line.role,
      model: line.model,
      input: isTokenCount(line.input) ? line.input : UNKNOWN_TOKEN_COUNT,
      output: isTokenCount(line.output) ? line.output : UNKNOWN_TOKEN_COUNT,
    })),
  };
}

/**
 * @param {string} jobRole
 * @param {{ parentUsage?: object | null, subagents?: Record<string, object> }} collected
 * @param {string} identifier
 */
export function tokenSnapshotFromCollected(jobRole, collected, identifier) {
  const parentModel = TOKEN_ROLE_MODELS[jobRole] ?? UNKNOWN_TOKEN_COUNT;
  const lines = [
    {
      role: jobRole,
      model: parentModel,
      ...readUsageCounts(collected?.parentUsage),
    },
  ];
  const subagents = collected?.subagents ?? {};
  for (const role of ["scout", "gate"]) {
    if (subagents[role] && typeof subagents[role] === "object") {
      lines.push({
        role,
        model: TOKEN_ROLE_MODELS[role],
        ...readUsageCounts(subagents[role]),
      });
    }
  }
  return publicTokenSnapshot({ role: jobRole, identifier, lines });
}

/**
 * Collect Pi JSON usage. Parent message_update.usage is cumulative.
 * Scout/Gate counts come from subagent tool results — not invented.
 */
export function createTokenUseCollector() {
  /** @type {object | null} */
  let parentUsage = null;
  /** @type {Record<string, object>} */
  const subagents = {};

  return {
    /**
     * @param {string} line
     */
    async consumeLine(line) {
      const trimmed = line.trim();
      if (trimmed.length === 0) {
        return;
      }
      let event;
      try {
        event = JSON.parse(trimmed);
      } catch {
        return;
      }
      if (event === null || typeof event !== "object") {
        return;
      }
      if (event.type === "message_update" && event.usage && typeof event.usage === "object") {
        parentUsage = event.usage;
      }
      if (event.type === "tool_execution_end") {
        const agent = event.result?.agent ?? event.args?.agent;
        const usage = event.result?.usage;
        if (TOKEN_SUBAGENT_ROLES.has(agent) && usage && typeof usage === "object") {
          subagents[agent] = usage;
        }
      }
    },
    snapshot() {
      return { parentUsage, subagents: { ...subagents } };
    },
  };
}

/**
 * @param {string | undefined} current
 * @param {{ lines: Array<{ role: string, model: string, input: number | "unknown", output: number | "unknown" }> }} tokens
 */
export function applyTokenUseWorkpad(current, tokens) {
  const base =
    typeof current === "string" && current.includes(WORKPAD_HEADING)
      ? current.trimEnd()
      : WORKPAD_HEADING;
  const lines = Array.isArray(tokens?.lines) ? tokens.lines : [];
  const content = `${lines.map((line) => formatTokenUseLine(line)).join("\n")}\n`;
  if (base.includes(TOKEN_USE_HEADING)) {
    return `${base.replace(/### Token use\n[\s\S]*?(?=\n### |\s*$)/, `${TOKEN_USE_HEADING}\n\n${content}`)}\n`;
  }
  if (base.includes("### Review feedback")) {
    return `${base.replace("### Review feedback", `${TOKEN_USE_HEADING}\n\n${content}\n### Review feedback`)}\n`;
  }
  return `${base}\n\n${TOKEN_USE_HEADING}\n\n${content}\n`;
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @returns {number}
 */
export function jobIdleMs(env = {}) {
  const raw = env.PI_JOB_IDLE_MS;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  if (typeof raw === "string" && raw.length > 0) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return DEFAULT_JOB_IDLE_MS;
}

/**
 * @param {string} body
 * @param {string} line
 */
function replaceReviewFeedback(body, line) {
  if (body.includes("### Review feedback")) {
    return body.replace(
      /### Review feedback\n[\s\S]*?(?=\n### |\s*$)/,
      `### Review feedback\n\n${line}\n`,
    );
  }
  return `${body}\n\n### Review feedback\n\n${line}\n`;
}

/**
 * @param {string | undefined} current
 * @param {{ role: string, identifier: string, idleMs: number }} input
 */
export function applyIdleTimeoutWorkpad(current, { role, identifier, idleMs }) {
  const base =
    typeof current === "string" && current.includes(WORKPAD_HEADING)
      ? current.trimEnd()
      : WORKPAD_HEADING;
  const minutes = idleMs / 60_000;
  const line = `- Idle timeout: ${role} ${identifier} had no close and no stdout for ${minutes} minutes (PI_JOB_IDLE_MS).`;
  return `${replaceReviewFeedback(base, line)}\n`;
}

/**
 * Kill the Pi child process group. Prefer the negative pid so grandchildren die too.
 *
 * @param {{ pid?: number, kill?: (signal?: string) => void }} spawned
 * @param {string} [signal]
 */
export function killProcessGroupDefault(spawned, signal = "SIGTERM") {
  const pid = spawned?.pid;
  if (typeof pid === "number") {
    try {
      process.kill(-pid, signal);
      return;
    } catch {
      // Not a process-group leader, or already gone.
    }
  }
  if (typeof spawned?.kill === "function") {
    spawned.kill(signal);
  }
}

/**
 * @param {string} role
 * @param {string} identifier
 * @param {string | undefined} adwFile
 */
export function implementPrompt(role, identifier, adwFile) {
  if (role === "implement") {
    const adw = typeof adwFile === "string" ? ` ADW ${adwFile}.` : "";
    return `Factory role implement for ${identifier}.${adw} Update the existing workpad. Open a PR into development. Do not move Linear to In Review — the harness does that after required GitHub checks are green and MERGEABLE. Never merge. Never spawn factory-checker.`;
  }
  if (role === "factory-checker") {
    return `Factory role factory-checker for ${identifier}. Run /code-review (Standards + Spec). Update the existing workpad via the linear_cli host tool only — replace ### Review feedback with the complete finding set (- (none) on pass). Never merge. Never move Linear status — the harness applies pass/fail after you exit.`;
  }
  return typeof adwFile === "string"
    ? `Factory role ${role} for ${identifier}. ADW ${adwFile}.`
    : `Factory role ${role} for ${identifier}.`;
}

/**
 * @param {string | undefined} fromFile
 */
export function resolvePiWorkspace(env = process.env, fromFile = import.meta.url) {
  if (typeof env.PI_WORKSPACE === "string" && env.PI_WORKSPACE.length > 0) {
    return env.PI_WORKSPACE;
  }
  return join(dirname(fileURLToPath(fromFile)), "..");
}

/**
 * @param {{
 *   root: string,
 *   listPackages?: () => Promise<string>,
 * }} input
 */
export async function assertPiPackagesReady({ root, listPackages } = {}) {
  const settingsPath = join(root, ".pi/settings.json");
  let settings;
  try {
    settings = JSON.parse(readFileSync(settingsPath, "utf8"));
  } catch {
    throw new Error(`missing Pi package manifest at ${settingsPath}`);
  }
  const listed = Array.isArray(settings.packages) ? settings.packages : [];
  const missingManifest = REQUIRED_PI_PACKAGES.filter((spec) => !listed.includes(spec));
  if (missingManifest.length > 0) {
    throw new Error(`missing Pi packages in .pi/settings.json: ${missingManifest.join(", ")}`);
  }

  const list =
    listPackages ??
    (async () => {
      const { stdout } = await execFile("pi", ["list"], {
        encoding: "utf8",
        timeout: 30_000,
        cwd: root,
      });
      return stdout;
    });
  const installed = await list();
  const missingInstalled = REQUIRED_PI_PACKAGES.filter((spec) => {
    const name = spec.replace(/^npm:/, "");
    return !installed.includes(name);
  });
  if (missingInstalled.length > 0) {
    throw new Error(`Pi packages not installed: ${missingInstalled.join(", ")}`);
  }
  return true;
}

/**
 * @param {string} role
 * @param {string} workspace
 * @param {string} roleFile
 * @param {string} model
 * @param {string} prompt
 * @param {{ browserSkill?: string }} [options]
 * @returns {string[]}
 */
export function piArgsForRole(role, workspace, roleFile, model, prompt, options = {}) {
  if (role === "factory-checker") {
    const args = factoryCheckerPiArgs({ workspace, roleFile, model, prompt });
    if (STREAMING_ROLES.has(role)) {
      const anchor = args.indexOf("-a");
      if (anchor >= 0) {
        return [...args.slice(0, anchor + 1), "--mode", "json", ...args.slice(anchor + 1)];
      }
    }
    return args;
  }
  const skillArgs =
    typeof options.browserSkill === "string" && options.browserSkill.length > 0
      ? ["--skill", options.browserSkill]
      : [];
  const memoryReaderArgs =
    role === "implement"
      ? ["--exclude-tools", IMPLEMENT_MEMORY_EXCLUDED_TOOLS.join(",")]
      : [];
  return [
    "-p",
    "-a",
    ...(STREAMING_ROLES.has(role) ? ["--mode", "json"] : []),
    "--model",
    model,
    ...skillArgs,
    ...memoryReaderArgs,
    "--append-system-prompt",
    join(workspace, roleFile),
    "--",
    prompt,
  ];
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv | Record<string, string | undefined>,
 *   workspace?: string,
 *   worktree?: { checkout: (input: { identifier: string }) => Promise<{ path: string, branch: string, lane: string }> },
 *   gh?: object,
 *   landGh?: object,
 *   checkerGh?: object,
 *   linear?: object,
 *   typecheckTouched?: (input: { cwd: string }) => Promise<unknown>,
 *   spawnProcess?: (command: string, args: string[], options: object) => Promise<{ status?: number | null, stdout?: import("node:stream").Readable, closePromise?: Promise<{ status: number | null }> }>,
 *   runCommand?: (command: string, args: string[], options: object) => Promise<string>,
 *   session?: { emitStream?: Function },
 *   now?: () => number,
 *   sleep?: (ms: number) => Promise<unknown>,
 *   capacitySleep?: (ms: number) => Promise<unknown>,
 *   readCapacity?: () => Promise<{ ramFreeMb: number, diskFreeMb: number, ready?: boolean }>,
 *   waitTimeoutMs?: number,
 *   waitIntervalMs?: number,
 *   killProcessGroup?: (spawned: object, signal?: string) => void | Promise<void>,
 * }} [deps]
 */
export function createPiJobRunner({
  env = process.env,
  workspace = resolvePiWorkspace(env),
  worktree,
  gh,
  landGh,
  checkerGh,
  linear,
  typecheckTouched,
  spawnProcess,
  runCommand,
  session,
  now,
  sleep,
  capacitySleep,
  readCapacity,
  waitTimeoutMs,
  waitIntervalMs,
  killProcessGroup,
} = {}) {
  const trees =
    worktree ??
    createWorktreeAdapter({
      env,
      findOpenIssuePr:
        typeof gh?.findOpenIssuePr === "function"
          ? (identifier) => gh.findOpenIssuePr({ identifier })
          : undefined,
    });
  const killGroup = killProcessGroup ?? killProcessGroupDefault;
  const spawnJob =
    spawnProcess ??
    ((command, args, options) =>
      new Promise((resolve, reject) => {
        const child = spawn(command, args, { ...options, detached: true });
        child.on("error", reject);
        resolve({
          pid: child.pid,
          stdout: child.stdout,
          kill(signal) {
            killProcessGroupDefault({ pid: child.pid, kill: (sig) => child.kill(sig) }, signal);
          },
          closePromise: new Promise((res, rej) => {
            child.on("error", rej);
            child.on("close", (status) => res({ status }));
          }),
        });
      }));

  /**
   * @param {{ role: string, identifier?: string, issueId?: string, adwFile?: string }} job
   * @param {string} cwd
   * @param {string} model
   * @param {string} roleFile
   * @param {string} prompt
   * @param {NodeJS.ProcessEnv} spawnEnv
   * @param {{ browserSkill?: string }} [piOptions]
   */
  async function runPiJob(job, cwd, model, roleFile, prompt, spawnEnv, piOptions = {}) {
    const args = piArgsForRole(job.role, workspace, roleFile, model, prompt, piOptions);
    const streamIssueId = typeof job.issueId === "string" ? job.issueId : undefined;
    const collectStdout = STREAMING_ROLES.has(job.role);
    const shouldStream =
      collectStdout &&
      typeof session?.emitStream === "function" &&
      typeof streamIssueId === "string";
    const stdio = collectStdout ? ["inherit", "pipe", "inherit"] : "inherit";
    const spawned = await spawnJob("pi", args, { cwd, env: spawnEnv, stdio });
    const waitClose =
      spawned.closePromise ??
      spawned.closed ??
      Promise.resolve({ status: typeof spawned.status === "number" ? spawned.status : 0 });
    const liveChild =
      spawned.closePromise != null || spawned.closed != null || typeof spawned.pid === "number";
    const clock = now ?? Date.now;
    const snooze = sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    const idleMs = jobIdleMs(env);
    const pollMs = 1000;
    let lastStdoutAt = clock();
    if (spawned.stdout && typeof spawned.stdout.on === "function") {
      spawned.stdout.on("data", () => {
        lastStdoutAt = clock();
      });
    }
    const tokenCollector = createTokenUseCollector();
    let streamDone = Promise.resolve();
    if (collectStdout && spawned.stdout) {
      const streamConsumer = shouldStream
        ? createPiEventStreamConsumer({ session, issueId: streamIssueId, now })
        : null;
      streamDone = pipeReadableJsonLines(spawned.stdout, {
        async consumeLine(line) {
          await tokenCollector.consumeLine(line);
          if (streamConsumer) {
            await streamConsumer.consumeLine(line);
          }
        },
        async finish() {
          if (streamConsumer) {
            await streamConsumer.finish();
          }
        },
      });
    }
    if (!liveChild) {
      const [{ status }] = await Promise.all([waitClose, streamDone]);
      return { status, stdout: spawned.stdout, tokenUse: tokenCollector.snapshot() };
    }

    let timedOut = false;
    let finished = false;
    const closed = waitClose.then((closeResult) => {
      finished = true;
      return closeResult;
    });
    const idleWatch = (async () => {
      while (!finished) {
        const elapsed = clock() - lastStdoutAt;
        if (elapsed >= idleMs) {
          timedOut = true;
          finished = true;
          await killGroup(spawned);
          return;
        }
        const remaining = idleMs - elapsed;
        await snooze(Math.max(1, Math.min(pollMs, remaining)));
      }
    })();
    await Promise.race([closed, idleWatch]);
    if (timedOut) {
      return {
        status: null,
        idleTimeout: true,
        stdout: spawned.stdout,
        tokenUse: tokenCollector.snapshot(),
      };
    }
    await streamDone;
    const closeResult = await closed;
    return {
      status: closeResult.status,
      stdout: spawned.stdout,
      tokenUse: tokenCollector.snapshot(),
    };
  }

  /**
   * @param {{ role: string, identifier?: string, issueId?: string }} job
   * @param {string} identifier
   * @param {number} idleMs
   */
  async function timeoutPark(job, identifier, idleMs) {
    const linearClient = linear ?? job.linear ?? createLinearCliClient({ env, runCommand });
    const issueId = job.issueId ?? identifier;
    const comments =
      typeof linearClient.listComments === "function"
        ? await linearClient.listComments(issueId)
        : [];
    const existing = comments.find((comment) => comment.body?.includes(WORKPAD_HEADING));
    const body = applyIdleTimeoutWorkpad(existing?.body, {
      role: job.role,
      identifier,
      idleMs,
    });
    if (typeof linearClient.updateWorkpad === "function") {
      await linearClient.updateWorkpad({
        issueId,
        body,
        commentId: existing?.id,
      });
    }
    if (typeof linearClient.setStatus === "function") {
      await linearClient.setStatus({ issueId, status: TIMEOUT_PARK_STATUS });
    }
    if (typeof trees.reap === "function") {
      await trees.reap({ identifier });
    }
    return { ...job, idleTimeout: true, nextStatus: TIMEOUT_PARK_STATUS };
  }

  /**
   * Fold token lines into whatever workpad write the exit path already makes.
   *
   * @param {object | undefined} linearClient
   * @param {{ lines: object[] } | null} tokens
   */
  function withTokenUse(linearClient, tokens) {
    if (!linearClient || typeof linearClient.updateWorkpad !== "function" || !tokens) {
      return linearClient;
    }
    return {
      ...linearClient,
      async updateWorkpad(input) {
        return linearClient.updateWorkpad({
          ...input,
          body: applyTokenUseWorkpad(input.body, tokens),
        });
      },
    };
  }

  /**
   * Write ### Token use onto the existing workpad. Fail open if Linear is missing.
   *
   * @param {{ role: string, identifier?: string, issueId?: string }} job
   * @param {string} identifier
   * @param {{ parentUsage?: object | null, subagents?: Record<string, object> } | undefined} collected
   */
  async function recordTokenUse(job, identifier, collected) {
    if (job.role !== "implement" && job.role !== "factory-checker") {
      return null;
    }
    const tokens = tokenSnapshotFromCollected(job.role, collected ?? {}, identifier);
    const linearClient = linear ?? job.linear;
    if (
      !linearClient ||
      typeof linearClient.listComments !== "function" ||
      typeof linearClient.updateWorkpad !== "function"
    ) {
      return tokens;
    }
    const issueId = job.issueId ?? identifier;
    const comments = await linearClient.listComments(issueId);
    const existing = comments.find((comment) => comment.body?.includes(WORKPAD_HEADING));
    const body = applyTokenUseWorkpad(existing?.body, tokens);
    await linearClient.updateWorkpad({
      issueId,
      body,
      commentId: existing?.id,
    });
    return tokens;
  }

  return {
    /**
     * @param {{ role: string, identifier?: string, issueId?: string, adwFile?: string }} job
     */
    async run(job) {
      const identifier = job.identifier ?? job.issueId ?? "unknown";
      if (job.role === "planner") {
        const client = linear ?? createLinearCliClient({ env, runCommand });
        return runPlanner({ env, linear: client });
      }
      if (job.role === "intake") {
        const client = linear ?? createLinearCliClient({ env, runCommand });
        return runIntake({ env, linear: client });
      }
      if (CAPACITY_GATED_ROLES.has(job.role) && typeof readCapacity === "function") {
        const client =
          linear ??
          (typeof runCommand === "function" ? createLinearCliClient({ env, runCommand }) : linear);
        await waitForCapacity({
          readCapacity,
          floors: floorsFromEnv(env),
          linear: client,
          issueId: typeof job.issueId === "string" ? job.issueId : undefined,
          identifier,
          sleep: capacitySleep ?? sleep,
          pollMs: Number(env.PI_CAPACITY_POLL_MS ?? DEFAULT_CAPACITY_POLL_MS),
        });
      }
      if (job.role === "auto-merge") {
        const linearClient = linear ?? createLinearCliClient({ env, runCommand });
        const mergeGh = landGh ?? createLandGh({ env, runCommand });
        return completeAutoMerge({
          job: {
            issueId: job.issueId ?? identifier,
            identifier,
          },
          linear: linearClient,
          gh: mergeGh,
          delegateGateConfig: createDelegateGateConfig(env),
          env,
        });
      }
      if (job.role === "land") {
        const linearClient = linear ?? createLinearCliClient({ env, runCommand });
        const mergeGh = landGh ?? createLandGh({ env, runCommand });
        return completeLand({
          job: {
            issueId: job.issueId ?? identifier,
            identifier,
          },
          linear: linearClient,
          gh: mergeGh,
          worktree: trees,
        });
      }
      const roleFile = ROLE_FILES[job.role];
      if (typeof roleFile !== "string") {
        throw new Error(`no Pi role file for ${job.role}`);
      }
      const model = FAST_ROLES.has(job.role) ? env.PI_MODEL_FAST : env.PI_MODEL;
      if (typeof model !== "string" || model.length === 0) {
        throw new Error(`missing Pi model env for role ${job.role}`);
      }
      if (job.role === "implement") {
        const openRouterKey = env.OPENROUTER_API_KEY;
        if (typeof openRouterKey !== "string" || openRouterKey.length === 0) {
          throw new Error("missing OPENROUTER_API_KEY");
        }
        for (const relative of [".pi/agents/scout.md", ".pi/agents/gate.md"]) {
          try {
            readFileSync(join(workspace, relative), "utf8");
          } catch {
            throw new Error(`implement requires ${relative}`);
          }
        }
      }
      let cwd = workspace;
      let checkout;
      if (job.role === "implement" || job.role === "factory-checker") {
        checkout = await trees.checkout({
          identifier,
          mode: job.role === "implement" ? "implement" : "reuse",
        });
        cwd = checkout.path;
      }
      const prompt = implementPrompt(job.role, identifier, job.adwFile);
      const hermesDir =
        typeof env.KIT_PI_HERMES === "string" && env.KIT_PI_HERMES.length > 0
          ? env.KIT_PI_HERMES
          : WORKER_MEMORY_DIR;
      const agentDir =
        typeof env.PI_CODING_AGENT_DIR === "string" && env.PI_CODING_AGENT_DIR.length > 0
          ? env.PI_CODING_AGENT_DIR
          : join(workspace, HERMES_AGENT_DIR_REL);
      const spawnEnv = {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        ...env,
        LINEAR_API_KEY: env.LINEAR_CLI_API_KEY,
        KIT_PI_HERMES: hermesDir,
        PI_CODING_AGENT_DIR: agentDir,
      };
      delete spawnEnv.DATABASE_URL;
      if (job.role === "factory-checker") {
        spawnEnv.LINEAR_ISSUE_ID = job.issueId ?? identifier;
      }
      let browserSkill;
      if (job.role === "implement") {
        const linearClient = linear ?? job.linear;
        const issue =
          typeof linearClient?.getIssue === "function"
            ? await linearClient.getIssue(job.issueId ?? identifier)
            : null;
        const slice = {
          labels: issue?.labels ?? job.labels ?? [],
          description: issue?.description ?? job.description ?? "",
        };
        if (isUiImplementSlice(slice) && typeof readCapacity === "function") {
          const raw = await readCapacity();
          const chromium = evaluateChromiumCapacity({
            ramFreeMb: raw.ramFreeMb,
            diskFreeMb: raw.diskFreeMb,
            ...floorsFromEnv(env),
          });
          if (chromium.ready) {
            browserSkill = join(workspace, IMPLEMENT_BROWSER_SKILL_PATH);
          }
        }
      }
      const result = await runPiJob(job, cwd, model, roleFile, prompt, spawnEnv, {
        browserSkill,
      });
      if (result.idleTimeout) {
        return timeoutPark(job, identifier, jobIdleMs(env));
      }
      if (result.status !== 0) {
        throw new Error(`pi exited ${result.status} for ${identifier}`);
      }
      if (job.role === "implement") {
        const adwFile = job.adwFile;
        if (typeof adwFile !== "string") {
          throw new Error("implement requires an ADW file");
        }
        const ghClient = gh ?? job.gh;
        const linearClient = linear ?? job.linear;
        if (!ghClient || !linearClient) {
          throw new Error("implement requires gh and Linear adapters");
        }
        const tokens = tokenSnapshotFromCollected(job.role, result.tokenUse ?? {}, identifier);
        const exit = await completeImplementAdw({
          job: { ...job, identifier, issueId: job.issueId ?? identifier },
          checkout,
          gh: ghClient,
          linear: withTokenUse(linearClient, tokens),
          typecheckTouched: typecheckTouched ?? createTypecheckTouched(),
          adwText: readFileSync(join(workspace, adwFile), "utf8"),
          now,
          sleep,
          waitTimeoutMs,
          waitIntervalMs,
        });
        return { ...job, ...exit, tokens };
      }
      if (job.role === "factory-checker") {
        const tokens = tokenSnapshotFromCollected(job.role, result.tokenUse ?? {}, identifier);
        const linearClient = linear ?? createLinearCliClient({ env, runCommand });
        const checkerGhClient = checkerGh ?? createCheckerGh({ env, runCommand });
        await completeChecker({
          job: { ...job, identifier, issueId: job.issueId ?? identifier },
          linear: withTokenUse(linearClient, tokens),
          gh: checkerGhClient,
          now,
          sleep,
          waitTimeoutMs,
          waitIntervalMs,
        });
        await recordTokenUse(job, identifier, result.tokenUse);
        return { ...job, tokens };
      }
      return job;
    },
  };
}
