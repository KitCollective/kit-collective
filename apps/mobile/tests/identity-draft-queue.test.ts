import { describe, expect, it } from "vitest";
import {
  addJerseyDraft,
  bindUnboundPhotoToDraft,
  createCaptureSession,
  getActiveDraft,
} from "../src/capture/captureSession";
import {
  IDENTITY_TIMEOUT_ERROR,
  identityRunKey,
  identitySettledSnapshot,
  isDraftReadyForIdentityJob,
  nextQueuedIdentityDraft,
  orderedIdentityDrafts,
  raceWithTimeout,
  remainingIdentityBudget,
  shouldAttemptIdentityQueue,
  shouldSyncIdentityChrome,
} from "../src/capture/identityDraftQueue";

const URI_A = "file:///photos/a.jpg";
const URI_B = "file:///photos/b.jpg";
const URI_C = "file:///photos/c.jpg";
const URI_D = "file:///photos/d.jpg";

function draftAt(drafts: ReturnType<typeof createCaptureSession>["drafts"], index: number) {
  const draft = drafts[index];
  if (!draft) {
    throw new Error(`expected draft at ${index}`);
  }
  return draft;
}

function threeJerseySession() {
  let session = createCaptureSession([URI_A, URI_B, URI_C, URI_D]);
  const first = getActiveDraft(session).id;
  session = addJerseyDraft(session);
  const second = draftAt(session.drafts, 1).id;
  session = addJerseyDraft(session);
  const third = draftAt(session.drafts, 2).id;
  session = bindUnboundPhotoToDraft(session, URI_A, first);
  session = bindUnboundPhotoToDraft(session, URI_B, second);
  session = bindUnboundPhotoToDraft(session, URI_C, third);
  return { session, first, second, third };
}

describe("orderedIdentityDrafts", () => {
  it("keeps Confirm tab order and drops drafts with no photos", () => {
    const { session, first, second, third } = threeJerseySession();
    const ordered = orderedIdentityDrafts(session.drafts);
    expect(ordered.map((draft) => draft.id)).toEqual([first, second, third]);
  });
});

describe("nextQueuedIdentityDraft", () => {
  it("starts at jersey 1 even when jersey 3 is the only one already started", () => {
    const { session, first, third } = threeJerseySession();
    const started = new Set([identityRunKey(draftAt(session.drafts, 2))]);
    expect(draftAt(session.drafts, 2).id).toBe(third);

    const next = nextQueuedIdentityDraft(session.drafts, started);
    expect(next?.id).toBe(first);
  });

  it("walks 1 then 2 then 3", () => {
    const { session, first, second, third } = threeJerseySession();
    const started = new Set<string>();
    const one = nextQueuedIdentityDraft(session.drafts, started);
    expect(one?.id).toBe(first);
    if (!one) {
      throw new Error("expected jersey 1");
    }
    started.add(identityRunKey(one));
    const two = nextQueuedIdentityDraft(session.drafts, started);
    expect(two?.id).toBe(second);
    if (!two) {
      throw new Error("expected jersey 2");
    }
    started.add(identityRunKey(two));
    const three = nextQueuedIdentityDraft(session.drafts, started);
    expect(three?.id).toBe(third);
  });

  it("moves to jersey 2 after jersey 1 was attempted, even when that attempt failed", () => {
    const { session, first, second } = threeJerseySession();
    const started = new Set([identityRunKey(draftAt(session.drafts, 0))]);
    expect(draftAt(session.drafts, 0).id).toBe(first);
    expect(nextQueuedIdentityDraft(session.drafts, started)?.id).toBe(second);
  });
});

describe("shouldSyncIdentityChrome", () => {
  it("does not bind Data loading to jersey 1 when the collector opened jersey 2", () => {
    expect(shouldSyncIdentityChrome("jersey-1", "jersey-2")).toBe(false);
    expect(shouldSyncIdentityChrome("jersey-1", "jersey-1")).toBe(true);
  });
});

describe("raceWithTimeout", () => {
  it("rejects hanging work so jersey 1 cannot block 2 and 3", async () => {
    await expect(raceWithTimeout(new Promise(() => {}), 20)).rejects.toThrow(
      IDENTITY_TIMEOUT_ERROR,
    );
  });

  it("counts photo prepare against the same budget as poll", () => {
    expect(remainingIdentityBudget(1_000, 45_000, 1_000)).toBe(45_000);
    expect(remainingIdentityBudget(1_000, 45_000, 46_000)).toBe(0);
  });
});

describe("identitySettledSnapshot", () => {
  it("clears the skeleton without a catalog miss", () => {
    expect(identitySettledSnapshot()).toEqual({
      fieldPreselect: {},
      suggestions: null,
      catalogMiss: false,
    });
  });
});

describe("shouldAttemptIdentityQueue", () => {
  const ready = {
    hasAccessToken: true,
    queueFingerprint: "a",
    previousFingerprint: "a",
  };

  it("does not start when the collector only switches tabs", () => {
    expect(shouldAttemptIdentityQueue(ready)).toBe(false);
  });

  it("starts when a new jersey gains photos", () => {
    expect(shouldAttemptIdentityQueue({ ...ready, queueFingerprint: "a|b" })).toBe(true);
  });

  it("starts on first ready session without a tab switch", () => {
    expect(shouldAttemptIdentityQueue({ ...ready, previousFingerprint: null })).toBe(true);
  });

  it("does not start without a token or an empty queue", () => {
    expect(shouldAttemptIdentityQueue({ ...ready, hasAccessToken: false })).toBe(false);
    expect(
      shouldAttemptIdentityQueue({ ...ready, queueFingerprint: "", previousFingerprint: null }),
    ).toBe(false);
  });

  it("starts when jersey 1 lands", () => {
    expect(
      shouldAttemptIdentityQueue({
        ...ready,
        previousFingerprint: "",
        queueFingerprint: "jersey-1:front.jpg",
      }),
    ).toBe(true);
  });
});

describe("isDraftReadyForIdentityJob", () => {
  it("is false when the draft has no photos", () => {
    const session = createCaptureSession([]);
    expect(isDraftReadyForIdentityJob(getActiveDraft(session))).toBe(false);
  });

  it("is ready with a single photo, with no wait for front and back", () => {
    let session = createCaptureSession([URI_A, URI_B, URI_C, URI_D]);
    session = bindUnboundPhotoToDraft(session, URI_A, getActiveDraft(session).id, "front");
    expect(isDraftReadyForIdentityJob(getActiveDraft(session))).toBe(true);
  });
});

describe("identity queue", () => {
  it("queues jerseys with photos in tab order and skips the started ones", () => {
    let session = createCaptureSession([URI_A, URI_B, URI_C, URI_D]);
    const first = getActiveDraft(session).id;
    expect(orderedIdentityDrafts(session.drafts)).toEqual([]);
    expect(nextQueuedIdentityDraft(session.drafts, new Set())).toBeUndefined();

    session = bindUnboundPhotoToDraft(session, URI_A, first, "front");

    expect(orderedIdentityDrafts(session.drafts).map((draft) => draft.id)).toEqual([first]);
    expect(nextQueuedIdentityDraft(session.drafts, new Set())?.id).toBe(first);
    const started = new Set([identityRunKey(getActiveDraft(session))]);
    expect(nextQueuedIdentityDraft(session.drafts, started)).toBeUndefined();
  });
});
