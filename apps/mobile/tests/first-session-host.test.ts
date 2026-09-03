import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const mobileRoot = join(__dirname, "..");
const splashPath = join(mobileRoot, "src/first-session/splash.tsx");
const splashScreenPath = join(mobileRoot, "src/first-session/splash-screen.tsx");
const doorPath = join(mobileRoot, "src/first-session/door.tsx");
const doorSheetPath = join(mobileRoot, "src/first-session/door-sheet.tsx");
const doorCopyPath = join(mobileRoot, "src/first-session/door-copy.ts");
const verifyPath = join(mobileRoot, "src/first-session/verify-email-beat.tsx");
const profilePath = join(mobileRoot, "src/first-session/profile-onboarding.tsx");
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

  it("splash copy is Tryk for at fortsætte / Log ind / Opret konto", () => {
    const splash = readFileSync(splashPath, "utf8");
    const splashScreen = readFileSync(splashScreenPath, "utf8");
    const copy = readFileSync(doorCopyPath, "utf8");

    expect(splash).toContain("SplashScreen");
    expect(splashScreen).toContain("SPLASH_CAPTION");
    expect(copy).toContain("Tryk for at fortsætte");
    expect(copy).toContain("Log ind");
    expect(copy).toContain("Opret konto");
  });

  it("door copy is locked, Apple is hidden, and banned first-session chrome is absent", () => {
    const door = readFileSync(doorPath, "utf8");
    const doorSheet = readFileSync(doorSheetPath, "utf8");
    const copy = readFileSync(doorCopyPath, "utf8");
    const verify = readFileSync(verifyPath, "utf8");
    const profile = readFileSync(profilePath, "utf8");
    const host = readFileSync(hostPath, "utf8");
    const chrome = `${door}\n${doorSheet}\n${copy}\n${verify}\n${profile}\n${host}`;

    expect(copy).toContain("Gem samlingen");
    expect(copy).toContain("Trøjen er læst. En konto husker den.");
    expect(copy).toContain("Log ind");
    expect(copy).toContain("Samlingen venter.");
    expect(copy).toContain("Opret med e-mail");
    expect(copy).toContain("Log ind med e-mail");
    expect(copy).toContain("eller");
    expect(copy).toContain("Jeg har en konto");
    expect(copy).toContain("Ny her? Opret konto");
    expect(copy).toContain("1/2");
    expect(copy).toContain("Næste");
    expect(copy).toContain("Skift");
    expect(copy).toContain("Gentag adgangskode");
    expect(copy).toContain("mindst 8 tegn");
    expect(copy).toContain("Glemt adgangskode?");
    expect(copy).toContain("Tjek din e-mail");
    expect(doorSheet).toContain('variant="door"');
    expect(chrome).not.toContain("Apple");
    expect(chrome).not.toContain("Gem kun på denne telefon");
    expect(chrome).not.toMatch(/Fortsæt med Google/);
    expect(chrome).not.toMatch(/Fortsæt med Facebook/);
    expect(chrome).not.toMatch(/three-slide|tre slides|produktguide/i);
  });

  it("host opens profile onboarding after register and never copies prototype chrome", () => {
    const host = readFileSync(hostPath, "utf8");
    const profile = readFileSync(profilePath, "utf8");

    expect(host).toContain("ProfileOnboardingScreen");
    expect(host).toContain('place === "profile"');
    expect(host).toContain("continueProfile");
    expect(host).toContain("DiscoveryShowcaseScreen");
    expect(host).toContain("continueFromSplash");
    expect(profile).toContain("uploadAvatar");
    expect(profile).toContain("updateProfile");
    expect(profile).not.toContain("prototype-first-run");
  });

  it("host opens jersey details after profile/login with draft and routes result Samling", () => {
    const host = readFileSync(hostPath, "utf8");

    expect(host).toContain("JerseyDetailsScreen");
    expect(host).toContain('place === "jersey-details"');
    expect(host).toContain("saveJersey");
    expect(host).toContain("recordDumpSave");
    expect(host).toContain("firstSessionResult=1");
    expect(host).not.toContain("requestPremiumAccess");
    expect(host).not.toContain("Gem senere");
  });
});
