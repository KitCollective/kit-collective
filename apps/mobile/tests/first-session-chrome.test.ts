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
