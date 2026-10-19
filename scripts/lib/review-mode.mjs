/**
 * Full or delta review (2026-10-19). KIT-298 was reviewed five times on almost the same code: each
 * new head was the reviewed code plus a merge of origin/development, and each Reviewer read the whole
 * merge-base diff again. Delta mode lets the Reviewer read only what moved since the last green review,
 * and it is chosen here, from git, never by the model:
 *
 * - the workpad matrix is complete, has no `finding` row, and every row was read at one head X
 *   (the in-run green sha, when the workflow passes one, must be that same head);
 * - X is an ancestor of HEAD;
 * - every commit in X..HEAD that development does not hold is a merge whose other parents development
 *   holds: the branch made no commit of its own since X;
 * - no merge took one side of a file both sides changed whole (a dropped side shows in no `--cc` diff).
 *
 * Anything else is a full review, as before. Pure apart from the `git` function it is handed.
 */
import { validateMatrix } from "./review-matrix.mjs";

const SHA = /^[0-9a-f]{7,40}$/i;
const FULL_SHA = /^[0-9a-f]{40}$/;

/**
 * @param {{ id: string, status: string, at: string }[]} rows the workpad's review matrix
 * @param {string} green the in-run green head, or ""
 * @returns {{ ok: true, sha: string } | { ok: false, why: string }} the head the matrix was read at
 */
export function greenHead(rows, green = "") {
  if (rows.length === 0) {
    return { ok: false, why: "no review matrix in the workpad" };
  }
  if (validateMatrix(rows).length > 0) {
    return { ok: false, why: "the review matrix is incomplete" };
  }
  if (rows.some((row) => row.status === "finding")) {
    return { ok: false, why: "the review matrix holds a finding" };
  }
  const ats = new Set(rows.map((row) => row.at.replace(/`/g, "").trim().toLowerCase()));
  const [at] = ats;
  if (ats.size !== 1 || !SHA.test(at)) {
    return { ok: false, why: "the review matrix rows were not all read at one head" };
  }
  const want = String(green).toLowerCase();
  if (want && !want.startsWith(at) && !at.startsWith(want)) {
    return { ok: false, why: `the review matrix was read at ${at}, not at the green head ${want}` };
  }
  return { ok: true, sha: want || at };
}

/**
 * @param {object} input
 * @param {{ id: string, status: string, at: string }[]} input.rows
 * @param {string} [input.green] last green head of this run, or ""
 * @param {string} [input.lane] e.g. origin/development
 * @param {(args: string[]) => string | null} input.git stdout trimmed, or null when git exits non-zero
 * @returns {{ mode: "delta", since: string, head: string, merges: string[], overlap: string[] } | { mode: "full", why: string }}
 */
export function reviewMode({ rows, green = "", lane = "origin/development", git }) {
  const found = greenHead(rows, green);
  if (!found.ok) {
    return { mode: "full", why: found.why };
  }
  const since = git(["rev-parse", "--verify", "--quiet", `${found.sha}^{commit}`]);
  const head = git(["rev-parse", "HEAD"]);
  if (!since || !FULL_SHA.test(since)) {
    return { mode: "full", why: `the green head ${found.sha} is not in this checkout` };
  }
  if (!head || !FULL_SHA.test(head)) {
    return { mode: "full", why: "HEAD could not be read" };
  }
  const isAncestor = (a, b) => git(["merge-base", "--is-ancestor", a, b]) !== null;
  if (since !== head && !isAncestor(since, head)) {
    return { mode: "full", why: `HEAD does not descend from ${since}` };
  }
  const own = git(["rev-list", "--parents", `${since}..${head}`, "--not", lane]);
  if (own === null) {
    return { mode: "full", why: `could not list the commits since ${since}` };
  }
  const merges = [];
  const overlap = [];
  for (const line of own.split("\n").filter(Boolean)) {
    const [commit, first, ...others] = line.split(" ");
    if (others.length === 0) {
      return {
        mode: "full",
        why: `${commit.slice(0, 12)} is a commit of the branch, not a merge of ${lane}`,
      };
    }
    if (!others.every((parent) => isAncestor(parent, lane))) {
      return { mode: "full", why: `${commit.slice(0, 12)} merges something ${lane} does not hold` };
    }
    for (const other of others) {
      const base = git(["merge-base", first, other]);
      if (!base) {
        return { mode: "full", why: `${commit.slice(0, 12)} has no merge base` };
      }
      const ours = new Set(
        git(["diff", "--name-only", "--no-renames", base, first])?.split("\n").filter(Boolean) ??
          [],
      );
      const theirs =
        git(["diff", "--name-only", "--no-renames", base, other])?.split("\n").filter(Boolean) ??
        [];
      for (const file of theirs.filter((f) => ours.has(f))) {
        const blob = (rev) => git(["rev-parse", "--verify", "--quiet", `${rev}:${file}`]) ?? "";
        const result = blob(commit);
        if (result === blob(first) || result === blob(other)) {
          return {
            mode: "full",
            why: `${commit.slice(0, 12)} took one side of ${file} whole although both sides changed it`,
          };
        }
        overlap.push(file);
      }
    }
    merges.push(commit);
  }
  return { mode: "delta", since, head, merges, overlap: [...new Set(overlap)] };
}
