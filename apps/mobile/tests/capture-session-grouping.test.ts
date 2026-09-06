import { describe, expect, it } from "vitest";
import {
  applyGroupingSuggestion,
  createCaptureSession,
  dismissPendingGrouping,
  getActiveDraft,
  getDraft,
  sessionPhotoIds,
  shouldStartGroupingJob,
  unbindPhoto,
} from "../src/capture/captureSession";

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

  it("starts grouping only for bulk sessions with all photos unbound", () => {
    const bulk = createCaptureSession(BULK_URIS);
    expect(shouldStartGroupingJob(bulk)).toBe(true);

    const single = createCaptureSession([BULK_URIS[0]!]);
    expect(shouldStartGroupingJob(single)).toBe(false);
  });

  it("skips grouping when a single-shirt dump already has bound photos", () => {
    const session = createCaptureSession(BULK_URIS);
    const draftId = getActiveDraft(session).id;
    const bound = applyGroupingSuggestion(
      session,
      {
        groups: [{ photoIds: [session.photoIdByUri![BULK_URIS[0]!]!] }],
      },
      { preselect: true },
    );

    expect(shouldStartGroupingJob(bound)).toBe(false);
    expect(getDraft(bound, draftId).photos.length).toBeGreaterThan(0);
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
});
