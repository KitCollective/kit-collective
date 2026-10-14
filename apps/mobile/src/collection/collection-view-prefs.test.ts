import { describe, expect, it } from "vitest";
import {
  COLLECTION_VIEW_PREFS_DEFAULT,
  collectionViewPrefsKey,
  readCollectionViewPrefs,
  storeCollectionViewPrefs,
} from "@/collection/collection-view-prefs";
import type { PromptStore } from "@/profile-prompt/dismissal";

function mapStore(): PromptStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    get: async (key) => map.get(key) ?? null,
    set: async (key, value) => {
      map.set(key, value);
    },
  };
}

describe("collection view prefs", () => {
  it("keys the choice by account", () => {
    expect(collectionViewPrefsKey("user-1").endsWith("user-1")).toBe(true);
    expect(collectionViewPrefsKey("user-1")).not.toBe(collectionViewPrefsKey("user-2"));
  });

  it("reads Alle and latest added when nothing is stored", async () => {
    expect(await readCollectionViewPrefs(mapStore(), "user-1")).toEqual({
      view: "all",
      sort: "latest",
    });
    expect(COLLECTION_VIEW_PREFS_DEFAULT).toEqual({ view: "all", sort: "latest" });
  });

  it("restores what was stored for the same account", async () => {
    const store = mapStore();
    expect(await storeCollectionViewPrefs(store, "user-1", { view: "bids", sort: "club" })).toBe(
      true,
    );
    expect(await readCollectionViewPrefs(store, "user-1")).toEqual({ view: "bids", sort: "club" });
  });

  it("keeps accounts apart on one device", async () => {
    const store = mapStore();
    await storeCollectionViewPrefs(store, "user-1", { view: "private", sort: "seasonOldest" });
    expect(await readCollectionViewPrefs(store, "user-2")).toEqual({ view: "all", sort: "latest" });
  });

  it("falls back to the default on a broken or unknown value", async () => {
    const store = mapStore();
    store.map.set(collectionViewPrefsKey("user-1"), "not json");
    expect(await readCollectionViewPrefs(store, "user-1")).toEqual({ view: "all", sort: "latest" });
    store.map.set(collectionViewPrefsKey("user-1"), JSON.stringify({ view: "nope", sort: 4 }));
    expect(await readCollectionViewPrefs(store, "user-1")).toEqual({ view: "all", sort: "latest" });
  });

  it("keeps the half that is still valid", async () => {
    const store = mapStore();
    store.map.set(collectionViewPrefsKey("user-1"), JSON.stringify({ view: "open", sort: "gone" }));
    expect(await readCollectionViewPrefs(store, "user-1")).toEqual({
      view: "open",
      sort: "latest",
    });
  });

  it("reads the default when storage throws and reports a failed store", async () => {
    const broken: PromptStore = {
      get: async () => {
        throw new Error("denied");
      },
      set: async () => {
        throw new Error("denied");
      },
    };
    expect(await readCollectionViewPrefs(broken, "user-1")).toEqual({
      view: "all",
      sort: "latest",
    });
    expect(await storeCollectionViewPrefs(broken, "user-1", { view: "all", sort: "club" })).toBe(
      false,
    );
  });
});
