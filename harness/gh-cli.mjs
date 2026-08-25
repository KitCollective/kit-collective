/**
 * `gh` adapter for implement ADW exit. Implement never merges.
 * Fake `runCommand` at this seam.
 */
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { gitArgvContainsSecret, remoteGitChildEnv } from "./worktree.mjs";

const execFile = promisify(execFileCb);

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

  return {
    /**
     * @param {{ cwd: string, onto: string }} input
     */
    async rebase({ cwd, onto }) {
      await run("git", ["fetch", "origin", "development"], { cwd, env });
      await run("git", ["rebase", onto], { cwd, env });
    },

    /**
     * @param {{ cwd: string }} input
     */
    async viewPr({ cwd }) {
      try {
        const stdout = await run(
          "gh",
          ["pr", "view", "--json", "url,mergeable,statusCheckRollup"],
          { cwd, env },
        );
        const parsed = JSON.parse(stdout);
        const checks = Array.isArray(parsed.statusCheckRollup)
          ? parsed.statusCheckRollup.map((check) => ({
              name: check.name,
              conclusion: check.conclusion,
              status: check.status,
            }))
          : [];
        return { url: parsed.url, mergeable: parsed.mergeable, checks };
      } catch {
        return { url: undefined, mergeable: "UNKNOWN", checks: [] };
      }
    },

    /**
     * @param {{ cwd: string, base: string, head?: string, title: string, body?: string }} input
     */
    async createPr({ cwd, base, title, body }) {
      const args = ["pr", "create", "--base", base, "--title", title];
      if (typeof body === "string") {
        args.push("--body", body);
      }
      await run("gh", args, { cwd, env });
      return this.viewPr({ cwd });
    },

    merge() {
      throw new Error("implement never merges");
    },
  };
}
