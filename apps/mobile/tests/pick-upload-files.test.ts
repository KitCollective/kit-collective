import { describe, expect, it } from "vitest";
import { pickUploadFiles, type UploadFilesAdapter } from "../src/capture/pickUploadFiles";

function createRecordingAdapter(buttonIndex: number): {
  adapter: UploadFilesAdapter;
  counts: { gallery: number; documents: number };
} {
  const counts = { gallery: 0, documents: 0 };
  const adapter: UploadFilesAdapter = {
    os: "ios",
    showActionSheet(_options, callback) {
      callback(buttonIndex);
    },
    showAlert() {},
    async pickGalleryPhotos() {
      counts.gallery += 1;
      return ["file:///gallery/front.jpg"];
    },
    async pickDocumentImages() {
      counts.documents += 1;
      return ["file:///files/front.jpg"];
    },
    galleryMultiSelectQuality: () => 0.8,
  };

  return { adapter, counts };
}

describe("pickUploadFiles", () => {
  it("routes Fotos to the gallery picker on iOS", async () => {
    const recording = createRecordingAdapter(0);

    const uris = await pickUploadFiles({}, recording.adapter);

    expect(recording.counts.gallery).toBe(1);
    expect(recording.counts.documents).toBe(0);
    expect(uris).toEqual(["file:///gallery/front.jpg"]);
  });

  it("routes Filer to the document picker on iOS", async () => {
    const recording = createRecordingAdapter(1);

    const uris = await pickUploadFiles({}, recording.adapter);

    expect(recording.counts.documents).toBe(1);
    expect(recording.counts.gallery).toBe(0);
    expect(uris).toEqual(["file:///files/front.jpg"]);
  });
});
