/**
 * Serial Pi job runner and package boot check (KIT-53).
 * KIT-54 still owns “ADW opens a PR”; this module starts one Pi session per job.
 */
import { execFile as execFileCb, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createLinearCliClient } from "./linear-cli.mjs";
import { runPlanner } from "./planner.mjs";

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
 * @param {{
 *   env?: NodeJS.ProcessEnv | Record<string, string | undefined>,
 *   workspace?: string,
 *   spawnProcess?: (command: string, args: string[], options: object) => Promise<{ status: number | null }>,
 * }} [deps]
 */
export function createPiJobRunner({
  env = process.env,
  workspace = resolvePiWorkspace(env),
  spawnProcess,
  runCommand,
  linear,
} = {}) {
  const spawnJob =
    spawnProcess ??
    ((command, args, options) =>
      new Promise((resolve, reject) => {
        const child = spawn(command, args, { ...options, stdio: "inherit" });
        child.on("error", reject);
        child.on("close", (status) => resolve({ status }));
      }));

  return {
    /**
     * @param {{ role: string, identifier?: string, issueId?: string, adwFile?: string }} job
     */
    async run(job) {
      if (job.role === "planner") {
        const client = linear ?? createLinearCliClient({ env, runCommand });
        return runPlanner({ env, linear: client });
      }
      const roleFile = ROLE_FILES[job.role];
      if (typeof roleFile !== "string") {
        throw new Error(`no Pi role file for ${job.role}`);
      }
      const model = FAST_ROLES.has(job.role) ? env.PI_MODEL_FAST : env.PI_MODEL;
      if (typeof model !== "string" || model.length === 0) {
        throw new Error(`missing Pi model env for role ${job.role}`);
      }
      const identifier = job.identifier ?? job.issueId ?? "unknown";
      const prompt = job.adwFile
        ? `Factory role ${job.role} for ${identifier}. ADW ${job.adwFile}.`
        : `Factory role ${job.role} for ${identifier}.`;
      const spawnEnv = {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        ...env,
        LINEAR_API_KEY: env.LINEAR_CLI_API_KEY,
      };
      delete spawnEnv.DATABASE_URL;
      const result = await spawnJob(
        "pi",
        [
          "-p",
          "-a",
          "--model",
          model,
          "--append-system-prompt",
          join(workspace, roleFile),
          "--",
          prompt,
        ],
        { cwd: workspace, env: spawnEnv },
      );
      if (result.status !== 0) {
        throw new Error(`pi exited ${result.status} for ${identifier}`);
      }
      return job;
    },
  };
}
