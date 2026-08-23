#!/usr/bin/env node
/**
 * Ratchet (KIT-39): fail CI when admin.css invents typography, omits focus/scrim
 * tokens, uses raw color literals outside :root, or misses locked spacing/radius roles.
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

const DEFAULT_TYPOGRAPHY = { size: "16px", weight: "400", lineHeight: "24px" };

function matchesAllowedTypography(size, weight, lineHeight) {
  return ALLOWED_TYPOGRAPHY.some(
    (entry) => entry.size === size && entry.weight === weight && entry.lineHeight === lineHeight,
  );
}

function parseRules(css) {
  const rules = [];
  const rulePattern = /([^{]+)\{([^}]+)\}/g;
  for (const match of css.matchAll(rulePattern)) {
    rules.push({ selector: match[1].trim(), body: match[2] });
  }
  return rules;
}

if (!source.includes("--border-focus:")) {
  violations.push(`${cssPath}: missing --border-focus token in :root`);
}

if (!source.includes("--scrim:")) {
  violations.push(`${cssPath}: missing --scrim token in :root`);
}

if (!source.includes(":focus-visible") || !source.includes("var(--border-focus)")) {
  violations.push(`${cssPath}: missing :focus-visible rule referencing var(--border-focus)`);
}

const rules = parseRules(source);
const inheritedTypography = { ...DEFAULT_TYPOGRAPHY };

for (const rule of rules) {
  if (rule.selector.startsWith(":root")) {
    continue;
  }

  if (rule.selector === "body") {
    const sizeMatch = rule.body.match(/font-size:\s*([^;]+);/);
    const weightMatch = rule.body.match(/font-weight:\s*([^;]+);/);
    const lineHeightMatch = rule.body.match(/line-height:\s*([^;]+);/);
    if (sizeMatch) {
      inheritedTypography.size = sizeMatch[1].trim();
    }
    if (weightMatch) {
      inheritedTypography.weight = weightMatch[1].trim();
    }
    if (lineHeightMatch) {
      inheritedTypography.lineHeight = lineHeightMatch[1].trim();
    }
  }
}

for (const rule of rules) {
  const { selector, body } = rule;

  if (selector.startsWith(":root")) {
    continue;
  }

  const sizeMatch = body.match(/font-size:\s*([^;]+);/);
  const weightMatch = body.match(/font-weight:\s*([^;]+);/);
  const lineHeightMatch = body.match(/line-height:\s*([^;]+);/);

  const hasTypography = Boolean(sizeMatch) || Boolean(weightMatch) || Boolean(lineHeightMatch);

  if (!hasTypography) {
    continue;
  }

  const size = sizeMatch ? sizeMatch[1].trim() : inheritedTypography.size;
  const weight = weightMatch ? weightMatch[1].trim() : inheritedTypography.weight;
  const lineHeight = lineHeightMatch ? lineHeightMatch[1].trim() : inheritedTypography.lineHeight;

  if (!matchesAllowedTypography(size, weight, lineHeight)) {
    violations.push(
      `${cssPath}: ${selector} uses invented typography (${size}/${weight}/${lineHeight}) — must match a locked type.* role`,
    );
  }
}

const activeTopTabRule = rules.find((rule) =>
  rule.selector.includes('.top-tab[aria-current="page"]'),
);
if (activeTopTabRule) {
  if (!activeTopTabRule.body.includes("border-bottom-color: var(--fill-primary)")) {
    violations.push(
      `${cssPath}: .top-tab[aria-current="page"] must use border-bottom-color: var(--fill-primary) for the active underline`,
    );
  }
}

const loginCardRule = rules.find((rule) => rule.selector === ".login-card");
const loginFieldInputRule = rules.find((rule) => rule.selector === ".login-card .field input");
if (loginCardRule?.body.includes("border-radius: var(--radius-md)") && loginFieldInputRule) {
  if (!loginFieldInputRule.body.includes("border-radius: var(--radius-sm)")) {
    violations.push(
      `${cssPath}: .login-card .field input must use border-radius: var(--radius-sm) (nested radius shrinks one step from card radius.md)`,
    );
  }
}

const chipRule = rules.find((rule) => rule.selector === ".chip");
if (chipRule && !chipRule.body.includes("padding: 0 var(--space-inset-sm)")) {
  violations.push(
    `${cssPath}: .chip must use padding: 0 var(--space-inset-sm) per space.inset.sm chip role`,
  );
}

const drillPageRule = rules.find((rule) => rule.selector === ".drill-page");
if (drillPageRule?.body.includes("max-width: 960px")) {
  violations.push(
    `${cssPath}: .drill-page must not cap content to the Astro 960px column — admin drill is full width`,
  );
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
