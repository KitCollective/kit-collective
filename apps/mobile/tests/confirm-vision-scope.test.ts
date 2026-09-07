import { describe, expect, it } from "vitest";
import {
  addJerseyDraft,
  bindUnboundPhotoToDraft,
  createCaptureSession,
  getActiveDraft,
  getDraft,
  selectDraftKitType,
  setDraftClub,
  setDraftSeason,
} from "../src/capture/captureSession";
import {
  confirmVisionScopeFromDraft,
  draftPhotoFingerprint,
  shouldResetConfirmVision,
} from "../src/capture/confirmVisionScope";

const UUID = "550e8400-e29b-41d4-a716-446655440000";
const UUID_B = "550e8400-e29b-41d4-a716-446655440001";
const URI_FRONT = "file:///photos/front.jpg";
const URI_BACK = "file:///photos/back.jpg";
const BULK_URIS = Array.from({ length: 11 }, (_, index) => `file:///photos/bulk-${index}.jpg`);
const BULK_URI_A = BULK_URIS[0];
if (!BULK_URI_A) {
  throw new Error("expected bulk fixture uris");
}

describe("draftPhotoFingerprint", () => {
  it("tracks all bound photos on the draft", () => {
    const session = createCaptureSession([URI_FRONT, URI_BACK]);
    const draft = getActiveDraft(session);

    expect(draftPhotoFingerprint(draft)).toBe([URI_BACK, URI_FRONT].sort().join("\0"));
  });
});

describe("confirmVisionScopeFromDraft", () => {
  it("tracks draft id and all bound photos", () => {
    const session = createCaptureSession(BULK_URIS);
    const draft = getActiveDraft(session);

    expect(confirmVisionScopeFromDraft(draft)).toEqual({
      draftId: draft.id,
      photoFingerprint: null,
    });

    const bound = bindUnboundPhotoToDraft(session, BULK_URI_A, draft.id);
    const boundDraft = getDraft(bound, draft.id);

    expect(confirmVisionScopeFromDraft(boundDraft)).toEqual({
      draftId: draft.id,
      photoFingerprint: BULK_URI_A,
    });
  });
});

describe("shouldResetConfirmVision", () => {
  it("does not reset when club, season, or kit type changes on the same draft and photos", () => {
    let session = createCaptureSession([URI_FRONT]);
    const draftId = getActiveDraft(session).id;
    const before = confirmVisionScopeFromDraft(getActiveDraft(session));

    session = setDraftClub(session, draftId, UUID, "FC Test");
    expect(
      shouldResetConfirmVision(before, confirmVisionScopeFromDraft(getActiveDraft(session))),
    ).toBe(false);

    session = setDraftSeason(session, draftId, UUID_B);
    expect(
      shouldResetConfirmVision(before, confirmVisionScopeFromDraft(getActiveDraft(session))),
    ).toBe(false);

    session = selectDraftKitType(session, draftId, "away");
    expect(
      shouldResetConfirmVision(before, confirmVisionScopeFromDraft(getActiveDraft(session))),
    ).toBe(false);
  });

  it("resets when the active jersey tab changes", () => {
    const session = createCaptureSession(BULK_URIS);
    const before = confirmVisionScopeFromDraft(getActiveDraft(session));

    const withSecondJersey = addJerseyDraft(session);
    const after = confirmVisionScopeFromDraft(getActiveDraft(withSecondJersey));

    expect(shouldResetConfirmVision(before, after)).toBe(true);
  });

  it("resets when another photo is bound on the draft", () => {
    const session = createCaptureSession(BULK_URIS);
    const draftId = getActiveDraft(session).id;
    const before = confirmVisionScopeFromDraft(getDraft(session, draftId));

    const bound = bindUnboundPhotoToDraft(session, BULK_URI_A, draftId);
    const after = confirmVisionScopeFromDraft(getDraft(bound, draftId));

    expect(shouldResetConfirmVision(before, after)).toBe(true);
  });

  it("resets when a second photo is added on single branch", () => {
    const session = createCaptureSession([URI_FRONT]);
    const before = confirmVisionScopeFromDraft(getActiveDraft(session));

    const withBack = createCaptureSession([URI_FRONT, URI_BACK]);
    const after = confirmVisionScopeFromDraft(getActiveDraft(withBack));

    expect(shouldResetConfirmVision(before, after)).toBe(true);
  });
});
