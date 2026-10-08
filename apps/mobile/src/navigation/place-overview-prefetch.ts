import { fetchActivity } from "@/api/activity";
import { fetchDiscoverHome } from "@/api/bidding";
import { fetchCollectionJerseys } from "@/api/collection";
import { fetchConversations } from "@/api/conversations";
import { fetchFavorites } from "@/api/favorites";
import { fetchCollectionShortcuts } from "@/api/shortcuts";
import { fetchWishlistEntries } from "@/api/wishlist";
import { writePlaceOverview } from "./place-overview-cache";

let inflight: Promise<void> | null = null;
let inflightToken: string | null = null;

/**
 * Warm every parent overview so a swipe (or first tap) does not cold-start
 * a spinner. Homes still refresh in the background after they mount.
 */
export function prefetchPlaceOverviews(accessToken: string): Promise<void> {
  if (inflight && inflightToken === accessToken) {
    return inflight;
  }

  inflightToken = accessToken;
  inflight = Promise.allSettled([
    prefetchCollection(accessToken),
    prefetchInbox(accessToken),
    prefetchSearch(accessToken),
    prefetchWishlist(accessToken),
    prefetchProfile(accessToken),
  ]).then(() => undefined);

  return inflight;
}

export function resetPlaceOverviewPrefetch(): void {
  inflight = null;
  inflightToken = null;
}

async function prefetchCollection(accessToken: string): Promise<void> {
  const [jerseys, shortcuts] = await Promise.all([
    fetchCollectionJerseys(accessToken, null),
    fetchCollectionShortcuts(accessToken),
  ]);
  writePlaceOverview("collection", {
    jerseys: jerseys.jerseys,
    allJerseys: jerseys.jerseys,
    totalJerseyCount: jerseys.jerseys.length,
    shortcuts: shortcuts.shortcuts,
  });
}

async function prefetchInbox(accessToken: string): Promise<void> {
  const [conversations, activity] = await Promise.all([
    fetchConversations(accessToken),
    fetchActivity(accessToken),
  ]);
  writePlaceOverview("inbox", {
    conversations: conversations.conversations,
    activityItems: activity.items,
  });
}

async function prefetchSearch(accessToken: string): Promise<void> {
  const home = await fetchDiscoverHome(accessToken);
  writePlaceOverview("search", { home });
}

async function prefetchWishlist(accessToken: string): Promise<void> {
  const response = await fetchWishlistEntries(accessToken);
  writePlaceOverview("wishlist", { entries: response.entries });
}

async function prefetchProfile(accessToken: string): Promise<void> {
  const response = await fetchFavorites(accessToken);
  writePlaceOverview("profile", { favoriteCount: response.favorites.length });
}
