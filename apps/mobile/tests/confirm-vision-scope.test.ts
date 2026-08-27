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
  shouldResetConfirmVision,
} from "../src/capture/confirmVisionScope";

const UUID = "550e8400-e29b-41d4-a716-446655440000";
const UUID_B = "550e8400-e29b-41d4-a716-446655440001";
const URI_FRONT = "file:///photos/front.jpg";
const URI_EXTRA_A = "file:///photos/extra-a.jpg";
const URI_EXTRA_B = "file:///photos/extra-b.jpg";
const URI_EXTRA_C = "file:///photos/extra-c.jpg";
const URI_EXTRA_D = "file:///photos/extra-d.jpg";

describe("confirmVisionScopeFromDraft", () => {
  it("tracks draft id and first bound photo only", () => {
    const session = createCaptureSession([URI_EXTRA_A, URI_EXTRA_B, URI_EXTRA_C, URI_EXTRA_D]);
    const draft = getActiveDraft(session);

    expect(confirmVisionScopeFromDraft(draft)).toEqual({
      draftId: draft.id,
      firstPhotoUri: null,
    });

    const bound = bindUnboundPhotoToDraft(session, URI_EXTRA_A, draft.id);
    const boundDraft = getDraft(bound, draft.id);

    expect(confirmVisionScopeFromDraft(boundDraft)).toEqual({
      draftId: draft.id,
      firstPhotoUri: URI_EXTRA_A,
    });
  });
});

describe("shouldResetConfirmVision", () => {
  it("does not reset when club, season, or kit type changes on the same draft and photo", () => {
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
    const session = createCaptureSession([URI_EXTRA_A, URI_EXTRA_B, URI_EXTRA_C, URI_EXTRA_D]);
    const before = confirmVisionScopeFromDraft(getActiveDraft(session));

    const withSecondJersey = addJerseyDraft(session);
    const after = confirmVisionScopeFromDraft(getActiveDraft(withSecondJersey));

    expect(shouldResetConfirmVision(before, after)).toBe(true);
  });

  it("resets when the first photo is newly bound on a draft", () => {
    const session = createCaptureSession([URI_EXTRA_A, URI_EXTRA_B, URI_EXTRA_C, URI_EXTRA_D]);
    const draftId = getActiveDraft(session).id;
    const before = confirmVisionScopeFromDraft(getDraft(session, draftId));

    const bound = bindUnboundPhotoToDraft(session, URI_EXTRA_A, draftId);
    const after = confirmVisionScopeFromDraft(getDraft(bound, draftId));

    expect(shouldResetConfirmVision(before, after)).toBe(true);
  });
});
