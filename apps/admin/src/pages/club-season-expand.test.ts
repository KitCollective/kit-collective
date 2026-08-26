import { describe, expect, it } from "vitest";
import {
  isClubSeasonExpandPending,
  isClubSeasonReadyToExpand,
  resolveSeasonIdForClub,
} from "./club-season-expand.js";

const clubA = "550e8400-e29b-41d4-a716-446655440010";
const clubB = "550e8400-e29b-41d4-a716-446655440020";
const seasonA = "550e8400-e29b-41d4-a716-446655440011";
const seasonB = "550e8400-e29b-41d4-a716-446655440021";

describe("isClubSeasonReadyToExpand", () => {
  it("rejects a leftover club payload after the route club changes", () => {
    expect(
      isClubSeasonReadyToExpand({ id: clubA, seasons: [{ id: seasonA }] }, clubB, seasonA),
    ).toBe(false);
  });

  it("rejects a leftover season that the routed club has not confirmed", () => {
    expect(
      isClubSeasonReadyToExpand({ id: clubB, seasons: [{ id: seasonB }] }, clubB, seasonA),
    ).toBe(false);
  });

  it("allows expand only when the routed club owns the selected season", () => {
    expect(
      isClubSeasonReadyToExpand({ id: clubB, seasons: [{ id: seasonB }] }, clubB, seasonB),
    ).toBe(true);
  });
});

describe("isClubSeasonExpandPending", () => {
  it("keeps the table in loading while the previous club payload is still mounted", () => {
    expect(
      isClubSeasonExpandPending({ id: clubA, seasons: [{ id: seasonA }] }, clubB, seasonA),
    ).toBe(true);
  });

  it("does not spin after a matching club reports no seasons", () => {
    expect(isClubSeasonExpandPending({ id: clubB, seasons: [] }, clubB, "")).toBe(false);
  });
});

describe("resolveSeasonIdForClub", () => {
  it("keeps the current season when the next club also lists it", () => {
    expect(resolveSeasonIdForClub(seasonA, [{ id: seasonA }, { id: seasonB }])).toBe(seasonA);
  });

  it("falls back to the first season when the leftover id is missing", () => {
    expect(resolveSeasonIdForClub(seasonA, [{ id: seasonB }])).toBe(seasonB);
  });
});
