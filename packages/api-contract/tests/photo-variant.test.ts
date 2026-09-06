import { describe, expect, it } from "vitest";
import { collectionPhotoVariantQuerySchema } from "../src/collection/photo-variant.js";

describe("collectionPhotoVariantQuerySchema", () => {
  it("accepts grid and omits unknown variants for later slices", () => {
    expect(collectionPhotoVariantQuerySchema.parse("grid")).toBe("grid");
    expect(collectionPhotoVariantQuerySchema.parse(undefined)).toBeUndefined();
  });

  it("rejects free-text variants", () => {
    expect(() => collectionPhotoVariantQuerySchema.parse("huge")).toThrow();
  });

  it("parses reserved variants for contract completeness", () => {
    expect(collectionPhotoVariantQuerySchema.parse("original")).toBe("original");
  });
});
