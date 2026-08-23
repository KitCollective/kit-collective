import { describe, expect, it } from "vitest";
import {
  canSaveGenvej,
  manageRowAccessibilityLabel,
  resolveGenvejeSheetTitle,
  seedClubForEdit,
  shouldFallbackToAlleOnFetchError,
  shouldResetShortcutAfterDelete,
} from "../src/components/genveje-sheet-logic";

const UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("resolveGenvejeSheetTitle", () => {
  it("uses locked Genveje title for list mode", () => {
    expect(resolveGenvejeSheetTitle("list")).toBe("Genveje");
  });

  it("uses locked Ny genvej title for add and edit form mode", () => {
    expect(resolveGenvejeSheetTitle("form")).toBe("Ny genvej");
  });
});

describe("canSaveGenvej", () => {
  it("disables Gem until a club is selected", () => {
    expect(canSaveGenvej(null, false)).toBe(false);
    expect(canSaveGenvej({ id: UUID, label: "F.C. København" }, false)).toBe(true);
    expect(canSaveGenvej({ id: UUID, label: "F.C. København" }, true)).toBe(false);
  });
});

describe("seedClubForEdit", () => {
  it("seeds the club picker with the resolved club label", () => {
    expect(
      seedClubForEdit({
        id: UUID,
        name: "FCK",
        sortOrder: 0,
        clubId: UUID,
        clubLabel: "F.C. København",
        matchCount: 2,
      }),
    ).toEqual({ id: UUID, label: "F.C. København" });
  });

  it("returns null when club label is missing", () => {
    expect(
      seedClubForEdit({
        id: UUID,
        name: "FCK",
        sortOrder: 0,
        clubId: UUID,
        clubLabel: null,
        matchCount: 0,
      }),
    ).toBeNull();
  });
});

describe("manageRowAccessibilityLabel", () => {
  it("includes match count in the row accessible name for Flyt manage rows", () => {
    expect(manageRowAccessibilityLabel("F.C. København", 3)).toBe("F.C. København, 3");
  });
});

describe("shouldResetShortcutAfterDelete", () => {
  it("resets Alle when the active genvej chip is deleted", () => {
    expect(shouldResetShortcutAfterDelete("shortcut-a", "shortcut-a")).toBe(true);
    expect(shouldResetShortcutAfterDelete("shortcut-a", "shortcut-b")).toBe(false);
    expect(shouldResetShortcutAfterDelete("shortcut-a", null)).toBe(false);
  });
});

describe("shouldFallbackToAlleOnFetchError", () => {
  it("falls back to Alle when filtered collection fetch 404s", () => {
    expect(shouldFallbackToAlleOnFetchError(404, UUID)).toBe(true);
    expect(shouldFallbackToAlleOnFetchError(404, null)).toBe(false);
    expect(shouldFallbackToAlleOnFetchError(500, UUID)).toBe(false);
  });
});
