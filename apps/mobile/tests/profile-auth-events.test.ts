import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const profileDir = join(__dirname, "../app/(tabs)/profile");
const identityApiPath = join(__dirname, "../src/api/identity.ts");
const peerProfilePath = join(__dirname, "../app/(tabs)/search/peer/[handle].tsx");
const peerIdentityPath = join(__dirname, "../src/api/peer-profile.ts");

describe("Profil Auth events (KIT-177)", () => {
  it("lists own Auth events and log out everywhere on settings, never Auth security", () => {
    const settings = readFileSync(join(profileDir, "indstillinger.tsx"), "utf8");
    const identityApi = readFileSync(identityApiPath, "utf8");

    expect(settings).toContain("Login-historik");
    expect(settings).toContain("Log ud overalt");
    expect(settings).toContain("fetchAuthEvents");
    expect(settings).toContain("revokeAllSessions");
    expect(settings).toContain("ConfirmSheet");
    expect(settings).toContain("authEventKindLabel");
    expect(settings).not.toMatch(/auth.security/i);
    expect(settings).not.toContain("/admin/auth/security");
    expect(settings).not.toContain("Sentinel");
    expect(settings).not.toContain("dash.better-auth.com");

    expect(identityApi).toContain("/v1/identity/auth-events");
    expect(identityApi).toContain("/v1/identity/sessions/revoke-all");
    expect(identityApi).not.toContain("/admin/auth/security");
  });

  it("does not show Auth events on Peer Profil", () => {
    const peerScreen = readFileSync(peerProfilePath, "utf8");
    const peerApi = readFileSync(peerIdentityPath, "utf8");

    expect(peerScreen).not.toContain("auth-events");
    expect(peerScreen).not.toContain("fetchAuthEvents");
    expect(peerScreen).not.toContain("Login-historik");
    expect(peerApi).not.toContain("auth-events");
  });
});
