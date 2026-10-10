import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSavedSheetModel, pickSavedFrontPhoto } from "../src/capture/confirmSheet";

const postSavePath = join(__dirname, "../src/components/post-save-sheet.tsx");
const arsenal = { id: "club-arsenal", label: "Arsenal" };

describe("pickSavedFrontPhoto", () => {
  it("prefers the front photo, falls back to the first", () => {
    const back = { id: "b", role: "back", photoUrl: "/b" };
    const front = { id: "f", role: "front", photoUrl: "/f" };
    expect(pickSavedFrontPhoto([back, front])).toBe(front);
    expect(pickSavedFrontPhoto([back])).toBe(back);
    expect(pickSavedFrontPhoto([])).toBeNull();
  });
});

describe("buildSavedSheetModel", () => {
  it("builds the Saved sheet copy from the saved jersey and the running count", () => {
    const model = buildSavedSheetModel({
      club: arsenal,
      seasonLabel: "2023/24",
      kitType: "home",
      count: 5,
    });
    expect(model.title).toBe("Gemt");
    expect(model.summary).toBe("Arsenal · 2023/24 · Hjemme");
    expect(model.countLine).toBe("Trøje nr. 5 i din samling");
    expect(model.nextLabel).toBe("Tilføj næste trøje");
    expect(model.sameSideLabel).toBe("Endnu en Arsenal");
    expect(model.sameSide).toEqual(arsenal);
    expect(model.collectionLabel).toBe("Se samlingen");
  });

  it("omits the count line when the count is unknown", () => {
    const model = buildSavedSheetModel({
      club: arsenal,
      seasonLabel: "2023/24",
      kitType: "away",
      count: null,
    });
    expect(model.countLine).toBeNull();
  });

  it("has no same-side action without a saved side", () => {
    const model = buildSavedSheetModel({
      club: null,
      seasonLabel: "2023/24",
      kitType: "home",
      count: 1,
    });
    expect(model.sameSideLabel).toBeNull();
    expect(model.sameSide).toBeNull();
    expect(model.summary).toBe("2023/24 · Hjemme");
  });
});

describe("PostSaveSheet source", () => {
  it("uses the new labels and drops the old ones", () => {
    const source = readFileSync(postSavePath, "utf8");
    expect(source).toContain("useCaptureChooser");
    expect(source).toContain("buildSavedSheetModel");
    expect(source).not.toContain("Samme klub");
    expect(source).not.toContain("Ny trøje");
    expect(source).not.toContain("Til samling");
    expect(source).toContain('variant="secondary"');
    expect(source).toContain('variant="tertiary"');
  });
});
