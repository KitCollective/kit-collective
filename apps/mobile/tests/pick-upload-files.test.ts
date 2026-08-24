import { beforeEach, describe, expect, it, vi } from "vitest";

const { pickGalleryPhotos } = vi.hoisted(() => ({
  pickGalleryPhotos: vi.fn(),
}));

const { pickDocumentImages } = vi.hoisted(() => ({
  pickDocumentImages: vi.fn(),
}));

const { showActionSheetWithOptions } = vi.hoisted(() => ({
  showActionSheetWithOptions: vi.fn(),
}));

vi.mock("../src/capture/pickGalleryPhotos", () => ({
  pickGalleryPhotos,
}));

vi.mock("../src/capture/pickDocumentImages", () => ({
  pickDocumentImages,
}));

vi.mock("../src/capture/photoBytes", () => ({
  galleryMultiSelectQuality: () => 0.8,
}));

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  ActionSheetIOS: {
    showActionSheetWithOptions,
  },
  Alert: {
    alert: vi.fn(),
  },
  NativeModules: {},
}));

import { pickUploadFiles } from "../src/capture/pickUploadFiles";

describe("pickUploadFiles", () => {
  beforeEach(() => {
    pickGalleryPhotos.mockReset();
    pickDocumentImages.mockReset();
    showActionSheetWithOptions.mockReset();
    pickGalleryPhotos.mockResolvedValue(["file:///gallery/front.jpg"]);
    pickDocumentImages.mockResolvedValue(["file:///files/front.jpg"]);
  });

  it("routes Fotos to the gallery picker on iOS", async () => {
    showActionSheetWithOptions.mockImplementation((_options, callback) => {
      callback(0);
    });

    const uris = await pickUploadFiles();

    expect(showActionSheetWithOptions).toHaveBeenCalledOnce();
    expect(pickGalleryPhotos).toHaveBeenCalledOnce();
    expect(pickDocumentImages).not.toHaveBeenCalled();
    expect(uris).toEqual(["file:///gallery/front.jpg"]);
  });

  it("routes Filer to the document picker on iOS", async () => {
    showActionSheetWithOptions.mockImplementation((_options, callback) => {
      callback(1);
    });

    const uris = await pickUploadFiles();

    expect(pickDocumentImages).toHaveBeenCalledOnce();
    expect(pickGalleryPhotos).not.toHaveBeenCalled();
    expect(uris).toEqual(["file:///files/front.jpg"]);
  });
});
