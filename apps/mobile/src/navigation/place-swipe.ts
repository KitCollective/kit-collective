import { project } from "@/components/gesture-physics";

export const PLACE_ORDER = ["collection", "inbox", "search", "wishlist", "profile"] as const;
export type PlaceId = (typeof PLACE_ORDER)[number];

export const INBOX_TABS = ["Beskeder", "Aktivitet"] as const;
export type InboxTab = (typeof INBOX_TABS)[number];

export const PLACE_HREFS = {
  collection: "/(tabs)/collection",
  inbox: "/(tabs)/inbox",
  search: "/(tabs)/search",
  wishlist: "/(tabs)/wishlist",
  profile: "/(tabs)/profile",
} as const;

/** +1 is toward Profil (swipe left). −1 is toward Samling (swipe right). */
export type PlaceSwipeDirection = 1 | -1;

export function placeIndex(place: PlaceId): number {
  return PLACE_ORDER.indexOf(place);
}

export function placeAtIndex(index: number): PlaceId | null {
  return PLACE_ORDER[index] ?? null;
}

export function inboxTabIndex(tab: InboxTab): number {
  return INBOX_TABS.indexOf(tab);
}

export function inboxTabAtIndex(index: number): InboxTab | null {
  return INBOX_TABS[index] ?? null;
}

/**
 * Whether a horizontal swipe on Indbakke should leave the inner tabs and
 * continue to the neighbouring bottom-nav place. The inner tabs consume the
 * swipe until that edge.
 */
export function inboxYieldsToPlaceSwipe(tab: InboxTab, direction: PlaceSwipeDirection): boolean {
  "worklet";
  if (direction === 1) {
    return tab === "Aktivitet";
  }
  return tab === "Beskeder";
}

/** Horizontal travel before a place / inbox pan activates. */
export const PLACE_PAN_ACTIVE_X = 12;
/** Vertical travel that fails a place / inbox pan so lists can scroll. */
export const PLACE_PAN_FAIL_Y = 16;

/**
 * Outer place-pan may start only when Indbakke is not the host, or the inner
 * Beskeder|Aktivitet pager is at the edge in that direction. Otherwise the
 * inner pager must keep the gesture.
 *
 * When the inner pager is not consuming swipe (loading, copy, reduced motion,
 * wide), the outer pan always may start — otherwise Indbakke traps the finger.
 */
export function inboxOuterPanShouldActivate(
  isInboxHost: boolean,
  innerTabIndex: number,
  translationX: number,
  innerConsumesSwipe = true,
): boolean {
  "worklet";
  if (!isInboxHost || !innerConsumesSwipe) {
    return true;
  }
  const direction: PlaceSwipeDirection = translationX < 0 ? 1 : -1;
  if (direction === 1) {
    return innerTabIndex === 1;
  }
  return innerTabIndex === 0;
}

/**
 * NativeTabs can leave the outgoing tab on-screen for a few frames after
 * `focused` flips. Keep the row on the swiped page until this window has
 * passed, then park on the host page off-screen.
 */
export const PLACE_PAGER_HOLD_AFTER_BLUR_MS = 450;

/** Snap a finger-followed row to a page index. One gesture moves at most one page. */
export function placePagerSnapIndex(
  translateX: number,
  velocityX: number,
  pageWidth: number,
  pageCount: number,
  startIndex: number,
): number {
  "worklet";
  if (pageWidth <= 0 || pageCount <= 0) {
    return 0;
  }
  const last = pageCount - 1;
  const start = Math.max(
    0,
    Math.min(last, Number.isFinite(startIndex) ? Math.round(startIndex) : 0),
  );
  const projected = translateX + project(velocityX);
  const raw = Math.round(-projected / pageWidth);
  const next = Math.max(start - 1, Math.min(start + 1, raw));
  return Math.max(0, Math.min(last, next));
}

export function placePagerHoldUntilAfterBlur(
  focused: boolean,
  previousHoldUntilMs: number | null,
  nowMs: number,
): number | null {
  if (focused) {
    return null;
  }
  if (previousHoldUntilMs != null) {
    return previousHoldUntilMs;
  }
  return nowMs + PLACE_PAGER_HOLD_AFTER_BLUR_MS;
}

export function placePagerHoldsNeighbourPages(
  focused: boolean,
  holdUntilMs: number | null,
  nowMs: number,
): boolean {
  if (focused) {
    return true;
  }
  return holdUntilMs != null && nowMs < holdUntilMs;
}
