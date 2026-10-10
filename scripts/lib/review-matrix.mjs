/**
 * Review matrix (ADR-0050). The workpad's `### Review matrix` holds one row per lock-set row,
 * with a status and evidence. The next review inherits it and re-checks only the rows the new
 * diff touches, plus every row that is still a finding. Pure helpers; CLI in review-matrix.mjs.
 */
import { matchesGlob } from "./pr-write-scope.mjs";

export const STATUSES = ["checked", "N/A", "finding"];

const CODE = ["apps/**", "packages/**", "seed/**", "scripts/**"];

/**
 * Lock-set rows. `touches` are the globs of a change that re-opens the row; `"always"` rows are
 * state, not code, and are re-read on every pass. Rows 1 to 6 are the checker's lock set;
 * the rest come from rounds that each found something new (KIT-267, 272, 277).
 *
 * @type {{ id: string, label: string, touches: string[] | "always" }[]}
 */
export const LOCK_ROWS = [
  {
    id: "spec-ac",
    label: "Spec: every Acceptance criterion and What to build clause",
    touches: "always",
  },
  {
    id: "architecture",
    label: "Architecture lock (modules, auth)",
    touches: ["apps/api/**", "packages/**", "docs/adr/**"],
  },
  {
    id: "design-system",
    label: "Design system (tokens, type roles, components)",
    touches: ["apps/mobile/**", "apps/web/**", "docs/design-system.md"],
  },
  {
    id: "env-secrets",
    label: "Secrets, CORS, required boot env",
    touches: [".github/workflows/**", ".env*", "**/.env*", "**/Dockerfile", "apps/api/src/**"],
  },
  {
    id: "mergeable",
    label: "Mergeability (MERGEABLE, not behind a strict lane)",
    touches: "always",
  },
  { id: "required-checks", label: "All required GitHub checks green", touches: "always" },
  {
    id: "device-flow",
    label: "Device flow: a step per criterion a screen can show, status on the head",
    touches: ["apps/mobile/**"],
  },
  {
    id: "state-machine",
    label: "State machines: every state, transition and guard the diff touches, walked together",
    touches: ["**/*reducer*", "**/*machine*", "**/*dismissal*", "**/*state*"],
  },
  {
    id: "names-english",
    label: "Names: identifiers and file names are English (scripts/check-code-english.mjs)",
    touches: CODE,
  },
  {
    id: "docs-sync",
    label: "Docs name what the code now is (scripts/check-doc-references.mjs)",
    touches: [...CODE, "docs/**", "*.md", ".cursor/**"],
  },
];

/**
 * @param {string} workpad workpad comment body
 * @returns {{ id: string, status: string, evidence: string, at: string }[]}
 */
export function parseMatrix(workpad) {
  const section = String(workpad).split(/^### Review matrix\s*$/m)[1];
  if (section === undefined) {
    return [];
  }
  const body = section.split(/^### /m)[0];
  /** @type {{ id: string, status: string, evidence: string, at: string }[]} */
  const rows = [];
  for (const line of body.split("\n")) {
    if (!line.trim().startsWith("|")) {
      continue;
    }
    const cells = line
      .trim()
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((cell) => cell.trim());
    if (cells.length < 3 || cells[0] === "row" || /^-+$/.test(cells[0].replace(/:/g, ""))) {
      continue;
    }
    rows.push({
      id: cells[0].replace(/`/g, ""),
      status: cells[1],
      evidence: cells[2],
      at: cells[3] ?? "",
    });
  }
  return rows;
}

/**
 * @param {{ id: string, status: string, evidence: string, at: string }[]} rows
 * @returns {string[]} problems; empty when the matrix is complete
 */
export function validateMatrix(rows) {
  const problems = [];
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const lock of LOCK_ROWS) {
    const row = byId.get(lock.id);
    if (!row) {
      problems.push(`row \`${lock.id}\` is missing`);
      continue;
    }
    if (!STATUSES.includes(row.status)) {
      problems.push(`row \`${lock.id}\` has status "${row.status}"; use checked, N/A or finding`);
    }
    if (!row.evidence || row.evidence === "-") {
      problems.push(`row \`${lock.id}\` has no evidence`);
    }
  }
  for (const row of rows) {
    if (!LOCK_ROWS.some((lock) => lock.id === row.id)) {
      problems.push(`row \`${row.id}\` is not a lock-set row`);
    }
  }
  return problems;
}

/**
 * Rows the next review has to re-check: every row still a finding, every "always" row, every
 * row whose globs match a changed file, and every row the matrix lacks. All other rows are
 * inherited as they stand.
 *
 * @param {{ id: string, status: string }[]} rows
 * @param {string[]} changedFiles files changed since the matrix's review (`lastReviewSha...HEAD`)
 * @returns {{ recheck: string[], inherit: string[] }}
 */
export function planRecheck(rows, changedFiles) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const recheck = [];
  const inherit = [];
  for (const lock of LOCK_ROWS) {
    const row = byId.get(lock.id);
    const touched =
      lock.touches === "always" ||
      changedFiles.some((file) => lock.touches.some((glob) => matchesGlob(file, glob)));
    if (!row || row.status === "finding" || touched) {
      recheck.push(lock.id);
    } else {
      inherit.push(lock.id);
    }
  }
  return { recheck, inherit };
}
