import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sheetPath = join(__dirname, "../src/components/sheet.tsx");
const catalogUiPath = join(__dirname, "../src/components/catalog-ui.tsx");
const sheetDismissPath = join(__dirname, "../src/components/use-sheet-dismiss.ts");
const accountUiPath = join(__dirname, "../src/components/account-ui.tsx");
const doorSheetPath = join(__dirname, "../src/first-session/door-sheet.tsx");
const doorFacesPath = join(__dirname, "../src/first-session/door-faces.tsx");
const hostPath = join(__dirname, "../app/(first-session)/index.tsx");

function readDoorChrome() {
  return `${readFileSync(doorSheetPath, "utf8")}\n${readFileSync(doorFacesPath, "utf8")}`;
}

describe("Sheet chrome", () => {
  it("pins a light circular close button to the TOP-LEFT with content below the header", () => {
    const catalog = readFileSync(sheetPath, "utf8");

    // One circular chrome button — X ("Luk") on a root sheet, chevron ("Tilbage") on a sub-page.
    expect(catalog).toContain("SheetChromeButton");
    expect(catalog).toContain('accessibilityLabel={isBack ? "Tilbage" : "Luk"}');
    expect(catalog).toContain('name={isBack ? "chevron-back" : "close"}');
    // Circular, translucent neutral surface from a semantic token (no raw color).
    expect(catalog).toContain("sheetChromeButton");
    expect(catalog).toContain("withAlpha(theme.contentPrimary, 0.06)");
    expect(catalog).toContain("borderRadius: radius.pill");
    // No top-right pinned close treatment anymore.
    expect(catalog).not.toContain("sheetClose");
    expect(catalog).not.toContain("sheetHeaderSpacer");
    // Title (or title-slot node) is the first content row BELOW the header, not beside it.
    expect(catalog).toContain("sheetTitleRegion");
    expect(catalog).not.toContain("isDoor ? null");
    expect(catalog).not.toContain("isDoor ? (");
    expect(catalog).toContain("sheetHandle");
  });

  it("offers an optional trailing header action slot", () => {
    const catalog = readFileSync(sheetPath, "utf8");

    expect(catalog).toContain("headerAction?: ReactNode");
    expect(catalog).toContain("headerAction ? (");
    expect(catalog).toContain("sheetHeaderAction");
  });

  it("supports a sub-page back state via onBack", () => {
    const catalog = readFileSync(sheetPath, "utf8");

    expect(catalog).toContain("onBack?: () => void");
    // Back chevron when onBack is set; otherwise the close X calls requestDismiss.
    expect(catalog).toContain('mode={onBack ? "back" : "close"}');
    expect(catalog).toContain("onPress={onBack ?? requestDismiss}");
  });

  it("makes a downward drag anywhere the default dismiss, handing off to a scrolling body", () => {
    const catalog = readFileSync(sheetPath, "utf8");
    const dismiss = readFileSync(sheetDismissPath, "utf8");

    expect(catalog).toContain("GestureHandlerRootView");
    expect(catalog).toContain("useSheetDismiss");
    // The pan wraps the whole sheet (drag anywhere), and a scrolling body reads the
    // shared scroll controls to hand off the gesture.
    expect(catalog).toContain("useSheetScroll");
    expect(catalog).toContain("SheetScrollContext.Provider");

    expect(dismiss).toContain("Gesture.Pan");
    expect(dismiss).toContain("activeOffsetY");
    // Horizontal intent fails the vertical dismiss so the door's mode-swipe can win.
    expect(dismiss).toContain("failOffsetX");
    expect(dismiss).toContain("translateY");
    expect(dismiss).toContain("withSpring");
    expect(dismiss).toContain("rubberband");
    expect(dismiss).toContain("project(");
    // Scroll composition: at-top handoff on the UI thread.
    expect(dismiss).toContain("Gesture.Native");
    expect(dismiss).toContain("simultaneousWithExternalGesture");
    expect(dismiss).toContain("useAnimatedScrollHandler");
    expect(dismiss).toContain("scrollOffset");
    expect(dismiss).toContain("driving");
  });

  it("fills the door variant almost to the top", () => {
    const catalog = readFileSync(sheetPath, "utf8");

    expect(catalog).toContain("sheetDoor");
    expect(catalog).toContain("insets.top");
    expect(catalog).toContain("space.insetSm");
  });

  it("routes confirm sheets through the shared Sheet", () => {
    const account = readFileSync(accountUiPath, "utf8");
    const catalog = readFileSync(catalogUiPath, "utf8");

    expect(catalog).toContain('export { Sheet, useSheetScroll } from "@/components/sheet"');
    expect(account).toContain('from "@/components/catalog-ui"');
    expect(account).toContain("<Sheet");
    expect(account).not.toContain("Modal");
  });
});

describe("Door identity face", () => {
  it("keeps email + password on one face with social filling the row", () => {
    const door = readDoorChrome();
    const host = readFileSync(hostPath, "utf8");

    expect(door).toContain('label="E-mail"');
    expect(door).toContain('label="Adgangskode"');
    expect(door).toContain("doorPasswordSubmitLabel");
    expect(door).toContain("<BrandMark provider={provider}");
    expect(door).toContain('provider: "google"');
    expect(door).toContain('provider: "facebook"');
    // Social buttons fill the row so they read as one centered cluster.
    expect(door).toContain("flex: 1");
    // No multi-step chrome anywhere.
    expect(door).not.toContain("emailStep");
    expect(door).not.toContain("ChooseStep");
    expect(door).not.toContain("EmailPasswordStep");
    expect(door).not.toContain("doorEmailCtaLabel");
    expect(host).not.toContain("emailStep");
    expect(host).not.toContain("onNextEmail");
  });
});

describe("Door title mode switcher", () => {
  it("lets Sheet take a ReactNode title slot rendered below the header row", () => {
    const catalog = readFileSync(sheetPath, "utf8");

    // New optional slot, plain `title` string still rendered when absent.
    expect(catalog).toContain("titleContent?: ReactNode");
    expect(catalog).toContain("titleContent ? (");
    expect(catalog).toContain('accessibilityRole="header"');
    // The title-slot node lives in the content region below the header, not the header row.
    expect(catalog).toContain("<View style={styles.sheetTitleRegion}>{titleContent}</View>");
  });

  it("drops the switcher to the first content row below the header (not beside the button)", () => {
    const door = readFileSync(doorSheetPath, "utf8");

    // The header row is just the circular button; the switcher is titleContent.
    expect(door).toContain("titleContent={");
    expect(door).toContain("DoorModeSwitcher mode={mode}");
    // No bespoke leading/back affordance in the door — the shared sub-page pattern owns it.
    expect(door).not.toContain("leading={");
    expect(door).not.toContain('icon="arrow-back"');
  });

  it("renders two switcher segments that tap-switch and expose selected state", () => {
    const door = readFileSync(doorSheetPath, "utf8");

    expect(door).toContain("DoorModeSwitcher");
    expect(door).toContain("DOOR_LOGIN_SEGMENT");
    expect(door).toContain("DOOR_REGISTER_SEGMENT");
    // Each segment is an accessible button reporting its selected state.
    expect(door).toContain("accessibilityState={{ selected }}");
    // The muted inactive segment uses content.muted; active uses content.primary.
    expect(door).toContain("theme.contentPrimary : theme.contentMuted");
    // Grayscale-only — no underline / animated indicator bar under the active segment.
    expect(door).not.toContain("borderBottomWidth");
    expect(door).not.toContain("indicatorStyle");
    // Tapping a segment triggers the same mode swap as the swipe / bottom link.
    expect(door).toContain("onSwapMode");
  });
});

describe("Door face motion and mode swipe", () => {
  it("crossfades faces on the UI thread with an interruptible, velocity-aware swipe", () => {
    const door = readFileSync(doorSheetPath, "utf8");

    // Transform + opacity only, driven by shared values.
    expect(door).toContain("useAnimatedStyle");
    expect(door).toContain("translateX");
    expect(door).toContain("faceOpacity");
    // Horizontal swipe declares its axis so it never fights vertical dismiss / scroll.
    expect(door).toContain("activeOffsetX");
    expect(door).toContain("failOffsetY");
    expect(door).toContain("GestureDetector");
    // Capture current value on start; hand velocity to the settle spring.
    expect(door).toContain("dragStart.set(faceX.get())");
    expect(door).toContain("withSpring");
    expect(door).toContain("velocity: event.velocityX");
    expect(door).toContain("project(event.velocityX)");
    expect(door).toContain("scheduleOnRN(onSwapMode)");
    // Reduced motion drops the translation, keeps opacity.
    expect(door).toContain("useReduceMotion");
    expect(door).toContain("translateX: reduceMotion ? 0 : faceX.get()");
  });
});

describe("Door forgot-password page-in-a-sheet", () => {
  it("swaps in place to a reset sub-page with the shared top-left back chevron", () => {
    const door = readDoorChrome();
    const host = readFileSync(hostPath, "utf8");

    // In-sheet page state, not a route push.
    expect(door).toContain('"auth" | "forgot"');
    expect(door).toContain("ForgotPasswordFace");
    expect(door).toContain("FORGOT_PASSWORD_TITLE");
    expect(door).toContain("FORGOT_PASSWORD_SUBMIT");
    // Same reset API the /(auth)/reset route uses.
    expect(door).toContain("requestPasswordReset");
    // The reset page uses the shared sub-page back handler, not a bespoke leading button.
    expect(door).toContain("onBack={onForgot ? backToAuth : undefined}");
    // The host no longer pushes the reset route from the door.
    expect(host).not.toContain('router.push("/(auth)/reset")');
    expect(host).not.toContain("useRouter");
    expect(door).not.toContain("router.push");
  });
});

describe("Door body scroll composition", () => {
  it("wires the door ScrollView to the shared dismiss handoff", () => {
    const door = readFileSync(doorSheetPath, "utf8");

    expect(door).toContain("useSheetScroll");
    expect(door).toContain("Animated.ScrollView");
    expect(door).toContain("sheetScroll?.scrollHandler");
    expect(door).toContain("sheetScroll.scrollGesture");
  });
});
