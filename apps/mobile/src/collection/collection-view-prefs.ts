import type { PromptStore } from "@/profile-prompt/dismissal";
import {
  COLLECTION_SORTS,
  COLLECTION_VIEWS,
  type CollectionSort,
  type CollectionView,
} from "./collection-view-model";

export type CollectionViewPrefs = {
  view: CollectionView;
  sort: CollectionSort;
};

export const COLLECTION_VIEW_PREFS_DEFAULT: CollectionViewPrefs = {
  view: "all",
  sort: "latest",
};

/** One entry per account, so two collectors on one device keep their own choice. */
export function collectionViewPrefsKey(userId: string): string {
  return `kit.collectionViewPrefs.${userId}`;
}

function pickView(value: unknown): CollectionView {
  return COLLECTION_VIEWS.find((view) => view === value) ?? COLLECTION_VIEW_PREFS_DEFAULT.view;
}

function pickSort(value: unknown): CollectionSort {
  return COLLECTION_SORTS.find((sort) => sort === value) ?? COLLECTION_VIEW_PREFS_DEFAULT.sort;
}

/** A missing, unknown or unreadable value reads as Alle + latest added. */
export async function readCollectionViewPrefs(
  store: PromptStore,
  userId: string,
): Promise<CollectionViewPrefs> {
  try {
    const raw = await store.get(collectionViewPrefsKey(userId));
    if (raw == null) {
      return COLLECTION_VIEW_PREFS_DEFAULT;
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return COLLECTION_VIEW_PREFS_DEFAULT;
    }
    return {
      view: pickView("view" in parsed ? parsed.view : undefined),
      sort: pickSort("sort" in parsed ? parsed.sort : undefined),
    };
  } catch {
    return COLLECTION_VIEW_PREFS_DEFAULT;
  }
}

/** Returns false when storage fails; the choice still holds for this visit. */
export async function storeCollectionViewPrefs(
  store: PromptStore,
  userId: string,
  prefs: CollectionViewPrefs,
): Promise<boolean> {
  try {
    await store.set(
      collectionViewPrefsKey(userId),
      JSON.stringify({ view: prefs.view, sort: prefs.sort }),
    );
    return true;
  } catch {
    return false;
  }
}
