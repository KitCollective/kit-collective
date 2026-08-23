#!/usr/bin/env node
/**
 * Ratchet (KIT-39): fail CI when admin.css invents typography, omits focus/scrim
 * tokens, or uses raw color literals outside :root token definitions.
 */
import { readFileSync } from "node:fs";

const cssPath = "apps/admin/src/styles/admin.css";
const source = readFileSync(cssPath, "utf8");
const violations = [];

const ALLOWED_TYPOGRAPHY = [
  { size: "22px", weight: "600", lineHeight: "28px", role: "type.title" },
  { size: "16px", weight: "400", lineHeight: "24px", role: "type.body" },
  { size: "16px", weight: "500", lineHeight: "20px", role: "type.label" },
  { size: "13px", weight: "400", lineHeight: "18px", role: "type.caption" },
];

function matchesAllowedTypography(size, weight, lineHeight) {
  return ALLOWED_TYPOGRAPHY.some(
    (entry) =>
      entry.size === size && entry.weight === weight && entry.lineHeight === lineHeight,
  );
}

if (!source.includes("--border-focus:")) {
  violations.push(`${cssPath}: missing --border-focus token in :root`);
}

if (!source.includes("--scrim:")) {
  violations.push(`${cssPath}: missing --scrim token in :root`);
}

if (!source.includes(":focus-visible") || !source.includes("var(--border-focus)")) {
  violations.push(
    `${cssPath}: missing :focus-visible rule referencing var(--border-focus)`,
  );
}

const rulePattern = /([^{]+)\{([^}]+)\}/g;
for (const match of source.matchAll(rulePattern)) {
  const selector = match[1].trim();
  const body = match[2];

  if (selector.startsWith(":root")) {
    continue;
  }

  const sizeMatch = body.match(/font-size:\s*([^;]+);/);
  if (!sizeMatch) {
    continue;
  }

  const size = sizeMatch[1].trim();
  const weightMatch = body.match(/font-weight:\s*([^;]+);/);
  const lineHeightMatch = body.match(/line-height:\s*([^;]+);/);

  if (!weightMatch || !lineHeightMatch) {
    violations.push(
      `${cssPath}: ${selector} sets font-size without explicit font-weight and line-height`,
    );
    continue;
  }

  const weight = weightMatch[1].trim();
  const lineHeight = lineHeightMatch[1].trim();

  if (!matchesAllowedTypography(size, weight, lineHeight)) {
    violations.push(
      `${cssPath}: ${selector} uses invented typography (${size}/${weight}/${lineHeight}) — must match a locked type.* role`,
    );
  }
}

const outsideRoot = source.replace(/:root\s*\{[^}]+\}/, "");
const rawRgb = [...outsideRoot.matchAll(/rgba?\([^)]+\)/g)];
for (const match of rawRgb) {
  violations.push(
    `${cssPath}: raw rgb/rgba "${match[0]}" outside :root — use a semantic token such as var(--scrim)`,
  );
}

if (violations.length > 0) {
  console.error("Admin design-token ratchet failed:\n");
  for (const violation of violations) {
    console.error(`  - ${violation}`);
  }
  process.exit(1);
}

console.log("Admin design-token check passed.");
