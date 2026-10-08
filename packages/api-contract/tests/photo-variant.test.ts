import { describe, expect, it } from "vitest";
import { collectionPhotoOriginalUploadSchema } from "../src/collection/photo-original-upload.js";
import { collectionPhotoVariantQuerySchema } from "../src/collection/photo-variant.js";

describe("collectionPhotoVariantQuerySchema", () => {
  it("accepts grid, strip, and lightbox", () => {
    expect(collectionPhotoVariantQuerySchema.parse("grid")).toBe("grid");
    expect(collectionPhotoVariantQuerySchema.parse("strip")).toBe("strip");
    expect(collectionPhotoVariantQuerySchema.parse("lightbox")).toBe("lightbox");
    expect(collectionPhotoVariantQuerySchema.parse(undefined)).toBeUndefined();
  });

  it("rejects free-text variants", () => {
    expect(() => collectionPhotoVariantQuerySchema.parse("huge")).toThrow();
  });

  it("parses original for contract completeness but collectors cannot fetch it", () => {
    expect(collectionPhotoVariantQuerySchema.parse("original")).toBe("original");
  });
});

describe("collectionPhotoOriginalUploadSchema", () => {
  it("requires base64 content", () => {
    expect(collectionPhotoOriginalUploadSchema.parse({ contentBase64: "abc" }).contentBase64).toBe(
      "abc",
    );
  });
});
