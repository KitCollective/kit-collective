/**
 * `gh` adapter for implement ADW exit. Implement never merges.
 * Fake `runCommand` at this seam.
 */
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { gitArgvContainsSecret, remoteGitChildEnv } from "./worktree.mjs";

const execFile = promisify(execFileCb);

export const DEFAULT_GH_REPO = "KitCollective/kit-collective";

/**
 * Open PRs whose title starts with the issue id. KIT-47 does not match KIT-470.
 *
 * @param {Array<{ title?: string }> | undefined} rows
 * @param {string} identifier
 * @returns {Array<{ title?: string, headRefName?: string, url?: string, number?: number }>}
 */
export function selectOpenIssuePrs(rows, identifier) {
  if (!Array.isArray(rows) || typeof identifier !== "string" || identifier.length === 0) {
    return [];
  }
  const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const prefix = new RegExp(`^${escaped}(?:[:\\s]|$)`);
  return rows.filter((row) => typeof row?.title === "string" && prefix.test(row.title));
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 */
function repoFromEnv(env = {}) {
  const remote = env.KIT_PI_REMOTE;
  const match = typeof remote === "string" ? remote.match(/github\.com[:/]([^/]+\/[^/.]+)/) : null;
  return match ? match[1] : DEFAULT_GH_REPO;
}

/**
 * @param {string | undefined} state
 */
function stateToCheck(state) {
  switch (state) {
    case "pass":
      return { conclusion: "success", status: "COMPLETED" };
    case "pending":
      return { conclusion: "", status: "PENDING" };
    case "fail":
      return { conclusion: "failure", status: "COMPLETED" };
    case "skipping":
    case "skip":
      return { conclusion: "skipped", status: "COMPLETED" };
    default:
      return { conclusion: "", status: typeof state === "string" ? state : "" };
  }
}

/**
 * @param {Array<{ name?: string, conclusion?: string, status?: string }> | undefined} rollup
 * @param {Array<{ name?: string, state?: string }> | null} requiredRows
 */
export function mapStatusChecks(rollup, requiredRows) {
  const list = Array.isArray(rollup) ? rollup : [];
  const requiredList = Array.isArray(requiredRows)
    ? requiredRows
    : [{ name: "required", state: "pending" }];
  const requiredNames = new Set(
    requiredList
      .map((row) => row?.name)
      .filter((name) => typeof name === "string" && name.length > 0),
  );
  const byName = new Map();
  for (const check of list) {
    const name = check?.name;
    if (typeof name !== "string") {
      continue;
    }
    byName.set(name, {
      name,
      conclusion: check.conclusion,
      status: check.status,
      isRequired: requiredNames.size > 0 ? requiredNames.has(name) : false,
    });
  }
  for (const row of requiredList) {
    const name = row?.name;
    if (typeof name !== "string") {
      continue;
    }
    const fromState = stateToCheck(row.state);
    const existing = byName.get(name);
    if (existing) {
      existing.isRequired = true;
      if (!existing.conclusion) {
        existing.conclusion = fromState.conclusion;
        existing.status = fromState.status;
      }
    } else {
      byName.set(name, { name, isRequired: true, ...fromState });
    }
  }
  return [...byName.values()];
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv | Record<string, string | undefined>,
 *   runCommand?: (command: string, args: string[], options: { cwd?: string, env?: NodeJS.ProcessEnv }) => Promise<string>,
 * }} [deps]
 */
export function createGhClient({ env = process.env, runCommand } = {}) {
  const invoke =
    runCommand ??
    (async (command, args, options) => {
      const { stdout } = await execFile(command, args, {
        encoding: "utf8",
        timeout: 120_000,
        cwd: options.cwd,
        env: options.env,
      });
      return stdout;
    });

  /**
   * @param {string} command
   * @param {string[]} args
   * @param {{ cwd?: string, env?: NodeJS.ProcessEnv }} [options]
   */
  async function run(command, args, options = {}) {
    const childEnv = remoteGitChildEnv({ ...process.env, ...env, ...options.env });
    if (gitArgvContainsSecret(args, childEnv)) {
      throw new Error("git argv must not contain GH_TOKEN");
    }
    return invoke(command, args, { ...options, env: childEnv });
  }

  /**
   * @param {string} cwd
   * @returns {Promise<Array<{ name?: string, state?: string }>>}
   */
  async function loadRequiredChecks(cwd) {
    const pending = [{ name: "required", state: "pending" }];
    try {
      const stdout = await run("gh", ["pr", "checks", "--required", "--json", "name,state"], {
        cwd,
        env,
      });
      const parsed = JSON.parse(stdout);
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : pending;
    } catch (err) {
      const stdout = typeof err?.stdout === "string" ? err.stdout : "";
      if (stdout.trim().length > 0) {
        try {
          const parsed = JSON.parse(stdout);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        } catch {
          return pending;
        }
      }
      return pending;
    }
  }

  return {
    /**
     * @param {{ cwd: string, onto: string, branch?: string }} input
     */
    async rebase({ cwd, onto, branch }) {
      await run("git", ["fetch", "origin", "development:refs/remotes/origin/development"], {
        cwd,
        env,
      });
      try {
        await run("git", ["rebase", onto], { cwd, env });
      } catch (error) {
        try {
          await run("git", ["rebase", "--abort"], { cwd, env });
        } catch {
          // already aborted or not in a rebase
        }
        throw error;
      }
      if (typeof branch === "string" && branch.length > 0) {
        await run(
          "git",
          ["push", "--force-with-lease", "-u", "origin", `HEAD:refs/heads/${branch}`],
          {
            cwd,
            env,
          },
        );
      }
    },

    /**
     * Land the worktree on origin/<branch> so write-scope sees the PR, not a leftover rebase.
     *
     * @param {{ cwd: string, branch: string }} input
     */
    async syncToRemoteBranch({ cwd, branch }) {
      if (typeof branch !== "string" || branch.length === 0) {
        throw new Error("syncToRemoteBranch requires branch");
      }
      await run("git", ["fetch", "origin", `${branch}:refs/remotes/origin/${branch}`], {
        cwd,
        env,
      });
      await run("git", ["reset", "--hard", `origin/${branch}`], { cwd, env });
    },

    /**
     * Exactly one open development PR for the identifier, or null.
     * Two matches fail closed — do not guess which PR to extend.
     *
     * @param {{ identifier: string }} input
     */
    async findOpenIssuePr({ identifier }) {
      if (typeof identifier !== "string" || identifier.length === 0) {
        throw new Error("findOpenIssuePr requires identifier");
      }
      const stdout = await run(
        "gh",
        [
          "pr",
          "list",
          "--repo",
          repoFromEnv(env),
          "--search",
          identifier,
          "--state",
          "open",
          "--base",
          "development",
          "--json",
          "number,title,headRefName,url",
        ],
        { env },
      );
      const parsed = JSON.parse(stdout);
      const matched = selectOpenIssuePrs(parsed, identifier);
      if (matched.length > 1) {
        throw new Error(`${identifier} has multiple open PRs`);
      }
      const row = matched[0];
      if (!row || typeof row.headRefName !== "string" || typeof row.url !== "string") {
        return null;
      }
      return { head: row.headRefName, url: row.url, number: row.number };
    },

    async viewPr({ cwd }) {
      try {
        const stdout = await run(
          "gh",
          ["pr", "view", "--json", "url,mergeable,statusCheckRollup"],
          { cwd, env },
        );
        const parsed = JSON.parse(stdout);
        const requiredRows = await loadRequiredChecks(cwd);
        return {
          url: parsed.url,
          mergeable: parsed.mergeable,
          checks: mapStatusChecks(parsed.statusCheckRollup, requiredRows),
        };
      } catch {
        return { url: undefined, mergeable: "UNKNOWN", checks: [] };
      }
    },

    /**
     * @param {{ cwd: string, base: string, head?: string, title: string, body?: string }} input
     */
    async createPr({ cwd, base, head, title, body, identifier }) {
      if (typeof head !== "string" || head.length === 0) {
        throw new Error("createPr requires head branch");
      }
      if (typeof identifier === "string" && identifier.length > 0) {
        const existing = await this.findOpenIssuePr({ identifier });
        if (existing?.url) {
          throw new Error(`${identifier} already has open PR ${existing.url}`);
        }
      }
      await run("git", ["push", "-u", "origin", `HEAD:refs/heads/${head}`], { cwd, env });
      const args = ["pr", "create", "--base", base, "--head", head, "--title", title];
      if (typeof body === "string") {
        args.push("--body", body);
      }
      const stdout = await run("gh", args, { cwd, env });
      const url = stdout.trim().split("\n").filter(Boolean).at(-1);
      return { url, mergeable: "UNKNOWN", checks: [] };
    },

    /**
     * Best-effort failed-job log for the workpad. Redaction happens in implement-exit.
     *
     * @param {{ cwd: string, name?: string }} input
     */
    async fetchCheckLog({ cwd }) {
      try {
        return await run("gh", ["run", "view", "--log-failed"], { cwd, env });
      } catch {
        return "";
      }
    },

    merge() {
      throw new Error("implement never merges");
    },
  };
}
