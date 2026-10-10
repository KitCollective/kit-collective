/**
 * Start decision: rules in code, no external service. Decides whether an issue gets a Lead plan,
 * which Role helpers the issue probably needs, and which model the Engineer runs on.
 * Pattern from Optio's decide/start.mjs and engineer-model.mjs, rewritten as pure rules
 * (see .cursor/skills/NOTICE.md). Used by the orchestrator in /issue-session; ADR-0051.
 */
/** Model aliases the orchestrator maps to a bb provider and model id. */
export const MODELS = { strong: "opus", standard: "sonnet" };

/** Paths whose change is high-risk on its own: schema, auth (identity), IAP (billing), workflows. Concrete directories only. */
export const HIGH_RISK_GLOBS = [
  "packages/db/**",
  "apps/api/src/identity/**",
  "apps/api/src/billing/**",
  ".github/workflows/**",
];

/** Role helper -> the globs that make it match a slice (mirrors the `description` of each Role). */
export const ROLE_GLOBS = {
  frontend: ["apps/mobile/**", "apps/web/**", "apps/admin/**", "docs/design-system.md"],
  backend: ["apps/api/**", "packages/db/**", "seed/**"],
  devops: [".github/**", "apps/mobile/eas.json", "apps/mobile/.maestro/**", "Dockerfile"],
};

/** Reads the `write-scope:` line of an issue body into globs. */
export function parseWriteScope(body) {
  const line = /^\s*write-scope:\s*(.+)$/im.exec(String(body ?? ""))?.[1] ?? "";
  return line
    .split(",")
    .map((glob) => glob.trim().replace(/`/g, ""))
    .filter(Boolean);
}

/** Top-level app or package a glob lives in (`apps/api/**` -> `apps/api`), else the first segment. */
function areaOf(glob) {
  const m = /^(apps|packages)\/([\w-]+)/.exec(glob);
  return m ? `${m[1]}/${m[2]}` : glob.split("/")[0];
}

/** Literal directory segments of a glob, up to its first wildcard segment. */
function literalSegments(glob) {
  const out = [];
  for (const segment of glob.split("/")) {
    if (segment.includes("*")) {
      break;
    }
    out.push(segment);
  }
  return out;
}

/**
 * A write-scope entry touches a path glob when one literal directory prefix contains the other:
 * the entry is equal to, inside of, or a parent of the path. `apps/api/src/catalog/**` does not
 * touch `apps/api/src/identity/**`; `apps/api/**` does.
 */
function globHitsGlob(glob, sample) {
  const a = literalSegments(glob);
  const b = literalSegments(sample);
  const n = Math.min(a.length, b.length);
  return a.slice(0, n).every((segment, i) => segment === b[i]);
}

/** Role helpers whose globs contain a write-scope entry (a hint; the Lead decides the final set). */
export function matchRoles(scope) {
  return Object.entries(ROLE_GLOBS)
    .filter(([, globs]) => scope.some((s) => globs.some((g) => globHitsGlob(g, s))))
    .map(([role]) => role);
}

/**
 * @param {{ body?: string, labels?: string[], redAudits?: number, replan?: boolean }} issue
 * @returns {{ plan: boolean, planWhy: string, roles: string[],
 *   engineerModel: string, modelWhy: string }}
 */
export function startDecision({ body = "", labels = [], redAudits = 0, replan = false }) {
  const scope = parseWriteScope(body);
  const areas = new Set(scope.map(areaOf));
  const highRiskPath = scope.some((s) => HIGH_RISK_GLOBS.some((g) => globHitsGlob(g, s)));
  const approvalPlan = labels.some((label) => /approv/i.test(label) && /plan/i.test(label));
  const noSeams = !/^#+\s*(Seams|Testing)\b/im.test(String(body));

  let plan = true;
  let planWhy;
  if (approvalPlan) {
    planWhy = "an approval label asks for a plan";
  } else if (highRiskPath) {
    planWhy = "the write-scope touches schema, auth, IAP or workflows";
  } else if (areas.size > 1) {
    planWhy = "the write-scope spans more than one app or package";
  } else if (noSeams) {
    planWhy = "the issue has no Seams section";
  } else {
    plan = false;
    planWhy = "small single-area change with a Seams section";
  }

  let engineerModel = MODELS.standard;
  let modelWhy = "default";
  if (highRiskPath) {
    engineerModel = MODELS.strong;
    modelWhy = "high-risk path";
  } else if (replan) {
    engineerModel = MODELS.strong;
    modelWhy = "replan";
  } else if (redAudits >= 2) {
    engineerModel = MODELS.strong;
    modelWhy = "two red audits";
  }
  return { plan, planWhy, roles: matchRoles(scope), engineerModel, modelWhy };
}
