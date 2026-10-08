import { describe, expect, it } from "vitest";
import {
  collectionAddFavoriteRequestSchema,
  collectionFavoritesSchema,
} from "../src/collection/favorites.js";

describe("collectionAddFavoriteRequestSchema", () => {
  it("accepts a userJerseyId uuid", () => {
    expect(
      collectionAddFavoriteRequestSchema.parse({
        userJerseyId: "00000000-0000-0000-0000-000000000001",
      }),
    ).toEqual({
      userJerseyId: "00000000-0000-0000-0000-000000000001",
    });
  });
});

describe("collectionFavoritesSchema", () => {
  it("accepts favorite list items without owner handle", () => {
    const parsed = collectionFavoritesSchema.parse({
      favorites: [
        {
          userJerseyId: "00000000-0000-0000-0000-000000000001",
          photoUrl: "/v1/collection/photos/00000000-0000-0000-0000-000000000099",
          clubLabel: "F.C. København",
          seasonLabel: "2023/24",
          type: "home",
        },
      ],
    });

    expect(parsed.favorites[0]).not.toHaveProperty("ownerHandle");
    expect(parsed.favorites[0]?.clubLabel).toBe("F.C. København");
  });

  it("rejects favorite list items that include owner handle", () => {
    expect(() =>
      collectionFavoritesSchema.parse({
        favorites: [
          {
            userJerseyId: "00000000-0000-0000-0000-000000000001",
            photoUrl: "/v1/collection/photos/x",
            clubLabel: "F.C. København",
            seasonLabel: "2023/24",
            type: "home",
            ownerHandle: "nick",
          },
        ],
      }),
    ).toThrow();
  });
});
