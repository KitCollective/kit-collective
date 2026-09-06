import type { JerseyCondition, JerseySize, KitType } from "@kit/domain";
import { PHOTO_ROLES } from "@kit/domain";
import { describe, expect, it } from "vitest";
import {
  addJerseyDraft,
  bindPhoto,
  bindUnboundPhotoToDraft,
  branchFromPhotoCount,
  canAddPhotoToDraft,
  canSave,
  changeDraftPhotoRole,
  createCaptureSession,
  createMemoryCaptureSessionStore,
  getActiveDraft,
  getDraft,
  nextAvailableRole,
  photoUriForRole,
  reloadCaptureSession,
  removeDraft,
  removeDraftPhoto,
  selectDraftCondition,
  selectDraftKitType,
  selectDraftSize,
  setActiveDraft,
  setDraftClub,
  setDraftNotes,
  setDraftPhotoLabel,
  setDraftSeason,
  switchSingleToBulkBind,
  unbindPhoto,
  upsertDraftPhoto,
} from "../src/capture/captureSession";

const UUID = "550e8400-e29b-41d4-a716-446655440000";
const UUID_B = "550e8400-e29b-41d4-a716-446655440001";

const URI_FRONT = "file:///photos/front.jpg";
const URI_BACK = "file:///photos/back.jpg";
const URI_LABEL = "file:///photos/label.jpg";
const URI_EXTRA_A = "file:///photos/extra-a.jpg";
const URI_EXTRA_B = "file:///photos/extra-b.jpg";

const BULK_URIS = Array.from({ length: 11 }, (_, index) => `file:///photos/bulk-${index}.jpg`);
const BULK_URI_A = BULK_URIS[0];
const BULK_URI_B = BULK_URIS[1];
if (!BULK_URI_A || !BULK_URI_B) {
  throw new Error("expected bulk fixture uris");
}

function fillDraftForSave(
  session: ReturnType<typeof createCaptureSession>,
  draftId: string,
  {
    clubId = UUID,
    seasonId = UUID_B,
    kitType = "home",
    size = "m",
    condition = "used",
  }: {
    clubId?: string;
    seasonId?: string;
    kitType?: KitType;
    size?: JerseySize;
    condition?: JerseyCondition;
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
  it("branches to single for 1–10 photos", () => {
    for (let count = 1; count <= 10; count += 1) {
      expect(branchFromPhotoCount(count)).toBe("single");
    }
  });

  it("branches to bulk at 11+ photos", () => {
    expect(branchFromPhotoCount(11)).toBe("bulk");
    expect(branchFromPhotoCount(12)).toBe("bulk");
  });
});

describe("single branch role assignment", () => {
  it("fills front, back, and left in picker order and leaves leftover roles empty", () => {
    const session = createCaptureSession([URI_FRONT, URI_BACK, URI_LABEL]);
    const draft = getActiveDraft(session);

    expect(session.branch).toBe("single");
    expect(photoUriForRole(draft, "front")).toBe(URI_FRONT);
    expect(photoUriForRole(draft, "back")).toBe(URI_BACK);
    expect(photoUriForRole(draft, "left")).toBe(URI_LABEL);
  });

  it("assigns only front when one photo is picked", () => {
    const draft = getActiveDraft(createCaptureSession([URI_FRONT]));

    expect(photoUriForRole(draft, "front")).toBe(URI_FRONT);
    expect(photoUriForRole(draft, "back")).toBeNull();
    expect(photoUriForRole(draft, "left")).toBeNull();
  });

  it("assigns front and back when two photos are picked", () => {
    const draft = getActiveDraft(createCaptureSession([URI_FRONT, URI_BACK]));

    expect(photoUriForRole(draft, "front")).toBe(URI_FRONT);
    expect(photoUriForRole(draft, "back")).toBe(URI_BACK);
    expect(photoUriForRole(draft, "left")).toBeNull();
  });

  it("assigns four universal roles then Andet for gallery picks up to ten", () => {
    const uris = Array.from({ length: 7 }, (_, index) => `file:///photos/pick-${index}.jpg`);
    const session = createCaptureSession(uris);
    const draft = getActiveDraft(session);

    expect(session.branch).toBe("single");
    expect(draft.photos).toHaveLength(7);
    expect(photoUriForRole(draft, "front")).toBe(uris[0]);
    expect(photoUriForRole(draft, "right")).toBe(uris[3]);
    expect(draft.photos.filter((photo) => photo.role === "other")).toHaveLength(3);
  });

  it("uses domain Photo roles front | back | left | right | other", () => {
    const draft = getActiveDraft(createCaptureSession([URI_FRONT, URI_BACK, URI_LABEL]));

    expect(draft.photos.map((photo) => photo.role)).toEqual(["front", "back", "left"]);
    expect(PHOTO_ROLES).toContain("other");
    expect(PHOTO_ROLES).not.toContain("label");
  });
});

describe("bulk branch", () => {
  it("starts with every photo unbound and one empty draft", () => {
    const uris = Array.from({ length: 11 }, (_, index) => `file:///photos/extra-${index}.jpg`);
    const session = createCaptureSession(uris);

    expect(session.branch).toBe("bulk");
    expect(session.unboundUris).toEqual(uris);
    expect(session.drafts).toHaveLength(1);
    expect(getActiveDraft(session).photos).toEqual([]);
  });
});

describe("bind, unbind, and addJersey", () => {
  it("bind attaches an unbound photo to a jersey draft with an optional role", () => {
    const session = createCaptureSession(BULK_URIS);
    const draftId = getActiveDraft(session).id;

    const bound = bindPhoto(session, BULK_URI_A, draftId, "front");
    const draft = getDraft(bound, draftId);

    expect(bound.unboundUris).toEqual(BULK_URIS.slice(1));
    expect(photoUriForRole(draft, "front")).toBe(BULK_URIS[0]);
  });

  it("unbind returns a bound photo to the unbound list", () => {
    const session = createCaptureSession(BULK_URIS);
    const draftId = getActiveDraft(session).id;
    const bound = bindPhoto(session, BULK_URI_A, draftId, "back");

    const unbound = unbindPhoto(bound, BULK_URI_A);

    expect(unbound.unboundUris).toContain(BULK_URIS[0]);
    expect(photoUriForRole(getDraft(unbound, draftId), "back")).toBeNull();
  });

  it("addJersey creates another empty draft in the same session", () => {
    const session = createCaptureSession(BULK_URIS);
    const firstDraftId = getActiveDraft(session).id;

    const withSecondJersey = addJerseyDraft(session);

    expect(withSecondJersey.drafts).toHaveLength(2);
    expect(withSecondJersey.activeDraftId).not.toBe(firstDraftId);
    expect(getDraft(withSecondJersey, withSecondJersey.activeDraftId).photos).toEqual([]);
    expect(withSecondJersey.unboundUris).toEqual(session.unboundUris);
  });

  it("setActiveDraft switches the bind target tab", () => {
    const session = createCaptureSession(BULK_URIS);
    const withSecondJersey = addJerseyDraft(session);
    const secondDraftId = withSecondJersey.activeDraftId;
    const firstDraft = session.drafts[0];
    if (firstDraft === undefined) {
      throw new Error("expected first draft");
    }

    const switched = setActiveDraft(withSecondJersey, firstDraft.id);

    expect(switched.activeDraftId).toBe(firstDraft.id);
    expect(switched.activeDraftId).not.toBe(secondDraftId);
  });

  it("removeDraft drops a saved jersey and advances the active tab", () => {
    const session = createCaptureSession(BULK_URIS);
    const withSecondJersey = addJerseyDraft(session);
    const firstDraft = session.drafts[0];
    if (firstDraft === undefined) {
      throw new Error("expected first draft");
    }
    const firstDraftId = firstDraft.id;

    const removed = removeDraft(withSecondJersey, firstDraftId);

    expect(removed.drafts).toHaveLength(1);
    expect(removed.activeDraftId).toBe(withSecondJersey.activeDraftId);
  });

  it("bindUnboundPhotoToDraft assigns the next available role", () => {
    const session = createCaptureSession(BULK_URIS);
    const draftId = getActiveDraft(session).id;

    const bound = bindUnboundPhotoToDraft(session, BULK_URI_A, draftId);
    const draft = getDraft(bound, draftId);

    expect(nextAvailableRole(draft)).toBe("back");
    expect(photoUriForRole(draft, "front")).toBe(BULK_URIS[0]);
  });

  it("switchSingleToBulkBind keeps photos on the current draft", () => {
    const session = createCaptureSession([URI_FRONT, URI_BACK, URI_LABEL]);
    const draftId = getActiveDraft(session).id;

    const bulk = switchSingleToBulkBind(session);
    const draft = getDraft(bulk, draftId);

    expect(bulk.branch).toBe("bulk");
    expect(bulk.unboundUris).toEqual([]);
    expect(draft.photos).toHaveLength(3);
    expect(photoUriForRole(draft, "front")).toBe(URI_FRONT);
  });
});

describe("setDraftNotes", () => {
  it("persists notes on the active draft", () => {
    const session = createCaptureSession([URI_FRONT]);
    const draftId = getActiveDraft(session).id;

    const withNotes = setDraftNotes(session, draftId, "Match-worn");
    expect(getDraft(withNotes, draftId).notes).toBe("Match-worn");
  });
});

describe("setDraftClub", () => {
  it("clears season when the club changes", () => {
    const session = createCaptureSession([URI_FRONT]);
    const draftId = getActiveDraft(session).id;

    let next = setDraftClub(session, draftId, UUID);
    next = setDraftSeason(next, draftId, UUID_B);
    expect(getDraft(next, draftId).seasonId).toBe(UUID_B);

    next = setDraftClub(next, draftId, "660e8400-e29b-41d4-a716-446655440002");
    expect(getDraft(next, draftId).seasonId).toBeNull();
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
    const session = createCaptureSession(BULK_URIS);
    const draftId = getActiveDraft(session).id;
    const filled = fillDraftForSave(session, draftId);

    expect(canSave(getDraft(filled, draftId))).toBe(false);
  });

  it("is true for a bulk draft once a photo is bound and all fields are selected", () => {
    const session = createCaptureSession(BULK_URIS);
    const draftId = getActiveDraft(session).id;
    const bound = bindPhoto(session, BULK_URI_A, draftId, "left");
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

    const withClubAndSeason = setDraftSeason(
      setDraftClub(session, draft.id, UUID),
      draft.id,
      UUID_B,
    );
    const stillBlocked = getDraft(withClubAndSeason, draft.id);

    expect(stillBlocked.kitType).toBeNull();
    expect(stillBlocked.size).toBeNull();
    expect(stillBlocked.condition).toBeNull();
    expect(canSave(stillBlocked)).toBe(false);
  });
});

describe("removeDraftPhoto", () => {
  it("removes the photo for a role and leaves other photos and fields untouched", () => {
    const session = createCaptureSession([URI_FRONT, URI_BACK, URI_LABEL]);
    const draftId = getActiveDraft(session).id;

    const withClub = setDraftClub(session, draftId, UUID);
    const removed = removeDraftPhoto(withClub, draftId, "back");
    const draft = getDraft(removed, draftId);

    expect(photoUriForRole(draft, "front")).toBe(URI_FRONT);
    expect(photoUriForRole(draft, "back")).toBeNull();
    expect(photoUriForRole(draft, "left")).toBe(URI_LABEL);
    expect(draft.clubId).toBe(UUID);
    expect(draft.photos).toHaveLength(2);
  });
});

describe("many Andet photos and jersey cap", () => {
  it("allows many Andet photos with optional Beskrivelse", () => {
    let session = createCaptureSession([URI_FRONT]);
    const draftId = getActiveDraft(session).id;

    session = upsertDraftPhoto(session, draftId, "other", URI_EXTRA_A, "gallery");
    session = upsertDraftPhoto(session, draftId, "other", URI_EXTRA_B, "gallery");
    session = setDraftPhotoLabel(session, draftId, URI_EXTRA_A, "Vaskemærke");

    const draft = getDraft(session, draftId);
    expect(draft.photos.filter((photo) => photo.role === "other")).toHaveLength(2);
    expect(draft.photos.find((photo) => photo.uri === URI_EXTRA_A)?.label).toBe("Vaskemærke");
  });

  it("refuses an eleventh photo without dropping silently", () => {
    const uris = Array.from({ length: 10 }, (_, index) => `file:///photos/cap-${index}.jpg`);
    let session = createCaptureSession(uris);
    const draftId = getActiveDraft(session).id;
    const before = getDraft(session, draftId).photos.length;

    session = upsertDraftPhoto(session, draftId, "other", URI_EXTRA_A, "gallery");
    const after = getDraft(session, draftId).photos.length;

    expect(before).toBe(10);
    expect(after).toBe(10);
    expect(canAddPhotoToDraft(getDraft(session, draftId))).toBe(false);
  });

  it("removes only the targeted Andet photo", () => {
    let session = createCaptureSession([URI_FRONT]);
    const draftId = getActiveDraft(session).id;
    session = upsertDraftPhoto(session, draftId, "other", URI_EXTRA_A, "gallery");
    session = upsertDraftPhoto(session, draftId, "other", URI_EXTRA_B, "gallery");

    const removed = removeDraftPhoto(session, draftId, "other", URI_EXTRA_A);
    const draft = getDraft(removed, draftId);

    expect(draft.photos).toHaveLength(2);
    expect(draft.photos.some((photo) => photo.uri === URI_EXTRA_A)).toBe(false);
    expect(draft.photos.some((photo) => photo.uri === URI_EXTRA_B)).toBe(true);
  });
});

describe("changeDraftPhotoRole", () => {
  it("joins Andet when changing to other while other photos already exist", () => {
    let session = createCaptureSession([URI_FRONT, URI_BACK]);
    const draftId = getActiveDraft(session).id;
    session = upsertDraftPhoto(session, draftId, "other", URI_EXTRA_A, "gallery");

    const joined = changeDraftPhotoRole(session, draftId, "front", "other");
    const draft = getDraft(joined, draftId);

    expect(photoUriForRole(draft, "front")).toBeNull();
    expect(draft.photos.filter((photo) => photo.role === "other")).toHaveLength(2);
  });

  it("moves a photo to an empty role", () => {
    const session = createCaptureSession([URI_FRONT, URI_BACK]);
    const draftId = getActiveDraft(session).id;

    const moved = changeDraftPhotoRole(session, draftId, "back", "left");
    const draft = getDraft(moved, draftId);

    expect(photoUriForRole(draft, "back")).toBeNull();
    expect(photoUriForRole(draft, "left")).toBe(URI_BACK);
    expect(photoUriForRole(draft, "front")).toBe(URI_FRONT);
  });

  it("swaps photos when the target universal role is occupied", () => {
    const session = createCaptureSession([URI_FRONT, URI_BACK, URI_LABEL]);
    const draftId = getActiveDraft(session).id;

    const swapped = changeDraftPhotoRole(session, draftId, "front", "left");
    const draft = getDraft(swapped, draftId);

    expect(photoUriForRole(draft, "front")).toBe(URI_LABEL);
    expect(photoUriForRole(draft, "left")).toBe(URI_FRONT);
    expect(photoUriForRole(draft, "back")).toBe(URI_BACK);
    expect(draft.photos).toHaveLength(3);
  });

  it("is a no-op when the source role is empty", () => {
    const session = createCaptureSession([URI_FRONT]);
    const draftId = getActiveDraft(session).id;

    const unchanged = changeDraftPhotoRole(session, draftId, "back", "left");
    const draft = getDraft(unchanged, draftId);

    expect(photoUriForRole(draft, "front")).toBe(URI_FRONT);
    expect(photoUriForRole(draft, "back")).toBeNull();
    expect(photoUriForRole(draft, "left")).toBeNull();
  });

  it("is a no-op when from and to roles are the same", () => {
    const session = createCaptureSession([URI_FRONT]);
    const draftId = getActiveDraft(session).id;

    const unchanged = changeDraftPhotoRole(session, draftId, "front", "front");
    expect(getDraft(unchanged, draftId).photos).toEqual(getDraft(session, draftId).photos);
  });
});

describe("upsertDraftPhoto regression", () => {
  it("replaces a photo for a role without touching other roles", () => {
    const session = createCaptureSession([URI_FRONT, URI_BACK]);
    const draftId = getActiveDraft(session).id;
    const replacement = "file:///photos/new-label.jpg";

    const updated = upsertDraftPhoto(session, draftId, "back", replacement, "gallery");
    const draft = getDraft(updated, draftId);

    expect(photoUriForRole(draft, "front")).toBe(URI_FRONT);
    expect(photoUriForRole(draft, "back")).toBe(replacement);
    expect(draft.photos.find((photo) => photo.role === "back")?.source).toBe("gallery");
  });
});

describe("persistence", () => {
  it("survives reload after pick, bind, unbind, and field changes", () => {
    const store = createMemoryCaptureSessionStore();
    let session = createCaptureSession(BULK_URIS, {
      store,
    });
    const draftId = getActiveDraft(session).id;

    session = bindPhoto(session, BULK_URI_A, draftId, "front");
    session = bindPhoto(session, BULK_URI_B, draftId, "back");
    session = unbindPhoto(session, BULK_URI_B);
    session = addJerseyDraft(session);
    session = setDraftClub(session, draftId, UUID);
    session = selectDraftKitType(session, draftId, "away");

    const reloaded = reloadCaptureSession(store);

    expect(reloaded).not.toBeNull();
    if (!reloaded) {
      throw new Error("expected reloaded session");
    }
    expect(reloaded.branch).toBe("bulk");
    expect(reloaded.unboundUris).toEqual([BULK_URIS[1], ...BULK_URIS.slice(2)]);
    expect(reloaded.drafts).toHaveLength(2);
    expect(photoUriForRole(getDraft(reloaded, draftId), "front")).toBe(BULK_URIS[0]);
    expect(getDraft(reloaded, draftId).clubId).toBe(UUID);
    expect(getDraft(reloaded, draftId).kitType).toBe("away");
  });
});
