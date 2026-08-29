#!/usr/bin/env node
/**
 * CI ratchet: harness Docker build context must ship `.cursor` rules/skills the PI worker
 * reads at runtime (--skill paths and dynamic append rules such as design-system.mdc).
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { harnessDockerCursorPaths } from "../harness/implement-context.mjs";

const root = join(import.meta.dirname, "..");

export const REQUIRED_FILES = {
  dockerignore: ".dockerignore",
  dockerfile: "harness/Dockerfile",
  composeWorkerTest: "harness/tests/compose-worker.test.mjs",
};

/**
 * @param {Record<string, string>} sources
 * @returns {string[]}
 */
export function missingHarnessDockerCursorContextCoverage(sources) {
  const missing = [];
  const dockerignore = sources.dockerignore ?? "";
  const dockerfile = sources.dockerfile ?? "";
  const composeTest = sources.composeWorkerTest ?? "";

  if (!/!\.cursor\/rules\//.test(dockerignore) || !/!\.cursor\/rules\/\*\.mdc/.test(dockerignore)) {
    missing.push(".dockerignore re-includes .cursor/rules/*.mdc after .cursor/ exclusion");
  }
  if (
    !/!\.cursor\/skills\//.test(dockerignore) ||
    !/!\.cursor\/skills\/\*\*\/SKILL\.md/.test(dockerignore)
  ) {
    missing.push(".dockerignore re-includes .cursor/skills/**/SKILL.md");
  }
  const mdExclude = dockerignore.indexOf("**/*.md");
  const skillReinclude = dockerignore.lastIndexOf("!.cursor/skills/**/SKILL.md");
  if (mdExclude === -1 || skillReinclude <= mdExclude) {
    missing.push(".dockerignore re-includes skills after **/*.md exclusion");
  }

  if (!/COPY \.cursor\/rules /.test(dockerfile)) {
    missing.push("harness/Dockerfile COPY .cursor/rules into /workspace");
  }
  if (!/COPY \.cursor\/skills /.test(dockerfile)) {
    missing.push("harness/Dockerfile COPY .cursor/skills into /workspace");
  }

  if (!/harnessDockerCursorPaths/.test(composeTest)) {
    missing.push("compose-worker.test.mjs harnessDockerCursorPaths ratchet");
  }
  if (!/design-system\.mdc/.test(composeTest)) {
    missing.push("compose-worker.test.mjs design-system.mdc docker context ratchet");
  }

  return missing;
}

/**
 * @param {string} rootDir
 * @returns {string[]}
 */
export function missingHarnessDockerCursorPaths(rootDir) {
  const { skills, rules } = harnessDockerCursorPaths();
  const missing = [];
  for (const rel of [...skills, ...rules]) {
    if (!existsSync(join(rootDir, rel))) {
      missing.push(rel);
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
  const sources = {
    dockerignore: readFileSync(join(root, REQUIRED_FILES.dockerignore), "utf8"),
    dockerfile: readFileSync(join(root, REQUIRED_FILES.dockerfile), "utf8"),
    composeWorkerTest: readFileSync(join(root, REQUIRED_FILES.composeWorkerTest), "utf8"),
  };
  const coverageMissing = missingHarnessDockerCursorContextCoverage(sources);
  const pathMissing = missingHarnessDockerCursorPaths(root);
  if (coverageMissing.length > 0 || pathMissing.length > 0) {
    console.error("check-harness-docker-cursor-context: missing required coverage:");
    for (const item of coverageMissing) {
      console.error(`  - ${item}`);
    }
    for (const rel of pathMissing) {
      console.error(`  - missing repo file ${rel}`);
    }
    process.exit(1);
  }
  console.log("check-harness-docker-cursor-context: ok");
}
