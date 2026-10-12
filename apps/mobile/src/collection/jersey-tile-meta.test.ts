import { describe, expect, it } from "vitest";
import {
  jerseyTileAccessibilityLabel,
  jerseyTileBadgeLabel,
  jerseyTileMetaLine,
} from "@/components/jersey-tile-meta";

describe("jerseyTileMetaLine", () => {
  it("keeps its output for the other tile screens", () => {
    expect(jerseyTileMetaLine("2023/24", "Hjemme")).toBe("2023/24 · Hjemme");
  });
});

describe("jerseyTileBadgeLabel", () => {
  it("is n bud for bids and Privat for the lock", () => {
    expect(jerseyTileBadgeLabel({ kind: "bids", count: 2 })).toBe("2 bud");
    expect(jerseyTileBadgeLabel({ kind: "lock" })).toBe("Privat");
  });
});

describe("jerseyTileAccessibilityLabel", () => {
  const base = { clubLabel: "F.C. København", seasonLabel: "2023/24", typeLabel: "Hjemme" };

  it("is today's name without a caption or badge", () => {
    expect(jerseyTileAccessibilityLabel(base)).toBe("F.C. København, 2023/24 · Hjemme");
  });

  it("names the club first in a club-led caption and adds the badge", () => {
    expect(
      jerseyTileAccessibilityLabel({
        ...base,
        caption: {
          lead: "F.C. København",
          leadRole: "club",
          trailing: "L",
          secondary: "2023/24 · Hjemme",
        },
        badge: { kind: "bids", count: 3 },
      }),
    ).toBe("F.C. København, L, 2023/24 · Hjemme, 3 bud");
  });

  it("keeps the club in the name when the heading carries it visually", () => {
    expect(
      jerseyTileAccessibilityLabel({
        ...base,
        caption: { lead: "2023/24", leadRole: "season", trailing: "L", secondary: "Hjemme · Zeca" },
        badge: { kind: "lock" },
      }),
    ).toBe("F.C. København, 2023/24, L, Hjemme · Zeca, Privat");
  });
});
