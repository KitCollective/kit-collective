import { describe, expect, it } from "vitest";
import {
  catalogClubSearchResponseSchema,
  catalogClubSeasonsResponseSchema,
  catalogPickerItemSchema,
  catalogPickerSearchQuerySchema,
} from "../src/catalog/picker.js";

describe("catalogPickerItemSchema", () => {
  it("accepts id and label only", () => {
    const item = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      label: "F.C. København",
    };
    expect(catalogPickerItemSchema.parse(item)).toEqual(item);
  });

  it("rejects extra fields such as image URLs", () => {
    expect(() =>
      catalogPickerItemSchema.parse({
        id: "550e8400-e29b-41d4-a716-446655440000",
        label: "F.C. København",
        crestUrl: "https://example.com/kit.jpg",
      }),
    ).toThrow();
  });
});

describe("catalogClubSearchResponseSchema", () => {
  it("accepts a club search payload", () => {
    const payload = {
      clubs: [
        {
          id: "550e8400-e29b-41d4-a716-446655440000",
          label: "F.C. København",
        },
      ],
    };
    expect(catalogClubSearchResponseSchema.parse(payload)).toEqual(payload);
  });
});

describe("catalogClubSeasonsResponseSchema", () => {
  it("accepts club-scoped seasons", () => {
    const payload = {
      seasons: [
        {
          id: "660e8400-e29b-41d4-a716-446655440001",
          label: "2023/24",
        },
      ],
    };
    expect(catalogClubSeasonsResponseSchema.parse(payload)).toEqual(payload);
  });
});

describe("catalogPickerSearchQuerySchema", () => {
  it("defaults locale to da", () => {
    expect(catalogPickerSearchQuerySchema.parse({ q: "fck" })).toEqual({
      q: "fck",
      locale: "da",
    });
  });
});
