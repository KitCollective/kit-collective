/**
 * PI implement context selector — hard first-run / checker-fail injection.
 * Maps slice signals to helpers, skills, and .cursor/rules for Pi --skill / append.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const UI_SURFACE_LABELS = ["mobile", "web", "admin"];
export const UI_WRITE_SCOPE_PREFIXES = ["apps/mobile", "apps/web", "apps/admin"];

export const GENERATED_CONTEXT_REL = ".pi/generated/implement-context.md";

export const ALWAYS_RULES = [
  ".cursor/rules/write-scope.mdc",
  ".cursor/rules/scope-signal-up.mdc",
  ".cursor/rules/secrets.mdc",
  ".cursor/rules/project.mdc",
  ".cursor/rules/orchestration.mdc",
  ".cursor/rules/pre-review-gate.mdc",
];

export const ALWAYS_SKILLS = [
  ".cursor/skills/tdd/SKILL.md",
  ".cursor/skills/implement/SKILL.md",
  ".cursor/skills/signal-up/SKILL.md",
];

export const PI_SECRETS_OVERLAY = `# PI worker overlay (secrets)

- \`LINEAR_API_KEY\` in spawn env is remapped from \`LINEAR_CLI_API_KEY\` for the Linear CLI only.
- \`LINEAR_API_KEY\` from \`scripts/bootstrap-linear.mjs\` is never set on the worker — do not use it.
- Never log secrets, full cookies, or raw \`Authorization\` headers.
`;

export const PI_PRE_REVIEW_OVERLAY = `# PI worker overlay (pre-review)

- Full \`pnpm test\` graph runs on **GitHub Actions only** — not on this 4 GB / 8 GB worker.
- Gate typecheck of touched packages may be yellow; \`pnpm format:check\` / \`biome ci .\` is red.
- Wait for **all** required GitHub checks before the harness moves to In Review.
`;

export const PI_ORCHESTRATION_OVERLAY = `# PI worker overlay (orchestration)

- Runtime is the PI worker: Compose + \`gh\` + Linear CLI. Linear MCP is not on the box (\`.pi/mcp.json\` empty).
- Do not treat Cursor Cloud Agents as dispatch. Never set Linear Agent to Cursor.
- Factory checker is a separate Pi process on \`In Review\` — never spawn it from implement.
`;

/**
 * @param {string | undefined} writeScopeLine
 * @returns {string[]}
 */
export function parseWriteScopeGlobs(writeScopeLine = "") {
  if (typeof writeScopeLine !== "string" || writeScopeLine.trim().length === 0) {
    return [];
  }
  return writeScopeLine
    .split(",")
    .map((glob) => glob.trim())
    .filter(Boolean);
}

/**
 * @param {{ writeScopeGlobs?: string[], labels?: string[], body?: string }} input
 */
export function detectRequiredHelpers({ writeScopeGlobs = [], labels = [], body = "" } = {}) {
  /** @type {Set<string>} */
  const helpers = new Set();
  const scope = writeScopeGlobs.join(", ");
  const labelNames = Array.isArray(labels) ? labels : [];
  const bodyText = String(body);

  const uiByLabel = labelNames.some((label) => UI_SURFACE_LABELS.includes(label));
  const uiByScope = UI_WRITE_SCOPE_PREFIXES.some((prefix) => scope.includes(prefix));
  if (uiByLabel || uiByScope) {
    helpers.add("ui-ux");
  }

  if (
    labelNames.includes("mobile") ||
    scope.includes("apps/mobile") ||
    /\bexpo\b|react native|eas\b/i.test(bodyText)
  ) {
    helpers.add("expo");
  }

  if (scope.includes("apps/api") || /\bnest\b|\/v1\b|\bauth\b/i.test(bodyText)) {
    helpers.add("nest");
  }

  if (scope.includes("packages/db") || /\bschema\b|\bdrizzle\b|\bmigration/i.test(bodyText)) {
    helpers.add("drizzle");
  }

  if (/design-system|design lock|docs\/design-system\.md/i.test(bodyText)) {
    helpers.add("ui-ux");
  }

  return [...helpers].sort();
}

/**
 * @param {string[]} requiredHelpers
 * @param {{ labels?: string[], writeScopeGlobs?: string[], body?: string }} slice
 */
export function selectImplementSkills(requiredHelpers, slice = {}) {
  /** @type {Set<string>} */
  const skills = new Set(ALWAYS_SKILLS);
  if (requiredHelpers.includes("expo")) {
    skills.add(".cursor/skills/expo/expo-overview/SKILL.md");
  }
  if (requiredHelpers.includes("nest")) {
    skills.add(".cursor/skills/codebase-design/SKILL.md");
  }
  const scope = (slice.writeScopeGlobs ?? []).join(", ");
  const labels = slice.labels ?? [];
  const ui =
    requiredHelpers.includes("ui-ux") ||
    labels.some((label) => UI_SURFACE_LABELS.includes(label)) ||
    UI_WRITE_SCOPE_PREFIXES.some((prefix) => scope.includes(prefix));
  if (ui) {
    // design-system rule is injected separately; expo-overview already added for mobile expo slices
  }
  return [...skills].sort();
}

/**
 * @param {string[]} requiredHelpers
 * @param {{ labels?: string[], writeScopeGlobs?: string[] }} slice
 */
export function selectImplementRules(requiredHelpers, slice = {}) {
  /** @type {Set<string>} */
  const rules = new Set(ALWAYS_RULES);
  const scope = (slice.writeScopeGlobs ?? []).join(", ");
  const labels = slice.labels ?? [];
  const ui =
    requiredHelpers.includes("ui-ux") ||
    labels.some((label) => UI_SURFACE_LABELS.includes(label)) ||
    UI_WRITE_SCOPE_PREFIXES.some((prefix) => scope.includes(prefix));
  if (ui) {
    rules.add(".cursor/rules/design-system.mdc");
  }
  return [...rules].sort();
}

/**
 * @returns {string}
 */
export function buildImplementAppendOverlay() {
  return [PI_SECRETS_OVERLAY, PI_PRE_REVIEW_OVERLAY, PI_ORCHESTRATION_OVERLAY].join("\n");
}

/**
 * @param {{
 *   writeScope?: string,
 *   labels?: string[],
 *   body?: string,
 *   reviewFeedback?: string,
 *   cheapRetry?: boolean,
 *   mergeFailResume?: boolean,
 * }} input
 * @returns {{ requiredHelpers: string[], skills: string[], rules: string[], appendOverlay: string }}
 */
export function selectImplementContext(input = {}) {
  if (input.cheapRetry === true || input.mergeFailResume === true) {
    return {
      requiredHelpers: [],
      skills: [],
      rules: [],
      appendOverlay: "",
    };
  }

  const writeScopeGlobs = parseWriteScopeGlobs(input.writeScope);
  const slice = {
    labels: input.labels ?? [],
    writeScopeGlobs,
    body: input.body ?? "",
  };
  const requiredHelpers = detectRequiredHelpers(slice);
  const skills = selectImplementSkills(requiredHelpers, slice);
  const rules = selectImplementRules(requiredHelpers, slice);
  const appendOverlay = buildImplementAppendOverlay();

  return { requiredHelpers, skills, rules, appendOverlay };
}

/**
 * Whether harness should inject full factory context (first run or checker-fail resume).
 * Only cheap CI / write-scope / format retry and merge-fail resume skip injection.
 *
 * @param {{ cheapRetry?: boolean, mergeFailResume?: boolean }} input
 */
export function shouldInjectImplementContext(input = {}) {
  return input.cheapRetry !== true && input.mergeFailResume !== true;
}

/**
 * @param {string} workspace
 * @param {string} roleFile
 * @param {{ rules: string[], appendOverlay: string }} context
 */
export function buildImplementAppendPath(workspace, roleFile, context) {
  const parts = [
    readFileSync(join(workspace, roleFile), "utf8"),
    "\n\n---\n\n# Injected factory context\n\n",
  ];
  for (const ruleRel of context.rules) {
    parts.push(`## ${ruleRel}\n\n`);
    parts.push(readFileSync(join(workspace, ruleRel), "utf8"));
    parts.push("\n\n");
  }
  if (typeof context.appendOverlay === "string" && context.appendOverlay.length > 0) {
    parts.push(context.appendOverlay);
    parts.push("\n");
  }
  const outPath = join(workspace, GENERATED_CONTEXT_REL);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, parts.join(""));
  return outPath;
}

/**
 * @param {string} workspace
 * @param {string[]} skillRels
 * @returns {string[]}
 */
export function resolveImplementSkillPaths(workspace, skillRels) {
  return skillRels.map((rel) => join(workspace, rel));
}
