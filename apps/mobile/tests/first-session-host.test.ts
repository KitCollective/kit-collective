import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const mobileRoot = join(__dirname, "..");
const doorPath = join(mobileRoot, "src/first-session/door.tsx");
const doorSheetPath = join(mobileRoot, "src/first-session/door-sheet.tsx");
const doorFacesPath = join(mobileRoot, "src/first-session/door-faces.tsx");
const doorCopyPath = join(mobileRoot, "src/first-session/door-copy.ts");
const hostPath = join(mobileRoot, "app/(first-session)/index.tsx");
const indexPath = join(mobileRoot, "app/index.tsx");

function walkSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".expo") {
      continue;
    }
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkSourceFiles(full));
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

describe("First session host chrome", () => {
  it("unsigned index redirects to first-session not /login", () => {
    const index = readFileSync(indexPath, "utf8");

    expect(index).toContain("/(first-session)");
    expect(index).not.toContain('href="/login"');
  });

  it("product files do not import prototype-first-run", () => {
    const files = [
      ...walkSourceFiles(join(mobileRoot, "app")),
      ...walkSourceFiles(join(mobileRoot, "src")),
    ];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/prototype-first-run/);
    }
  });

  it("welcome copy carries the two secondary actions and no splash caption", () => {
    const copy = readFileSync(join(mobileRoot, "src/first-session/welcome-copy.ts"), "utf8");
    const doorCopy = readFileSync(doorCopyPath, "utf8");

    expect(copy).toContain('WELCOME_OWN_PHOTO_LABEL = "Brug mit eget foto"');
    expect(copy).toContain('WELCOME_HAVE_ACCOUNT_LABEL = "Jeg har allerede en konto"');
    expect(copy).toContain('DEMO_START_LABEL = "Kom i gang"');
    expect(copy).toContain('DEMO_ANOTHER_LABEL = "Prøv en anden trøje"');
    expect(doorCopy).not.toContain("Tryk for at fortsætte");
    // "Login" replaces "Log ind" as the general term in door copy.
    expect(doorCopy).not.toContain("Log ind");
  });

  it("door copy is locked, Apple is hidden, and banned first-session chrome is absent", () => {
    const door = readFileSync(doorPath, "utf8");
    const doorSheet = readFileSync(doorSheetPath, "utf8");
    const doorFaces = readFileSync(doorFacesPath, "utf8");
    const copy = readFileSync(doorCopyPath, "utf8");
    const host = readFileSync(hostPath, "utf8");
    const chrome = `${door}\n${doorSheet}\n${doorFaces}\n${copy}\n${host}`;

    // One Kom i gang sheet: e-mail + Fortsæt, divider, equal secondary social buttons.
    expect(copy).toContain('DOOR_TITLE = "Kom i gang"');
    expect(copy).toContain('DOOR_SUBMIT_LABEL = "Fortsæt"');
    expect(copy).toContain("eller");
    expect(doorSheet).toContain('variant="door"');
    expect(doorSheet).toContain("title={DOOR_TITLE}");
    for (const testId of ["door-email", "door-submit", "door-email-error"]) {
      expect(doorFaces).toContain(testId);
    }
    expect(doorFaces).toContain("door-${provider}");
    expect(doorFaces).toContain('variant="secondary"');
    expect(doorFaces).toContain("leading={");
    // No password, switcher, forgot page, mode state or Apple (KIT-274 adds Apple).
    for (const banned of [
      "Apple",
      "Adgangskode",
      "password",
      "Password",
      "Glemt",
      "forgot",
      "Forgot",
      "doorMode",
      "DoorMode",
      "Opret konto",
      "Login",
      "Log ind",
      "Gem kun på denne telefon",
    ]) {
      expect(chrome).not.toContain(banned);
    }
    expect(chrome).not.toMatch(/Fortsæt med Google/);
    expect(chrome).not.toMatch(/Fortsæt med Facebook/);
  });

  it("Return on the e-mail field does nothing while a social sign-in is pending", () => {
    const host = readFileSync(hostPath, "utf8");
    const submit = host.slice(host.indexOf("function handleSubmitEmail"));

    expect(submit.indexOf("socialBusy !== null")).toBeGreaterThan(-1);
    expect(submit.indexOf("socialBusy !== null")).toBeLessThan(
      submit.indexOf("isValidEmail(email)"),
    );
  });

  it("host renders welcome, demo and own-photo entry, with no onboarding or profile step", () => {
    const host = readFileSync(hostPath, "utf8");

    expect(host).toContain("WelcomeScreen");
    expect(host).toContain("DemoScreen");
    expect(host).toContain('type: "startDemo"');
    expect(host).toContain('type: "startAdd"');
    // Kom i gang and Jeg har allerede en konto both open the existing door.
    expect(host).toContain("onStart={() => openDoor()}");
    expect(host).toContain("onHaveAccount={() => openDoor()}");
    expect(host).toContain('dispatch({ type: "openDoor" })');
    expect(host).not.toContain("signUp");
    // E-mail routes to the code stub; social skips it; a failed login raises a bottom toast.
    expect(host).toContain('method: "email"');
    expect(host).toContain('method: "social"');
    expect(host).toContain("CodeStub");
    expect(host).toContain('type: "backFromCode"');
    expect(host).toContain("socialCancelledMessage(provider)");
    expect(host).toContain('position: "bottom"');
    // One backdrop at a time is decided in the reducer, not by flag algebra in the host.
    expect(host).toContain("firstSessionBackdrop");
    expect(host).not.toMatch(/Onboard|ProfileOnboarding|VerifyEmailBeat|DiscoveryShowcase/);
    expect(host).not.toMatch(
      /continueProfile|completeOnboard|continueFromSplash|dismissVerifyEmail/,
    );
  });

  it("the removed onboarding, profile step and splash files are gone", () => {
    for (const file of [
      "onboard-screen.tsx",
      "onboard-copy.ts",
      "profile-onboarding.tsx",
      "verify-email-beat.tsx",
      "discovery-showcase.tsx",
      "splash-screen.tsx",
      "splash-backdrop.tsx",
    ]) {
      expect(existsSync(join(mobileRoot, "src/first-session", file))).toBe(false);
    }
    expect(existsSync(join(mobileRoot, "assets/onboard"))).toBe(false);
    expect(existsSync(join(mobileRoot, "assets/brand/splash-prize-jersey.png"))).toBe(false);
  });

  it("host opens jersey details after identity with a draft and routes result Collection", () => {
    const host = readFileSync(hostPath, "utf8");

    expect(host).toContain("JerseyDetailsScreen");
    expect(host).toContain('place === "jersey-details"');
    expect(host).toContain("saveJersey");
    expect(host).toContain("recordDumpSave");
    expect(host).toContain("collectionHref(session)");
    expect(readFileSync(join(mobileRoot, "src/first-session/session.ts"), "utf8")).toContain(
      "firstSessionResult=1",
    );
    expect(host).not.toContain("requestPremiumAccess");
    expect(host).not.toContain("Gem senere");
  });
});
