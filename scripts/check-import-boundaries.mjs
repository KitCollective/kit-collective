#!/usr/bin/env node
/**
 * Static import boundary check for CI.
 * - Client apps must not import @kit/db, packages/db, or apps/api
 * - apps/api must not import seed/ or @kit/seed-*
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function collectSourceFiles(dir) {
  try {
    statSync(dir);
  } catch {
    return [];
  }

  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      files.push(...collectSourceFiles(full));
    } else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function findViolations(files, patterns) {
  const violations = [];
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    for (const pattern of patterns) {
      if (pattern.test(content)) {
        violations.push(`${file}: ${pattern}`);
      }
    }
  }
  return violations;
}

const clientApps = ["apps/mobile", "apps/web", "apps/admin"].map((p) => path.join(ROOT, p));
const clientFiles = clientApps.flatMap((dir) => collectSourceFiles(dir));
const clientViolations = findViolations(clientFiles, [
  /@kit\/db/,
  /packages\/db/,
  /from ['"]@kit\/api/,
  /from ['"]apps\/api/,
  /from ['"]\.\.\/\.\.\/api/,
]);

const apiFiles = collectSourceFiles(path.join(ROOT, "apps/api"));
const apiViolations = findViolations(apiFiles, [
  /from ['"]seed\//,
  /import ['"]seed\//,
  /from ['"]@kit\/seed-/,
  /import ['"]@kit\/seed-/,
]);

const seedFiles = collectSourceFiles(path.join(ROOT, "seed/fkapi"));
const seedViolations = findViolations(seedFiles, [
  /from ['"]@kit\/db/,
  /import ['"]@kit\/db/,
  /from ['"]packages\/db/,
  /import ['"]packages\/db/,
]);

const all = [...clientViolations, ...apiViolations, ...seedViolations];
if (all.length > 0) {
  console.error("Import boundary violations:");
  for (const v of all) console.error(v);
  process.exit(1);
}

console.log("Import boundaries OK");
