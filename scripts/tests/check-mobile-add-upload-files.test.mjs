import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkMobileAddUploadFiles } from "../check-mobile-add-upload-files.mjs";

const compliantChooser = `
import { pickUploadFiles } from "@/capture/pickUploadFiles";
const uris = await pickUploadFiles({ allowsMultipleSelection: true });
`;

const compliantUploadFiles = `
import { pickDocumentImages } from "./pickDocumentImages";
return pickDocumentImages({ multiple: true });
`;

const compliantDocumentPicker = `
import * as DocumentPicker from "expo-document-picker";
`;

const compliantPackageJson = `"expo-document-picker": "~13.0.3"`;

const compliantUploadTest = `
it("routes Filer to the document picker on iOS", () => {});
`;

describe("checkMobileAddUploadFiles", () => {
  it("passes compliant upload-files wiring", () => {
    assert.deepEqual(
      checkMobileAddUploadFiles({
        chooserSource: compliantChooser,
        uploadFilesSource: compliantUploadFiles,
        documentPickerSource: compliantDocumentPicker,
        packageJsonSource: compliantPackageJson,
        uploadTestSource: compliantUploadTest,
      }),
      [],
    );
  });

  it("fails when chooser bypasses pickUploadFiles", () => {
    const violations = checkMobileAddUploadFiles({
      chooserSource: `
        import { pickGalleryPhotos } from "@/capture/pickGalleryPhotos";
        const uris = await pickGalleryPhotos();
      `,
      uploadFilesSource: compliantUploadFiles,
      documentPickerSource: compliantDocumentPicker,
      packageJsonSource: compliantPackageJson,
      uploadTestSource: compliantUploadTest,
    });

    assert.ok(violations.some((line) => line.includes("pickUploadFiles")));
  });

  it("fails when upload files omits document picker branch", () => {
    const violations = checkMobileAddUploadFiles({
      chooserSource: compliantChooser,
      uploadFilesSource: `return pickGalleryPhotos();`,
      documentPickerSource: compliantDocumentPicker,
      packageJsonSource: compliantPackageJson,
      uploadTestSource: compliantUploadTest,
    });

    assert.ok(violations.some((line) => line.includes("pickDocumentImages")));
  });
});
