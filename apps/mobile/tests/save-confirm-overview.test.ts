import { describe, expect, it } from "vitest";
import { advanceBulkSessionAfterSave } from "../src/capture/bulkSaveAdvance";
import {
  firstUnsavedDraftId,
  overviewRows,
  unsavedDraftCount,
} from "../src/capture/captureOverview";
import {
  applyGroupingSuggestion,
  createCaptureSession,
  markOverviewSession,
  selectDraftCondition,
  selectDraftKitType,
  selectDraftSize,
  setDraftCatalogSide,
  setDraftSeason,
} from "../src/capture/captureSession";
import type { CaptureSessionState } from "../src/capture/captureSessionTypes";

const URIS = Array.from({ length: 6 }, (_, index) => `file:///photos/s-${index}.jpg`);

/** Three complete drafts of two photos each, every group confident. */
function completeSession(overview: boolean): CaptureSessionState {
  const base = createCaptureSession(URIS);
  const idOf = (uri: string) => base.photoIdByUri?.[uri] ?? "";
  let state = applyGroupingSuggestion(
    base,
    {
      groups: [
        { photoIds: [idOf(URIS[0] ?? ""), idOf(URIS[1] ?? "")], confidence: 90 },
        { photoIds: [idOf(URIS[2] ?? ""), idOf(URIS[3] ?? "")], confidence: 90 },
        { photoIds: [idOf(URIS[4] ?? ""), idOf(URIS[5] ?? "")], confidence: 90 },
      ],
    },
    {},
  );
  for (const draft of state.drafts) {
    state = setDraftCatalogSide(state, draft.id, { id: "club-1", label: "FCK", kind: "club" });
    state = setDraftSeason(state, draft.id, "season-1", "2023/24");
    state = selectDraftKitType(state, draft.id, "home");
    state = selectDraftSize(state, draft.id, "m");
    state = selectDraftCondition(state, draft.id, "used");
  }
  return overview ? markOverviewSession(state) : state;
}

function holder(initial: CaptureSessionState) {
  let current = initial;
  return {
    get state() {
      return current;
    },
    mutate: (updater: (state: CaptureSessionState) => CaptureSessionState) => {
      current = updater(current);
      return current;
    },
  };
}

function saveActive(session: ReturnType<typeof holder>) {
  const draft = session.state.drafts.find((entry) => entry.id === session.state.activeDraftId);
  if (!draft) {
    throw new Error("no active draft");
  }
  return advanceBulkSessionAfterSave({ draft, stickySize: "m", mutate: session.mutate });
}

describe("what a saved jersey does to a bulk session", () => {
  it("returns overview-continue with the unsaved jerseys left, then none", () => {
    const session = holder(completeSession(true));
    expect(unsavedDraftCount(session.state)).toBe(3);

    expect(saveActive(session)).toEqual({ status: "overview-continue", remaining: 2 });
    expect(saveActive(session)).toEqual({ status: "overview-continue", remaining: 1 });
    expect(saveActive(session)).toEqual({ status: "overview-continue", remaining: 0 });

    expect(overviewRows(session.state).map((row) => row.statusLabel)).toEqual([
      "Gemt",
      "Gemt",
      "Gemt",
    ]);
    expect(firstUnsavedDraftId(session.state)).toBeNull();
  });

  it("advances the active draft to the next unsaved one after each save", () => {
    const session = holder(completeSession(true));
    const order = overviewRows(session.state).map((row) => row.draftId);
    expect(session.state.activeDraftId).toBe(order[0]);

    saveActive(session);
    expect(session.state.activeDraftId).toBe(order[1]);
    saveActive(session);
    expect(session.state.activeDraftId).toBe(order[2]);
  });

  it("keeps the plain bulk behaviour outside the overview, and ends the session after the last", () => {
    const session = holder(completeSession(false));
    expect(saveActive(session)).toEqual({ status: "bulk-continue" });
    expect(session.state.savedDrafts ?? []).toEqual([]);
    expect(saveActive(session)).toEqual({ status: "bulk-continue" });
    expect(saveActive(session)).toEqual({ status: "session-done" });
  });
});
