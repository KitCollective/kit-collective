import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { tabBarContentInset } from "../src/components/tab-bar-metrics";
import { sendBidDockBottomPadding } from "../src/search/send-bid-layout";
import { space } from "../src/theme/tokens";

const screenPath = join(__dirname, "../app/(tabs)/search/send-bid/[jerseyId].tsx");

function readScreen(): string {
  return readFileSync(screenPath, "utf8");
}

describe("send bid dock layout (KIT-270)", () => {
  it("clears the native tab bar while the number pad is closed", () => {
    expect(sendBidDockBottomPadding(false, 34)).toBe(tabBarContentInset(34));
    expect(sendBidDockBottomPadding(false, 83)).toBe(tabBarContentInset(83));
  });

  it("sits flush on the number pad while it is open", () => {
    expect(sendBidDockBottomPadding(true, 34)).toBe(space.insetSm);
    expect(sendBidDockBottomPadding(true, 83)).toBe(space.insetSm);
    expect(sendBidDockBottomPadding(true, 34, false)).toBe(space.insetSm);
  });

  it("adds no Tab bar inset while the number pad is closed and the Tab bar is hidden", () => {
    expect(sendBidDockBottomPadding(false, 34, false)).toBe(34);
    expect(sendBidDockBottomPadding(false, 0, false)).toBe(space.insetMd);
  });

  it("keeps the Tab bar inset when the Tab bar shows", () => {
    expect(sendBidDockBottomPadding(false, 34, true)).toBe(tabBarContentInset(34));
  });
});

describe("send bid screen chrome (KIT-270)", () => {
  it("lifts the dock above the number pad with KeyboardAvoidingView", () => {
    const source = readScreen();

    expect(source).toContain("KeyboardAvoidingView");
    expect(source).toMatch(/behavior=\{Platform\.OS === "ios" \? "padding" : undefined\}/);
  });

  it("shows no large photo, so Dit bud clears the tab bar on open", () => {
    const source = readScreen();

    expect(source).not.toMatch(/aspectRatio:\s*4\s*\/\s*5/);
  });

  it("keeps the submit Button outside the scroll body", () => {
    const source = readScreen();
    const scrollClose = source.indexOf("</ScrollView>");
    const submit = source.indexOf('testID="bid-submit"');

    expect(scrollClose).toBeGreaterThan(-1);
    expect(submit).toBeGreaterThan(scrollClose);
  });

  it("opens the number pad from the start and lets a tap outside the field keep working", () => {
    const source = readScreen();

    expect(source).toMatch(/amountInputRef\.current\?\.focus\(\)/);
    expect(source).toMatch(/keyboardShouldPersistTaps="handled"/);
    expect(source).toMatch(/keyboardDismissMode="on-drag"/);
  });

  it("focuses the field from JS, not native autoFocus, so the Færdig accessory is attached first", () => {
    // RN Fabric: native autoFocus makes the field first responder in its own didMoveToWindow,
    // before the sibling InputAccessoryView attaches, and the accessory never reloads the
    // input views, so the iOS number pad opens without Færdig (hosted Device flow, 9ee252ab).
    const source = readScreen();

    expect(source).not.toMatch(/\bautoFocus\b/);
    expect(source).toMatch(/requestAnimationFrame\(\(\) => amountInputRef\.current\?\.focus\(\)\)/);
  });

  it("links the field and the accessory by the same id", () => {
    const source = readScreen();

    expect(source).toMatch(/inputAccessoryViewID=\{[^}]*KEYBOARD_ACCESSORY_ID/);
    expect(source).toMatch(/nativeID=\{KEYBOARD_ACCESSORY_ID\}/);
  });

  it("gives the number pad a Færdig control that dismisses it", () => {
    const source = readScreen();

    expect(source).toMatch(/inputAccessoryViewID=/);
    expect(source).toContain("InputAccessoryView");
    expect(source).toContain('testID="bid-keyboard-done"');
    expect(source).toContain("Færdig");
    expect(source).toMatch(/onPress=\{Keyboard\.dismiss\}/);
  });

  it("shows a failed send as a danger Banner under the header and keeps the amount", () => {
    const source = readScreen();

    expect(source).toContain("<Banner");
    expect(source).toContain('tone="danger"');
    expect(source.indexOf("<Banner")).toBeLessThan(source.indexOf("<ScrollView"));
    expect(source).not.toMatch(/setAmount\(""\)/);
  });

  it("drops the Tab bar inset when Send bud sits above the foreign detail on iOS", () => {
    const source = readScreen();

    expect(source).toContain("sitsAboveForeignJersey");
    expect(source).toContain(
      "sendBidDockBottomPadding(keyboardVisible, insets.bottom, tabBarShown)",
    );
  });

  it("hands the sent bid to the detail for the Toast, then goes back", () => {
    const source = readScreen();

    expect(source).toContain("rememberBidSent");
    expect(source.indexOf("rememberBidSent")).toBeLessThan(source.indexOf("router.back()"));
  });

  it("summarises the jersey as club and season, type · size · condition, player · owner", () => {
    const source = readScreen();

    expect(source).toContain("buildSendBidSummary");
    expect(source).not.toMatch(/aspectRatio:\s*4\s*\/\s*5/);
  });

  it("does not show the last bid or any other collector's amount", () => {
    const source = readScreen();

    expect(source).not.toContain("latestBidAmountDkk");
    expect(source).not.toContain("Seneste bud");
  });

  it("keeps the documented test ids", () => {
    const source = readScreen();

    expect(source).toContain('testID="bid-amount"');
    expect(source).toContain('testID="bid-submit"');
  });
});
