#!/usr/bin/env node
/**
 * Ratchet (KIT-23): fail CI when a workflow boots the API Docker image without
 * required runtime env vars (BETTER_AUTH_SECRET, BETTER_AUTH_URL). Prevents
 * repeating deploy-api.yml smoke failures when IdentityModule requires Better
 * Auth names at Nest bootstrap.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const workflowDir = ".github/workflows";
const violations = [];

/** Env vars required when a workflow `docker run` starts the API image. */
const REQUIRED_DOCKER_ENV = ["BETTER_AUTH_SECRET", "BETTER_AUTH_URL"];

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
  const content = readFileSync(path, "utf8");
  const lines = content.split("\n");

  let inRunBlock = false;
  let runIndent = 0;
  let stepLines = [];

  const flushStep = () => {
    if (!inRunBlock || stepLines.length === 0) return;
    const body = stepLines.join("\n");
    if (!/docker\s+run/.test(body)) {
      stepLines = [];
      inRunBlock = false;
      return;
    }
    if (!/kit-api:|kit-deploy-api/.test(body)) {
      stepLines = [];
      inRunBlock = false;
      return;
    }

    // Image inspection steps use --entrypoint sh and do not boot Nest.
    if (/--entrypoint\s+sh/.test(body)) {
      stepLines = [];
      inRunBlock = false;
      return;
    }

    for (const envName of REQUIRED_DOCKER_ENV) {
      const hasEnv =
        new RegExp(`-e\\s+${envName}=`).test(body) ||
        new RegExp(`-e\\s+["']${envName}=`).test(body) ||
        new RegExp(`-e\\s+${envName}\\b`).test(body);
      if (!hasEnv) {
        violations.push(
          `${path}: docker run for API image missing required env ${envName} (Nest Identity boots via AppModule)`,
        );
      }
    }

    stepLines = [];
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
    }
  }
  flushStep();
}

walk(workflowDir);

if (violations.length > 0) {
  console.error("Workflow API boot env ratchet failed:\n");
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}

console.log("Workflow API boot env check passed.");
