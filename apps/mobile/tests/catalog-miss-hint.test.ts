import { describe, expect, it } from "vitest";
import {
  formatCatalogMissBannerMessage,
  formatCatalogMissSheetMessage,
  resolveVisionCatalogMissHint,
} from "../src/capture/catalogMissHint";

describe("catalogMissHint", () => {
  it("prefers nationalTeamHint over clubHint", () => {
    expect(
      resolveVisionCatalogMissHint({
        jobId: "00000000-0000-0000-0000-000000000001",
        status: "ready",
        catalogMiss: true,
        clubHint: "Barcelona",
        nationalTeamHint: "Argentina",
      }),
    ).toBe("Argentina");
  });

  it("falls back to clubHint", () => {
    expect(
      resolveVisionCatalogMissHint({
        jobId: "00000000-0000-0000-0000-000000000001",
        status: "ready",
        catalogMiss: true,
        clubHint: "FC Barcelona",
      }),
    ).toBe("FC Barcelona");
  });

  it("formats banner and sheet copy with hint", () => {
    expect(formatCatalogMissBannerMessage("Barcelona")).toBe(
      "«Barcelona» findes ikke i kataloget endnu. Dit draft bliver gemt.",
    );
    expect(formatCatalogMissSheetMessage("Barcelona")).toBe(
      "«Barcelona» findes ikke i kataloget endnu. Søg selv nedenfor.",
    );
  });

  it("formats fallback copy without hint", () => {
    expect(formatCatalogMissBannerMessage(null)).toBe(
      "Klubben findes ikke i kataloget endnu. Dit draft bliver gemt.",
    );
  });
});
