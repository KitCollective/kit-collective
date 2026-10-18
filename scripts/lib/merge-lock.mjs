/**
 * Merge lock shared by every machine (ADR-0054). The lock is one git ref on origin
 * (`refs/factory/merge-lock`) that points at an empty commit whose message names the holder PR
 * and the time. Creating or moving the ref uses `--force-with-lease`, which GitHub evaluates
 * atomically, so two orchestrators on two machines cannot both take it. No extra service.
 * Pattern from Optio's merge-lock.sh (a folder in the git common dir: single clone only).
 */
import { execFileSync } from "node:child_process";

export const LOCK_REF = "refs/factory/merge-lock";
export const DEFAULT_STALE_SECONDS = 1800;
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const IDENTITY = {
  GIT_AUTHOR_NAME: "merge-lock",
  GIT_AUTHOR_EMAIL: "merge-lock@kitcollective.invalid",
  GIT_COMMITTER_NAME: "merge-lock",
  GIT_COMMITTER_EMAIL: "merge-lock@kitcollective.invalid",
};

/**
 * git's own first error line (`fatal: ...`, `error: ...`, or a `remote: ...` line from the server),
 * not node's "Command failed: git ..." header and not the "To <url>" line a rejected push starts with.
 */
function firstErrorLine(error) {
  const lines = `${error?.stderr ?? ""}\n${error?.message ?? ""}`
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("Command failed"));
  return (
    lines.find((line) => /^(fatal|error|remote):/.test(line)) ??
    lines.find((line) => !line.startsWith("To ")) ??
    "git failed without output"
  );
}

function git(cwd, args, { input, ...extraEnv } = {}) {
  try {
    return execFileSync("git", args, {
      cwd,
      input,
      encoding: "utf8",
      stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
      // LC_ALL=C: the lease rejection is recognised by git's English "(stale info)".
      env: { ...process.env, ...IDENTITY, LC_ALL: "C", ...extraEnv },
    }).trim();
  } catch (error) {
    throw Object.assign(new Error(firstErrorLine(error)), { stderr: error.stderr });
  }
}

/** @returns {{ sha: string, pr: string, at: number } | null} the current holder */
function holder(cwd, remote) {
  const out = git(cwd, ["ls-remote", remote, LOCK_REF]);
  const sha = out.split(/\s+/)[0];
  if (!sha) {
    return null;
  }
  git(cwd, ["fetch", "--no-tags", "--quiet", remote, `+${LOCK_REF}:${LOCK_REF}`]);
  const message = git(cwd, ["log", "-1", "--format=%B", LOCK_REF]);
  const m = /merge-lock pr=(\d+) at=(\d+)/.exec(message);
  return { sha, pr: m?.[1] ?? "", at: Number(m?.[2] ?? 0) };
}

/**
 * Pushes a new lock commit over `expected` (a sha, or "" for "must not exist").
 * Returns false only when git refused on the lease (another PR moved the ref); any other
 * push failure (credentials, permission, network) throws with git's first error line.
 */
function swap(cwd, remote, pr, now, expected) {
  git(cwd, ["hash-object", "-t", "tree", "-w", "--stdin"], { input: "" });
  const commit = git(cwd, ["commit-tree", EMPTY_TREE, "-m", `merge-lock pr=${pr} at=${now}`]);
  try {
    git(cwd, [
      "push",
      "--quiet",
      remote,
      `--force-with-lease=${LOCK_REF}:${expected}`,
      `${commit}:${LOCK_REF}`,
    ]);
    return true;
  } catch (error) {
    if (/\(stale info\)/.test(String(error.stderr))) {
      return false;
    }
    throw error;
  }
}

/**
 * @param {{ cwd: string, remote?: string, pr: string, now?: number, staleSeconds?: number }} o
 * @returns {{ code: number, line: string }} 0 taken, 3 held by another PR, 1 cannot work
 */
export function take({
  cwd,
  remote = "origin",
  pr,
  now = Math.floor(Date.now() / 1000),
  staleSeconds = DEFAULT_STALE_SECONDS,
}) {
  try {
    const current = holder(cwd, remote);
    if (current && current.pr !== String(pr) && now - current.at <= staleSeconds) {
      const minutes = Math.round((now - current.at) / 60);
      return {
        code: 3,
        line: `HELD (merge-lock): PR ${current.pr} holds it, taken ${minutes} min ago`,
      };
    }
    if (swap(cwd, remote, pr, now, current?.sha ?? "")) {
      const how = current
        ? current.pr === String(pr)
          ? "renewed"
          : `taken over from stale PR ${current.pr}`
        : "taken";
      return { code: 0, line: `TAKEN (merge-lock): PR ${pr} holds the merge lock (${how})` };
    }
    return { code: 3, line: "HELD (merge-lock): another PR took it first" };
  } catch (error) {
    return { code: 1, line: `CLOSED (merge-lock): ${error.message}` };
  }
}

/** Gives the lock back. Only the PR that holds it can. */
export function release({ cwd, remote = "origin", pr, force = false }) {
  try {
    const current = holder(cwd, remote);
    if (!current) {
      return { code: 0, line: "RELEASED (merge-lock): nothing was held" };
    }
    if (!force && current.pr !== String(pr)) {
      return { code: 3, line: `HELD (merge-lock): PR ${current.pr} holds it, not PR ${pr}` };
    }
    git(cwd, [
      "push",
      "--quiet",
      remote,
      `--force-with-lease=${LOCK_REF}:${current.sha}`,
      `:${LOCK_REF}`,
    ]);
    return {
      code: 0,
      line:
        force && current.pr !== String(pr)
          ? `RELEASED (merge-lock): cleared by force, PR ${current.pr} held it`
          : `RELEASED (merge-lock): PR ${pr} gave the lock back`,
    };
  } catch (error) {
    return { code: 1, line: `CLOSED (merge-lock): ${error.message}` };
  }
}

/**
 * Who holds the lock and for how long. Exit 0 held, 3 free (nothing to wait for), 1 cannot work.
 * @param {{ cwd: string, remote?: string, now?: number }} o
 */
export function status({ cwd, remote = "origin", now = Math.floor(Date.now() / 1000) }) {
  try {
    const current = holder(cwd, remote);
    if (!current) {
      return { code: 3, line: "FREE (merge-lock): nobody holds it" };
    }
    const minutes = Math.round((now - current.at) / 60);
    return { code: 0, line: `HELD (merge-lock): PR ${current.pr} for ${minutes} min` };
  } catch (error) {
    return { code: 1, line: `CLOSED (merge-lock): ${error.message}` };
  }
}

/** Tries every `pollSeconds` until taken or `waitSeconds` pass. `sleep` is injectable for tests. */
export async function waitFor(
  options,
  {
    waitSeconds = 3600,
    pollSeconds = 30,
    sleep = (s) => new Promise((r) => setTimeout(r, s * 1000)),
  } = {},
) {
  let waited = 0;
  for (;;) {
    const result = take(options);
    if (result.code !== 3 || waited >= waitSeconds) {
      return result;
    }
    await sleep(pollSeconds);
    waited += pollSeconds;
  }
}
