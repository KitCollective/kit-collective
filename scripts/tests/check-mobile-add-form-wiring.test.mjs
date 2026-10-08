import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkMobileAddFormWiring,
  findConfirmRedirectViolations,
  findConfirmSaveViolations,
  findGalleryEscapeViolations,
  findOrphanFormStateViolations,
  findUploadPickerViolations,
} from "../check-mobile-add-form-wiring.mjs";

const compliantSave = `
source: photo.source,
`;

const compliantDetails = `
mutate((current) => setDraftNotes(current, current.activeDraftId, text));
<TextField value={draft.notes} />
`;

const compliantConfirm = `
const { state, isSessionResolved } = usePersistedCaptureSession(sessionId);
useConfirmExit(sessionId, state, isSessionResolved);
`;

const compliantConfirmExit = `
if (shouldConfirmRedirectAway(sessionId, state, isSessionResolved)) {
  exitToCollection();
}
`;

const compliantUploadCapture = `
const uris = await pickUploadFiles();
`;

describe("findOrphanFormStateViolations", () => {
  it("flags TextInput bound to orphan useState", () => {
    const violations = findOrphanFormStateViolations({
      filePath: "apps/mobile/app/(tabs)/add/confirm.tsx",
      source: `
        const [notes, setNotes] = useState("");
        <TextInput value={notes} onChangeText={setNotes} />
      `,
    });

    assert.equal(violations.length, 1);
    assert.match(violations[0], /notes/);
  });

  it("passes when the state is wired through mutate", () => {
    const violations = findOrphanFormStateViolations({
      filePath: "apps/mobile/app/(tabs)/add/confirm.tsx",
      source: `
        const [notes, setNotes] = useState("");
        mutate((current) => setDraftNotes(current, current.activeDraftId, notes));
        <TextInput value={notes} />
      `,
    });

    assert.deepEqual(violations, []);
  });
});

describe("findConfirmSaveViolations", () => {
  it("requires per-photo source and draft-backed notes", () => {
    assert.deepEqual(
      findConfirmSaveViolations({ saveSource: compliantSave, detailsSource: compliantDetails }),
      [],
    );
  });

  it("fails when save uses a single default photo source", () => {
    const violations = findConfirmSaveViolations({
      saveSource: `
        const defaultPhotoSource = "camera";
        source: defaultPhotoSource,
      `,
      detailsSource: compliantDetails,
    });

    assert.ok(violations.some((line) => line.includes("photo.source")));
    assert.ok(violations.some((line) => line.includes("route params")));
  });
});

describe("findGalleryEscapeViolations", () => {
  it("requires merge helper and existing camera photos", () => {
    assert.deepEqual(
      findGalleryEscapeViolations({
        captureSource: `
          mergeGalleryEscapePhotos(existingPhotos, uris);
          onGalleryEscape={(existingPhotos) => void openGalleryEscape(existingPhotos)}
        `,
      }),
      [],
    );
  });
});

describe("findConfirmRedirectViolations", () => {
  it("requires resolved-session redirect guard", () => {
    assert.deepEqual(
      findConfirmRedirectViolations({
        confirmSource: compliantConfirm,
        confirmExitSource: compliantConfirmExit,
      }),
      [],
    );
  });
});

describe("findUploadPickerViolations", () => {
  it("requires Upload filer to route through pickUploadFiles with documents support", () => {
    assert.deepEqual(
      findUploadPickerViolations({
        chooserSource: `router.push({ pathname: "/(capture)/loading" });`,
        uploadCaptureSource: compliantUploadCapture,
        pickUploadSource: `import { pickDocumentImages } from "./pickDocumentImages";`,
      }),
      [],
    );
  });
});

describe("checkMobileAddFormWiring", () => {
  it("passes compliant confirm screen wiring", () => {
    assert.deepEqual(
      checkMobileAddFormWiring({
        addSources: [],
        confirmSource: compliantConfirm,
        confirmExitSource: compliantConfirmExit,
        saveSource: compliantSave,
        detailsSource: compliantDetails,
        chooserSource: `router.push({ pathname: "/(capture)/loading" });`,
        uploadCaptureSource: compliantUploadCapture,
        captureSource: `
          mergeGalleryEscapePhotos(existingPhotos, uris);
          onGalleryEscape={(existingPhotos) => void openGalleryEscape(existingPhotos)}
        `,
        pickUploadSource: `import { pickDocumentImages } from "./pickDocumentImages";`,
      }),
      [],
    );
  });
});
