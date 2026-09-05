import { afterEach, describe, expect, it } from "vitest";
import { tabBarContentInset } from "../src/components/tab-bar-metrics";
import { isPlaceHomeLive } from "../src/navigation/place-homes";
import {
  clearPlaceOverviews,
  readPlaceOverview,
  subscribePlaceOverviews,
  writePlaceOverview,
} from "../src/navigation/place-overview-cache";
import {
  inboxOuterPanShouldActivate,
  inboxTabAtIndex,
  inboxTabIndex,
  inboxYieldsToPlaceSwipe,
  PLACE_HREFS,
  PLACE_ORDER,
  PLACE_PAGER_HOLD_AFTER_BLUR_MS,
  placeAtIndex,
  placeIndex,
  placePagerHoldsNeighbourPages,
  placePagerHoldUntilAfterBlur,
  placePagerSnapIndex,
} from "../src/navigation/place-swipe";
import { stackRouteMotion, stackScreenMotion } from "../src/navigation/stack-motion";
import { coalesceSafeAreaInsets } from "../src/theme/stable-safe-area";

describe("place swipe", () => {
  it("orders the five parent places left to right", () => {
    expect(PLACE_ORDER).toEqual(["collection", "inbox", "search", "wishlist", "profile"]);
    expect(placeIndex("search")).toBe(2);
    expect(placeAtIndex(4)).toBe("profile");
    expect(placeAtIndex(-1)).toBeNull();
    expect(PLACE_HREFS.inbox).toBe("/(tabs)/inbox");
  });

  it("lets Indbakke keep the swipe until the inner tab is at that edge", () => {
    expect(inboxTabIndex("Beskeder")).toBe(0);
    expect(inboxTabAtIndex(1)).toBe("Aktivitet");

    // Next place is Søg: only after Aktivitet.
    expect(inboxYieldsToPlaceSwipe("Beskeder", 1)).toBe(false);
    expect(inboxYieldsToPlaceSwipe("Aktivitet", 1)).toBe(true);

    // Previous place is Samling: only from Beskeder.
    expect(inboxYieldsToPlaceSwipe("Aktivitet", -1)).toBe(false);
    expect(inboxYieldsToPlaceSwipe("Beskeder", -1)).toBe(true);

    // Other places: outer pan always. Indbakke: only at that edge.
    expect(inboxOuterPanShouldActivate(false, 0, -40)).toBe(true);
    expect(inboxOuterPanShouldActivate(true, 0, -40)).toBe(false);
    expect(inboxOuterPanShouldActivate(true, 1, -40)).toBe(true);
    expect(inboxOuterPanShouldActivate(true, 1, 40)).toBe(false);
    expect(inboxOuterPanShouldActivate(true, 0, 40)).toBe(true);

    // No inner pager mounted (loading / copy / reduced motion): leave Indbakke.
    expect(inboxOuterPanShouldActivate(true, 0, -40, false)).toBe(true);
    expect(inboxOuterPanShouldActivate(true, 1, 40, false)).toBe(true);
  });

  it("keeps neighbour pages mounted on the blur frame, and only parks after the hold window", () => {
    // NativeTabs can leave the outgoing tab on-screen after `focused` flips.
    // Neighbours must stay mounted on that same frame — a useEffect hold is
    // one frame too late and is the Samling flash in the landing recording.
    expect(PLACE_PAGER_HOLD_AFTER_BLUR_MS).toBe(450);
    expect(placePagerHoldsNeighbourPages(true, null, 1000)).toBe(true);

    const holdUntil = placePagerHoldUntilAfterBlur(false, null, 1000);
    expect(holdUntil).toBe(1450);
    expect(placePagerHoldsNeighbourPages(false, holdUntil, 1000)).toBe(true);
    expect(placePagerHoldsNeighbourPages(false, holdUntil, 1449)).toBe(true);
    expect(placePagerHoldsNeighbourPages(false, holdUntil, 1450)).toBe(false);

    // Later unfocused renders keep the same deadline (do not restart the hold).
    expect(placePagerHoldUntilAfterBlur(false, holdUntil, 1200)).toBe(1450);
    expect(placePagerHoldUntilAfterBlur(true, holdUntil, 1600)).toBeNull();
  });

  it("snaps the overview row at most one page per gesture", () => {
    expect(placePagerSnapIndex(0, 0, 390, 5, 0)).toBe(0);
    expect(placePagerSnapIndex(-390, 0, 390, 5, 0)).toBe(1);
    expect(placePagerSnapIndex(-200, 0, 390, 5, 0)).toBe(1);
    expect(placePagerSnapIndex(-100, 0, 390, 5, 0)).toBe(0);
    expect(placePagerSnapIndex(0, 0, 0, 5, 0)).toBe(0);
    // A flick's projection is more than one page; still land on the neighbour.
    expect(placePagerSnapIndex(-390, -2500, 390, 5, 0)).toBe(1);
    expect(placePagerSnapIndex(-780, -2500, 390, 5, 0)).toBe(1);
    expect(placePagerSnapIndex(-390, 2500, 390, 5, 1)).toBe(0);
  });
});

describe("stack screen motion", () => {
  it("uses the platform push, and fades when motion is reduced", () => {
    expect(stackScreenMotion(false)).toBe("default");
    expect(stackScreenMotion(true)).toBe("fade");
  });

  it("does not slide parent overview index screens", () => {
    expect(stackRouteMotion("index", false)).toBe("none");
    expect(stackRouteMotion("index", true)).toBe("none");
    expect(stackRouteMotion("[jerseyId]", false)).toBe("default");
    expect(stackRouteMotion("[conversationId]", true)).toBe("fade");
  });
});

describe("place home live instance", () => {
  it("only the focused tab's own home fetches; copies read cache", () => {
    // No provider (wide / reduced-motion / tests): treat as live.
    expect(isPlaceHomeLive(undefined, "inbox")).toBe(true);
    // Focused Samling pager: only Samling refreshes. Indbakke in that pager is a copy.
    expect(isPlaceHomeLive("collection", "collection")).toBe(true);
    expect(isPlaceHomeLive("collection", "inbox")).toBe(false);
    // Blurred tab: nothing in that pager is live.
    expect(isPlaceHomeLive(null, "collection")).toBe(false);
  });
});

describe("stable safe area insets", () => {
  it("keeps the largest NativeTabs insets so pre-attach 34 does not win over bounded 83", () => {
    const device = { top: 59, bottom: 34, left: 0, right: 0 };
    const bounded = { top: 59, bottom: 83, left: 0, right: 0 };
    expect(coalesceSafeAreaInsets({ top: 0, bottom: 34, left: 0, right: 0 }, device)).toEqual(
      device,
    );
    expect(coalesceSafeAreaInsets(bounded, device)).toEqual(bounded);
    expect(coalesceSafeAreaInsets(device, bounded)).toEqual(bounded);
    expect(coalesceSafeAreaInsets({ top: 20, bottom: 10, left: 0, right: 0 }, null)).toEqual({
      top: 20,
      bottom: 10,
      left: 0,
      right: 0,
    });
  });

  it("keeps overview bottom padding equal for device-only and bounded insets", () => {
    expect(tabBarContentInset(34)).toBe(tabBarContentInset(83));
    expect(tabBarContentInset(34)).toBe(91);
  });
});

describe("place overview cache", () => {
  afterEach(() => {
    clearPlaceOverviews();
  });

  it("returns nothing until a snapshot is written", () => {
    expect(readPlaceOverview("inbox")).toBeUndefined();
  });

  it("hydrates a later read from the written snapshot", () => {
    writePlaceOverview("inbox", {
      conversations: [],
      activityItems: [],
    });

    expect(readPlaceOverview("inbox")).toEqual({
      conversations: [],
      activityItems: [],
    });
  });

  it("notifies subscribers when a snapshot lands, then forgets after clear", () => {
    let notices = 0;
    const unsubscribe = subscribePlaceOverviews(() => {
      notices += 1;
    });

    writePlaceOverview("search", { home: {} });
    expect(notices).toBe(1);
    expect(readPlaceOverview("search")).toEqual({ home: {} });

    clearPlaceOverviews();
    expect(readPlaceOverview("search")).toBeUndefined();
    expect(notices).toBe(2);

    unsubscribe();
    writePlaceOverview("search", { home: {} });
    expect(notices).toBe(2);
  });
});
