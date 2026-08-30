/**
 * PI implement context selector — hard first-run / checker-fail injection.
 * Maps slice signals to helpers, skills, and .cursor/rules for Pi --skill / append.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  extractIssueConstraints,
  extractIssuePaths,
  extractPriorFailLines,
  extractWorkpadCompositionPaths,
  formatSliceBrief,
} from "./first-pass.mjs";
import { formatHermesLessonsBrief, selectHermesLessons } from "./hermes-lessons.mjs";

export const UI_SURFACE_LABELS = ["mobile", "web", "admin"];
export const UI_WRITE_SCOPE_PREFIXES = ["apps/mobile", "apps/web", "apps/admin"];

export const GENERATED_CONTEXT_REL = ".pi/generated/implement-context.md";
export const GENERATED_APPEND_REL = ".pi/generated/implement-append.md";
export const GENERATED_SLIM_APPEND_REL = ".pi/generated/implement-slim-append.md";
export const GENERATED_CHECKER_APPEND_REL = ".pi/generated/checker-append.md";

export const ALWAYS_RULES = [
  ".cursor/rules/write-scope.mdc",
  ".cursor/rules/scope-signal-up.mdc",
  ".cursor/rules/secrets.mdc",
  ".cursor/rules/project.mdc",
  ".cursor/rules/orchestration.mdc",
  ".cursor/rules/pre-review-gate.mdc",
  ".cursor/rules/code-english.mdc",
];

export const ALWAYS_SKILLS = [
  ".cursor/skills/tdd/SKILL.md",
  ".cursor/skills/implement/SKILL.md",
  ".cursor/skills/signal-up/SKILL.md",
];

/** Component / pattern headings that may be excerpted from docs/design-system.md */
export const DESIGN_LOCK_HEADINGS = [
  "Button",
  "Button dock",
  "Icon button",
  "Search field",
  "Text field",
  "Select field",
  "Chip",
  "Jersey tile",
  "Mark",
  "Avatar",
  "Switch",
  "List row",
  "Photo slot",
  "Empty state",
  "Sheet",
  "Tab bar",
  "Thread row",
  "Activity card",
  "Chat bubble",
  "Bid card",
  "Message composer",
  "Banner",
  "Data table",
  "Top tabs",
  "Collection grid",
  "Collection shortcuts (genveje)",
  "Inbox",
  "Conversation",
  "Conversation details",
  "Own Profil",
  "Send bid",
  "Confirm and Save",
  "Capture session",
  "Admin shell",
  "Admin drill",
  "Typography",
];

export const MAX_DESIGN_LOCK_EXCERPT_CHARS = 14_000;

export const PI_SECRETS_OVERLAY = `# PI worker overlay (secrets)

- \`LINEAR_API_KEY\` in spawn env is remapped from \`LINEAR_CLI_API_KEY\` for the Linear CLI only.
- \`LINEAR_API_KEY\` from \`scripts/bootstrap-linear.mjs\` is never set on the worker — do not use it.
- Never log secrets, full cookies, or raw \`Authorization\` headers.
`;

export const PI_PRE_REVIEW_OVERLAY = `# PI worker overlay (pre-review)

- Full \`pnpm test\` graph runs on **GitHub Actions only** — not on this 4 GB / 8 GB worker.
- Gate typecheck of touched packages may be yellow; \`pnpm format:check\` / \`biome ci .\` is red.
- Do not sleep or poll GitHub. The harness waits for required checks before In Review.
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

  const nestByScope = scope.includes("apps/api");
  const nestByPath = /(?:^|[\s`"'(])apps\/api\//m.test(bodyText);
  if (nestByScope || nestByPath) {
    helpers.add("nest");
  }

  const drizzleByScope = scope.includes("packages/db");
  const drizzleByPath =
    /(?:^|[\s`"'(])packages\/db\//m.test(bodyText) ||
    /(?:^|[\s`"'(])packages\/db\/migrations\//m.test(bodyText);
  if (drizzleByScope || drizzleByPath) {
    helpers.add("drizzle");
  }

  if (/design-system|design lock|docs\/design-system\.md/i.test(bodyText)) {
    helpers.add("ui-ux");
  }

  return [...helpers].sort();
}

/**
 * @param {string} text
 * @returns {string[]}
 */
export function selectDesignLockHeadings(text = "") {
  const source = String(text);
  const lower = source.toLowerCase();
  /** @type {Set<string>} */
  const selected = new Set();
  for (const name of DESIGN_LOCK_HEADINGS) {
    if (lower.includes(name.toLowerCase())) {
      selected.add(name);
    }
  }
  return [...selected];
}

/**
 * @param {string} markdown
 * @param {string[]} headings
 * @param {number} [maxChars]
 */
export function excerptDesignLock(markdown, headings, maxChars = MAX_DESIGN_LOCK_EXCERPT_CHARS) {
  if (typeof markdown !== "string" || markdown.length === 0) {
    return "";
  }
  if (!Array.isArray(headings) || headings.length === 0) {
    return "";
  }
  const wanted = new Set(headings.map((heading) => heading.toLowerCase()));
  /** @type {string[]} */
  const parts = [];
  const lines = markdown.split("\n");
  let index = 0;
  while (index < lines.length) {
    const match = lines[index].match(/^### (.+)$/);
    if (!match) {
      index += 1;
      continue;
    }
    const title = match[1].trim();
    if (!wanted.has(title.toLowerCase())) {
      index += 1;
      continue;
    }
    const block = [lines[index]];
    index += 1;
    while (index < lines.length && !/^#{2,3} /.test(lines[index])) {
      block.push(lines[index]);
      index += 1;
    }
    parts.push(block.join("\n").trim());
  }
  let out = parts.join("\n\n");
  if (out.length > maxChars) {
    out = `${out.slice(0, maxChars).trimEnd()}\n…`;
  }
  return out;
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
 *   workpadBody?: string,
 *   hermesDir?: string,
 *   cheapRetry?: boolean,
 *   mergeFailResume?: boolean,
 *   slimOnly?: boolean,
 * }} input
 * @returns {{ requiredHelpers: string[], skills: string[], rules: string[], appendOverlay: string, designLockHeadings: string[], compositionHints: [], sliceBrief: string, hermesBrief: string, slimOnly: boolean }}
 */
export function selectImplementContext(input = {}) {
  const slimOnly = input.slimOnly === true;
  if (
    (input.cheapRetry === true || input.mergeFailResume === true) &&
    !slimOnly
  ) {
    return {
      requiredHelpers: [],
      skills: [],
      rules: [],
      appendOverlay: "",
      designLockHeadings: [],
      compositionHints: [],
      sliceBrief: "",
      hermesBrief: "",
      slimOnly: false,
    };
  }

  const writeScopeGlobs = parseWriteScopeGlobs(input.writeScope);
  const slice = {
    labels: input.labels ?? [],
    writeScopeGlobs,
    body: input.body ?? "",
  };
  const requiredHelpers = slimOnly ? [] : detectRequiredHelpers(slice);
  const skills = slimOnly ? [] : selectImplementSkills(requiredHelpers, slice);
  const rules = slimOnly ? [] : selectImplementRules(requiredHelpers, slice);
  const appendOverlay = slimOnly ? "" : buildImplementAppendOverlay();
  const ui = rules.includes(".cursor/rules/design-system.mdc");
  const workpadBody = typeof input.workpadBody === "string" ? input.workpadBody : "";
  const sliceText = `${slice.body}\n${input.reviewFeedback ?? ""}\n${workpadBody}`;
  const designLockHeadings = ui && !slimOnly ? selectDesignLockHeadings(sliceText) : [];
  const paths = [
    ...new Set([
      ...extractIssuePaths(sliceText),
      ...extractWorkpadCompositionPaths(workpadBody),
    ]),
  ].sort();
  const sliceBrief = formatSliceBrief({
    paths,
    constraints: slimOnly ? [] : extractIssueConstraints(slice.body ?? ""),
    priorFails: extractPriorFailLines(input.reviewFeedback ?? ""),
  });
  const hermesBrief = formatHermesLessonsBrief(
    selectHermesLessons({
      hermesDir: typeof input.hermesDir === "string" ? input.hermesDir : "",
      query: `${input.reviewFeedback ?? ""}\n${slice.body}`,
    }),
  );

  return {
    requiredHelpers,
    skills,
    rules,
    appendOverlay,
    designLockHeadings,
    compositionHints: [],
    sliceBrief,
    hermesBrief,
    slimOnly,
  };
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
 * Rules injected at runtime beyond the committed generated base (e.g. design-system for UI slices).
 *
 * @param {string[]} selectedRules
 * @returns {string[]}
 */
export function dynamicAppendRules(selectedRules = []) {
  const generatedBase = new Set(ALWAYS_RULES);
  return selectedRules.filter((ruleRel) => !generatedBase.has(ruleRel));
}

/**
 * @param {string} workspace
 * @param {string} roleFile
 * @param {{
 *   rules?: string[],
 *   appendOverlay?: string,
 *   designLockHeadings?: string[],
 *   sliceBrief?: string,
 *   hermesBrief?: string,
 *   slimOnly?: boolean,
 * }} context
 */
export function buildImplementAppendPath(workspace, roleFile, context) {
  if (context.slimOnly === true) {
    return buildImplementSlimAppendPath(workspace, roleFile, context);
  }
  const generatedPath = join(workspace, GENERATED_CONTEXT_REL);
  if (!existsSync(generatedPath)) {
    throw new Error(
      `Missing ${GENERATED_CONTEXT_REL}. Run node scripts/generate-pi-implement-context.mjs`,
    );
  }
  const parts = [
    readFileSync(join(workspace, roleFile), "utf8"),
    "\n\n---\n\n# Injected factory context\n\n",
    readFileSync(generatedPath, "utf8"),
    "\n",
  ];
  for (const ruleRel of dynamicAppendRules(context.rules ?? [])) {
    parts.push(`## ${ruleRel}\n\n`);
    parts.push(readFileSync(join(workspace, ruleRel), "utf8"));
    parts.push("\n\n");
  }
  const headings = Array.isArray(context.designLockHeadings) ? context.designLockHeadings : [];
  const lockPath = join(workspace, "docs/design-system.md");
  if (headings.length > 0 && existsSync(lockPath)) {
    const excerpt = excerptDesignLock(readFileSync(lockPath, "utf8"), headings);
    if (excerpt.length > 0) {
      parts.push("## Slice design lock (excerpt)\n\n");
      parts.push(
        "Do not read the full `docs/design-system.md` unless a named AC pattern is missing from this excerpt.\n\n",
      );
      parts.push(excerpt);
      parts.push("\n");
    }
  }
  const hintMarkdown =
    typeof context.sliceBrief === "string" && context.sliceBrief.length > 0
      ? context.sliceBrief
      : "";
  if (hintMarkdown.length > 0) {
    parts.push(hintMarkdown);
  }
  if (typeof context.hermesBrief === "string" && context.hermesBrief.length > 0) {
    parts.push(context.hermesBrief);
  }
  const outPath = join(workspace, GENERATED_APPEND_REL);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, parts.join(""));
  return outPath;
}

/**
 * Cheap / first-pass resume: role + prior fails + Hermes only (no full factory dump).
 *
 * @param {string} workspace
 * @param {string} roleFile
 * @param {{ sliceBrief?: string, hermesBrief?: string }} context
 */
export function buildImplementSlimAppendPath(workspace, roleFile, context) {
  const parts = [
    readFileSync(join(workspace, roleFile), "utf8"),
    "\n\n---\n\n# Slim resume context\n\n",
    "Fix the class in ### Review feedback. Do not re-map the repo.\n",
    "Do not read full `CONTEXT.md` — use the slice brief and Review feedback only.\n\n",
  ];
  if (typeof context.sliceBrief === "string" && context.sliceBrief.length > 0) {
    parts.push(context.sliceBrief);
  }
  if (typeof context.hermesBrief === "string" && context.hermesBrief.length > 0) {
    parts.push(context.hermesBrief);
  }
  const outPath = join(workspace, GENERATED_SLIM_APPEND_REL);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, parts.join(""));
  return outPath;
}

/**
 * @param {string} workspace
 * @param {string} roleFile
 * @param {string} registryMarkdown
 * @param {{ reviewBundle?: string }} [extras]
 */
export function buildCheckerAppendPath(workspace, roleFile, registryMarkdown = "", extras = {}) {
  const parts = [
    readFileSync(join(workspace, roleFile), "utf8"),
    "\n\n---\n\n# Injected first-pass registry\n\n",
    typeof registryMarkdown === "string" && registryMarkdown.length > 0
      ? registryMarkdown
      : "(empty registry)\n",
  ];
  if (typeof extras.reviewBundle === "string" && extras.reviewBundle.trim().length > 0) {
    parts.push("\n---\n\n");
    parts.push(extras.reviewBundle.trimEnd());
    parts.push("\n");
  }
  const outPath = join(workspace, GENERATED_CHECKER_APPEND_REL);
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

/**
 * All `.cursor` paths the harness may read from `/workspace` at runtime (--skill + append).
 * Used by Docker build-context ratchets; keep in sync with selectImplementSkills/Rules.
 *
 * @returns {{ skills: string[], rules: string[] }}
 */
export function harnessDockerCursorPaths() {
  /** @type {Set<string>} */
  const skills = new Set(ALWAYS_SKILLS);
  for (const helper of ["expo", "nest"]) {
    for (const skillRel of selectImplementSkills([helper])) {
      skills.add(skillRel);
    }
  }
  /** @type {Set<string>} */
  const rules = new Set();
  for (const ruleRel of dynamicAppendRules(
    selectImplementRules(["ui-ux"], {
      labels: ["mobile"],
      writeScopeGlobs: ["apps/mobile"],
    }),
  )) {
    rules.add(ruleRel);
  }
  return {
    skills: [...skills].sort(),
    rules: [...rules].sort(),
  };
}
