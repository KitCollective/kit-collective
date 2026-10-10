import { describe, expect, it } from "vitest";
import {
  addJerseyDraft,
  applyGroupingSuggestion,
  applyStickySizeToUnselected,
  createCaptureSession,
  createCaptureSessionFromPhotos,
  getActiveDraft,
  selectDraftCondition,
  selectDraftSize,
  switchSingleToBulkBind,
} from "../src/capture/captureSession";
import {
  createStickySizeStore,
  parseStickySize,
  type StickySizeStorage,
  stickySizeKey,
} from "../src/prefs/stickySize";

const URI = "file:///photos/front.jpg";

function memoryStorage(): StickySizeStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: async (key) => data.get(key) ?? null,
    set: async (key, value) => {
      data.set(key, value);
    },
  };
}

describe("sticky size on new drafts", () => {
  it("pre-selects the last size on a new single session, and never the condition", () => {
    const draft = getActiveDraft(createCaptureSession([URI], { defaultSize: "l" }));
    expect(draft.size).toBe("l");
    expect(draft.sizeSelected).toBe(true);
    expect(draft.condition).toBeNull();
    expect(draft.conditionSelected).toBe(false);
  });

  it("pre-selects it on sessions built from photos", () => {
    const state = createCaptureSessionFromPhotos([{ uri: URI, role: "front", source: "gallery" }], {
      defaultSize: "xl",
    });
    expect(getActiveDraft(state).size).toBe("xl");
    expect(getActiveDraft(state).conditionSelected).toBe(false);
  });

  it("pre-selects it on an added jersey in the same session", () => {
    const session = createCaptureSession([URI]);
    const next = addJerseyDraft(switchSingleToBulkBind(session), { defaultSize: "s" });
    const added = getActiveDraft(next);
    expect(added.size).toBe("s");
    expect(added.sizeSelected).toBe(true);
    expect(added.conditionSelected).toBe(false);
  });

  it("pre-selects it on every jersey Vision grouping creates", () => {
    const uris = Array.from({ length: 5 }, (_, index) => `file:///photos/sticky-${index}.jpg`);
    let session = createCaptureSession(uris, { defaultSize: "l" });
    const idOf = (uri: string) => session.photoIdByUri?.[uri] ?? "";
    session = applyGroupingSuggestion(
      session,
      {
        groups: [
          { photoIds: [idOf(uris[0] ?? ""), idOf(uris[1] ?? "")], confidence: 90 },
          { photoIds: [idOf(uris[2] ?? "")], confidence: 60 },
        ],
      },
      { defaultSize: "l" },
    );
    expect(session.drafts).toHaveLength(2);
    expect(session.drafts.map((draft) => draft.size)).toEqual(["l", "l"]);
    expect(session.drafts.every((draft) => !draft.conditionSelected)).toBe(true);
  });

  it("leaves the size empty when nothing was saved yet", () => {
    const draft = getActiveDraft(createCaptureSession([URI]));
    expect(draft.size).toBeNull();
    expect(draft.sizeSelected).toBe(false);
  });

  it("lets the collector change the pre-selected size", () => {
    const session = createCaptureSession([URI], { defaultSize: "l" });
    const next = selectDraftSize(session, getActiveDraft(session).id, "m");
    expect(getActiveDraft(next).size).toBe("m");
  });

  it("fills only drafts that have no size chosen when a jersey is saved", () => {
    let session = switchSingleToBulkBind(createCaptureSession([URI]));
    const first = getActiveDraft(session).id;
    session = selectDraftSize(session, first, "xs");
    session = addJerseyDraft(session);
    session = selectDraftCondition(session, getActiveDraft(session).id, "new");
    const next = applyStickySizeToUnselected(session, "m");
    expect(next.drafts[0]?.size).toBe("xs");
    expect(next.drafts[1]?.size).toBe("m");
    expect(next.drafts[1]?.sizeSelected).toBe(true);
    expect(next.drafts[1]?.conditionSelected).toBe(true);
  });
});

describe("sticky size store", () => {
  it("remembers a size per collector and returns it after an app restart", async () => {
    const storage = memoryStorage();
    const first = createStickySizeStore(storage);
    await first.bind("collector-a");
    expect(first.get()).toBeNull();
    first.remember("l");
    expect(first.get()).toBe("l");
    await Promise.resolve();

    const afterRestart = createStickySizeStore(storage);
    await afterRestart.bind("collector-a");
    expect(afterRestart.get()).toBe("l");
  });

  it("keeps collectors apart", async () => {
    const storage = memoryStorage();
    const store = createStickySizeStore(storage);
    await store.bind("collector-a");
    store.remember("xl");
    await Promise.resolve();
    await store.bind("collector-b");
    expect(store.get()).toBeNull();
    await store.bind("collector-a");
    expect(store.get()).toBe("xl");
    expect(storage.data.has(stickySizeKey("collector-a"))).toBe(true);
  });

  it("returns nothing when signed out and ignores unknown stored values", async () => {
    const storage = memoryStorage();
    storage.data.set(stickySizeKey("c"), "huge");
    const store = createStickySizeStore(storage);
    await store.bind("c");
    expect(store.get()).toBeNull();
    expect(parseStickySize("m")).toBe("m");
    expect(parseStickySize(null)).toBeNull();
  });

  it("does not throw when the device store fails", async () => {
    const store = createStickySizeStore({
      get: async () => {
        throw new Error("denied");
      },
      set: async () => {
        throw new Error("denied");
      },
    });
    await store.bind("c");
    store.remember("s");
    await Promise.resolve();
    expect(store.get()).toBe("s");
  });
});
