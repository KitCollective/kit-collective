import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDocumentAsync } = vi.hoisted(() => ({
  getDocumentAsync: vi.fn(),
}));

vi.mock("expo-document-picker", () => ({
  getDocumentAsync,
}));

import { pickDocumentImages } from "../src/capture/pickDocumentImages";

describe("pickDocumentImages", () => {
  beforeEach(() => {
    getDocumentAsync.mockReset();
    getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///docs/jersey.jpg" }],
    });
  });

  it("opens the document picker for image files", async () => {
    const uris = await pickDocumentImages({ multiple: true });

    expect(getDocumentAsync).toHaveBeenCalledWith({
      type: "image/*",
      multiple: true,
      copyToCacheDirectory: true,
    });
    expect(uris).toEqual(["file:///docs/jersey.jpg"]);
  });
});
