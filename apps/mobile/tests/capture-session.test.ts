import type { JerseyCondition, JerseySize, KitType } from "@kit/domain";
import { PHOTO_ROLES } from "@kit/domain";
import { describe, expect, it } from "vitest";
import {
  addJerseyDraft,
  bindPhoto,
  branchFromPhotoCount,
  canSave,
  createCaptureSession,
  createMemoryCaptureSessionStore,
  getActiveDraft,
  getDraft,
  photoUriForRole,
  reloadCaptureSession,
  selectDraftCondition,
  selectDraftKitType,
  selectDraftSize,
  setDraftClub,
  setDraftSeason,
  unbindPhoto,
} from "../src/capture/captureSession";

const UUID = "550e8400-e29b-41d4-a716-446655440000";
const UUID_B = "550e8400-e29b-41d4-a716-446655440001";

const URI_FRONT = "file:///photos/front.jpg";
const URI_BACK = "file:///photos/back.jpg";
const URI_LABEL = "file:///photos/label.jpg";
const URI_EXTRA_A = "file:///photos/extra-a.jpg";
const URI_EXTRA_B = "file:///photos/extra-b.jpg";
const URI_EXTRA_C = "file:///photos/extra-c.jpg";
const URI_EXTRA_D = "file:///photos/extra-d.jpg";

function fillDraftForSave(
  session: ReturnType<typeof createCaptureSession>,
  draftId: string,
  {
    clubId = UUID,
    seasonId = UUID_B,
    kitType = "home" as KitType,
    size = "m" as JerseySize,
    condition = "used" as JerseyCondition,
  } = {},
) {
  let next = setDraftClub(session, draftId, clubId);
  next = setDraftSeason(next, draftId, seasonId);
  next = selectDraftKitType(next, draftId, kitType);
  next = selectDraftSize(next, draftId, size);
  next = selectDraftCondition(next, draftId, condition);
  return next;
}

describe("branchFromPhotoCount", () => {
  it("branches to single for 1–3 photos", () => {
    expect(branchFromPhotoCount(1)).toBe("single");
    expect(branchFromPhotoCount(2)).toBe("single");
    expect(branchFromPhotoCount(3)).toBe("single");
  });

  it("branches to bulk at 4+ photos", () => {
    expect(branchFromPhotoCount(4)).toBe("bulk");
    expect(branchFromPhotoCount(12)).toBe("bulk");
  });
});

describe("single branch role assignment", () => {
  it("fills front, back, and label in picker order and leaves leftover roles empty", () => {
    const session = createCaptureSession([URI_FRONT, URI_BACK, URI_LABEL]);
    const draft = getActiveDraft(session);

    expect(session.branch).toBe("single");
    expect(photoUriForRole(draft, "front")).toBe(URI_FRONT);
    expect(photoUriForRole(draft, "back")).toBe(URI_BACK);
    expect(photoUriForRole(draft, "label")).toBe(URI_LABEL);
  });

  it("assigns only front when one photo is picked", () => {
    const draft = getActiveDraft(createCaptureSession([URI_FRONT]));

    expect(photoUriForRole(draft, "front")).toBe(URI_FRONT);
    expect(photoUriForRole(draft, "back")).toBeNull();
    expect(photoUriForRole(draft, "label")).toBeNull();
  });

  it("assigns front and back when two photos are picked", () => {
    const draft = getActiveDraft(createCaptureSession([URI_FRONT, URI_BACK]));

    expect(photoUriForRole(draft, "front")).toBe(URI_FRONT);
    expect(photoUriForRole(draft, "back")).toBe(URI_BACK);
    expect(photoUriForRole(draft, "label")).toBeNull();
  });

  it("uses domain Photo roles front | back | label only", () => {
    const draft = getActiveDraft(createCaptureSession([URI_FRONT, URI_BACK, URI_LABEL]));

    expect(draft.photos.map((photo) => photo.role)).toEqual(["front", "back", "label"]);
    expect(new Set(draft.photos.map((photo) => photo.role))).toEqual(new Set(PHOTO_ROLES));
  });
});

describe("bulk branch", () => {
  it("starts with every photo unbound and one empty draft", () => {
    const session = createCaptureSession([
      URI_EXTRA_A,
      URI_EXTRA_B,
      URI_EXTRA_C,
      URI_EXTRA_D,
    ]);

    expect(session.branch).toBe("bulk");
    expect(session.unboundUris).toEqual([URI_EXTRA_A, URI_EXTRA_B, URI_EXTRA_C, URI_EXTRA_D]);
    expect(session.drafts).toHaveLength(1);
    expect(getActiveDraft(session).photos).toEqual([]);
  });
});

describe("bind, unbind, and addJersey", () => {
  it("bind attaches an unbound photo to a jersey draft with an optional role", () => {
    const session = createCaptureSession([URI_EXTRA_A, URI_EXTRA_B, URI_EXTRA_C, URI_EXTRA_D]);
    const draftId = getActiveDraft(session).id;

    const bound = bindPhoto(session, URI_EXTRA_A, draftId, "front");
    const draft = getDraft(bound, draftId);

    expect(bound.unboundUris).toEqual([URI_EXTRA_B, URI_EXTRA_C, URI_EXTRA_D]);
    expect(photoUriForRole(draft, "front")).toBe(URI_EXTRA_A);
  });

  it("unbind returns a bound photo to the unbound list", () => {
    const session = createCaptureSession([URI_EXTRA_A, URI_EXTRA_B, URI_EXTRA_C, URI_EXTRA_D]);
    const draftId = getActiveDraft(session).id;
    const bound = bindPhoto(session, URI_EXTRA_A, draftId, "back");

    const unbound = unbindPhoto(bound, URI_EXTRA_A);

    expect(unbound.unboundUris).toContain(URI_EXTRA_A);
    expect(photoUriForRole(getDraft(unbound, draftId), "back")).toBeNull();
  });

  it("addJersey creates another empty draft in the same session", () => {
    const session = createCaptureSession([URI_EXTRA_A, URI_EXTRA_B, URI_EXTRA_C, URI_EXTRA_D]);
    const firstDraftId = getActiveDraft(session).id;

    const withSecondJersey = addJerseyDraft(session);

    expect(withSecondJersey.drafts).toHaveLength(2);
    expect(withSecondJersey.activeDraftId).not.toBe(firstDraftId);
    expect(getDraft(withSecondJersey, withSecondJersey.activeDraftId).photos).toEqual([]);
    expect(withSecondJersey.unboundUris).toEqual(session.unboundUris);
  });
});

describe("canSave", () => {
  it("is false until photo, club, season, kit type, size, and condition are explicitly set", () => {
    const session = createCaptureSession([URI_FRONT]);
    const draftId = getActiveDraft(session).id;

    expect(canSave(getDraft(session, draftId))).toBe(false);

    const withClub = setDraftClub(session, draftId, UUID);
    expect(canSave(getDraft(withClub, draftId))).toBe(false);

    const withSeason = setDraftSeason(withClub, draftId, UUID_B);
    expect(canSave(getDraft(withSeason, draftId))).toBe(false);

    const withKitType = selectDraftKitType(withSeason, draftId, "home");
    expect(canSave(getDraft(withKitType, draftId))).toBe(false);

    const withSize = selectDraftSize(withKitType, draftId, "m");
    expect(canSave(getDraft(withSize, draftId))).toBe(false);

    const complete = selectDraftCondition(withSize, draftId, "used");
    expect(canSave(getDraft(complete, draftId))).toBe(true);
  });

  it("stays false when only metadata is set but the draft has no photo", () => {
    const session = createCaptureSession([URI_EXTRA_A, URI_EXTRA_B, URI_EXTRA_C, URI_EXTRA_D]);
    const draftId = getActiveDraft(session).id;
    const filled = fillDraftForSave(session, draftId);

    expect(canSave(getDraft(filled, draftId))).toBe(false);
  });

  it("is true for a bulk draft once a photo is bound and all fields are selected", () => {
    const session = createCaptureSession([URI_EXTRA_A, URI_EXTRA_B, URI_EXTRA_C, URI_EXTRA_D]);
    const draftId = getActiveDraft(session).id;
    const bound = bindPhoto(session, URI_EXTRA_A, draftId, "label");
    const complete = fillDraftForSave(bound, draftId);

    expect(canSave(getDraft(complete, draftId))).toBe(true);
  });
});

describe("canSave and silent sqlite defaults", () => {
  it("does not treat home / m / used storage defaults as explicit chip selection", () => {
    const session = createCaptureSession([URI_FRONT]);
    const draft = getActiveDraft(session);

    expect(draft.kitType).toBeNull();
    expect(draft.size).toBeNull();
    expect(draft.condition).toBeNull();
    expect(canSave(draft)).toBe(false);

    const withClubAndSeason = setDraftSeason(setDraftClub(session, draft.id, UUID), draft.id, UUID_B);
    const stillBlocked = getDraft(withClubAndSeason, draft.id);

    expect(stillBlocked.kitType).toBeNull();
    expect(stillBlocked.size).toBeNull();
    expect(stillBlocked.condition).toBeNull();
    expect(canSave(stillBlocked)).toBe(false);
  });
});

describe("persistence", () => {
  it("survives reload after pick, bind, unbind, and field changes", () => {
    const store = createMemoryCaptureSessionStore();
    let session = createCaptureSession(
      [URI_EXTRA_A, URI_EXTRA_B, URI_EXTRA_C, URI_EXTRA_D],
      { store },
    );
    const draftId = getActiveDraft(session).id;

    session = bindPhoto(session, URI_EXTRA_A, draftId, "front");
    session = bindPhoto(session, URI_EXTRA_B, draftId, "back");
    session = unbindPhoto(session, URI_EXTRA_B);
    session = addJerseyDraft(session);
    session = setDraftClub(session, draftId, UUID);
    session = selectDraftKitType(session, draftId, "away");

    const reloaded = reloadCaptureSession(store);

    expect(reloaded).not.toBeNull();
    expect(reloaded!.branch).toBe("bulk");
    expect(reloaded!.unboundUris).toEqual([URI_EXTRA_B, URI_EXTRA_C, URI_EXTRA_D]);
    expect(reloaded!.drafts).toHaveLength(2);
    expect(photoUriForRole(getDraft(reloaded!, draftId), "front")).toBe(URI_EXTRA_A);
    expect(getDraft(reloaded!, draftId).clubId).toBe(UUID);
    expect(getDraft(reloaded!, draftId).kitType).toBe("away");
  });
});
