import { describe, expect, it } from "vitest";
import {
  applyIdentitySuggestion,
  createCaptureSession,
  getActiveDraft,
  selectDraftKitType,
  setDraftClub,
  setDraftSeason,
} from "../src/capture/captureSession";

const UUID = "550e8400-e29b-41d4-a716-446655440000";
const UUID_B = "550e8400-e29b-41d4-a716-446655440001";
const URI_FRONT = "file:///photos/front.jpg";
const URI_BACK = "file:///photos/back.jpg";

describe("applyIdentitySuggestion", () => {
  it("preselects only fields flagged in fieldPreselect", () => {
    const session = createCaptureSession([URI_FRONT, URI_BACK]);
    const draftId = getActiveDraft(session).id;

    const applied = applyIdentitySuggestion(
      session,
      draftId,
      {
        clubId: UUID,
        clubLabel: "FC Test",
        seasonId: UUID_B,
        type: "away",
      },
      {
        fieldPreselect: { club: true, season: false, type: true },
      },
    );

    const draft = getActiveDraft(applied);
    expect(draft.clubId).toBe(UUID);
    expect(draft.seasonId).toBeNull();
    expect(draft.kitType).toBe("away");
  });

  it("skips fields the collector already edited", () => {
    let session = createCaptureSession([URI_FRONT]);
    const draftId = getActiveDraft(session).id;
    session = setDraftClub(session, draftId, UUID, "Manual Club");

    const applied = applyIdentitySuggestion(
      session,
      draftId,
      {
        clubId: UUID_B,
        clubLabel: "Vision Club",
        seasonId: UUID_B,
        type: "home",
      },
      {
        fieldPreselect: { club: true, season: true, type: true },
        manualEdits: { club: true },
      },
    );

    const draft = getActiveDraft(applied);
    expect(draft.clubId).toBe(UUID);
    expect(draft.seasonId).toBe(UUID_B);
    expect(draft.kitType).toBe("home");
  });

  it("does not touch size or condition", () => {
    let session = createCaptureSession([URI_FRONT]);
    const draftId = getActiveDraft(session).id;
    session = selectDraftKitType(session, draftId, "third");

    const applied = applyIdentitySuggestion(
      session,
      draftId,
      { clubId: UUID, clubLabel: "FC Test", type: "home" },
      { fieldPreselect: { club: true, type: true } },
    );

    const draft = getActiveDraft(applied);
    expect(draft.kitType).toBe("home");
    expect(draft.size).toBeNull();
    expect(draft.condition).toBeNull();
  });
});
