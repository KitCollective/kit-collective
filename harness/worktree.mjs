/**
 * Git worktree adapter (KIT-54).
 *
 * Bare mirror + `/var/lib/kit-pi/worktrees/KIT-n`. Implement creates the issue
 * branch from `origin/development`. Checker reuses that tree (or `origin/kit-n`
 * once the PR is on the remote). One issue, one branch, one PR. Fake `runGit`.
 */
import { execFile as execFileCb } from "node:child_process";
import { existsSync as fsExistsSync, mkdirSync as fsMkdirSync, rmSync as fsRmSync } from "node:fs";
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
 * @param {string} token
 */
export function gitAuthExtraHeader(token) {
  const basic = Buffer.from(`x-access-token:${token}`).toString("base64");
  return `Authorization: Basic ${basic}`;
}

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
    configs.push(["http.extraHeader", gitAuthExtraHeader(token)]);
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
 * @param {(args: string[]) => Promise<unknown>} git
 * @param {string} dir
 * @param {string} branch
 * @param {{ worktree?: boolean }} [opts]
 */
async function fetchIssueBranch(git, dir, branch, opts = {}) {
  const prefix = opts.worktree ? ["-C", dir] : ["--git-dir", dir];
  try {
    await git([...prefix, "fetch", "origin", branch]);
  } catch {
    return false;
  }
  const verify = opts.worktree ? `origin/${branch}` : `refs/remotes/origin/${branch}`;
  try {
    await git([...prefix, "rev-parse", "--verify", verify]);
    return true;
  } catch {
    return false;
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
 *   rmSync?: (path: string, options?: { recursive?: boolean, force?: boolean }) => void,
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
  rmSync = fsRmSync,
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
      const hasIssueBranch = await fetchIssueBranch(git, mirrorDir, branch);

      if (!existsSync(path)) {
        const startPoint = hasIssueBranch ? `origin/${branch}` : `origin/${lane}`;
        await git(["--git-dir", mirrorDir, "worktree", "add", "-B", branch, path, startPoint]);
        return { path, branch, lane };
      }

      await git(["-C", path, "checkout", branch]);
      if (hasIssueBranch) {
        await fetchIssueBranch(git, path, branch, { worktree: true });
        try {
          await git(["-C", path, "merge", "--ff-only", `origin/${branch}`]);
        } catch {
          // Local implement commits stay; diverged remote is a later signal-up.
        }
      }

      return { path, branch, lane };
    },

    /**
     * Remove the Issue worktree. The bare mirror stays.
     * Triggers: Timeout park, land Done, webhook Canceled/Done. Not a human Park.
     *
     * @param {{ identifier: string }} input
     * @returns {Promise<{ reaped: boolean, path: string, mirror: string }>}
     */
    async reap({ identifier }) {
      assertIdentifier(identifier);
      const path = worktreePath(identifier, worktreesDir);
      if (!existsSync(path)) {
        return { reaped: false, path, mirror: mirrorDir };
      }
      try {
        await git(["--git-dir", mirrorDir, "worktree", "remove", "--force", path]);
      } catch {
        // Directory delete below still runs when git worktree remove fails.
      }
      if (existsSync(path)) {
        rmSync(path, { recursive: true, force: true });
      }
      return { reaped: true, path, mirror: mirrorDir };
    },
  };
}
