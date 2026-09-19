import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const uiPath = join(__dirname, "../src/components/ui.tsx");
const confirmPath = join(__dirname, "../app/(capture)/confirm.tsx");
const loginPath = join(__dirname, "../app/(auth)/login.tsx");
const registerPath = join(__dirname, "../app/(auth)/register.tsx");
const cookiePath = join(__dirname, "../app/(tabs)/profile/cookie-indstillinger.tsx");

describe("Button dock chrome", () => {
  it("adds a fade variant alongside the default border dock", () => {
    const ui = readFileSync(uiPath, "utf8");

    expect(ui).toContain("variant?: ButtonDockVariant");
    expect(ui).toContain('"border" | "fade"');
    expect(ui).toContain('variant = "border"');
    expect(ui).toContain("BUTTON_DOCK_FADE_SCRIM_HEIGHT");
    expect(ui).toContain("BUTTON_DOCK_FADE_SCROLL_PADDING");
  });

  it("uses fade on confirm with scroll padding for the overlay dock", () => {
    const confirm = readFileSync(confirmPath, "utf8");

    expect(confirm).toContain('variant="fade"');
    expect(confirm).toContain("BUTTON_DOCK_FADE_SCROLL_PADDING");
    expect(confirm).toContain("fadeDockScrollPadding");
  });

  it("does not render Save-block helper text over Gem on the hub", () => {
    const confirm = readFileSync(confirmPath, "utf8");

    // The Data/Detaljer donuts + dashed capsules already surface what is missing;
    // no helper string sits over Gem. Save enablement (disabled prop) is unchanged.
    expect(confirm).not.toContain("dockHelper");
    expect(confirm).toContain("disabled={!saveEnabled}");
  });

  it("keeps login, register, and cookie-indstillinger on the border dock", () => {
    const login = readFileSync(loginPath, "utf8");
    const register = readFileSync(registerPath, "utf8");
    const cookies = readFileSync(cookiePath, "utf8");

    for (const source of [login, register, cookies]) {
      expect(source).toContain("ButtonDock");
      expect(source).not.toContain('variant="fade"');
    }
  });

  it("renders fade with reduce-motion-aware blur and a continuous canvas gradient", () => {
    const fadeScrim = readFileSync(join(__dirname, "../src/components/fade-scrim.tsx"), "utf8");
    const ui = readFileSync(uiPath, "utf8");

    expect(fadeScrim).toContain("useReduceMotion");
    expect(fadeScrim).toContain("BlurView");
    expect(fadeScrim).toContain("!reduceMotion");
    expect(fadeScrim).toContain("LinearGradient");
    expect(fadeScrim).toContain("theme.canvas");
    expect(fadeScrim).toContain("space.insetMd");
    expect(fadeScrim).not.toContain("space.insetLg * 2");
    expect(fadeScrim).not.toMatch(/FADE_SCRIM_HEIGHT = space\.insetLg;/);
    expect(ui).toContain("FadeScrim");
    expect(ui).toContain('edge="bottom"');
  });

  it("keeps the hairline on border and omits it on fade", () => {
    const ui = readFileSync(uiPath, "utf8");

    expect(ui).toContain("dockBorder");
    expect(ui).toMatch(/dockBorder:\s*\{[\s\S]*borderTopWidth: 1/);
    expect(ui).toContain('variant === "fade"');
    expect(ui).toContain("styles.dockBorder");
    expect(ui).not.toMatch(/dockFadeRoot:\s*\{[\s\S]*borderTopWidth/);
    expect(ui).not.toMatch(/dockContent:\s*\{[\s\S]*borderTopWidth/);
  });
});
