import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const collectionPath = join(__dirname, "../app/(tabs)/collection/index.tsx");
const emptyStatePath = join(__dirname, "../src/components/ui.tsx");
const diagramPath = join(__dirname, "../src/components/collection-empty-diagram.tsx");
const tabLayoutPath = join(__dirname, "../app/(tabs)/_layout.tsx");
const collectionHeaderPath = join(__dirname, "../src/components/collection-header.tsx");
const sheetPath = join(__dirname, "../src/components/capture-source-sheet.tsx");
const chooserPath = join(__dirname, "../src/capture/capture-chooser.tsx");
const postSavePath = join(__dirname, "../src/components/post-save-sheet.tsx");

describe("Collection empty chrome", () => {
  it("keeps only the title and a hug action under a shirt diagram", () => {
    const source = readFileSync(collectionPath, "utf8");

    expect(source).toContain('title="Ingen trøjer endnu"');
    expect(source).toContain("CollectionEmptyDiagram");
    expect(source).toContain('width="hug"');
    expect(source).not.toContain("Tilføj den første fra galleriet.");
    expect(source).not.toContain("ButtonDock");
  });

  it("makes EmptyState body optional and accepts a diagram slot", () => {
    const source = readFileSync(emptyStatePath, "utf8");

    expect(source).toContain("body?: string");
    expect(source).toContain("diagram?: ReactNode");
  });

  it("uses the Tab bar icon family for the empty diagram", () => {
    const source = readFileSync(diagramPath, "utf8");

    expect(source).toContain('name="shirt-outline"');
    expect(source).toContain("useReduceMotion");
    expect(source).toContain("withRepeat");
  });
});

describe("Native tab bar chrome", () => {
  it("renders NativeTabs with the five locked tabs in order", () => {
    const layout = readFileSync(tabLayoutPath, "utf8");

    expect(layout).toContain("NativeTabs");
    expect(layout).not.toContain("FloatingTabBar");
    const order = [...layout.matchAll(/<NativeTabs\.Trigger\s+name="([^"]+)"/g)].map((m) => m[1]);
    expect(order).toEqual(["collection", "inbox", "search", "wishlist", "profile"]);
    // Søg (search) is the center tab.
    expect(order[2]).toBe("search");
    // NativeTabs would inset the first UIScrollView on focus. Outer overviews
    // no longer use PagerView; keep the Trigger opt-out so lists stay manual.
    expect([...layout.matchAll(/disableAutomaticContentInsets/g)]).toHaveLength(5);
    expect([...layout.matchAll(/contentStyle=\{tabContentStyle\}/g)]).toHaveLength(5);
  });

  it("renders tab icons a little under the system SF default", () => {
    const layout = readFileSync(tabLayoutPath, "utf8");
    const icon = readFileSync(join(__dirname, "../src/components/tab-bar-icon.tsx"), "utf8");
    const metrics = readFileSync(join(__dirname, "../src/components/tab-bar-metrics.ts"), "utf8");

    expect(layout).toContain("useTabBarIconSrc");
    expect(icon).toContain("TAB_BAR_ICON_SIZE");
    expect(icon).toContain("Promise.all");
    expect(metrics).toContain("export const TAB_BAR_ICON_SIZE = 22");
  });

  it("pages parent overviews with the finger and keeps drills on the stack", () => {
    const collection = readFileSync(collectionPath, "utf8");
    const inbox = readFileSync(join(__dirname, "../app/(tabs)/inbox/index.tsx"), "utf8");
    const search = readFileSync(join(__dirname, "../app/(tabs)/search/index.tsx"), "utf8");
    const wishlist = readFileSync(join(__dirname, "../app/(tabs)/wishlist/index.tsx"), "utf8");
    const profile = readFileSync(join(__dirname, "../app/(tabs)/profile/index.tsx"), "utf8");
    const jersey = readFileSync(join(__dirname, "../app/(tabs)/collection/[jerseyId].tsx"), "utf8");
    const swipe = readFileSync(join(__dirname, "../src/navigation/place-swipe.ts"), "utf8");
    const layout = readFileSync(tabLayoutPath, "utf8");
    const pager = readFileSync(join(__dirname, "../src/navigation/place-pager.tsx"), "utf8");
    const warmup = readFileSync(join(__dirname, "../src/navigation/place-home-warmup.ts"), "utf8");

    for (const source of [collection, inbox, search, wishlist, profile]) {
      expect(source).toContain("PlacePagerScreen");
    }
    expect(jersey).not.toContain("PlacePagerScreen");
    expect(swipe).toContain("inboxYieldsToPlaceSwipe");
    expect(swipe).toContain("inboxOuterPanShouldActivate");
    expect(layout).toContain("prefetchPlaceOverviews");
    expect(layout).toContain("place-home-warmup");
    expect(pager).toContain("GestureDetector");
    expect(pager).toContain("inboxOuterPanShouldActivate");
    expect(pager).not.toContain("blocksExternalGesture");
    expect(pager).toContain("requireExternalGestureToFail");
    expect(pager).toContain("inboxInnerConsumesSwipe");
    expect(inbox).toContain("InboxInnerPager");
    expect(inbox).not.toContain("inboxPagerNative");
    expect(inbox).not.toContain("react-native-pager-view");
    const innerPager = readFileSync(
      join(__dirname, "../src/navigation/inbox-inner-pager.tsx"),
      "utf8",
    );
    expect(innerPager).toContain("inboxOuterPanShouldActivate");
    expect(innerPager).not.toContain("react-native-pager-view");
    expect(pager).toContain("placePagerSnapIndex");
    expect(pager).toContain("placePagerHoldUntilAfterBlur");
    expect(pager).toContain("scheduleOnRN(commitPlace");
    expect(pager).not.toContain("react-native-pager-view");
    expect(pager).toContain("PLACE_ORDER.map");
    expect(pager).not.toContain("setSettling");
    const pagerScreen = readFileSync(
      join(__dirname, "../src/navigation/place-pager-screen.tsx"),
      "utf8",
    );
    expect(pagerScreen).toContain("focused={focused}");
    expect(pagerScreen).toContain("PlaceHomeLiveProvider");
    expect(pager).toContain("withSpring");
    expect(pager).toContain("theme.canvas");
    expect(pagerScreen).toContain("theme.canvas");
    const screenHeader = readFileSync(
      join(__dirname, "../src/components/screen-header.tsx"),
      "utf8",
    );
    const collectionHeader = readFileSync(
      join(__dirname, "../src/components/collection-header.tsx"),
      "utf8",
    );
    expect(screenHeader).toContain("useStableSafeAreaInsets");
    expect(collectionHeader).toContain("useStableSafeAreaInsets");
    expect(warmup).toContain("collection/index");
    expect(warmup).toContain("inbox/index");
    expect(inbox).toContain("usePlaceOverview");
    expect(search).toContain("usePlaceOverview");
  });

  it("uses one stack push animation for in-app drills", () => {
    const collectionLayout = readFileSync(
      join(__dirname, "../app/(tabs)/collection/_layout.tsx"),
      "utf8",
    );
    const profileLayout = readFileSync(
      join(__dirname, "../app/(tabs)/profile/_layout.tsx"),
      "utf8",
    );
    const inboxLayout = readFileSync(join(__dirname, "../app/(tabs)/inbox/_layout.tsx"), "utf8");
    const searchLayout = readFileSync(join(__dirname, "../app/(tabs)/search/_layout.tsx"), "utf8");
    const motion = readFileSync(join(__dirname, "../src/navigation/stack-motion.ts"), "utf8");

    expect(motion).toContain('return reduceMotion ? "fade" : "default"');
    expect(motion).toContain("stackRouteMotion");
    expect(collectionLayout).toContain("stackScreenMotion(reduceMotion)");
    expect(collectionLayout).toContain('name="index" options={{ animation: "none" }}');
    expect(profileLayout).toContain("stackScreenMotion(reduceMotion)");
    expect(profileLayout).toContain('animation: "none"');
    expect(inboxLayout).toContain("stackRouteMotion(route.name, reduceMotion)");
    expect(inboxLayout).toContain("theme.canvas");
    expect(searchLayout).toContain("stackRouteMotion(route.name, reduceMotion)");
    expect(searchLayout).toContain("theme.canvas");
    expect(profileLayout).not.toContain('"fade"');
  });

  it("makes capture the Samling header action, not a tab", () => {
    const layout = readFileSync(tabLayoutPath, "utf8");
    const header = readFileSync(collectionHeaderPath, "utf8");
    const collection = readFileSync(collectionPath, "utf8");

    // Capture is never a tab.
    expect(layout).not.toContain('name="add"');
    expect(layout).not.toContain('name="capture"');
    // It lives as the top-right header button on Samling.
    expect(header).toContain('name="Tilføj trøje"');
    expect(header).toContain('icon="add"');
    expect(collection).toContain("captureChooser.open()");
    // The bookmark is gone — wishlist is its own tab now.
    expect(header).not.toContain("bookmark-outline");
  });

  it("gives wishlist its own tab screen and moves capture out of the tabs", () => {
    expect(existsSync(join(__dirname, "../app/(tabs)/wishlist/index.tsx"))).toBe(true);
    // Capture flow lives in its own modal group, no longer under (tabs)/add.
    expect(existsSync(join(__dirname, "../app/(capture)/capture.tsx"))).toBe(true);
    expect(existsSync(join(__dirname, "../app/(capture)/confirm.tsx"))).toBe(true);
    expect(existsSync(join(__dirname, "../app/(tabs)/add"))).toBe(false);
  });

  it("opens the capture chooser as a Sheet, gated behind a single choice", () => {
    const sheet = readFileSync(sheetPath, "utf8");

    expect(sheet).toContain('title="Tilføj trøje"');
    expect(sheet).toContain('accessibilityRole="radio"');
    expect(sheet).toContain('label="Næste"');
    expect(sheet).toContain('label="Annuller"');
    // Each choice carries a title, a helper sentence, and a leading icon.
    expect(sheet).toContain('icon: "images-outline"');
    expect(sheet).toContain('icon: "camera-outline"');
    expect(sheet).toContain("option.helper");
    // Nothing preselected: Næste is blocked, and the block is spelled out.
    expect(sheet).toContain("useState<CaptureSource | null>(null)");
    expect(sheet).toContain("disabled={selected === null}");
    expect(sheet).toContain("Vælg en mulighed for at fortsætte.");
  });

  it("keeps one chooser face for the plus and the post-Save re-entry", () => {
    const chooser = readFileSync(chooserPath, "utf8");
    const postSave = readFileSync(postSavePath, "utf8");

    expect(chooser).toContain("CaptureSourceSheet");
    expect(chooser).toContain("startCaptureFromSource");
    // Post-Save re-opens the same Sheet instead of a full-screen Add place.
    expect(postSave).toContain("useCaptureChooser");
    expect(postSave).not.toContain('pathname: "/(tabs)/add"');
    expect(existsSync(join(__dirname, "../app/(tabs)/add/index.tsx"))).toBe(false);
  });

  it("routes capture into the (capture) modal group, not the tabs", () => {
    const flow = readFileSync(join(__dirname, "../src/capture/captureSourceFlow.ts"), "utf8");

    expect(flow).toContain('"/(capture)/capture"');
    expect(flow).toContain('"/(capture)/confirm"');
    expect(flow).not.toContain('"/(tabs)/add');
  });
});
