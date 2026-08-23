/**
 * Pure helpers for the PR write-scope ratchet (KIT-39).
 * Imported by scripts/check-pr-write-scope.mjs and its unit tests.
 */

export const RATCHET_EXCEPTION_PREFIXES = [
  ".cursor/hooks/",
  ".cursor/hooks.json",
  ".cursor/rules/",
  "docs/agents/error-ratcheting.md",
  "scripts/check-",
  "scripts/lib/",
  "scripts/tests/",
];

export function matchesGlob(filePath, glob) {
  const regexSource = `^${glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\0")
    .replace(/\*/g, "[^/]*")
    .replace(/\0/g, ".*")}$`;
  return new RegExp(regexSource).test(filePath);
}

export function isRatchetException(filePath) {
  return RATCHET_EXCEPTION_PREFIXES.some((prefix) => filePath.startsWith(prefix));
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
