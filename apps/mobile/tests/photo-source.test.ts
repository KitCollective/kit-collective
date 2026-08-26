import { describe, expect, it } from "vitest";
import {
  createCaptureSession,
  getActiveDraft,
  upsertDraftPhoto,
} from "../src/capture/captureSession";

const URI_FRONT = "file:///photos/front.jpg";
const URI_BACK = "file:///photos/back.jpg";
const URI_LABEL = "file:///photos/label.jpg";

describe("photo source tracking", () => {
  it("tags single-branch photos with the session photoSource", () => {
    const session = createCaptureSession([URI_FRONT, URI_BACK], { photoSource: "gallery" });
    const draft = getActiveDraft(session);

    expect(draft.photos).toEqual([
      { uri: URI_FRONT, role: "front", source: "gallery" },
      { uri: URI_BACK, role: "back", source: "gallery" },
    ]);
  });

  it("tags camera sessions with camera source", () => {
    const draft = getActiveDraft(createCaptureSession([URI_FRONT], { photoSource: "camera" }));

    expect(draft.photos[0]?.source).toBe("camera");
  });

  it("preserves per-photo source when a gallery pick replaces one role", () => {
    let session = createCaptureSession([URI_FRONT, URI_BACK, URI_LABEL], {
      photoSource: "camera",
    });
    const draftId = getActiveDraft(session).id;

    session = upsertDraftPhoto(session, draftId, "label", "file:///gallery/label.jpg", "gallery");
    const draft = getActiveDraft(session);

    expect(draft.photos.find((photo) => photo.role === "front")?.source).toBe("camera");
    expect(draft.photos.find((photo) => photo.role === "back")?.source).toBe("camera");
    expect(draft.photos.find((photo) => photo.role === "label")?.source).toBe("gallery");
  });
});
