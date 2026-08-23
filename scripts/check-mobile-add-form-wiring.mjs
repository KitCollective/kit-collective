#!/usr/bin/env node
/**
 * Ratchet (KIT-48): fail CI when a Sheet/form TextInput under apps/mobile/app/(tabs)/add/**
 * is bound to local useState but never wired to capture-session mutate or save payload.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ADD_DIR = "apps/mobile/app/(tabs)/add";
const CONFIRM_PATH = `${ADD_DIR}/confirm.tsx`;

function listTsxFiles(dir) {
  const entries = readdirSync(dir);
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...listTsxFiles(fullPath));
      continue;
    }
    if (fullPath.endsWith(".tsx")) {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * @param {{ filePath: string, source: string }} input
 * @returns {string[]}
 */
export function findOrphanFormStateViolations({ filePath, source }) {
  const violations = [];
  const useStateVars = new Set(
    [...source.matchAll(/const\s+\[(\w+)\s*,\s*set\w+\]\s*=\s*useState/g)].map(
      (match) => match[1],
    ),
  );

  for (const match of source.matchAll(/<TextInput[\s\S]*?value=\{(\w+)\}/g)) {
    const varName = match[1];
    if (!useStateVars.has(varName)) {
      continue;
    }

    const wired =
      source.includes(`setDraft${varName.charAt(0).toUpperCase()}${varName.slice(1)}`) ||
      source.includes(`draft.${varName}`) ||
      new RegExp(`mutate\\([\\s\\S]*${varName}`).test(source) ||
      new RegExp(`saveUserJersey\\([\\s\\S]*${varName}`).test(source);

    if (!wired) {
      violations.push(
        `${filePath}: TextInput value={${varName}} uses local useState but is not wired to capture-session mutate/save`,
      );
    }
  }

  return violations;
}

/**
 * @param {{ confirmSource: string }} input
 * @returns {string[]}
 */
export function findConfirmSaveViolations({ confirmSource }) {
  const violations = [];

  if (!confirmSource.includes("photo.source")) {
    violations.push(
      `${CONFIRM_PATH}: save payload must use per-photo photo.source instead of a single route-level default`,
    );
  }

  if (/\bdefaultPhotoSource\b/.test(confirmSource)) {
    violations.push(`${CONFIRM_PATH}: must not infer one photoSource for every photo from route params`);
  }

  if (!confirmSource.includes("setDraftNotes") || !confirmSource.includes("draft.notes")) {
    violations.push(
      `${CONFIRM_PATH}: Flere detaljer notes must be stored on the capture-session draft via setDraftNotes/draft.notes`,
    );
  }

  return violations;
}

export function checkMobileAddFormWiring({
  addSources = listTsxFiles(ADD_DIR).map((filePath) => ({
    filePath,
    source: readFileSync(filePath, "utf8"),
  })),
  confirmSource = readFileSync(CONFIRM_PATH, "utf8"),
} = {}) {
  const violations = [];

  for (const file of addSources) {
    violations.push(...findOrphanFormStateViolations(file));
  }

  violations.push(...findConfirmSaveViolations({ confirmSource }));

  return violations;
}

function main() {
  const violations = checkMobileAddFormWiring();
  if (violations.length > 0) {
    console.error("Mobile add form-wiring ratchet failed:\n");
    for (const violation of violations) {
      console.error(`  - ${violation}`);
    }
    process.exit(1);
  }

  console.log("Mobile add form-wiring check passed.");
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  main();
}
