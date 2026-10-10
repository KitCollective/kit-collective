import { VISION_CONFIDENCE_PRESELECT, VISION_CONFIDENCE_SUGGEST } from "@kit/api-contract";
import { describe, expect, it } from "vitest";
import { shouldOpenBulkOverview } from "../src/capture/captureOverview";
import {
  appendUnboundPhotos,
  applyGroupingSuggestion,
  createCaptureSession,
  createMemoryCaptureSessionStore,
  ensureSessionPhotoIds,
  getDraft,
  groupingJobFingerprint,
  groupingPriorGroups,
  isUuid,
  markGroupingSettled,
  reloadCaptureSession,
  sessionPhotoIds,
  shouldStartGroupingJob,
  unbindPhoto,
  uriForPhotoId,
} from "../src/capture/captureSession";
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
        groups: [{ photoIds: [session.photoIdByUri![BULK_URIS[0]!]!], confidence: 90 }],
      },
      {},
    );

    expect(shouldStartGroupingJob(bound)).toBe(true);
    expect(groupingPriorGroups(bound)[0]?.photoIds).toHaveLength(1);
  });

  it("can bind one grouping photo at a time so Confirm can reveal them in sequence", () => {
    const session = createCaptureSession(BULK_URIS);
    const first = session.photoIdByUri![BULK_URIS[0]!]!;
    const second = session.photoIdByUri![BULK_URIS[1]!]!;

    const afterFirst = applyGroupingSuggestion(
      session,
      { groups: [{ photoIds: [first], confidence: 90 }] },
      {},
    );
    expect(afterFirst.unboundUris).toHaveLength(BULK_URIS.length - 1);
    expect(getDraft(afterFirst, afterFirst.drafts[0]!.id).photos).toHaveLength(1);

    const afterSecond = applyGroupingSuggestion(
      afterFirst,
      { groups: [{ photoIds: [first, second], confidence: 90 }] },
      {},
    );
    expect(afterSecond.unboundUris).toHaveLength(BULK_URIS.length - 2);
    expect(getDraft(afterSecond, afterSecond.drafts[0]!.id).photos).toHaveLength(2);
  });

  it("binds via the existing bind reducers and fills empty universal slots in picker order", () => {
    const session = createCaptureSession(BULK_URIS);
    const groupA = [session.photoIdByUri![BULK_URIS[0]!]!, session.photoIdByUri![BULK_URIS[1]!]!];
    const groupB = [session.photoIdByUri![BULK_URIS[2]!]!];

    const applied = applyGroupingSuggestion(
      session,
      {
        groups: [
          { photoIds: groupA, confidence: 90 },
          { photoIds: groupB, confidence: 85 },
        ],
      },
      {},
    );

    expect(applied.drafts).toHaveLength(2);
    expect(applied.unboundUris).toHaveLength(BULK_URIS.length - 3);
    const first = getDraft(applied, applied.drafts[0]!.id);
    expect(first.photos[0]?.role).toBe("front");
    expect(first.photos[1]?.role).toBe("back");
  });

  it("lets the collector unbind after a grouping suggestion", () => {
    const session = createCaptureSession(BULK_URIS);
    const photoId = session.photoIdByUri![BULK_URIS[0]!]!;
    const applied = applyGroupingSuggestion(
      session,
      { groups: [{ photoIds: [photoId], confidence: 90 }] },
      {},
    );
    const draftId = applied.drafts[0]!.id;
    const uri = BULK_URIS[0]!;

    const unbound = unbindPhoto(applied, uri);

    expect(unbound.unboundUris).toContain(uri);
    expect(getDraft(unbound, draftId).photos).toHaveLength(0);
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
  describe("per-group confidence", () => {
    const sessionWithGroups = () => {
      const session = createCaptureSession(BULK_URIS);
      const ids = (from: number, to: number) =>
        BULK_URIS.slice(from, to).map((uri) => session.photoIdByUri![uri]!);
      return {
        session,
        strong: ids(0, 3),
        unsure: ids(3, 5),
        weak: ids(5, 7),
      };
    };

    it("binds the 90 group, drafts the 60 group as Tjek, leaves the 30 group without a jersey", () => {
      const { session, strong, unsure, weak } = sessionWithGroups();

      const applied = applyGroupingSuggestion(
        session,
        {
          groups: [
            { photoIds: strong, confidence: 90 },
            { photoIds: unsure, confidence: 60 },
            { photoIds: weak, confidence: 30 },
          ],
        },
        {},
      );

      expect(applied.drafts).toHaveLength(2);
      const [bound, check] = applied.drafts;
      expect(bound!.photos).toHaveLength(3);
      expect(bound!.needsCheck).toBeFalsy();
      expect(check!.photos).toHaveLength(2);
      expect(check!.needsCheck).toBe(true);
      for (const photoId of weak) {
        expect(applied.unboundUris).toContain(uriForPhotoId(applied, photoId));
      }
      expect(applied.unboundUris).toHaveLength(BULK_URIS.length - 5);
    });

    it("treats the preselect and suggest thresholds as inclusive lower bounds", () => {
      const { session, strong, unsure, weak } = sessionWithGroups();

      const applied = applyGroupingSuggestion(
        session,
        {
          groups: [
            { photoIds: strong, confidence: VISION_CONFIDENCE_PRESELECT },
            { photoIds: unsure, confidence: VISION_CONFIDENCE_SUGGEST },
            { photoIds: weak, confidence: VISION_CONFIDENCE_SUGGEST - 1 },
          ],
        },
        {},
      );

      expect(applied.drafts.map((draft) => draft.needsCheck === true)).toEqual([false, true]);
      expect(applied.drafts.map((draft) => draft.photos.length)).toEqual([3, 2]);
    });

    it("lets one uncertain group not hold back a confident one", () => {
      const { session, strong, unsure } = sessionWithGroups();

      const applied = applyGroupingSuggestion(
        session,
        {
          groups: [
            { photoIds: unsure, confidence: 55 },
            { photoIds: strong, confidence: 95 },
          ],
        },
        {},
      );

      expect(applied.drafts.map((draft) => draft.photos.length)).toEqual([2, 3]);
      expect(applied.drafts.map((draft) => draft.needsCheck === true)).toEqual([true, false]);
    });

    it("keeps a group that arrives without confidence as a Tjek draft rather than dropping photos", () => {
      const { session, strong } = sessionWithGroups();

      const applied = applyGroupingSuggestion(session, { groups: [{ photoIds: strong }] }, {});

      expect(applied.drafts).toHaveLength(1);
      expect(applied.drafts[0]!.needsCheck).toBe(true);
      expect(applied.drafts[0]!.photos).toHaveLength(3);
    });

    it("keeps a prior group on its own draft instead of binding by group position", () => {
      const { session, strong, unsure, weak } = sessionWithGroups();
      const first = applyGroupingSuggestion(
        session,
        {
          groups: [
            { photoIds: weak, confidence: 20 },
            { photoIds: strong, confidence: 90 },
          ],
        },
        {},
      );
      expect(first.drafts).toHaveLength(1);
      const strongDraftId = first.drafts[0]!.id;

      const later = applyGroupingSuggestion(
        first,
        {
          groups: [
            { photoIds: strong, confidence: 90 },
            { photoIds: unsure, confidence: 62 },
          ],
        },
        {},
      );

      expect(later.drafts).toHaveLength(2);
      expect(later.drafts[0]!.id).toBe(strongDraftId);
      expect(later.drafts[0]!.photos).toHaveLength(3);
      expect(later.drafts[1]!.needsCheck).toBe(true);
    });

    it("keeps the Tjek flag through a persist and reload", () => {
      const store = createMemoryCaptureSessionStore();
      const session = createCaptureSession(BULK_URIS, { store });
      const photoIds = BULK_URIS.slice(0, 2).map((uri) => session.photoIdByUri![uri]!);

      const applied = applyGroupingSuggestion(
        session,
        { groups: [{ photoIds, confidence: 60 }] },
        {},
      );
      store.save(applied);

      expect(reloadCaptureSession(store)?.drafts[0]?.needsCheck).toBe(true);
    });

    it("does not restart grouping for photos the settled run already judged", () => {
      const { session, weak } = sessionWithGroups();
      const applied = applyGroupingSuggestion(
        session,
        { groups: [{ photoIds: weak, confidence: 30 }] },
        {},
      );
      expect(shouldStartGroupingJob(applied)).toBe(true);

      const settled = markGroupingSettled(applied);

      expect(shouldStartGroupingJob(settled)).toBe(false);
      expect(groupingJobFingerprint(settled)).toBeNull();

      const withNewPhoto = appendUnboundPhotos(settled, ["file:///photos/late.jpg"]);
      expect(shouldStartGroupingJob(withNewPhoto)).toBe(true);
    });
  });

  it("goes straight to Confirm for three photos or fewer (no overview, no grouping)", () => {
    const three = createCaptureSession(BULK_URIS.slice(0, 3));
    expect(three.branch).toBe("single");
    expect(shouldStartGroupingJob(three)).toBe(false);
    expect(shouldOpenBulkOverview({ branch: three.branch, visionOn: true })).toBe(false);

    const four = createCaptureSession(BULK_URIS.slice(0, 4));
    expect(four.branch).toBe("bulk");
    expect(shouldOpenBulkOverview({ branch: four.branch, visionOn: true })).toBe(true);
    expect(shouldOpenBulkOverview({ branch: four.branch, visionOn: false })).toBe(false);
  });
});
