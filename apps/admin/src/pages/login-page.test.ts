import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

describe("Admin Sign in card social actions", () => {
  it("keeps Google and Facebook English on the existing login-card, no Apple", () => {
    const source = readFileSync(join(here, "LoginPage.tsx"), "utf8");

    expect(source).toContain('className="login-card"');
    expect(source).toContain("login-lockup");
    expect(source).toContain('variant="lockup"');
    expect(source).toContain("Continue with Google");
    expect(source).toContain("Continue with Facebook");
    expect(source).toContain("btn-secondary");
    expect(source).toContain("btn-tertiary");
    expect(source).toContain("loginSocial");
    expect(source).not.toMatch(/apple/i);
    expect(source.match(/className="login-card"/g)?.length).toBe(1);
    expect(source).not.toContain("#4285");
    expect(source).not.toContain("#1877");
  });

  it("posts social idToken through AuthProvider to /identity/social", () => {
    const source = readFileSync(join(here, "../auth/AuthProvider.tsx"), "utf8");

    expect(source).toContain("loginSocial");
    expect(source).toContain("/identity/social");
    expect(source).toContain("idToken");
    expect(source).not.toMatch(/apple/i);
  });
});
