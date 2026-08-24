import { beforeEach, describe, expect, it, vi } from "vitest";

const { launchImageLibraryAsync, requestMediaLibraryPermissionsAsync } = vi.hoisted(() => ({
  launchImageLibraryAsync: vi.fn(),
  requestMediaLibraryPermissionsAsync: vi.fn(),
}));

vi.mock("expo-image-picker", () => ({
  launchImageLibraryAsync,
  requestMediaLibraryPermissionsAsync,
}));

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

import { pickGalleryPhotos } from "../src/capture/pickGalleryPhotos";

describe("pickGalleryPhotos", () => {
  beforeEach(() => {
    launchImageLibraryAsync.mockReset();
    requestMediaLibraryPermissionsAsync.mockReset();
    launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///photo.jpg" }],
    });
  });

  it("opens the system picker without requesting media-library permission", async () => {
    const uris = await pickGalleryPhotos({ allowsMultipleSelection: true });

    expect(requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
    expect(launchImageLibraryAsync).toHaveBeenCalledOnce();
    expect(uris).toEqual(["file:///photo.jpg"]);
  });
});
