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

  it("keeps login, register, and cookie-indstillinger on the border dock", () => {
    const login = readFileSync(loginPath, "utf8");
    const register = readFileSync(registerPath, "utf8");
    const cookies = readFileSync(cookiePath, "utf8");

    for (const source of [login, register, cookies]) {
      expect(source).toContain("ButtonDock");
      expect(source).not.toContain('variant="fade"');
    }
  });

  it("renders fade with reduce-motion-aware blur and a static scrim gradient", () => {
    const ui = readFileSync(uiPath, "utf8");

    expect(ui).toContain("useReduceMotion");
    expect(ui).toContain("BlurView");
    expect(ui).toContain("!reduceMotion");
    expect(ui).toContain("withAlpha(theme.canvas");
    expect(ui).toContain("FADE_GRADIENT_STOPS");
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
