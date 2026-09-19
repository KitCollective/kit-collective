import type {
  CollectionActivityItem,
  CollectionConversation,
  CollectionDiscoverHome,
  CollectionJersey,
  CollectionShortcut,
  WishlistEntry,
} from "@kit/api-contract";
import { PLACE_ORDER, type PlaceId } from "./place-swipe";

export type PlaceOverviewSnapshot = {
  collection: {
    jerseys: CollectionJersey[];
    allJerseys: CollectionJersey[];
    totalJerseyCount: number;
    shortcuts: CollectionShortcut[];
  };
  inbox: {
    conversations: CollectionConversation[];
    activityItems: CollectionActivityItem[];
  };
  search: {
    home: CollectionDiscoverHome;
  };
  wishlist: {
    entries: WishlistEntry[];
  };
  profile: {
    favoriteCount: number;
  };
};

const snapshots: Partial<PlaceOverviewSnapshot> = {};
const listeners = new Set<() => void>();

function notifyPlaceOverviews(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function readPlaceOverview<K extends PlaceId>(
  place: K,
): PlaceOverviewSnapshot[K] | undefined {
  return snapshots[place];
}

export function writePlaceOverview<K extends PlaceId>(
  place: K,
  snapshot: PlaceOverviewSnapshot[K],
): void {
  snapshots[place] = snapshot;
  notifyPlaceOverviews();
}

export function clearPlaceOverviews(): void {
  for (const place of PLACE_ORDER) {
    delete snapshots[place];
  }
  notifyPlaceOverviews();
}

export function subscribePlaceOverviews(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}
