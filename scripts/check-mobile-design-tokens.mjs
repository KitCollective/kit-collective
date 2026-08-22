#!/usr/bin/env node
/**
 * Ratchet (KIT-24): fail CI when mobile components invent raw hex/rgba colors
 * instead of semantic tokens from apps/mobile/src/theme/tokens.ts.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const mobileRoot = "apps/mobile";
const tokenFile = "apps/mobile/src/theme/tokens.ts";
const hexPattern = /#[0-9A-Fa-f]{3,8}\b/g;
const rgbPattern = /rgba?\([^)]+\)/g;

const violations = [];

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }

    if (!/\.(tsx|ts)$/.test(entry.name)) continue;
    if (fullPath === tokenFile) continue;

    const source = readFileSync(fullPath, "utf8");
    const rel = relative(process.cwd(), fullPath);

    for (const match of source.matchAll(hexPattern)) {
      violations.push(`${rel}: raw hex color "${match[0]}" — use semantic tokens from theme/tokens.ts`);
    }

    for (const match of source.matchAll(rgbPattern)) {
      violations.push(`${rel}: raw rgb/rgba color "${match[0]}" — use semantic tokens from theme/tokens.ts`);
    }
  }
}

walk(mobileRoot);

if (violations.length > 0) {
  console.error("Mobile design-token ratchet failed:\n");
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}

console.log("Mobile design-token check passed.");
