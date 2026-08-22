#!/usr/bin/env node
/**
 * Ratchet (KIT-7): fail CI if a workflow step logs deploy webhook / bearer URLs
 * without GitHub Actions masking.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const workflowDir = ".github/workflows";
const violations = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      walk(path);
      continue;
    }
    if (!name.endsWith(".yml") && !name.endsWith(".yaml")) continue;
    checkFile(path);
  }
}

function checkFile(path) {
  const lines = readFileSync(path, "utf8").split("\n");
  let inRunBlock = false;
  let runIndent = 0;
  let stepHasMask = false;
  let stepLines = [];

  const flushStep = () => {
    if (!inRunBlock || stepLines.length === 0) return;
    const body = stepLines.join("\n");
    const echoesSecret =
      /echo\s+["'][^"']*(?:COOLIFY_DEPLOY_WEBHOOK|WEBHOOK|Bearer\s)/.test(body) ||
      /GITHUB_OUTPUT.*(?:webhook|WEBHOOK|COOLIFY_DEPLOY)/.test(body);
    if (echoesSecret && !stepHasMask && !/::add-mask::/.test(body)) {
      violations.push(
        `${path}: workflow step may log a deploy webhook or bearer credential without ::add-mask::`,
      );
    }
    stepLines = [];
    stepHasMask = false;
    inRunBlock = false;
  };

  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (/^\s*- name:/.test(line) || /^\s*- uses:/.test(line)) {
      flushStep();
      continue;
    }
    if (/^\s*run:\s*\|/.test(line) || /^\s*run:\s*$/.test(line)) {
      flushStep();
      inRunBlock = true;
      runIndent = line.search(/\S/);
      continue;
    }
    if (inRunBlock) {
      const indent = line.search(/\S/);
      if (trimmed !== "" && indent <= runIndent && !/^\s*run:/.test(line)) {
        flushStep();
        continue;
      }
      stepLines.push(trimmed);
      if (trimmed.includes("::add-mask::")) stepHasMask = true;
    }
  }
  flushStep();
}

walk(workflowDir);

if (violations.length > 0) {
  console.error("Workflow secret-logging ratchet failed:\n");
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}

console.log("Workflow secret-logging check passed.");
