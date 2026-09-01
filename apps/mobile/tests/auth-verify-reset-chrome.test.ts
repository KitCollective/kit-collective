import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const authDir = join(__dirname, "../app/(auth)");

describe("Expo verify and reset chrome", () => {
  it("keeps Danish collector copy on verify and reset screens", () => {
    const verify = readFileSync(join(authDir, "verify.tsx"), "utf8");
    const reset = readFileSync(join(authDir, "reset.tsx"), "utf8");
    const complete = readFileSync(join(authDir, "reset-complete.tsx"), "utf8");
    const login = readFileSync(join(authDir, "login.tsx"), "utf8");

    expect(verify).toContain("Bekræft e-mail");
    expect(reset).toContain("Nulstil adgangskode");
    expect(complete).toContain("Ny adgangskode");
    expect(login).toContain("Glemt adgangskode");
  });
});

describe("Expo social login chrome", () => {
  it("offers Danish Google and Facebook on login, not Apple or browser OAuth", () => {
    const login = readFileSync(join(authDir, "login.tsx"), "utf8");

    expect(login).toContain("Fortsæt med Google");
    expect(login).toContain("Fortsæt med Facebook");
    expect(login).not.toContain("Apple");
    expect(login).not.toContain("WebBrowser");
    expect(login).not.toContain("auth-session");
    expect(login).not.toContain("accounts.google.com");
  });

  it("native idToken seam refuses browser OAuth", () => {
    const seam = readFileSync(join(__dirname, "../src/auth/native-id-token.ts"), "utf8");

    expect(seam).toContain("not browser OAuth");
    expect(seam).not.toContain("WebBrowser");
    expect(seam).not.toContain("auth-session");
    expect(seam).not.toContain("expo-auth-session");
    expect(seam).not.toContain("openAuthSessionAsync");
    expect(seam).not.toContain("accounts.google.com");
  });
});
