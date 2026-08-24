import { describe, expect, it } from "vitest";
import { resolveConfirmBanner } from "../src/capture/confirmBanner";

describe("resolveConfirmBanner", () => {
  it("returns null when no banner conditions are active", () => {
    expect(
      resolveConfirmBanner({
        saveError: false,
        visionSuggestionVisible: false,
        catalogMiss: false,
        clubSheetOpen: false,
      }),
    ).toBeNull();
  });

  it("shows only saveError when all three conditions are true", () => {
    expect(
      resolveConfirmBanner({
        saveError: true,
        visionSuggestionVisible: true,
        catalogMiss: true,
        clubSheetOpen: false,
      }),
    ).toBe("saveError");
  });

  it("shows visionSuggestion over catalogMiss", () => {
    expect(
      resolveConfirmBanner({
        saveError: false,
        visionSuggestionVisible: true,
        catalogMiss: true,
        clubSheetOpen: false,
      }),
    ).toBe("visionSuggestion");
  });

  it("hides catalogMiss banner while the club sheet is open", () => {
    expect(
      resolveConfirmBanner({
        saveError: false,
        visionSuggestionVisible: false,
        catalogMiss: true,
        clubSheetOpen: true,
      }),
    ).toBeNull();
  });

  it("shows catalogMiss when the club sheet is closed", () => {
    expect(
      resolveConfirmBanner({
        saveError: false,
        visionSuggestionVisible: false,
        catalogMiss: true,
        clubSheetOpen: false,
      }),
    ).toBe("catalogMiss");
  });
});
