import { describe, expect, it } from "vitest";
import { type GalleryPickerAdapter, pickGalleryPhotos } from "../src/capture/pickGalleryPhotos";

describe("pickGalleryPhotos", () => {
  it("opens the system picker without requesting media-library permission", async () => {
    const requests: unknown[] = [];
    const adapter: GalleryPickerAdapter = {
      os: "ios",
      async launchImageLibraryAsync(request) {
        requests.push(request);
        return { canceled: false, assets: [{ uri: "file:///photo.jpg" }] };
      },
    };

    const uris = await pickGalleryPhotos({ allowsMultipleSelection: true }, adapter);

    expect(requests).toEqual([
      {
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        orderedSelection: true,
        selectionLimit: undefined,
        quality: 0.8,
      },
    ]);
    expect(uris).toEqual(["file:///photo.jpg"]);
  });
});
