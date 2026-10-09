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
    expect(catalog).toContain("headerAction ?");
    expect(catalog).toContain("sheetHeaderAction");
  });

  it("can omit the chrome button and wait for Modal hide", () => {
    const catalog = readFileSync(sheetPath, "utf8");

    expect(catalog).toContain("hideChrome?: boolean");
    expect(catalog).toContain("onModalHide?: () => void");
    expect(catalog).toContain("onDismiss={onModalHide}");
    expect(catalog).toContain("hideChrome && !headerAction ? null");
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
  it("keeps one Kom i gang face: e-mail, Fortsæt, equal secondary social buttons with icon + text", () => {
    const door = readDoorChrome();
    const host = readFileSync(hostPath, "utf8");

    expect(door).toContain("DOOR_EMAIL_LABEL");
    expect(door).toContain("DOOR_SUBMIT_LABEL");
    expect(door).toContain("DOOR_TERMS_LINE");
    expect(door).toContain("<BrandMark provider={provider}");
    expect(door).toContain('"google"');
    expect(door).toContain('"facebook"');
    // Social buttons are equal-width secondary Buttons with a leading mark and the name.
    expect(door).toContain('variant="secondary"');
    expect(door).toContain('width="fill"');
    expect(door).toContain("DOOR_PROVIDER_LABEL[provider]");
    // Invalid e-mail: danger on the border and text only.
    expect(door).toContain("error ? theme.danger : theme.borderSubtle");
    // No multi-step chrome anywhere.
    expect(door).not.toContain("emailStep");
    expect(door).not.toContain("ChooseStep");
    expect(door).not.toContain("EmailPasswordStep");
    expect(host).not.toContain("emailStep");
    expect(host).not.toContain("onNextEmail");
  });
});

describe("Door title and Sheet title slot", () => {
  it("keeps the Sheet title slot generic: a ReactNode rendered below the header row", () => {
    const catalog = readFileSync(sheetPath, "utf8");

    // Optional slot for other users; plain `title` string still rendered when absent.
    expect(catalog).toContain("titleContent?: ReactNode");
    expect(catalog).toContain("titleContent ? (");
    expect(catalog).toContain('accessibilityRole="header"');
    expect(catalog).toContain("<View style={styles.sheetTitleRegion}>{titleContent}</View>");
  });

  it("titles the door Kom i gang with the plain title and no mode switcher", () => {
    const door = readFileSync(doorSheetPath, "utf8");

    expect(door).toContain('variant="door"');
    expect(door).toContain("title={DOOR_TITLE}");
    expect(door).not.toContain("titleContent");
    expect(door).not.toContain("DoorModeSwitcher");
    expect(door).not.toContain("DOOR_LOGIN_SEGMENT");
    expect(door).not.toContain("DOOR_REGISTER_SEGMENT");
    // No bespoke leading/back affordance in the door, no mode swipe, no forgot page.
    expect(door).not.toContain("leading={");
    expect(door).not.toContain("activeOffsetX");
    expect(door).not.toContain("onSwapMode");
    expect(door).not.toContain("requestPasswordReset");
    expect(door).not.toContain("ForgotPasswordFace");
  });

  it("mounts a Toast host inside the door Modal so the cancelled-login toast is visible", () => {
    const door = readFileSync(doorSheetPath, "utf8");

    expect(door).toContain("<Toast");
    expect(door).toContain("config={toastConfig}");
    expect(door).toContain('position="bottom"');
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
