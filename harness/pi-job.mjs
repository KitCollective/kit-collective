/**
 * Serial Pi job runner and package boot check (KIT-53).
 * KIT-54: implement checks out a worktree, then runs a coding Pi session there.
 */
import { execFile as execFileCb, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { completeChecker, createCheckerGh } from "./checker-exit.mjs";
import { factoryCheckerPiArgs } from "./checker-spawn.mjs";
import { completeImplementAdw, createTypecheckTouched } from "./implement-exit.mjs";
import { completeLand, createLandGh } from "./land.mjs";
import { createLinearCliClient } from "./linear-cli.mjs";
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
];

const ROLE_FILES = {
  planner: ".pi/roles/planner.md",
  implement: ".pi/roles/implement.md",
  "factory-checker": ".pi/roles/factory-checker.md",
  land: ".pi/roles/land.md",
};

const FAST_ROLES = new Set(["planner", "factory-checker", "land"]);

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
 * @returns {string[]}
 */
export function piArgsForRole(role, workspace, roleFile, model, prompt) {
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
  return [
    "-p",
    "-a",
    ...(STREAMING_ROLES.has(role) ? ["--mode", "json"] : []),
    "--model",
    model,
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
 *   waitTimeoutMs?: number,
 *   waitIntervalMs?: number,
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
  waitTimeoutMs,
  waitIntervalMs,
} = {}) {
  const trees = worktree ?? createWorktreeAdapter({ env });
  const spawnJob =
    spawnProcess ??
    ((command, args, options) =>
      new Promise((resolve, reject) => {
        const child = spawn(command, args, options);
        child.on("error", reject);
        resolve({
          stdout: child.stdout,
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
   */
  async function runPiJob(job, cwd, model, roleFile, prompt, spawnEnv) {
    const args = piArgsForRole(job.role, workspace, roleFile, model, prompt);
    const streamIssueId = typeof job.issueId === "string" ? job.issueId : undefined;
    const shouldStream =
      STREAMING_ROLES.has(job.role) &&
      typeof session?.emitStream === "function" &&
      typeof streamIssueId === "string";
    const stdio = shouldStream ? ["inherit", "pipe", "inherit"] : "inherit";
    const spawned = await spawnJob("pi", args, { cwd, env: spawnEnv, stdio });
    const waitClose =
      spawned.closePromise ??
      spawned.closed ??
      Promise.resolve({ status: typeof spawned.status === "number" ? spawned.status : 0 });
    let streamDone = Promise.resolve();
    if (shouldStream && spawned.stdout) {
      const consumer = createPiEventStreamConsumer({ session, issueId: streamIssueId, now });
      streamDone = pipeReadableJsonLines(spawned.stdout, consumer);
    }
    const [{ status }] = await Promise.all([waitClose, streamDone]);
    return { status, stdout: spawned.stdout };
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
      let cwd = workspace;
      let checkout;
      if (job.role === "implement" || job.role === "factory-checker") {
        checkout = await trees.checkout({ identifier });
        cwd = checkout.path;
      }
      const prompt = implementPrompt(job.role, identifier, job.adwFile);
      const spawnEnv = {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        ...env,
        LINEAR_API_KEY: env.LINEAR_CLI_API_KEY,
      };
      delete spawnEnv.DATABASE_URL;
      if (job.role === "factory-checker") {
        spawnEnv.LINEAR_ISSUE_ID = job.issueId ?? identifier;
      }
      const result = await runPiJob(job, cwd, model, roleFile, prompt, spawnEnv);
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
        const exit = await completeImplementAdw({
          job: { ...job, identifier, issueId: job.issueId ?? identifier },
          checkout,
          gh: ghClient,
          linear: linearClient,
          typecheckTouched: typecheckTouched ?? createTypecheckTouched(),
          adwText: readFileSync(join(workspace, adwFile), "utf8"),
          now,
          sleep,
          waitTimeoutMs,
          waitIntervalMs,
        });
        return { ...job, ...exit };
      }
      if (job.role === "factory-checker") {
        const linearClient = linear ?? createLinearCliClient({ env, runCommand });
        const checkerGhClient = checkerGh ?? createCheckerGh({ env, runCommand });
        await completeChecker({
          job: { ...job, identifier, issueId: job.issueId ?? identifier },
          linear: linearClient,
          gh: checkerGhClient,
          now,
          sleep,
          waitTimeoutMs,
          waitIntervalMs,
        });
      }
      return job;
    },
  };
}
