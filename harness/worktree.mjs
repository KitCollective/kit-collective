/**
 * Git worktree adapter (KIT-54).
 *
 * Bare mirror + `/var/lib/kit-pi/worktrees/KIT-n` from `origin/development`.
 * One issue, one branch, one PR. Fake `runGit` at this seam.
 */
import { execFile as execFileCb } from "node:child_process";
import { existsSync as fsExistsSync, mkdirSync as fsMkdirSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

export const DEFAULT_MIRROR_DIR = "/var/lib/kit-pi/mirror.git";
export const DEFAULT_WORKTREES_DIR = "/var/lib/kit-pi/worktrees";
export const DEFAULT_REMOTE_URL = "https://github.com/KitCollective/kit-collective.git";
export const IMPLEMENT_LANE = "development";

const IDENTIFIER_PATTERN = /^[A-Za-z][A-Za-z0-9]*-\d+$/;

/**
 * Git child env: token stays in env (`GIT_CONFIG_*`), never in argv.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 */
export function remoteGitChildEnv(env = {}) {
  const child = { ...env };
  const configs = [["safe.directory", "*"]];
  const token = env.GH_TOKEN;
  if (typeof token === "string" && token.length > 0) {
    configs.push(["http.extraHeader", `Authorization: Bearer ${token}`]);
  }
  child.GIT_CONFIG_COUNT = String(configs.length);
  configs.forEach(([key, value], index) => {
    child[`GIT_CONFIG_KEY_${index}`] = key;
    child[`GIT_CONFIG_VALUE_${index}`] = value;
  });
  return child;
}

/**
 * @param {string[]} args
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 */
export function gitArgvContainsSecret(args, env) {
  const token = env.GH_TOKEN;
  if (typeof token !== "string" || token.length === 0) {
    return false;
  }
  return args.some((arg) => String(arg).includes(token));
}

/**
 * @param {string} identifier
 * @returns {string}
 */
export function worktreePath(identifier, worktreesDir = DEFAULT_WORKTREES_DIR) {
  assertIdentifier(identifier);
  return join(worktreesDir, identifier);
}

/**
 * @param {string} identifier
 * @returns {string}
 */
export function worktreeBranch(identifier) {
  assertIdentifier(identifier);
  return identifier.toLowerCase();
}

/**
 * @param {string} identifier
 */
function assertIdentifier(identifier) {
  if (typeof identifier !== "string" || !IDENTIFIER_PATTERN.test(identifier)) {
    throw new Error(`invalid issue identifier: ${identifier}`);
  }
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv | Record<string, string | undefined>,
 *   mirrorDir?: string,
 *   worktreesDir?: string,
 *   remoteUrl?: string,
 *   lane?: string,
 *   existsSync?: (path: string) => boolean,
 *   mkdirSync?: (path: string, options?: { recursive?: boolean }) => void,
 *   runGit?: (args: string[], options?: { env?: NodeJS.ProcessEnv }) => Promise<{ stdout?: string, status?: number | null }>,
 *   execFileImpl?: (command: string, args: string[], options: object) => Promise<{ stdout: string }>,
 * }} [deps]
 */
export function createWorktreeAdapter({
  env = process.env,
  mirrorDir = env.KIT_PI_MIRROR ?? DEFAULT_MIRROR_DIR,
  worktreesDir = env.KIT_PI_WORKTREES ?? DEFAULT_WORKTREES_DIR,
  remoteUrl = env.KIT_PI_REMOTE ?? DEFAULT_REMOTE_URL,
  lane = IMPLEMENT_LANE,
  existsSync = fsExistsSync,
  mkdirSync = fsMkdirSync,
  runGit,
  execFileImpl,
} = {}) {
  const execGit = execFileImpl ?? execFile;
  const git =
    runGit ??
    (async (args, options = {}) => {
      if (gitArgvContainsSecret(args, env)) {
        throw new Error("git argv must not contain GH_TOKEN");
      }
      const { stdout } = await execGit("git", args, {
        encoding: "utf8",
        timeout: 120_000,
        env: remoteGitChildEnv({ ...process.env, ...env, ...options.env }),
      });
      return { stdout, status: 0 };
    });

  return {
    /**
     * @param {{ identifier: string }} input
     * @returns {Promise<{ path: string, branch: string, lane: string }>}
     */
    async checkout({ identifier }) {
      assertIdentifier(identifier);
      const path = worktreePath(identifier, worktreesDir);
      const branch = worktreeBranch(identifier);
      mkdirSync(worktreesDir, { recursive: true });

      if (!existsSync(mirrorDir)) {
        await git(["clone", "--bare", remoteUrl, mirrorDir]);
      }
      await git(["--git-dir", mirrorDir, "fetch", "origin", lane]);

      if (!existsSync(path)) {
        await git([
          "--git-dir",
          mirrorDir,
          "worktree",
          "add",
          "-B",
          branch,
          path,
          `origin/${lane}`,
        ]);
      }

      return { path, branch, lane };
    },
  };
}
