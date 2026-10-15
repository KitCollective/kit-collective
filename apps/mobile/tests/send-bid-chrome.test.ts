import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { tabBarContentInset } from "../src/components/tab-bar-metrics";
import { sendBidButtonLabel, sendBidDockBottomPadding } from "../src/search/send-bid-layout";
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
  });

  it("carries the amount on the button only for a whole kroner amount", () => {
    expect(sendBidButtonLabel("")).toBe("Send bud");
    expect(sendBidButtonLabel("0")).toBe("Send bud");
    expect(sendBidButtonLabel("abc")).toBe("Send bud");
    expect(sendBidButtonLabel("250")).toBe("Send bud på 250 kr");
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

    expect(source).toMatch(/autoFocus/);
    expect(source).toMatch(/keyboardShouldPersistTaps="handled"/);
    expect(source).toMatch(/keyboardDismissMode="on-drag"/);
  });

  it("gives the number pad a Færdig control that dismisses it", () => {
    const source = readScreen();

    expect(source).toMatch(/inputAccessoryViewID=/);
    expect(source).toContain("InputAccessoryView");
    expect(source).toContain('testID="bid-keyboard-done"');
    expect(source).toContain("Færdig");
    expect(source).toMatch(/onPress=\{Keyboard\.dismiss\}/);
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
