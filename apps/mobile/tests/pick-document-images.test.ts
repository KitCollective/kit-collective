import { describe, expect, it } from "vitest";
import { type DocumentPickerAdapter, pickDocumentImages } from "../src/capture/pickDocumentImages";

describe("pickDocumentImages", () => {
  it("opens the document picker for image files", async () => {
    const requests: unknown[] = [];
    const adapter: DocumentPickerAdapter = {
      async getDocumentAsync(request) {
        requests.push(request);
        return { canceled: false, assets: [{ uri: "file:///docs/jersey.jpg" }] };
      },
    };

    const uris = await pickDocumentImages({ multiple: true }, adapter);

    expect(requests).toEqual([
      {
        type: "image/*",
        multiple: true,
        copyToCacheDirectory: true,
      },
    ]);
    expect(uris).toEqual(["file:///docs/jersey.jpg"]);
  });
});
