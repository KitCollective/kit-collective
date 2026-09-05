import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const srcDir = join(__dirname, "../src/first-session");
const sheetPath = join(__dirname, "../src/components/sheet.tsx");

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
    expect(door).toContain('<BrandMark provider={provider}');
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

  it("locks discovery showcase chrome without title, search, or tab bar", () => {
    const discovery = readFirstSession("discovery-showcase.tsx");
    const marquee = readFirstSession("discovery-marquee.tsx");
    const copy = readFirstSession("discovery-copy.ts");
    const chrome = `${discovery}\n${marquee}\n${copy}`;

    expect(copy).toContain("Tilføj din første trøje");
    expect(copy).toContain("Jeg har allerede en konto");
    expect(discovery).toContain("DiscoveryMarquee");
    expect(discovery).toContain("ButtonDock");
    expect(discovery).toContain("fetchShowcaseJerseys");
    expect(marquee).toContain("displayOnly");
    expect(discovery).toContain("useReduceMotion");
    expect(marquee).toContain("columnTiles(jerseys, !reduceMotion)");
    expect(chrome).not.toContain("ScreenHeader");
    expect(chrome).not.toContain("SearchField");
    expect(chrome).not.toContain("FloatingTabBar");
    expect(chrome).not.toContain("Søg");
  });

  it("locks chooser chrome as gallery-first capture without premium or tab bar", () => {
    const chooser = readFirstSession("chooser-screen.tsx");

    expect(chooser).toContain("Tilføj trøje");
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
    expect(analysing).toContain("startUnsignedVisionSuggest");
    expect(chrome).not.toContain("identity.wash");
    expect(chrome).not.toContain("FloatingTabBar");
  });

  it("locks profile onboarding chrome without skip, handle field, or preferences", () => {
    const profile = readFirstSession("profile-onboarding.tsx");
    const location = readFirstSession("profile-location.tsx");
    const copy = readFirstSession("profile-copy.ts");
    const chrome = `${profile}\n${location}\n${copy}`;

    expect(copy).toContain("Din profil");
    expect(copy).toContain("Vælg billede");
    expect(copy).toContain("Min lokation");
    expect(copy).toContain("Om mig");
    expect(copy).toContain("Fortsæt");
    expect(profile).toContain("PROFILE_TITLE");
    expect(profile).toContain("typography.title");
    expect(profile).toContain('size="lg"');
    expect(profile).toContain("uploadAvatar");
    expect(profile).toContain("typography.mono");
    expect(profile).toContain("ButtonDock");
    expect(location).toContain("SearchField");
    expect(location).toContain('variant="city"');
    expect(location).toContain("popularCitiesForCountryLabel");
    expect(chrome).not.toContain("FloatingTabBar");
    expect(chrome).not.toContain("Spring over");
    expect(chrome).not.toContain("Brugernavn");
    expect(chrome).not.toContain("Navn");
    expect(chrome).not.toContain("Ønske");
    expect(chrome).not.toContain("genvej");
    expect(chrome).not.toContain("cookie");
    expect(chrome).not.toContain("notifikation");
    expect(chrome).not.toContain("prototype-first-run");
    expect(profile).not.toContain("KC");
  });
});
