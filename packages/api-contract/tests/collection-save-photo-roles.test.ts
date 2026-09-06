import { collectionSavePhotoSchema, collectionSaveRequestSchema } from "@kit/api-contract";
import { describe, expect, it } from "vitest";

const JPEG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const baseSaveBody = {
  clubId: "11111111-1111-1111-1111-111111111111",
  seasonId: "22222222-2222-2222-2222-222222222222",
  type: "home" as const,
  size: "m" as const,
  condition: "used" as const,
};

describe("collection save photo roles", () => {
  it("accepts front | back | left | right | other", () => {
    for (const role of ["front", "back", "left", "right", "other"] as const) {
      expect(
        collectionSavePhotoSchema.parse({
          role,
          source: "gallery",
          contentBase64: JPEG_BASE64,
        }).role,
      ).toBe(role);
    }
  });

  it("accepts 1..10 photos", () => {
    const photos = Array.from({ length: 10 }, (_, index) => ({
      role: index < 4 ? (["front", "back", "left", "right"] as const)[index] : "other",
      source: "gallery" as const,
      contentBase64: JPEG_BASE64,
    }));

    expect(collectionSaveRequestSchema.parse({ ...baseSaveBody, photos }).photos).toHaveLength(10);
  });

  it("rejects a second front", () => {
    expect(() =>
      collectionSaveRequestSchema.parse({
        ...baseSaveBody,
        photos: [
          { role: "front", source: "gallery", contentBase64: JPEG_BASE64 },
          { role: "front", source: "gallery", contentBase64: JPEG_BASE64 },
        ],
      }),
    ).toThrow();
  });

  it("accepts two other photos", () => {
    const parsed = collectionSaveRequestSchema.parse({
      ...baseSaveBody,
      photos: [
        { role: "front", source: "gallery", contentBase64: JPEG_BASE64 },
        { role: "other", source: "gallery", contentBase64: JPEG_BASE64, label: "Vaskemærke" },
        { role: "other", source: "gallery", contentBase64: JPEG_BASE64 },
      ],
    });
    expect(parsed.photos.filter((photo) => photo.role === "other")).toHaveLength(2);
  });

  it("rejects label on front", () => {
    expect(() =>
      collectionSavePhotoSchema.parse({
        role: "front",
        source: "gallery",
        contentBase64: JPEG_BASE64,
        label: "oops",
      }),
    ).toThrow();
  });

  it("rejects more than ten photos", () => {
    const photos = Array.from({ length: 11 }, () => ({
      role: "other" as const,
      source: "gallery" as const,
      contentBase64: JPEG_BASE64,
    }));

    expect(() => collectionSaveRequestSchema.parse({ ...baseSaveBody, photos })).toThrow();
  });
});
