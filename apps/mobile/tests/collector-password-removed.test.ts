import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isLegacyAuthPath, LEGACY_DOOR_PARAM_VALUE } from "../src/first-session/legacy-routes";

const mobileRoot = join(__dirname, "..");

function walkSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".expo") {
      continue;
    }
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

describe("No password in the collector app (KIT-276)", () => {
  it("has no login, register, reset, reset-complete, verify or change-password screen", () => {
    expect(existsSync(join(mobileRoot, "app/(auth)"))).toBe(false);
    for (const file of ["skift-adgangskode.tsx", "skift-email.tsx"]) {
      expect(existsSync(join(mobileRoot, "app/(tabs)/profile", file))).toBe(false);
    }
  });

  it("carries no password field, copy or password client call in app or src", () => {
    const files = [
      ...walkSourceFiles(join(mobileRoot, "app")),
      ...walkSourceFiles(join(mobileRoot, "src")),
    ];
    const banned =
      /adgangskode|password|loginCollector|registerCollector|requestPasswordReset|completePasswordReset|verifyEmail|changeEmail|signUp\b/i;
    for (const file of files) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(banned);
    }
  });

  it("the auth context offers the code and social sign-in only", () => {
    const provider = readFileSync(join(mobileRoot, "src/auth/AuthProvider.tsx"), "utf8");

    expect(provider).toContain("signInWithCode");
    expect(provider).toContain("signInSocial");
    expect(provider).not.toMatch(/signIn:|signUp/);
  });

  it("no route string points at a removed screen", () => {
    const files = [
      ...walkSourceFiles(join(mobileRoot, "app")),
      ...walkSourceFiles(join(mobileRoot, "src")),
    ];
    for (const file of files) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(
        /["'`]\/(\(auth\)\/)?(login|register|reset|reset-complete|verify)["'`]/,
      );
    }
  });
});

describe("Old routes and deep links open Kom i gang", () => {
  it("recognises every removed route, with or without the group and a query", () => {
    for (const path of [
      "/login",
      "/register",
      "/reset",
      "/reset-complete",
      "/verify",
      "/(auth)/login",
      "/verify?token=abc",
      "/reset-complete/",
    ]) {
      expect(isLegacyAuthPath(path), path).toBe(true);
    }
  });

  it("leaves every other route alone", () => {
    for (const path of ["/", "/collection", "/(tabs)/collection", "/profile/verify", "/loginx"]) {
      expect(isLegacyAuthPath(path), path).toBe(false);
    }
  });

  it("the not-found route sends a legacy path to the first-session host with the door open", () => {
    const notFound = readFileSync(join(mobileRoot, "app/+not-found.tsx"), "utf8");
    const host = readFileSync(join(mobileRoot, "app/(first-session)/index.tsx"), "utf8");

    expect(notFound).toContain("isLegacyAuthPath(pathname)");
    expect(notFound).toContain('pathname: "/(first-session)"');
    expect(notFound).toContain("LEGACY_DOOR_PARAM_VALUE");
    expect(LEGACY_DOOR_PARAM_VALUE).toBe("1");
    expect(host).toContain("door === LEGACY_DOOR_PARAM_VALUE");
    expect(host).toContain('{ type: "openDoor" }');
    // A signed-in collector goes to Samling, not to the sheet.
    expect(notFound.indexOf("if (user)")).toBeLessThan(notFound.indexOf("isLegacyAuthPath(path"));
  });
});
