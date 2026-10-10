/**
 * Start decision: rules in code, no external service. Decides whether an issue gets a Lead plan,
 * which Role helpers the issue probably needs, and which model the Engineer runs on.
 * Pattern from Optio's decide/start.mjs and engineer-model.mjs, rewritten as pure rules
 * (see .cursor/skills/NOTICE.md). Used by the orchestrator in /issue-session; ADR-0051.
 */
import { matchesGlob } from "./pr-write-scope.mjs";

/** Model aliases the orchestrator maps to a bb provider and model id. */
export const MODELS = { strong: "opus", standard: "sonnet" };

/** Paths whose change is high-risk on its own: auth, money, schema, boot env. */
export const HIGH_RISK_GLOBS = [
  "packages/db/**",
  "apps/api/src/**/*auth*/**",
  "apps/api/src/**/*iap*/**",
  "apps/api/src/**/*identity*/**",
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

/** `Risk: high` / `Risk: medium` line in the issue body; "" when absent. */
export function parseRisk(body) {
  return (/^\s*risk:\s*(low|medium|high)\b/im.exec(String(body ?? ""))?.[1] ?? "").toLowerCase();
}

/** Top-level app or package a glob lives in (`apps/api/**` -> `apps/api`), else the first segment. */
function areaOf(glob) {
  const m = /^(apps|packages)\/([\w-]+)/.exec(glob);
  return m ? `${m[1]}/${m[2]}` : glob.split("/")[0];
}

/** Two globs overlap when one matches the other's literal prefix; good enough for scope fan-out. */
function globHitsGlob(glob, sample) {
  const stem = sample.replace(/\*+.*$/, "");
  return (
    matchesGlob(stem, glob) ||
    matchesGlob(`${stem}x`, glob) ||
    stem.startsWith(glob.replace(/\*+.*$/, ""))
  );
}

/** Role helpers whose globs contain a write-scope entry (a hint; the Lead decides the final set). */
export function matchRoles(scope) {
  return Object.entries(ROLE_GLOBS)
    .filter(([, globs]) => scope.some((s) => globs.some((g) => globHitsGlob(g, s))))
    .map(([role]) => role);
}

/**
 * @param {{ body?: string, labels?: string[], redAudits?: number, replan?: boolean }} issue
 * @returns {{ plan: boolean, planWhy: string, roles: string[], risk: string,
 *   engineerModel: string, modelWhy: string }}
 */
export function startDecision({ body = "", labels = [], redAudits = 0, replan = false }) {
  const scope = parseWriteScope(body);
  const risk = parseRisk(body);
  const areas = new Set(scope.map(areaOf));
  const highRiskPath = scope.some((s) => HIGH_RISK_GLOBS.some((g) => globHitsGlob(g, s)));
  const approvalPlan = labels.some((label) => /approv/i.test(label) && /plan/i.test(label));
  const noTesting = !/^#+\s*Testing\b/im.test(String(body));

  let plan = true;
  let planWhy;
  if (approvalPlan) {
    planWhy = "an approval label asks for a plan";
  } else if (risk === "high" || risk === "medium" || highRiskPath) {
    planWhy = "risk is medium or high, or the write-scope touches auth, schema or workflows";
  } else if (areas.size > 1) {
    planWhy = "the write-scope spans more than one app or package";
  } else if (noTesting) {
    planWhy = "the issue has no Testing section";
  } else {
    plan = false;
    planWhy = "small single-area change with a Testing section";
  }

  let engineerModel = MODELS.standard;
  let modelWhy = "default";
  if (risk === "high" || highRiskPath) {
    engineerModel = MODELS.strong;
    modelWhy = "high-risk issue";
  } else if (replan) {
    engineerModel = MODELS.strong;
    modelWhy = "replan";
  } else if (redAudits >= 2) {
    engineerModel = MODELS.strong;
    modelWhy = "two red audits";
  }
  return { plan, planWhy, roles: matchRoles(scope), risk, engineerModel, modelWhy };
}
