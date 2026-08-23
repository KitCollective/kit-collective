/**
 * Pure helpers for the PR write-scope ratchet (KIT-39).
 * Imported by scripts/check-pr-write-scope.mjs and its unit tests.
 */

/** Documented ratchet-exception prefixes (hooks, rules). */
export const RATCHET_EXCEPTION_PREFIXES = [".cursor/hooks/", ".cursor/rules/"];

/** Exact paths exempt per docs/agents/write-scope.md. */
export const RATCHET_EXCEPTION_EXACT = [".cursor/hooks.json", "docs/agents/error-ratcheting.md"];

/**
 * Scripts that implement committed ratchets (see docs/agents/error-ratcheting.md).
 * Add a path when a new ratchet lands — do not use directory-wide script prefixes.
 */
export const RATCHET_SCRIPT_PATHS = new Set([
  "scripts/check-admin-design-tokens.mjs",
  "scripts/check-admin-stamdata-navigation.mjs",
  "scripts/check-import-boundaries.mjs",
  "scripts/check-mobile-design-tokens.mjs",
  "scripts/check-mobile-tab-bar.mjs",
  "scripts/check-pr-write-scope.mjs",
  "scripts/check-seed-fkapi-test-isolation.mjs",
  "scripts/check-seed-apify-test-database-isolation.mjs",
  "scripts/check-seed-development-proof-scripts.mjs",
  "scripts/check-seed-scope-isolation-test.mjs",
  "scripts/check-vision-log-save-action.mjs",
  "scripts/check-workflow-api-boot-env.mjs",
  "scripts/check-workflow-secrets.mjs",
  "scripts/lib/pr-write-scope.mjs",
  "scripts/lint-workflows.sh",
  "scripts/tests/check-mobile-tab-bar.test.mjs",
  "scripts/tests/check-mobile-design-tokens.test.mjs",
  "scripts/tests/check-pr-write-scope.test.mjs",
]);

export function matchesGlob(filePath, glob) {
  const regexSource = `^${glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\0")
    .replace(/\*/g, "[^/]*")
    .replace(/\0/g, ".*")}$`;
  return new RegExp(regexSource).test(filePath);
}

export function isRatchetException(filePath) {
  if (RATCHET_EXCEPTION_PREFIXES.some((prefix) => filePath.startsWith(prefix))) {
    return true;
  }
  if (RATCHET_EXCEPTION_EXACT.includes(filePath)) {
    return true;
  }
  if (filePath.startsWith(".github/workflows/")) {
    return true;
  }
  return RATCHET_SCRIPT_PATHS.has(filePath);
}

/** Write-scope is optional; only enforce when the PR declares globs. */
export function shouldEnforceWriteScope(globs) {
  return Array.isArray(globs) && globs.length > 0;
}

export function parseWriteScopeGlobs(text) {
  const match = text.match(/^write-scope:\s*(.+)$/m);
  if (!match) {
    return null;
  }
  return match[1]
    .split(",")
    .map((glob) => glob.trim())
    .filter(Boolean);
}

export function findWriteScopeViolations(changedFiles, globs) {
  const violations = [];
  for (const file of changedFiles) {
    if (isRatchetException(file)) {
      continue;
    }
    const inScope = globs.some((glob) => matchesGlob(file, glob));
    if (!inScope) {
      violations.push(file);
    }
  }
  return violations;
}
