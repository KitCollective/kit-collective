import { describe, expect, it } from "vitest";
import { buildSendBidSummary } from "../src/search/send-bid-summary";

const jersey = {
  clubLabel: "OB",
  seasonLabel: "2023/24",
  type: "home",
  size: "m",
  condition: "used",
  playerLabel: null,
  ownerHandle: "freja_e2e",
} as const;

describe("send bid jersey summary (KIT-291)", () => {
  it("reads club and season, then type · size · condition", () => {
    const summary = buildSendBidSummary(jersey);
    expect(summary.title).toBe("OB 2023/24");
    expect(summary.facts).toBe("Hjemme · M · Brugt");
  });

  it("reads the owner Handle alone without a player", () => {
    expect(buildSendBidSummary(jersey).byline).toBe("freja_e2e");
  });

  it("reads player · owner Handle with a player", () => {
    expect(buildSendBidSummary({ ...jersey, playerLabel: "Mads Hermansen" }).byline).toBe(
      "Mads Hermansen · freja_e2e",
    );
  });
});
