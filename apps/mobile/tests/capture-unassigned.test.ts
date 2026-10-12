import { describe, expect, it } from "vitest";
import {
  bindUnboundPhotosToDraft,
  createCaptureSession,
  createDraftFromUnbound,
  selectDraftKitType,
  setDraftCatalogSide,
  setDraftSeason,
} from "../src/capture/captureSession";
import type { CaptureSessionState } from "../src/capture/captureSessionTypes";
import {
  deleteConfirmCopy,
  draftPickerRows,
  leftBehindCount,
  selectedCaption,
  selectionBadge,
  toggleSelection,
  unassignedDock,
  unassignedExit,
} from "../src/capture/unassignedPhotos";

const URIS = Array.from({ length: 14 }, (_, index) => `file:///photos/u-${index}.jpg`);

/** A bulk session whose first draft holds `count` photos, named FC Barcelona 2023/24 Hjemme. */
function sessionWithDraft(count: number): { state: CaptureSessionState; draftId: string } {
  let state = createCaptureSession(URIS);
  state = createDraftFromUnbound(state, URIS.slice(0, count));
  const draftId = state.activeDraftId;
  state = setDraftCatalogSide(state, draftId, { id: "fcb", label: "FC Barcelona", kind: "club" });
  state = setDraftSeason(state, draftId, "fcb-23", "2023/24");
  state = selectDraftKitType(state, draftId, "home");
  return { state, draftId };
}

describe("selection in pick order", () => {
  it("numbers the badges 1, 2, 3 in the order the photos were picked", () => {
    const [a, b, c] = URIS as [string, string, string];
    let selection: string[] = [];
    selection = toggleSelection(selection, b);
    selection = toggleSelection(selection, a);
    selection = toggleSelection(selection, c);

    expect(selectionBadge(selection, b)).toBe(1);
    expect(selectionBadge(selection, a)).toBe(2);
    expect(selectionBadge(selection, c)).toBe(3);
    expect(selectionBadge(selection, URIS[5] ?? "")).toBeNull();
  });

  it("renumbers the rest when a photo is deselected", () => {
    const [a, b, c] = URIS as [string, string, string];
    let selection = [a, b, c];
    selection = toggleSelection(selection, a);

    expect(selection).toEqual([b, c]);
    expect(selectionBadge(selection, b)).toBe(1);
    expect(selectionBadge(selection, c)).toBe(2);
    expect(selectionBadge(selection, a)).toBeNull();
  });

  it("does not mutate the selection it is given", () => {
    const selection = [URIS[0] ?? ""];
    toggleSelection(selection, URIS[1] ?? "");
    expect(selection).toEqual([URIS[0]]);
  });
});

describe("dock", () => {
  it("reads the count in the primary label, singular for one photo", () => {
    expect(unassignedDock(1, true).primary.label).toBe("Ny trøje af 1 foto");
    expect(unassignedDock(3, true).primary.label).toBe("Ny trøje af 3 fotos");
  });

  it("holds the other two actions under the primary", () => {
    const dock = unassignedDock(2, true);
    expect(dock.addToDraft.label).toBe("Læg til en trøje");
    expect(dock.discard.label).toBe("Slet");
  });

  it("disables all three at zero selected and enables them with one", () => {
    const none = unassignedDock(0, true);
    expect(none.primary.disabled).toBe(true);
    expect(none.addToDraft.disabled).toBe(true);
    expect(none.discard.disabled).toBe(true);
    expect(none.primary.label).toBe("Ny trøje");

    const one = unassignedDock(1, true);
    expect(one.primary.disabled).toBe(false);
    expect(one.addToDraft.disabled).toBe(false);
    expect(one.discard.disabled).toBe(false);
  });

  it("keeps Læg til en trøje disabled while there is no jersey to add to", () => {
    const dock = unassignedDock(2, false);
    expect(dock.addToDraft.disabled).toBe(true);
    expect(dock.primary.disabled).toBe(false);
    expect(dock.discard.disabled).toBe(false);
  });

  it("names the selected count under the Sheet title", () => {
    expect(selectedCaption(1)).toBe("1 foto valgt");
    expect(selectedCaption(4)).toBe("4 fotos valgt");
  });

  it("asks before it deletes, with the count in the title", () => {
    expect(deleteConfirmCopy(1).title).toBe("Slet 1 foto?");
    expect(deleteConfirmCopy(3).title).toBe("Slet 3 fotos?");
    expect(deleteConfirmCopy(3).confirmLabel).toBe("Slet");
    expect(deleteConfirmCopy(3).consequence.length).toBeGreaterThan(0);
  });
});

describe("Læg til en trøje picker", () => {
  it("lists a jersey with its identity and photo count", () => {
    const { state, draftId } = sessionWithDraft(3);

    const rows = draftPickerRows(state);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.draftId).toBe(draftId);
    expect(rows[0]?.title).toBe("FC Barcelona");
    expect(rows[0]?.meta).toBe("2023/24 · Hjemme · 3 fotos");
    expect(rows[0]?.thumbUri).toBe(URIS[0]);
    expect(rows[0]?.full).toBe(false);
  });

  it("does not repeat the photo count while the jersey has no identity yet", () => {
    let state = createCaptureSession(URIS);
    state = createDraftFromUnbound(state, URIS.slice(0, 1));

    expect(draftPickerRows(state)[0]?.meta).toBe("1 foto");
  });

  it("marks a jersey with 10 photos as Fuld and not pressable", () => {
    const { state } = sessionWithDraft(10);

    const row = draftPickerRows(state)[0];

    expect(row?.full).toBe(true);
    expect(row?.row.statusLabel).toBe("Fuld");
  });

  it("keeps a jersey with room pressable and without a status word", () => {
    const { state } = sessionWithDraft(9);

    const row = draftPickerRows(state)[0];

    expect(row?.full).toBe(false);
    expect(row?.row.statusLabel).toBeNull();
  });

  it("does not list a draft without photos", () => {
    const state = createCaptureSession(URIS);

    expect(state.drafts.length).toBeGreaterThan(0);
    expect(draftPickerRows(state)).toEqual([]);
  });
});

describe("photos left behind", () => {
  it("counts the selected photos that are still without a jersey after a bind at the cap", () => {
    const { state, draftId } = sessionWithDraft(8);
    const selection = URIS.slice(8, 12);

    const next = bindUnboundPhotosToDraft(state, selection, draftId);

    expect(leftBehindCount(selection, next)).toBe(2);
  });

  it("is zero when every selected photo found its jersey", () => {
    const { state, draftId } = sessionWithDraft(3);
    const selection = URIS.slice(3, 6);

    const next = bindUnboundPhotosToDraft(state, selection, draftId);

    expect(leftBehindCount(selection, next)).toBe(0);
  });

  it("counts what a new jersey of more than 10 photos leaves loose", () => {
    const selection = URIS.slice(0, 12);

    const next = createDraftFromUnbound(createCaptureSession(URIS), selection);

    expect(leftBehindCount(selection, next)).toBe(2);
  });
});

describe("one way out", () => {
  it("goes to the overview once no photo is left without a jersey", () => {
    const four = URIS.slice(0, 4);
    const session = createCaptureSession(four);
    expect(unassignedExit(session, true)).toBeNull();

    const sorted = createDraftFromUnbound(session, four);

    expect(sorted.unboundUris).toEqual([]);
    expect(unassignedExit(sorted, true)).toBe("overview");
  });

  it("goes to Samling when the session is gone, and waits while it is still loading", () => {
    expect(unassignedExit(null, true)).toBe("collection");
    expect(unassignedExit(null, false)).toBeNull();
  });
});
