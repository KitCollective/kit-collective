import { describe, expect, it } from "vitest";
import {
  COLLECTION_SHOWCASE_JERSEY_CAP,
  collectionShowcaseJerseysSchema,
} from "../src/collection/showcase.js";

const jersey = {
  id: "11111111-1111-4111-8111-111111111111",
  clubLabel: "F.C. København",
  seasonLabel: "2023/24",
  type: "home" as const,
  photos: [
    {
      id: "44444444-4444-4444-8444-444444444444",
      role: "front" as const,
      source: "gallery" as const,
      objectKey: "user/owner/jersey/front.jpg",
      photoUrl: "/v1/collection/showcase/photos/44444444-4444-4444-8444-444444444444",
      ocrStatus: "none" as const,
    },
  ],
};

describe("collectionShowcaseJerseysSchema", () => {
  it("accepts an empty jersey list for an empty live catalog", () => {
    expect(collectionShowcaseJerseysSchema.parse({ jerseys: [] })).toEqual({ jerseys: [] });
  });

  it("accepts display-only showcase tiles without owner metadata", () => {
    expect(collectionShowcaseJerseysSchema.parse({ jerseys: [jersey] })).toEqual({
      jerseys: [jersey],
    });
  });

  it("rejects unknown keys", () => {
    expect(() => collectionShowcaseJerseysSchema.parse({ jerseys: [], extra: true })).toThrow();
  });

  it("exports a coarse cap constant", () => {
    expect(COLLECTION_SHOWCASE_JERSEY_CAP).toBeGreaterThan(0);
  });
});
