import { describe, expect, it } from "vitest";
import { mergeGalleryEscapePhotos } from "../src/capture/galleryEscape";

const URI_FRONT = "file:///camera/front.jpg";
const URI_BACK = "file:///camera/back.jpg";
const URI_LABEL = "file:///gallery/label.jpg";

describe("mergeGalleryEscapePhotos", () => {
  it("keeps camera shots and fills the next empty role from gallery picks", () => {
    const merged = mergeGalleryEscapePhotos(
      [
        { role: "front", uri: URI_FRONT },
        { role: "back", uri: URI_BACK },
      ],
      [URI_LABEL],
    );

    expect(merged).toEqual([
      { uri: URI_FRONT, role: "front", source: "camera" },
      { uri: URI_BACK, role: "back", source: "camera" },
      { uri: URI_LABEL, role: "label", source: "gallery" },
    ]);
  });

  it("assigns gallery-only escape picks to roles in order", () => {
    const merged = mergeGalleryEscapePhotos([], [URI_FRONT, URI_BACK]);

    expect(merged).toEqual([
      { uri: URI_FRONT, role: "front", source: "gallery" },
      { uri: URI_BACK, role: "back", source: "gallery" },
    ]);
  });
});
