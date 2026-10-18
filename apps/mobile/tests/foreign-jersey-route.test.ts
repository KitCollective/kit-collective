import { describe, expect, it } from "vitest";
import { FOREIGN_JERSEY_ROUTE, sitsAboveForeignJersey } from "@/search/foreign-jersey-route";

describe("routes above the foreign jersey detail (KIT-290)", () => {
  it("is false for the Søg index and the detail itself", () => {
    const names = ["index", FOREIGN_JERSEY_ROUTE];

    expect(sitsAboveForeignJersey(names, 0)).toBe(false);
    expect(sitsAboveForeignJersey(names, 1)).toBe(false);
  });

  it("is true for Send bud and Peer Profil pushed from the detail", () => {
    const names = ["index", FOREIGN_JERSEY_ROUTE, "send-bid/[jerseyId]", "peer/[handle]"];

    expect(sitsAboveForeignJersey(names, 2)).toBe(true);
    expect(sitsAboveForeignJersey(names, 3)).toBe(true);
  });

  it("is false for routes pushed from the Søg index, which keep the Tab bar", () => {
    const names = ["index", "club/[clubId]", "peer/[handle]"];

    expect(sitsAboveForeignJersey(names, 1)).toBe(false);
    expect(sitsAboveForeignJersey(names, 2)).toBe(false);
  });
});
