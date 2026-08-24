#!/usr/bin/env node
/**
 * Ratchet (KIT-48): fail CI when Upload filer only opens the Photos library
 * and omits a Files/documents picker path.
 */
import { readFileSync } from "node:fs";

const CHOOSER_PATH = "apps/mobile/app/(tabs)/add/index.tsx";
const UPLOAD_FILES_PATH = "apps/mobile/src/capture/pickUploadFiles.ts";
const DOCUMENT_PICKER_PATH = "apps/mobile/src/capture/pickDocumentImages.ts";
const PACKAGE_JSON_PATH = "apps/mobile/package.json";
const UPLOAD_TEST_PATH = "apps/mobile/tests/pick-upload-files.test.ts";

/**
 * @param {{ chooserSource: string, uploadFilesSource: string, documentPickerSource: string, packageJsonSource: string, uploadTestSource: string }} input
 * @returns {string[]}
 */
export function checkMobileAddUploadFiles({
  chooserSource,
  uploadFilesSource,
  documentPickerSource,
  packageJsonSource,
  uploadTestSource,
}) {
  const violations = [];

  if (!chooserSource.includes("pickUploadFiles")) {
    violations.push(
      `${CHOOSER_PATH}: Upload filer must call pickUploadFiles, not pickGalleryPhotos directly`,
    );
  }

  if (/pickGalleryPhotos/.test(chooserSource) && !chooserSource.includes("pickUploadFiles")) {
    violations.push(
      `${CHOOSER_PATH}: Upload filer must not bypass pickUploadFiles for gallery-only selection`,
    );
  }

  if (!uploadFilesSource.includes("pickDocumentImages")) {
    violations.push(
      `${UPLOAD_FILES_PATH}: must route a Files/documents branch through pickDocumentImages`,
    );
  }

  if (!documentPickerSource.includes("expo-document-picker")) {
    violations.push(
      `${DOCUMENT_PICKER_PATH}: must use expo-document-picker for Files/documents selection`,
    );
  }

  if (!packageJsonSource.includes("expo-document-picker")) {
    violations.push(
      `${PACKAGE_JSON_PATH}: must declare expo-document-picker for Upload filer Files/documents path`,
    );
  }

  if (!uploadTestSource.includes("routes Filer to the document picker")) {
    violations.push(
      `${UPLOAD_TEST_PATH}: must regression-test the Files/documents upload branch`,
    );
  }

  return violations;
}

export function checkMobileAddUploadFilesFromDisk() {
  return checkMobileAddUploadFiles({
    chooserSource: readFileSync(CHOOSER_PATH, "utf8"),
    uploadFilesSource: readFileSync(UPLOAD_FILES_PATH, "utf8"),
    documentPickerSource: readFileSync(DOCUMENT_PICKER_PATH, "utf8"),
    packageJsonSource: readFileSync(PACKAGE_JSON_PATH, "utf8"),
    uploadTestSource: readFileSync(UPLOAD_TEST_PATH, "utf8"),
  });
}

function main() {
  const violations = checkMobileAddUploadFilesFromDisk();
  if (violations.length > 0) {
    console.error("Mobile add upload-files ratchet failed:\n");
    for (const violation of violations) {
      console.error(`  - ${violation}`);
    }
    process.exit(1);
  }

  console.log("Mobile add upload-files check passed.");
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  main();
}
