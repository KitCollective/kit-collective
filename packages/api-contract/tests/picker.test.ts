import { describe, expect, it } from "vitest";
import { omitDevCatalogFixtureRows } from "../src/catalog/devFixtureIds.js";
import {
  catalogClubSearchQuerySchema,
  catalogClubSearchResponseSchema,
  catalogClubSeasonsResponseSchema,
  catalogFacetSearchResponseSchema,
  catalogPickerClubIdParamSchema,
  catalogPickerItemSchema,
  catalogPickerSearchQuerySchema,
  catalogPickerSeasonIdParamSchema,
  catalogPlayerSearchQuerySchema,
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

  it("accepts optional squad meta without archive URLs", () => {
    const item = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      label: "Jonas Wind",
      meta: "Nr. 23",
    };
    expect(catalogPickerItemSchema.parse(item)).toEqual(item);
  });
});

describe("catalogClubSearchResponseSchema", () => {
  it("accepts a club search payload", () => {
    const payload = {
      clubs: [
        {
          id: "550e8400-e29b-41d4-a716-446655440000",
          label: "F.C. København",
          kind: "club" as const,
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

describe("catalogFacetSearchResponseSchema", () => {
  it("accepts facet search items without archive URLs", () => {
    const payload = {
      items: [
        {
          id: "550e8400-e29b-41d4-a716-446655440000",
          label: "Danmark",
        },
      ],
    };
    expect(catalogFacetSearchResponseSchema.parse(payload)).toEqual(payload);
  });
});

describe("catalogPickerClubIdParamSchema", () => {
  it("accepts a UUID club id", () => {
    const payload = { clubId: "550e8400-e29b-41d4-a716-446655440000" };
    expect(catalogPickerClubIdParamSchema.parse(payload)).toEqual(payload);
  });

  it("rejects a malformed club id", () => {
    expect(() => catalogPickerClubIdParamSchema.parse({ clubId: "not-a-uuid" })).toThrow();
  });
});

describe("catalogPickerSeasonIdParamSchema", () => {
  it("accepts a UUID season id", () => {
    const payload = { seasonId: "660e8400-e29b-41d4-a716-446655440001" };
    expect(catalogPickerSeasonIdParamSchema.parse(payload)).toEqual(payload);
  });

  it("rejects a malformed season id", () => {
    expect(() => catalogPickerSeasonIdParamSchema.parse({ seasonId: "not-a-uuid" })).toThrow();
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

describe("catalogClubSearchQuerySchema", () => {
  it("allows an empty query so the picker can list live clubs", () => {
    expect(catalogClubSearchQuerySchema.parse({})).toEqual({
      q: "",
      locale: "da",
    });
  });
});

describe("catalogPlayerSearchQuerySchema", () => {
  it("allows unscoped search with a query", () => {
    expect(catalogPlayerSearchQuerySchema.parse({ q: "wind" })).toEqual({
      q: "wind",
      locale: "da",
    });
  });

  it("allows club-scoped search without a query", () => {
    expect(
      catalogPlayerSearchQuerySchema.parse({
        clubId: "550e8400-e29b-41d4-a716-446655440000",
      }),
    ).toEqual({
      q: "",
      locale: "da",
      clubId: "550e8400-e29b-41d4-a716-446655440000",
    });
  });

  it("rejects empty query without a club scope", () => {
    expect(() => catalogPlayerSearchQuerySchema.parse({})).toThrow();
  });

  it("rejects seasonId without clubId", () => {
    expect(() =>
      catalogPlayerSearchQuerySchema.parse({
        q: "wind",
        seasonId: "660e8400-e29b-41d4-a716-446655440001",
      }),
    ).toThrow();
  });
});

describe("omitDevCatalogFixtureRows", () => {
  it("drops historical picker seed IDs and keeps scraped UUIDs", () => {
    const liveId = "550e8400-e29b-41d4-a716-446655440000";
    expect(
      omitDevCatalogFixtureRows([
        { id: "11111111-1111-4111-8111-111111111111", label: "F.C. København" },
        { id: liveId, label: "F.C. København" },
      ]),
    ).toEqual([{ id: liveId, label: "F.C. København" }]);
  });
});
