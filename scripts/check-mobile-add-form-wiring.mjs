#!/usr/bin/env node
/**
 * Ratchet (KIT-48): fail CI when a Sheet/form TextInput under apps/mobile/app/(capture)/**
 * is bound to local useState but never wired to capture-session mutate or save payload.
 * The capture flow moved out of (tabs)/add into the (capture) modal group (2026-09-05).
 * Confirm save, notes, exit, and upload picker now live in dedicated modules (2026-09-06).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ADD_DIR = "apps/mobile/app/(capture)";
const CONFIRM_PATH = `${ADD_DIR}/confirm.tsx`;
const CAPTURE_PATH = `${ADD_DIR}/capture.tsx`;
const SAVE_PATH = "apps/mobile/src/capture/saveConfirmJersey.ts";
const DETAILS_PATH = "apps/mobile/src/components/confirm-details-screen.tsx";
const DATA_PATH = "apps/mobile/src/components/confirm-data-screen.tsx";
const CONFIRM_EXIT_PATH = "apps/mobile/src/capture/use-confirm-exit.ts";
/** The Chooser is a Sheet now; Upload filer is presentation-gated, then pickUploadFiles. */
const CHOOSER_FLOW_PATH = "apps/mobile/src/capture/captureSourceFlow.ts";
const UPLOAD_CAPTURE_PATH = "apps/mobile/src/capture/uploadCaptureSession.ts";
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

function defaultAddSources() {
  const routeSources = listTsxFiles(ADD_DIR).map((filePath) => ({
    filePath,
    source: readFileSync(filePath, "utf8"),
  }));
  return [
    ...routeSources,
    { filePath: DETAILS_PATH, source: readFileSync(DETAILS_PATH, "utf8") },
    { filePath: DATA_PATH, source: readFileSync(DATA_PATH, "utf8") },
  ];
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
 * @param {{ saveSource: string, detailsSource: string }} input
 * @returns {string[]}
 */
export function findConfirmSaveViolations({ saveSource, detailsSource }) {
  const violations = [];

  if (!saveSource.includes("photo.source")) {
    violations.push(
      `${SAVE_PATH}: save payload must use per-photo photo.source instead of a single route-level default`,
    );
  }

  if (/\bdefaultPhotoSource\b/.test(saveSource)) {
    violations.push(
      `${SAVE_PATH}: must not infer one photoSource for every photo from route params`,
    );
  }

  if (!detailsSource.includes("setDraftNotes") || !detailsSource.includes("draft.notes")) {
    violations.push(
      `${DETAILS_PATH}: Flere detaljer notes must be stored on the capture-session draft via setDraftNotes/draft.notes`,
    );
  }

  return violations;
}

/**
 * @param {{ confirmSource: string, confirmExitSource: string }} input
 * @returns {string[]}
 */
export function findConfirmRedirectViolations({ confirmSource, confirmExitSource }) {
  const violations = [];

  if (!confirmSource.includes("useConfirmExit")) {
    violations.push(
      `${CONFIRM_PATH}: must delegate guarded session-loss redirects to useConfirmExit`,
    );
  }

  if (!confirmSource.includes("isSessionResolved")) {
    violations.push(
      `${CONFIRM_PATH}: must wait for usePersistedCaptureSession isSessionResolved before redirecting away`,
    );
  }

  if (!confirmExitSource.includes("shouldConfirmRedirectAway")) {
    violations.push(
      `${CONFIRM_EXIT_PATH}: must gate chooser redirect with shouldConfirmRedirectAway so mount does not race session load`,
    );
  }

  return violations;
}

/**
 * @param {{ chooserSource: string, uploadCaptureSource: string, pickUploadSource: string }} input
 * @returns {string[]}
 */
export function findUploadPickerViolations({
  chooserSource,
  uploadCaptureSource,
  pickUploadSource,
}) {
  const violations = [];

  if (chooserSource.includes("pickGalleryPhotos")) {
    violations.push(
      `${CHOOSER_FLOW_PATH}: Upload filer must use pickUploadFiles (Photos + Files/documents), not pickGalleryPhotos directly`,
    );
  }

  if (!uploadCaptureSource.includes("pickUploadFiles")) {
    violations.push(
      `${UPLOAD_CAPTURE_PATH}: presentation-gated Upload filer must call pickUploadFiles`,
    );
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
  addSources = defaultAddSources(),
  confirmSource = readFileSync(CONFIRM_PATH, "utf8"),
  confirmExitSource = readFileSync(CONFIRM_EXIT_PATH, "utf8"),
  saveSource = readFileSync(SAVE_PATH, "utf8"),
  detailsSource = readFileSync(DETAILS_PATH, "utf8"),
  chooserSource = readFileSync(CHOOSER_FLOW_PATH, "utf8"),
  uploadCaptureSource = readFileSync(UPLOAD_CAPTURE_PATH, "utf8"),
  captureSource = readFileSync(CAPTURE_PATH, "utf8"),
  pickUploadSource = readFileSync(PICK_UPLOAD_FILES_PATH, "utf8"),
} = {}) {
  const violations = [];

  for (const file of addSources) {
    violations.push(...findOrphanFormStateViolations(file));
  }

  violations.push(...findConfirmSaveViolations({ saveSource, detailsSource }));
  violations.push(...findConfirmRedirectViolations({ confirmSource, confirmExitSource }));
  violations.push(
    ...findUploadPickerViolations({ chooserSource, uploadCaptureSource, pickUploadSource }),
  );
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
