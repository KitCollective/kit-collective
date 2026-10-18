import { describe, expect, it } from "vitest";
import {
  FOREIGN_JERSEY_ROUTE,
  sitsAboveForeignJersey,
  sitsDirectlyAboveForeignJerseyOf,
} from "@/search/foreign-jersey-route";

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

describe("Send bud directly above the detail of its own jersey (KIT-291)", () => {
  const detail = (jerseyId: string) => ({ name: FOREIGN_JERSEY_ROUTE, params: { jerseyId } });
  const sendBid = { name: "send-bid/[jerseyId]" };

  it("is true when the detail of the same jersey is the route below", () => {
    expect(
      sitsDirectlyAboveForeignJerseyOf([{ name: "index" }, detail("j1"), sendBid], 2, "j1"),
    ).toBe(true);
  });

  it("is false from an Indbakke thread, where Send bud has no detail below", () => {
    expect(sitsDirectlyAboveForeignJerseyOf([{ name: "index" }, sendBid], 1, "j1")).toBe(false);
    expect(sitsDirectlyAboveForeignJerseyOf([sendBid], 0, "j1")).toBe(false);
  });

  it("is false when a leftover detail of another jersey sits below", () => {
    expect(
      sitsDirectlyAboveForeignJerseyOf([{ name: "index" }, detail("j2"), sendBid], 2, "j1"),
    ).toBe(false);
  });
});
