import { describe, expect, it } from "vitest";
import {
  classifyFkaKitRemainder,
  classifyFkaKitStem,
  collapseFkaKitSnapshots,
  fkaKitExternalId,
  fkaKitPathStem,
  isDroppedFkaKitPath,
  resolveFkaTeamSlug,
  slugifyFkaClubLabel,
} from "../src/listing-fka-slugs.js";

describe("FKA club slugs", () => {
  it("slugifies English club labels for Wayback paths", () => {
    expect(slugifyFkaClubLabel("FC Copenhagen")).toBe("fc-copenhagen");
    expect(slugifyFkaClubLabel("Brøndby IF")).toBe("brondby-if");
  });

  it("prefers the Transfermarkt map over a slugified label", () => {
    expect(
      resolveFkaTeamSlug(
        {
          kind: "club",
          competition: "superligaen",
          clubExternalId: "191",
          season: "2010/11",
        },
        "Brøndby IF",
      ),
    ).toBe("brondby");
  });

  it("falls back to a slugified club label when the map misses", () => {
    expect(
      resolveFkaTeamSlug(
        {
          kind: "club",
          competition: "superligaen",
          clubExternalId: "99999",
          season: "2010/11",
        },
        "FC Copenhagen",
      ),
    ).toBe("fc-copenhagen");
  });

  it("classifies URL remainder into type plus open variant", () => {
    expect(classifyFkaKitRemainder("home")).toEqual({ type: "home", variant: null });
    expect(classifyFkaKitRemainder("home-v2")).toEqual({ type: "home", variant: "v2" });
    expect(classifyFkaKitRemainder("european-home")).toEqual({
      type: "home",
      variant: "european",
    });
    expect(classifyFkaKitRemainder("supercoppa-italiana-home")).toEqual({
      type: "home",
      variant: "supercoppa-italiana",
    });
    expect(classifyFkaKitRemainder("uefa-super-cup")).toEqual({
      type: "special",
      variant: "uefa-super-cup",
    });
    expect(classifyFkaKitRemainder("uefa-super-cup-1")).toEqual({
      type: "special",
      variant: "uefa-super-cup-1",
    });
    expect(classifyFkaKitRemainder("gk-home")).toEqual({ type: "gk", variant: "home" });
    expect(classifyFkaKitRemainder("gk-fourth")).toEqual({ type: "gk", variant: "fourth" });
    expect(classifyFkaKitRemainder("training")).toBeUndefined();
    expect(classifyFkaKitRemainder("champions-league-training")).toBeUndefined();
    expect(classifyFkaKitStem("ac-milan-2025-26-european-home-kit", "ac-milan-2025-26")).toEqual({
      type: "home",
      variant: "european",
    });
    expect(isDroppedFkaKitPath("/fc-copenhagen-2010-11-european-home-kit/")).toBe(false);
    expect(isDroppedFkaKitPath("/fc-copenhagen-2010-11-training-kit/")).toBe(true);
  });

  it("collapses slug-only and numbered FKA kit URLs onto one stem", () => {
    expect(fkaKitPathStem("/ac-milan-2025-26-home-kit/")).toBe("ac-milan-2025-26-home-kit");
    expect(fkaKitPathStem("/ac-milan-2025-26-home-kit/354421/")).toBe("ac-milan-2025-26-home-kit");
    expect(fkaKitExternalId("/ac-milan-2025-26-home-kit/")).toBe("ac-milan-2025-26-home-kit");
    expect(fkaKitExternalId("/ac-milan-2025-26-home-kit/354421/")).toBe("354421");
    expect(isDroppedFkaKitPath("/ac-milan-2025-26-kits/")).toBe(true);
    expect(isDroppedFkaKitPath("/ac-milan-2025-26-pre-match-kit/")).toBe(true);

    const collapsed = collapseFkaKitSnapshots([
      {
        timestamp: "20250801000000",
        original: "https://www.footballkitarchive.com/ac-milan-2025-26-home-kit/",
      },
      {
        timestamp: "20250701000000",
        original: "https://www.footballkitarchive.com/ac-milan-2025-26-home-kit/354421/",
      },
      {
        timestamp: "20250801000000",
        original: "https://www.footballkitarchive.com/ac-milan-2025-26-away-kit/",
      },
    ]);

    expect(collapsed).toEqual([
      {
        timestamp: "20250701000000",
        original: "https://www.footballkitarchive.com/ac-milan-2025-26-home-kit/354421/",
      },
      {
        timestamp: "20250801000000",
        original: "https://www.footballkitarchive.com/ac-milan-2025-26-away-kit/",
      },
    ]);
  });
});
