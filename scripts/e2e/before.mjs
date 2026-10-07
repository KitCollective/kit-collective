/**
 * "Before" selection for the device-flow comparison (KIT-267).
 *
 * @typedef {{ sha: string, lane: "development" | "pr", status: "passed" | "failed" }} RunRecord
 */

/**
 * "Before" for a PR is the latest passed `development` run at or before the
 * PR's merge base.
 *
 * @param {{ ancestors: string[], runs: RunRecord[] }} input `ancestors` is the
 *   merge base followed by its first-parent history, newest first.
 * @returns {string | null} commit SHA, or null when no such run exists
 */
export function selectBefore({ ancestors, runs }) {
  const usable = new Set(
    runs
      .filter((run) => run.lane === "development" && run.status === "passed")
      .map((run) => run.sha),
  );
  return ancestors.find((sha) => usable.has(sha)) ?? null;
}
