#!/usr/bin/env node
/**
 * Ratchet (KIT-48): fail CI when a Sheet/form TextInput under apps/mobile/app/(capture)/**
 * is bound to local useState but never wired to capture-session mutate or save payload.
 * The capture flow moved out of (tabs)/add into the (capture) modal group (2026-09-05).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ADD_DIR = "apps/mobile/app/(capture)";
const CONFIRM_PATH = `${ADD_DIR}/confirm.tsx`;
const CAPTURE_PATH = `${ADD_DIR}/capture.tsx`;
/** The Chooser is a Sheet now, so Upload filer is wired here instead of add/index.tsx. */
const CHOOSER_FLOW_PATH = "apps/mobile/src/capture/captureSourceFlow.ts";
const PICK_UPLOAD_FILES_PATH = "apps/mobile/src/capture/pickUploadFiles.ts";

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
    [...source.matchAll(/const\s+\[(\w+)\s*,\s*set\w+\]\s*=\s*useState/g)].map((match) => match[1]),
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
    violations.push(
      `${CONFIRM_PATH}: must not infer one photoSource for every photo from route params`,
    );
  }

  if (!confirmSource.includes("setDraftNotes") || !confirmSource.includes("draft.notes")) {
    violations.push(
      `${CONFIRM_PATH}: Flere detaljer notes must be stored on the capture-session draft via setDraftNotes/draft.notes`,
    );
  }

  return violations;
}

/**
 * @param {{ confirmSource: string }} input
 * @returns {string[]}
 */
export function findConfirmRedirectViolations({ confirmSource }) {
  const violations = [];

  if (!confirmSource.includes("shouldConfirmRedirectAway")) {
    violations.push(
      `${CONFIRM_PATH}: must gate chooser redirect with shouldConfirmRedirectAway so mount does not race session load`,
    );
  }

  if (!confirmSource.includes("isSessionResolved")) {
    violations.push(
      `${CONFIRM_PATH}: must wait for usePersistedCaptureSession isSessionResolved before redirecting away`,
    );
  }

  return violations;
}

/**
 * @param {{ chooserSource: string, pickUploadSource: string }} input
 * @returns {string[]}
 */
export function findUploadPickerViolations({ chooserSource, pickUploadSource }) {
  const violations = [];

  if (chooserSource.includes("pickGalleryPhotos")) {
    violations.push(
      `${CHOOSER_FLOW_PATH}: Upload filer must use pickUploadFiles (Photos + Files/documents), not pickGalleryPhotos directly`,
    );
  }

  if (!chooserSource.includes("pickUploadFiles")) {
    violations.push(`${CHOOSER_FLOW_PATH}: Upload filer must call pickUploadFiles`);
  }

  if (
    !pickUploadSource.includes("pickDocumentImages") &&
    !pickUploadSource.includes("expo-document-picker")
  ) {
    violations.push(
      `${PICK_UPLOAD_FILES_PATH}: Upload filer must include a Files/documents picker path`,
    );
  }

  return violations;
}

/**
 * @param {{ captureSource: string }} input
 * @returns {string[]}
 */
export function findGalleryEscapeViolations({ captureSource }) {
  const violations = [];

  if (!captureSource.includes("mergeGalleryEscapePhotos")) {
    violations.push(
      `${CAPTURE_PATH}: gallery escape must merge into in-progress camera photos via mergeGalleryEscapePhotos`,
    );
  }

  if (!captureSource.includes("existingPhotos")) {
    violations.push(
      `${CAPTURE_PATH}: gallery escape must receive existing camera photos from CaptureCameraSession`,
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
  chooserSource = readFileSync(CHOOSER_FLOW_PATH, "utf8"),
  captureSource = readFileSync(CAPTURE_PATH, "utf8"),
  pickUploadSource = readFileSync(PICK_UPLOAD_FILES_PATH, "utf8"),
} = {}) {
  const violations = [];

  for (const file of addSources) {
    violations.push(...findOrphanFormStateViolations(file));
  }

  violations.push(...findConfirmSaveViolations({ confirmSource }));
  violations.push(...findConfirmRedirectViolations({ confirmSource }));
  violations.push(...findUploadPickerViolations({ chooserSource, pickUploadSource }));
  violations.push(...findGalleryEscapeViolations({ captureSource }));

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
