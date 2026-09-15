#!/usr/bin/env node
/**
 * KIT-81 / KIT-98: factory lock prose and example config must match Merging land
 * policy and PI-worker runtime (not Cloud Agents / Linear MCP on the box).
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const FACTORY_LOCK_PATHS = {
  orchestration: ".cursor/rules/orchestration.mdc",
  exampleConfig: "factory.config.example.json",
  context: "CONTEXT.md",
  ciWorkflow: ".github/workflows/ci.yml",
};

/**
 * @param {Record<string, string>} files
 * @returns {string[]}
 */
export function factoryLockViolations(files) {
  /** @type {string[]} */
  const violations = [];

  const orchestration = files[FACTORY_LOCK_PATHS.orchestration];
  if (typeof orchestration === "string") {
    if (/Done.*merge approval|merge approval.*\*\*Done\*\*/i.test(orchestration)) {
      violations.push(`${FACTORY_LOCK_PATHS.orchestration}: treats Done as merge approval`);
    }
    if (!/moving the issue to `Merging` is merge approval/i.test(orchestration)) {
      violations.push(`${FACTORY_LOCK_PATHS.orchestration}: missing Merging as merge approval`);
    }
    if (!/PI worker/.test(orchestration) || !/Compose/.test(orchestration)) {
      violations.push(`${FACTORY_LOCK_PATHS.orchestration}: missing PI worker runtime lock`);
    }
    if (
      /Cloud Agents as dispatch/i.test(orchestration) &&
      !/Do not treat Cursor Cloud Agents as dispatch/.test(orchestration)
    ) {
      violations.push(`${FACTORY_LOCK_PATHS.orchestration}: treats Cloud Agents as dispatch`);
    }
    if (/Linear MCP is not installed on the box/.test(orchestration) === false) {
      violations.push(`${FACTORY_LOCK_PATHS.orchestration}: missing Linear MCP off-box lock`);
    }
  }

  const exampleConfig = files[FACTORY_LOCK_PATHS.exampleConfig];
  if (typeof exampleConfig === "string") {
    try {
      const config = JSON.parse(exampleConfig);
      const states = Array.isArray(config.states) ? config.states : [];
      const names = states.map((state) => state.name);
      const merging = states.find((state) => state.name === "Merging");
      if (!merging) {
        violations.push(`${FACTORY_LOCK_PATHS.exampleConfig}: missing Merging state`);
      } else if (merging.type !== "started") {
        violations.push(`${FACTORY_LOCK_PATHS.exampleConfig}: Merging must be type started`);
      }
      const readyIdx = names.indexOf("Ready for merge");
      const mergingIdx = names.indexOf("Merging");
      const doneIdx = names.indexOf("Done");
      if (readyIdx !== -1 && mergingIdx !== -1 && doneIdx !== -1) {
        if (!(readyIdx < mergingIdx && mergingIdx < doneIdx)) {
          violations.push(
            `${FACTORY_LOCK_PATHS.exampleConfig}: Merging must sit between Ready for merge and Done`,
          );
        }
      }
    } catch {
      violations.push(`${FACTORY_LOCK_PATHS.exampleConfig}: invalid JSON`);
    }
  }

  const context = files[FACTORY_LOCK_PATHS.context];
  if (typeof context === "string") {
    if (!/PI worker: Compose \+ `gh` \+ Linear CLI/.test(context)) {
      violations.push(`${FACTORY_LOCK_PATHS.context}: missing PI worker runtime block`);
    }
    if (
      /Cursor Cloud Agents as dispatch/i.test(context) &&
      !/_Avoid_.*Cloud Agents as dispatch/.test(context)
    ) {
      violations.push(`${FACTORY_LOCK_PATHS.context}: treats Cloud Agents as dispatch`);
    }
  }

  const ci = files[FACTORY_LOCK_PATHS.ciWorkflow];
  if (typeof ci === "string" && !ci.includes("scripts/tests/check-factory-locks")) {
    violations.push(`${FACTORY_LOCK_PATHS.ciWorkflow}: test job missing check-factory-locks`);
  }

  return violations;
}

/**
 * @param {string} [root]
 * @returns {Record<string, string>}
 */
export function readFactoryLockFiles(root = ".") {
  /** @type {Record<string, string>} */
  const files = {};
  for (const path of Object.values(FACTORY_LOCK_PATHS)) {
    files[path] = readFileSync(join(root, path), "utf8");
  }
  return files;
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
  const violations = factoryLockViolations(readFactoryLockFiles(root));
  if (violations.length > 0) {
    console.error("check-factory-locks: factory lock drift:");
    for (const item of violations) {
      console.error(`  - ${item}`);
    }
    process.exit(1);
  }
}
