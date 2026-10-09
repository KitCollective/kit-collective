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

    // Two-mode title switcher, Login as the general term, no sentence line.
    expect(copy).toContain("Login");
    expect(copy).toContain("Opret");
    expect(copy).toContain("eller");
    expect(copy).toContain("Har du en konto? Login");
    expect(copy).toContain("Ny her? Opret konto");
    expect(copy).toContain("Gentag adgangskode");
    expect(copy).toContain("mindst 8 tegn");
    expect(copy).toContain("Glemt adgangskode?");
    expect(copy).toContain("Tjek din e-mail");
    // Sentence line and its copy are gone.
    expect(copy).not.toContain("Samlingen venter.");
    expect(copy).not.toContain("Trøjen er læst. En konto husker den.");
    expect(copy).not.toContain("doorSentence");
    expect(copy).not.toContain("Log ind");
    expect(copy).not.toContain("1/2");
    expect(copy).not.toContain("Skift");
    expect(doorSheet).toContain('variant="door"');
    expect(chrome).not.toContain("Apple");
    expect(chrome).not.toContain("Gem kun på denne telefon");
    expect(chrome).not.toMatch(/Fortsæt med Google/);
    expect(chrome).not.toMatch(/Fortsæt med Facebook/);
  });

  it("host renders welcome, demo and own-photo entry, with no onboarding or profile step", () => {
    const host = readFileSync(hostPath, "utf8");

    expect(host).toContain("WelcomeScreen");
    expect(host).toContain("DemoScreen");
    expect(host).toContain('type: "startDemo"');
    expect(host).toContain('type: "startAdd"');
    // Kom i gang and Jeg har allerede en konto both open the existing door.
    expect(host).toContain('onStart={() => openDoor("register")}');
    expect(host).toContain('onHaveAccount={() => openDoor("login")}');
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
