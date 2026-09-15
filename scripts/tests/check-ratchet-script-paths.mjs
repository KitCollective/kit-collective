#!/usr/bin/env node
/**
 * KIT-98: every committed check ratchet must appear in RATCHET_SCRIPT_PATHS so
 * implement-exit and PR write-scope agree with CI (KIT-118 class).
 */
import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RATCHET_SCRIPT_PATHS } from "../lib/pr-write-scope.mjs";

/** @param {string} root */
export function listCommittedCheckRatchetPaths(root) {
  /** @type {string[]} */
  const paths = [];
  for (const name of readdirSync(join(root, "scripts"))) {
    if (/^check-[^/]+\.mjs$/.test(name)) {
      paths.push(`scripts/${name}`);
    }
  }
  for (const name of readdirSync(join(root, "scripts/tests"))) {
    if (/^check-[^/]+\.(test\.)?mjs$/.test(name)) {
      paths.push(`scripts/tests/${name}`);
    }
  }
  return paths.sort();
}

/**
 * @param {string} root
 * @returns {string[]}
 */
export function missingRatchetScriptPaths(root) {
  const missing = [];
  for (const path of listCommittedCheckRatchetPaths(root)) {
    if (!RATCHET_SCRIPT_PATHS.has(path)) {
      missing.push(path);
    }
  }
  return missing;
}

function isCli() {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  return resolve(entry) === fileURLToPath(import.meta.url);
}

if (isCli()) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const missing = missingRatchetScriptPaths(root);
  if (missing.length > 0) {
    console.error("check-ratchet-script-paths: add these paths to RATCHET_SCRIPT_PATHS:");
    for (const path of missing) {
      console.error(`  - ${path}`);
    }
    process.exit(1);
  }
}
