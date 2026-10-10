/**
 * Brings a PR branch up to date with the integration lane without a person, and tells whether an
 * audit still holds after only clean merges of the lane were added (ADR-0054).
 * Never rebases and never forces: a rewritten history would cost a full audit.
 * Pattern from Optio's sync.sh and delta.sh.
 */
import { execFileSync } from "node:child_process";

function git(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
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
    } catch {
      const files = git(cwd, ["diff", "--name-only", "--diff-filter=U"])
        .split("\n")
        .filter(Boolean);
      git(cwd, ["merge", "--abort"]);
      if (files.length === 0) {
        return {
          code: 1,
          line: "CLOSED (sync): the merge failed for a reason other than a conflict",
        };
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
          line: `CLOSED (sync): push refused (${String(error.message).split("\n")[0]}); merge kept locally`,
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
    const target = git(cwd, ["rev-parse", head]);
    const from = git(cwd, ["rev-parse", audited]);
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
