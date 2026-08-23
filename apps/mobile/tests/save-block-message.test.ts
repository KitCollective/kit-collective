import { describe, expect, it } from "vitest";
import type { CaptureJerseyDraft } from "../src/capture/captureSessionTypes";
import { getSaveBlockMessage } from "../src/capture/saveBlockMessage";

function emptyDraft(overrides: Partial<CaptureJerseyDraft> = {}): CaptureJerseyDraft {
  return {
    id: "draft-1",
    clubId: null,
    clubLabel: null,
    seasonId: null,
    kitType: null,
    size: null,
    condition: null,
    kitTypeSelected: false,
    sizeSelected: false,
    conditionSelected: false,
    photos: [],
    ...overrides,
  };
}

describe("getSaveBlockMessage", () => {
  it("names the first missing requirement", () => {
    expect(getSaveBlockMessage(emptyDraft())).toBe("Tilføj mindst ét foto.");
    expect(
      getSaveBlockMessage(
        emptyDraft({
          photos: [{ uri: "file:///a.jpg", role: "front" }],
        }),
      ),
    ).toBe("Vælg en klub.");
    expect(
      getSaveBlockMessage(
        emptyDraft({
          photos: [{ uri: "file:///a.jpg", role: "front" }],
          clubId: "club",
        }),
      ),
    ).toBe("Vælg en sæson.");
    expect(
      getSaveBlockMessage(
        emptyDraft({
          photos: [{ uri: "file:///a.jpg", role: "front" }],
          clubId: "club",
          seasonId: "season",
        }),
      ),
    ).toBe("Vælg en type.");
    expect(
      getSaveBlockMessage(
        emptyDraft({
          photos: [{ uri: "file:///a.jpg", role: "front" }],
          clubId: "club",
          seasonId: "season",
          kitTypeSelected: true,
          kitType: "home",
        }),
      ),
    ).toBe("Vælg en størrelse.");
    expect(
      getSaveBlockMessage(
        emptyDraft({
          photos: [{ uri: "file:///a.jpg", role: "front" }],
          clubId: "club",
          seasonId: "season",
          kitTypeSelected: true,
          kitType: "home",
          sizeSelected: true,
          size: "m",
        }),
      ),
    ).toBe("Vælg stand.");
  });

  it("returns null when every required field is selected", () => {
    expect(
      getSaveBlockMessage(
        emptyDraft({
          photos: [{ uri: "file:///a.jpg", role: "front" }],
          clubId: "club",
          seasonId: "season",
          kitTypeSelected: true,
          kitType: "home",
          sizeSelected: true,
          size: "m",
          conditionSelected: true,
          condition: "used",
        }),
      ),
    ).toBeNull();
  });
});
