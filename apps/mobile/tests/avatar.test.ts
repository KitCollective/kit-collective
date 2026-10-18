import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const avatarPath = join(__dirname, "../src/components/avatar.tsx");

function readAvatar() {
  return readFileSync(avatarPath, "utf8");
}

// Vitest has no React Native renderer, so the Avatar is pinned from its source
// (the pattern of search-field-discover-chrome.test.ts).
describe("Avatar sizes (docs/design-system.md → Avatar)", () => {
  it("has the three sizes lg 64, md 56 and sm 44", () => {
    const avatar = readAvatar();

    expect(avatar).toContain('export type AvatarSize = "lg" | "md" | "sm"');
    expect(avatar).toMatch(/lg: 64,\s+md: 56,\s+sm: 44,/);
    expect(avatar).toContain('size = "lg"');
  });

  it("sets the initials in type.label at sm and type.heading-sm at md and lg", () => {
    const avatar = readAvatar();

    expect(avatar).toContain('size === "sm" ? typography.label : typography.headingSm');
  });

  it("keeps the photo and the initials in the same pill-radius, clipped circle", () => {
    const avatar = readAvatar();

    expect(avatar).toMatch(/circle: \{\s+borderRadius: radius\.pill,\s+overflow: "hidden",/);
    expect(avatar).toMatch(/<Image[\s\S]*?resizeMode="cover"[\s\S]*?styles\.circle/);
    expect(avatar).toContain("width: dimension");
    expect(avatar).toContain("height: dimension");
  });
});
