/**
 * Brings a PR branch up to date with the integration lane without a person, and tells whether an
 * audit still holds after only clean merges of the lane were added (ADR-0054).
 * Never rebases and never forces: a rewritten history would cost a full audit.
 * Pattern from Optio's sync.sh and delta.sh.
 */
import { execFileSync } from "node:child_process";
import { prBound } from "./gates.mjs";
import { assertRef, nulList } from "./git-files.mjs";

/** A fixed identity for every git call here: never rely on, or change, the user's git config. */
const IDENTITY = {
  GIT_AUTHOR_NAME: "factory-sync",
  GIT_AUTHOR_EMAIL: "factory-sync@kitcollective.invalid",
  GIT_COMMITTER_NAME: "factory-sync",
  GIT_COMMITTER_EMAIL: "factory-sync@kitcollective.invalid",
};

function git(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...IDENTITY },
  }).trim();
}

/** First line of git's own message, from a failed call. */
const reason = (error) =>
  String(error.stderr || error.message || "")
    .trim()
    .split("\n")[0];
const ok = (cwd, args) => {
  try {
    git(cwd, args);
    return true;
  } catch {
    return false;
  }
};

/**
 * @param {{ cwd: string, base: string, remote?: string, push?: boolean }} o
 * @returns {{ code: number, line: string }} 0 CURRENT or SYNCED, 1 CONFLICT or CLOSED
 */
export function syncBranch({ cwd, base, remote = "origin", push = true }) {
  try {
    if (git(cwd, ["status", "--porcelain"]) !== "") {
      return { code: 1, line: "CLOSED (sync): uncommitted files; commit or discard them first" };
    }
    git(cwd, ["fetch", "--quiet", remote, base]);
    if (ok(cwd, ["merge-base", "--is-ancestor", `${remote}/${base}`, "HEAD"])) {
      return { code: 0, line: `CURRENT (sync): the branch already holds ${remote}/${base}` };
    }
    try {
      git(cwd, ["merge", "--no-edit", "--no-ff", `${remote}/${base}`]);
    } catch (error) {
      const merging = ok(cwd, ["rev-parse", "-q", "--verify", "MERGE_HEAD"]);
      const files = merging
        ? nulList(git(cwd, ["diff", "--name-only", "-z", "--diff-filter=U"]))
        : [];
      if (merging) {
        git(cwd, ["merge", "--abort"]);
      }
      if (files.length === 0) {
        return { code: 1, line: `CLOSED (sync): merge failed: ${reason(error)}` };
      }
      return {
        code: 1,
        line: `CONFLICT (sync): ${files.slice(0, 8).join(", ")}${files.length > 8 ? ` (+${files.length - 8} more)` : ""}; the implementer resolves it`,
      };
    }
    if (push) {
      try {
        git(cwd, ["push", "--quiet", remote, "HEAD"]);
      } catch (error) {
        return {
          code: 1,
          line: `CLOSED (sync): push refused (${reason(error)}); merge kept locally`,
        };
      }
    }
    return {
      code: 0,
      line: `SYNCED (sync): ${remote}/${base} merged in with no conflict${push ? " and pushed" : ""}; checks run again on the new head`,
    };
  } catch (error) {
    return { code: 1, line: `CLOSED (sync): ${String(error.message).split("\n")[0]}` };
  }
}

/**
 * The audit of `audited` still holds for HEAD when every commit added since is a merge of the
 * lane that git made alone: two parents, the second already on the lane, and a tree equal to
 * `git merge-tree` of the parents (no conflict resolution, nothing hand-edited).
 * @param {{ cwd: string, audited: string, base: string, remote?: string, head?: string }} o
 * @returns {{ code: number, line: string }} 0 valid, 1 stale
 */
export function auditStillValid({ cwd, audited, base, remote = "origin", head = "HEAD" }) {
  try {
    const target = git(cwd, ["rev-parse", "--verify", "--end-of-options", assertRef(head)]);
    const from = git(cwd, ["rev-parse", "--verify", "--end-of-options", assertRef(audited)]);
    if (target === from) {
      return { code: 0, line: "AUDIT-VALID: head is the audited commit" };
    }
    if (!ok(cwd, ["merge-base", "--is-ancestor", from, target])) {
      return { code: 1, line: "AUDIT-STALE: the audited commit is not an ancestor of the head" };
    }
    const rows = git(cwd, ["rev-list", "--first-parent", "--parents", `${from}..${target}`])
      .split("\n")
      .filter(Boolean);
    for (const row of rows) {
      const [sha, ...parents] = row.split(" ");
      if (parents.length !== 2) {
        return {
          code: 1,
          line: `AUDIT-STALE: ${sha.slice(0, 7)} is not a merge; new work needs a new audit`,
        };
      }
      if (!ok(cwd, ["merge-base", "--is-ancestor", parents[1], `${remote}/${base}`])) {
        return {
          code: 1,
          line: `AUDIT-STALE: ${sha.slice(0, 7)} merges something that is not on ${remote}/${base}`,
        };
      }
      let auto;
      try {
        auto = git(cwd, ["merge-tree", "--write-tree", parents[0], parents[1]]).split("\n")[0];
      } catch {
        return {
          code: 1,
          line: `AUDIT-STALE: ${sha.slice(0, 7)} merged with conflicts resolved by hand`,
        };
      }
      if (auto !== git(cwd, ["rev-parse", `${sha}^{tree}`])) {
        return {
          code: 1,
          line: `AUDIT-STALE: ${sha.slice(0, 7)} differs from the automatic merge (hand edits)`,
        };
      }
    }
    return {
      code: 0,
      line: `AUDIT-VALID: ${rows.length} clean merge(s) of ${remote}/${base} since the audit`,
    };
  } catch (error) {
    return { code: 1, line: `AUDIT-STALE: ${String(error.message).split("\n")[0]}` };
  }
}

/**
 * The checkout must be the PR's head by SHA, not only by branch name: a stale local branch
 * would be merged and pushed over newer work. Reuses `prBound` from the gates.
 * @param {{ head: string, prHead: string, verb?: string }} o
 * @returns {{ ok: boolean, line?: string }}
 */
export function syncBound({ head, prHead, verb = "CLOSED (sync)" }) {
  const bound = prBound({ head, prHead });
  if (bound.ok) {
    return bound;
  }
  const short = (sha) => String(sha ?? "").slice(0, 8) || "unknown";
  return {
    ok: false,
    line: `${verb}: local HEAD is ${short(head)}, the PR head is ${short(prHead)}; pull or run from the PR worktree`,
  };
}
