import { describe, expect, it } from "vitest";
import { mergeGalleryEscapePhotos } from "../src/capture/galleryEscape";

const URI_FRONT = "file:///camera/front.jpg";
const URI_BACK = "file:///camera/back.jpg";
const URI_LABEL = "file:///gallery/label.jpg";

describe("mergeGalleryEscapePhotos", () => {
  it("keeps shoot-first camera URIs and appends gallery picks unassigned", () => {
    const merged = mergeGalleryEscapePhotos([URI_FRONT, URI_BACK], [URI_LABEL]);

    expect(merged).toEqual([
      { uri: URI_FRONT, role: null, source: "camera" },
      { uri: URI_BACK, role: null, source: "camera" },
      { uri: URI_LABEL, role: null, source: "gallery" },
    ]);
  });

  it("stores gallery-only escape picks unassigned in order", () => {
    const merged = mergeGalleryEscapePhotos([], [URI_FRONT, URI_BACK]);

    expect(merged).toEqual([
      { uri: URI_FRONT, role: null, source: "gallery" },
      { uri: URI_BACK, role: null, source: "gallery" },
    ]);
  });
});
