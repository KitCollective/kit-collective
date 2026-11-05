import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Wiring that has no seam below the screen: which background a route paints and which controls it
// mounts. The behaviour (Plus status, caption, rows) is tested in profile-view-model.test.ts.
const profileDir = join(__dirname, "../app/(tabs)/profile");
const peerScreenPath = join(__dirname, "../app/(tabs)/search/peer/[handle].tsx");

const profileFiles = readdirSync(profileDir).filter((file) => file.endsWith(".tsx"));

describe("Profil and its drills sit on the white canvas (KIT-520 AC 1)", () => {
  it.each(profileFiles)("%s has no fill.secondary canvas and no surface group card", (file) => {
    const source = readFileSync(join(profileDir, file), "utf8");
    // Home's settings Icon button is the one `fill.secondary` fill the lock asks for.
    if (file !== "index.tsx") {
      expect(source).not.toContain("backgroundColor: theme.fillSecondary");
    }
    expect(source).not.toContain("ProfileSurfaceGroup");
  });

  it("paints Profil home on canvas", () => {
    const home = readFileSync(join(profileDir, "index.tsx"), "utf8");
    expect(home).toContain("backgroundColor: theme.canvas");
  });

  it("registers Se som andre in the Profil stack", () => {
    const layout = readFileSync(join(profileDir, "_layout.tsx"), "utf8");
    expect(layout).toContain('name="se-som-andre"');
    expect(profileFiles).toContain("se-som-andre.tsx");
  });
});

describe("Profil home (KIT-520)", () => {
  const home = readFileSync(join(profileDir, "index.tsx"), "utf8");

  it("opens Indstillinger from a header Icon button, not from a row", () => {
    expect(home).toContain('name="Indstillinger"');
    expect(home).not.toContain('title="Indstillinger"');
    expect(home).not.toContain("Cookie-indstillinger");
    expect(home).not.toContain("cookie-indstillinger");
  });

  it("holds Rediger profil and Se som andre as secondary Buttons", () => {
    expect(home.match(/variant="secondary"/g)).toHaveLength(2);
    expect(home).toContain('label="Rediger profil"');
    expect(home).toContain('label="Se som andre"');
  });
});

describe("Se som andre on the Peer Profil screen (KIT-520 AC 5)", () => {
  const peer = readFileSync(peerScreenPath, "utf8");

  it("hides More and its Sheet on one's own view", () => {
    expect(peer).toContain("isOwnView");
    expect(peer).toMatch(/isOwnView \? undefined : \(\s*<IconButton\s+name="Flere handlinger"/);
    expect(peer).toMatch(/isOwnView \? null : \(\s*<Sheet/);
  });
});
