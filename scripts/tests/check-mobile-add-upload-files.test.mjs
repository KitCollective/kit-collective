import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkMobileAddUploadFiles } from "../check-mobile-add-upload-files.mjs";

const compliantSourceFlow = `
router.push({ pathname: "/(capture)/loading" });
`;

const compliantUploadCapture = `
import { pickUploadFiles } from "./pickUploadFiles";
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
        sourceFlowSource: compliantSourceFlow,
        uploadCaptureSource: compliantUploadCapture,
        uploadFilesSource: compliantUploadFiles,
        documentPickerSource: compliantDocumentPicker,
        packageJsonSource: compliantPackageJson,
        uploadTestSource: compliantUploadTest,
      }),
      [],
    );
  });

  it("fails when source flow bypasses the loading route", () => {
    const violations = checkMobileAddUploadFiles({
      sourceFlowSource: `
        import { pickGalleryPhotos } from "@/capture/pickGalleryPhotos";
        const uris = await pickGalleryPhotos();
      `,
      uploadCaptureSource: compliantUploadCapture,
      uploadFilesSource: compliantUploadFiles,
      documentPickerSource: compliantDocumentPicker,
      packageJsonSource: compliantPackageJson,
      uploadTestSource: compliantUploadTest,
    });

    assert.ok(violations.some((line) => line.includes("loading")));
  });

  it("fails when the presentation-gated upload omits pickUploadFiles", () => {
    const violations = checkMobileAddUploadFiles({
      sourceFlowSource: compliantSourceFlow,
      uploadCaptureSource: "return pickGalleryPhotos();",
      uploadFilesSource: compliantUploadFiles,
      documentPickerSource: compliantDocumentPicker,
      packageJsonSource: compliantPackageJson,
      uploadTestSource: compliantUploadTest,
    });

    assert.ok(violations.some((line) => line.includes("pickUploadFiles")));
  });

  it("fails when upload files omits document picker branch", () => {
    const violations = checkMobileAddUploadFiles({
      sourceFlowSource: compliantSourceFlow,
      uploadCaptureSource: compliantUploadCapture,
      uploadFilesSource: `return pickGalleryPhotos();`,
      documentPickerSource: compliantDocumentPicker,
      packageJsonSource: compliantPackageJson,
      uploadTestSource: compliantUploadTest,
    });

    assert.ok(violations.some((line) => line.includes("pickDocumentImages")));
  });
});
