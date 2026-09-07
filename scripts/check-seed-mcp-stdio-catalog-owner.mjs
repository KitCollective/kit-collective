#!/usr/bin/env node
/**
 * CI ratchet (KIT-233): stdio Seed MCP catalog has one owner test.
 * Prevents repeating the duplicate-stdio-catalog checker fail
 * (`server.test.ts` owns `seed_apify`/`seed_fk`; HTTP tests must not re-prove it).
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const TESTS_DIR = "seed/mcp/tests";
const OWNER_REL = `${TESTS_DIR}/server.test.ts`;

const STDIO_CATALOG_ASSERT =
  /SEED_MCP_TOOL_NAMES\s*\)\s*\.to(?:Strict)?Equal\(\s*\[\s*["']seed_apify["']\s*,\s*["']seed_fk["']\s*\]\s*\)/g;

/**
 * @param {string} source
 * @returns {number}
 */
export function countStdioCatalogAsserts(source) {
  return [...source.matchAll(STDIO_CATALOG_ASSERT)].length;
}

/**
 * @param {{ testFileContents: Record<string, string> }} input
 * @returns {string[]}
 */
export function findSeedMcpStdioCatalogOwnerViolations({ testFileContents }) {
  const violations = [];
  const ownerSource = testFileContents[OWNER_REL] ?? "";
  const ownerCount = countStdioCatalogAsserts(ownerSource);

  if (ownerCount !== 1) {
    violations.push(
      `${OWNER_REL}: must pin SEED_MCP_TOOL_NAMES to ["seed_apify", "seed_fk"] exactly once (found ${ownerCount})`,
    );
  }

  for (const [rel, source] of Object.entries(testFileContents)) {
    if (rel === OWNER_REL) {
      continue;
    }
    const count = countStdioCatalogAsserts(source);
    if (count > 0) {
      violations.push(
        `${rel}: must not re-assert the stdio catalog; ${OWNER_REL} already owns seed_apify/seed_fk`,
      );
    }
  }

  return violations;
}

/**
 * @param {string} dir
 * @param {string} prefix
 * @returns {string[]}
 */
function listTestFiles(dir, prefix) {
  const names = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of names) {
    const rel = `${prefix}/${entry.name}`;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listTestFiles(abs, rel));
      continue;
    }
    if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.mjs")) {
      files.push(rel);
    }
  }
  return files;
}

function readRepoSnapshot() {
  const absTests = path.join(ROOT, TESTS_DIR);
  /** @type {Record<string, string>} */
  const testFileContents = {};
  for (const rel of listTestFiles(absTests, TESTS_DIR)) {
    testFileContents[rel] = readFileSync(path.join(ROOT, rel), "utf8");
  }
  return { testFileContents };
}

function main() {
  const violations = findSeedMcpStdioCatalogOwnerViolations(readRepoSnapshot());
  if (violations.length > 0) {
    console.error("check-seed-mcp-stdio-catalog-owner:");
    for (const violation of violations) {
      console.error(`  - ${violation}`);
    }
    process.exit(1);
  }
  console.log("check-seed-mcp-stdio-catalog-owner: ok");
}

const isDirectRun =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main();
}
