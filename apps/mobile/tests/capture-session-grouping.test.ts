import { describe, expect, it } from "vitest";
import {
  applyFillOrderToDraft,
  applyGroupingSuggestion,
  createCaptureSession,
  createMemoryCaptureSessionStore,
  dismissPendingGrouping,
  ensureSessionPhotoIds,
  getDraft,
  groupingJobFingerprint,
  groupingPriorGroups,
  isUuid,
  reloadCaptureSession,
  sessionPhotoIds,
  shouldStartGroupingJob,
  unbindPhoto,
} from "../src/capture/captureSession";
import {
  groupingStripUris,
  groupingViewerRoles,
  isGroupingWait,
} from "../src/capture/groupingReveal";
import {
  buildGroupingSuggestRequest,
  closeGroupingRun,
  shouldBeginGroupingStart,
} from "../src/capture/groupingSuggestRequest";

const BULK_URIS = Array.from({ length: 11 }, (_, index) => `file:///photos/bulk-${index}.jpg`);

describe("grouping session", () => {
  it("assigns stable photoIds to bulk session photos", () => {
    const session = createCaptureSession(BULK_URIS);
    const ids = sessionPhotoIds(session);

    expect(ids).toHaveLength(BULK_URIS.length);
    expect(new Set(ids).size).toBe(BULK_URIS.length);
    for (const uri of BULK_URIS) {
      expect(session.photoIdByUri?.[uri]).toBeTruthy();
    }
  });

  it("assigns UUID photoIds that grouping Vision will accept", () => {
    const session = createCaptureSession(
      Array.from({ length: 7 }, (_, index) => `file:///photos/three-shirts-${index}.jpg`),
    );
    const ids = Object.values(session.photoIdByUri ?? {});
    expect(ids).toHaveLength(7);
    expect(ids.every((photoId) => isUuid(photoId))).toBe(true);
    expect(
      buildGroupingSuggestRequest({
        sessionId: session.sessionId,
        photos: ids.slice(0, 2).map((photoId) => ({ photoId, contentBase64: "abc" })),
        priorGroups: [],
      }),
    ).not.toBeNull();
  });

  it("backfills missing photoIds instead of posting empty grouping keys", () => {
    const session = createCaptureSession(
      Array.from({ length: 4 }, (_, index) => `file:///photos/dump-${index}.jpg`),
    );
    const stripped = { ...session, photoIdByUri: {} };
    const next = ensureSessionPhotoIds(stripped);

    expect(Object.keys(next.photoIdByUri ?? {})).toHaveLength(4);
    expect(Object.values(next.photoIdByUri ?? {}).every((photoId) => isUuid(photoId))).toBe(true);
  });

  it("retries grouping after Fast Refresh drops analyzing but keeps the started key", () => {
    expect(
      shouldBeginGroupingStart({
        jobKey: "photos|",
        analyzing: false,
        failed: false,
      }),
    ).toBe(true);
    expect(
      shouldBeginGroupingStart({
        jobKey: "photos|",
        analyzing: true,
        failed: false,
      }),
    ).toBe(false);
    expect(
      shouldBeginGroupingStart({
        jobKey: "photos|",
        analyzing: false,
        failed: true,
      }),
    ).toBe(false);
  });

  it("does not restart grouping after a timeout close", () => {
    const close = closeGroupingRun("timeout");
    expect(close.failed).toBe(true);
    expect(close.analyzing).toBe(false);
    expect(
      shouldBeginGroupingStart({
        jobKey: "photos|",
        analyzing: close.analyzing,
        failed: close.failed,
      }),
    ).toBe(false);
  });

  it("does not build a grouping POST when photoIds are not UUIDs", () => {
    expect(
      buildGroupingSuggestRequest({
        sessionId: "capture-not-a-uuid",
        photos: [
          { photoId: "capture-1", contentBase64: "abc" },
          { photoId: "capture-2", contentBase64: "def" },
        ],
        priorGroups: [],
      }),
    ).toBeNull();
  });

  it("keeps groupingJobFingerprint stable when only draft identity fields persist", () => {
    const session = createCaptureSession(
      Array.from({ length: 7 }, (_, index) => `file:///photos/three-shirts-${index}.jpg`),
    );
    const before = groupingJobFingerprint(session);
    const persisted = {
      ...session,
      drafts: session.drafts.map((draft) => ({ ...draft, notes: "persist" })),
    };

    expect(before).toBeTruthy();
    expect(groupingJobFingerprint(persisted)).toBe(before);
  });

  it("starts grouping for bulk sessions with at least two unbound photos", () => {
    const bulk = createCaptureSession(BULK_URIS);
    expect(shouldStartGroupingJob(bulk)).toBe(true);

    const sevenShirtDump = createCaptureSession(
      Array.from({ length: 7 }, (_, index) => `file:///photos/three-shirts-${index}.jpg`),
    );
    expect(sevenShirtDump.branch).toBe("bulk");
    expect(shouldStartGroupingJob(sevenShirtDump)).toBe(true);

    const single = createCaptureSession([BULK_URIS[0]!]);
    expect(shouldStartGroupingJob(single)).toBe(false);
  });

  it("starts an incremental grouping job for leftover unbound photos after a bind", () => {
    const session = createCaptureSession(BULK_URIS);
    const bound = applyGroupingSuggestion(
      session,
      {
        groups: [{ photoIds: [session.photoIdByUri![BULK_URIS[0]!]!] }],
      },
      { preselect: true },
    );

    expect(shouldStartGroupingJob(bound)).toBe(true);
    expect(groupingPriorGroups(bound)[0]?.photoIds).toHaveLength(1);
  });

  it("keeps the grouping wait canvas empty until a photo occupies a role", () => {
    const empty = {
      front: undefined,
      back: undefined,
      left: undefined,
      right: undefined,
      other: undefined,
    };
    expect(groupingViewerRoles(empty, true)).toEqual([]);
    expect(isGroupingWait(empty, true)).toBe(true);
    expect(groupingViewerRoles({ ...empty, front: "file:///a.jpg" }, true)).toEqual(["front"]);
    expect(isGroupingWait({ ...empty, front: "file:///a.jpg" }, true)).toBe(false);
    expect(
      groupingViewerRoles({ ...empty, front: "file:///a.jpg", back: "file:///b.jpg" }, true),
    ).toEqual(["front", "back"]);
    expect(groupingViewerRoles(empty, false)).toEqual(["front", "back", "left", "right", "other"]);
  });

  it("lets rolling uris own the grouping strip so a late bind cannot empty Forside", () => {
    const rolling = groupingStripUris(["file:///a.jpg", "file:///b.jpg"]);
    expect(rolling.front).toBe("file:///a.jpg");
    expect(rolling.back).toBe("file:///b.jpg");

    const bound = groupingStripUris(["file:///a.jpg"]);
    expect(bound.front).toBe("file:///a.jpg");
    expect(bound.back).toBeUndefined();
  });

  it("can bind one grouping photo at a time so Confirm can reveal them in sequence", () => {
    const session = createCaptureSession(BULK_URIS);
    const first = session.photoIdByUri![BULK_URIS[0]!]!;
    const second = session.photoIdByUri![BULK_URIS[1]!]!;

    const afterFirst = applyGroupingSuggestion(
      session,
      { groups: [{ photoIds: [first] }] },
      { preselect: true },
    );
    expect(afterFirst.unboundUris).toHaveLength(BULK_URIS.length - 1);
    expect(getDraft(afterFirst, afterFirst.drafts[0]!.id).photos).toHaveLength(1);

    const afterSecond = applyGroupingSuggestion(
      afterFirst,
      { groups: [{ photoIds: [first, second] }] },
      { preselect: true },
    );
    expect(afterSecond.unboundUris).toHaveLength(BULK_URIS.length - 2);
    expect(getDraft(afterSecond, afterSecond.drafts[0]!.id).photos).toHaveLength(2);
  });

  it("preselect mode binds via existing bind reducers without assigning roles", () => {
    const session = createCaptureSession(BULK_URIS);
    const groupA = [session.photoIdByUri![BULK_URIS[0]!]!, session.photoIdByUri![BULK_URIS[1]!]!];
    const groupB = [session.photoIdByUri![BULK_URIS[2]!]!];

    const applied = applyGroupingSuggestion(
      session,
      { groups: [{ photoIds: groupA }, { photoIds: groupB }] },
      { preselect: true },
    );

    expect(applied.drafts).toHaveLength(2);
    expect(applied.unboundUris).toHaveLength(BULK_URIS.length - 3);
    expect(
      getDraft(applied, applied.drafts[0]!.id).photos.every((photo) => photo.role === null),
    ).toBe(true);

    const filled = applyFillOrderToDraft(applied, applied.drafts[0]!.id);
    expect(getDraft(filled, filled.drafts[0]!.id).photos[0]?.role).toBe("front");
    expect(getDraft(filled, filled.drafts[0]!.id).photos[1]?.role).toBe("back");
  });

  it("pending mode does not move unbound photos until accept", () => {
    const session = createCaptureSession(BULK_URIS);
    const photoIds = [session.photoIdByUri![BULK_URIS[0]!]!, session.photoIdByUri![BULK_URIS[1]!]!];

    const pending = applyGroupingSuggestion(
      session,
      { groups: [{ photoIds }] },
      { preselect: false },
    );

    expect(pending.unboundUris).toEqual(session.unboundUris);
    expect(pending.pendingGrouping?.groups).toHaveLength(1);
  });

  it("flags a design gap for multi-jersey suggest-only grouping", () => {
    const session = createCaptureSession(BULK_URIS);
    const groups = [
      { photoIds: [session.photoIdByUri![BULK_URIS[0]!]!] },
      { photoIds: [session.photoIdByUri![BULK_URIS[1]!]!] },
    ];

    const pending = applyGroupingSuggestion(session, { groups }, { preselect: false });

    expect(pending.groupingDesignGap).toBe(true);
    expect(pending.unboundUris).toEqual(session.unboundUris);
  });

  it("lets the collector unbind after a grouping suggestion", () => {
    const session = createCaptureSession(BULK_URIS);
    const photoId = session.photoIdByUri![BULK_URIS[0]!]!;
    const applied = applyGroupingSuggestion(
      session,
      { groups: [{ photoIds: [photoId] }] },
      {
        preselect: true,
      },
    );
    const draftId = applied.drafts[0]!.id;
    const uri = BULK_URIS[0]!;

    const unbound = unbindPhoto(applied, uri);

    expect(unbound.unboundUris).toContain(uri);
    expect(getDraft(unbound, draftId).photos).toHaveLength(0);
  });

  it("dismissPendingGrouping clears a pending suggestion without binding", () => {
    const session = createCaptureSession(BULK_URIS);
    const photoIds = [session.photoIdByUri![BULK_URIS[0]!]!];
    const pending = applyGroupingSuggestion(
      session,
      { groups: [{ photoIds }] },
      { preselect: false },
    );

    const dismissed = dismissPendingGrouping(pending);

    expect(dismissed.pendingGrouping).toBeUndefined();
    expect(dismissed.unboundUris).toEqual(session.unboundUris);
  });

  it("keeps stable photoIds after save and reload", () => {
    const store = createMemoryCaptureSessionStore();
    const session = createCaptureSession(BULK_URIS, { store });
    const beforeIds = sessionPhotoIds(session);

    const reloaded = reloadCaptureSession(store);

    expect(reloaded).not.toBeNull();
    expect(sessionPhotoIds(reloaded!)).toEqual(beforeIds);
    for (const uri of BULK_URIS) {
      expect(reloaded!.photoIdByUri?.[uri]).toBe(session.photoIdByUri?.[uri]);
    }
  });

  it("reloadCaptureSession backfills photoIdByUri for legacy snapshots", () => {
    const store = createMemoryCaptureSessionStore();
    const session = createCaptureSession(BULK_URIS, { store });

    store.save({ ...session, photoIdByUri: undefined });
    const reloaded = reloadCaptureSession(store);

    expect(reloaded?.photoIdByUri?.[BULK_URIS[0]!]).toBeTruthy();
  });
});
