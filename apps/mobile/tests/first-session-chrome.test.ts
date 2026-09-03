import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const srcDir = join(__dirname, "../src/first-session");
const catalogUiPath = join(__dirname, "../src/components/catalog-ui.tsx");

function readFirstSession(file: string) {
  return readFileSync(join(srcDir, file), "utf8");
}

describe("first-session visual host chrome", () => {
  it("paints splash with locked fill.primary, not theme.canvas or a raw dark hex", () => {
    const splash = readFirstSession("splash-screen.tsx");
    const copy = readFirstSession("door-copy.ts");

    expect(splash).toContain("color.fillPrimary");
    expect(splash).toContain("kitcollective-lockup-white.png");
    expect(splash).toContain("SPLASH_CAPTION");
    expect(copy).toContain("Tryk for at fortsætte");
    expect(splash).toContain("withAlpha(color.contentInverse");
    expect(splash).not.toContain("theme.canvas");
    expect(splash.includes(`#${"0A0A0A"}`)).toBe(false);
    expect(splash).not.toContain("BrandLockupWhite");
    expect(splash).not.toContain("prototype-first-run");
    expect(splash).not.toContain("FloatingTabBar");
  });

  it("keeps splash dock inverted surface login and tertiary inverse register", () => {
    const splash = readFirstSession("splash-screen.tsx");

    expect(splash).toContain("color.surface");
    expect(splash).toContain("color.contentPrimary");
    expect(splash).toContain("color.contentInverse");
    expect(splash).not.toContain("outline");
  });

  it("extends Sheet with door variant rather than a new primitive", () => {
    const catalog = readFileSync(catalogUiPath, "utf8");
    const door = readFirstSession("door-sheet.tsx");

    expect(catalog).toContain("variant?: SheetVariant");
    expect(catalog).toContain('"door"');
    expect(catalog).toContain("sentence?: string");
    expect(door).toContain('variant="door"');
    expect(door).toContain('from "@/components/catalog-ui"');
  });

  it("keeps door email steps, icon social, and locked Danish copy without prototype chrome", () => {
    const door = readFirstSession("door-sheet.tsx");
    const copy = readFirstSession("door-copy.ts");

    expect(door).toContain("doorStepCaption");
    expect(door).toContain("EMAIL_NEXT_LABEL");
    expect(door).toContain("EMAIL_CHANGE_LABEL");
    expect(door).toContain("PASSWORD_REPEAT_LABEL");
    expect(door).toContain("PASSWORD_HELPER");
    expect(door).toContain("FORGOT_PASSWORD_LABEL");
    expect(copy).toContain("1/2");
    expect(copy).toContain("2/2");
    expect(copy).toContain("Næste");
    expect(copy).toContain("Skift");
    expect(copy).toContain("Gentag adgangskode");
    expect(copy).toContain("mindst 8 tegn");
    expect(copy).toContain("Glemt adgangskode?");
    expect(door).toContain("logo-google");
    expect(door).toContain("logo-facebook");
    expect(door).toContain('name: "Google"');
    expect(door).toContain('name: "Facebook"');
    expect(door).not.toContain("Apple");
    expect(door).not.toContain("Fortsæt med");
    expect(door).not.toContain("Gem kun på denne telefon");
    expect(door).not.toContain("prototype-first-run");
    expect(door).not.toContain("FloatingTabBar");
  });

  it("keeps verify beat quiet and non-blocking", () => {
    const verify = readFirstSession("verify-email-beat.tsx");

    expect(verify).toContain("VERIFY_EMAIL_TITLE");
    expect(verify).toContain("onDismissVerify");
    expect(verify).toContain("onDismiss");
    expect(verify).toContain('variant="primary"');
    expect(verify).toContain("VERIFY_EMAIL_CONTINUE");
    expect(verify).not.toContain("FloatingTabBar");
    expect(verify).not.toContain("Bekræft");
  });
});
