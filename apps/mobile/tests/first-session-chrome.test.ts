import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const srcDir = join(__dirname, "../src/first-session");
const sheetPath = join(__dirname, "../src/components/sheet.tsx");

function readFirstSession(file: string) {
  return readFileSync(join(srcDir, file), "utf8");
}

describe("first-session visual host chrome", () => {
  it("paints welcome and demo on fill.primary with inverse tokens and the white lockup", () => {
    const welcome = readFirstSession("welcome-screen.tsx");
    const demo = readFirstSession("demo-screen.tsx");
    const wall = readFirstSession("jersey-wall.tsx");

    expect(welcome).toContain("color.fillPrimary");
    expect(welcome).toContain("kitcollective-lockup-white.svg");
    expect(welcome).toContain("WELCOME_HEADLINE");
    expect(welcome).toContain("typography.display");
    expect(demo).toContain("color.fillPrimary");
    expect(wall).toContain("color.scrim");
    for (const source of [welcome, demo, wall]) {
      expect(source).not.toContain("theme.canvas");
      expect(source).not.toContain("prototype-first-run");
      expect(source).not.toContain("FloatingTabBar");
      expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });

  it("welcome offers three example tiles, a secondary own-photo action and a tertiary account action", () => {
    const welcome = readFirstSession("welcome-screen.tsx");

    expect(welcome).toContain("EXAMPLE_JERSEYS.map");
    expect(welcome).toContain("onStartDemo(exampleId, origins)");
    expect(welcome).toContain('variant="secondary"');
    expect(welcome).toContain('variant="tertiary"');
    expect(welcome).toContain("WELCOME_OWN_PHOTO_LABEL");
    expect(welcome).toContain("WELCOME_HAVE_ACCOUNT_LABEL");
    expect(welcome).not.toContain("Næste");
  });

  it("the wall, travel and Vision-at-work motion follow Brand moments and honour Reduce Motion", () => {
    const wall = readFirstSession("jersey-wall.tsx");
    const demo = readFirstSession("demo-screen.tsx");
    const welcome = readFirstSession("welcome-screen.tsx");
    const moments = readFirstSession("brand-moments.ts");

    expect(wall).toContain("reduceMotion");
    expect(wall).toContain("withRepeat");
    expect(wall).toContain("Easing.linear");
    expect(wall).toContain("BRAND_MOMENTS.wall.tiltDeg");
    expect(wall).toContain('index % 2 === 0 ? "up" : "down"');
    expect(welcome).toContain("useReduceMotion");
    expect(welcome).toContain("riseStaggerMs");
    expect(demo).toContain("useReduceMotion");
    expect(demo).toContain("withSpring");
    expect(demo).toContain("timeline.showsScanLine");
    expect(demo).toContain("scale:");
    expect(moments).toContain("tiltDeg: 6");
    expect(moments).toContain("riseMs: 520");
    expect(moments).toContain("riseStaggerMs: 90");
    expect(moments).toContain("travelMs: 420");
    expect(moments).toContain("scanPassMs: 900");
    expect(moments).toContain("rowRevealMs: 260");
  });

  it("the stage is 4:5 and the demo never touches the network", () => {
    const demo = readFirstSession("demo-screen.tsx");
    const data = readFirstSession("demo.ts");
    const welcome = readFirstSession("welcome-screen.tsx");

    expect(demo).toContain("5 / 4");
    for (const source of [demo, data, welcome]) {
      expect(source).not.toMatch(/@\/api\//);
      expect(source).not.toMatch(/\bfetch\(|startUnsignedVisionSuggest|apiClient|axios/);
    }
  });

  it("keeps boot loading a plain plate and never brings back the prize-jersey splash", () => {
    const loading = readFirstSession("splash-loading.tsx");

    expect(loading).toContain("ActivityIndicator");
    expect(loading).toContain("color.fillPrimary");
    expect(loading).not.toContain("SplashBackdrop");
    expect(loading).not.toContain("splash-prize-jersey");
  });

  it("extends Sheet with door variant rather than a new primitive", () => {
    const catalog = readFileSync(sheetPath, "utf8");
    const door = readFirstSession("door-sheet.tsx");

    expect(catalog).toContain("variant?: SheetVariant");
    expect(catalog).toContain('"door"');
    expect(catalog).toContain("sentence?: string");
    expect(door).toContain('variant="door"');
    expect(door).toContain('from "@/components/sheet"');
  });

  it("adopts the shared Lunar-style chrome: top-left circular button, switcher below header, back sub-page", () => {
    const catalog = readFileSync(sheetPath, "utf8");
    const door = readFirstSession("door-sheet.tsx");

    // Light circular top-left button (X for root, chevron for sub-pages) on a translucent
    // neutral surface — semantic tokens only.
    expect(catalog).toContain("SheetChromeButton");
    expect(catalog).toContain('name={isBack ? "chevron-back" : "close"}');
    expect(catalog).toContain("withAlpha(theme.contentPrimary, 0.06)");
    // Content starts below the header row.
    expect(catalog).toContain("sheetTitleRegion");
    expect(catalog).not.toContain("sheetClose");
    // Door header row holds only the circular button; switcher is the first content row,
    // and the reset sub-page uses the shared back handler.
    expect(door).toContain("titleContent={");
    expect(door).toContain("onBack={onForgot ? backToAuth : undefined}");
    expect(door).not.toContain("leading={");
    expect(door).not.toContain('icon="arrow-back"');
    // Drag-anywhere dismiss with the scroll handoff wired through the door body.
    expect(door).toContain("useSheetScroll");
    expect(door).toContain("Animated.ScrollView");
  });

  it("keeps a single-face door with email + password, icon social, and locked Danish copy", () => {
    const door = `${readFirstSession("door-sheet.tsx")}\n${readFirstSession("door-faces.tsx")}`;
    const copy = readFirstSession("door-copy.ts");

    expect(door).toContain('label="E-mail"');
    expect(door).toContain('label="Adgangskode"');
    expect(door).toContain("PASSWORD_REPEAT_LABEL");
    expect(door).toContain("PASSWORD_HELPER");
    expect(door).toContain("FORGOT_PASSWORD_LABEL");
    expect(door).toContain("doorPasswordSubmitLabel");
    expect(copy).toContain("Gentag adgangskode");
    expect(copy).toContain("mindst 8 tegn");
    expect(copy).toContain("Glemt adgangskode?");
    expect(door).toContain("<BrandMark provider={provider}");
    expect(door).toContain('provider: "google"');
    expect(door).toContain('provider: "facebook"');
    expect(door).toContain('name: "Google"');
    expect(door).toContain('name: "Facebook"');
    // No multi-step chrome — one face for the whole identity flow.
    expect(door).not.toContain("emailStep");
    expect(door).not.toContain("doorStepCaption");
    expect(door).not.toContain("EMAIL_NEXT_LABEL");
    expect(door).not.toContain("EMAIL_CHANGE_LABEL");
    expect(door).not.toContain("doorEmailCtaLabel");
    expect(copy).not.toContain("1/2");
    expect(copy).not.toContain("Skift");
    expect(door).not.toContain("Apple");
    expect(door).not.toContain("Fortsæt med");
    expect(door).not.toContain("Gem kun på denne telefon");
    expect(door).not.toContain("prototype-first-run");
    expect(door).not.toContain("FloatingTabBar");
  });

  it("locks chooser chrome as gallery-first capture without premium or tab bar", () => {
    const chooser = readFirstSession("chooser-screen.tsx");

    expect(chooser).toContain("Tilføj trøje");
    expect(chooser).toContain("Op til tre billeder bliver én trøje");
    expect(chooser).toContain("Upload filer");
    expect(chooser).toContain("Tag billede");
    expect(chooser).toContain("pickUploadFiles");
    expect(chooser).toContain("CaptureCameraSession");
    expect(chooser).toContain("createPersistedCaptureSession");
    expect(chooser).not.toContain("requestPremiumAccess");
    expect(chooser).not.toContain("FloatingTabBar");
  });

  it("locks analysing chrome with Læser trøjen copy, PhotoSlot, hairline progress, and no wash", () => {
    const analysing = readFirstSession("analysing-screen.tsx");
    const copy = readFirstSession("analysing-copy.ts");
    const chrome = `${analysing}\n${copy}`;

    expect(copy).toContain("Læser trøjen");
    expect(copy).toContain("Vi finder klub, sæson og type.");
    expect(copy).toContain("Udfyld selv i stedet");
    expect(analysing).toContain("PhotoSlot");
    expect(analysing).toContain("StyleSheet.hairlineWidth");
    expect(analysing).toContain("buildIdentitySuggestRequest");
    expect(analysing).toContain("startUnsignedVisionSuggest");
    expect(chrome).not.toContain("identity.wash");
    expect(chrome).not.toContain("FloatingTabBar");
  });
});
