/**
 * Which issue worktrees on the runs machine can go (ADR-0066): one whose issue is Done, Canceled or
 * Duplicate. A worktree is a bb environment of the git-worktree provider; its issue is the one its
 * branch names (`bb/kit-n-thr_x`). Anything else is kept: the dispatcher's own environment, a
 * worktree with no issue in its branch, and every issue that is not finished. On 2026-10-18 the runs
 * machine held 99 worktrees (11 GB, 13 GB free).
 */
export const FINISHED_STATES = new Set(["Done", "Canceled", "Duplicate"]);

/** The issue key a worktree branch names, as `KIT-n`, or null. */
export function issueOfBranch(branch) {
  const match = /^bb\/([a-z][a-z0-9]*-\d+)(?:-|$)/i.exec(String(branch ?? ""));
  return match ? match[1].toUpperCase() : null;
}

/**
 * @param {Array<{ id: string, hostId?: string, environmentProviderId?: string, branchName?: string|null }>} environments
 * @param {{ machine: string, keep: string[], stateOf: (issue: string) => string|null }} options
 * @returns {{ reap: Array<{ id: string, issue: string, state: string }>, keep: Array<{ id: string, why: string }> }}
 */
export function planReap(environments, { machine, keep, stateOf }) {
  const reap = [];
  const kept = [];
  for (const env of environments ?? []) {
    if (env.hostId !== machine || env.environmentProviderId !== "git-worktree") continue;
    if (keep.includes(env.id)) {
      kept.push({ id: env.id, why: "kept on purpose" });
      continue;
    }
    const issue = issueOfBranch(env.branchName);
    if (!issue) {
      kept.push({ id: env.id, why: `no issue in branch ${env.branchName ?? "(none)"}` });
      continue;
    }
    const state = stateOf(issue);
    if (state && FINISHED_STATES.has(state)) {
      reap.push({ id: env.id, issue, state });
    } else {
      kept.push({ id: env.id, why: `${issue} is ${state ?? "unknown"}` });
    }
  }
  return { reap, keep: kept };
}
