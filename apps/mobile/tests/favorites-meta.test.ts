import { describe, expect, it } from "vitest";
import { favoritesMetaLine } from "../src/components/favorites-meta";

describe("favoritesMetaLine", () => {
  it("formats the Profil home row meta for zero and non-zero counts", () => {
    expect(favoritesMetaLine(0)).toBe("0 trøjer");
    expect(favoritesMetaLine(4)).toBe("4 trøjer");
  });
});
