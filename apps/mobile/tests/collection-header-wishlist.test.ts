import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const headerPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/components/collection-header.tsx",
);

describe("CollectionHeader capture chrome", () => {
  it("hosts capture as the top-right action, not the wishlist bookmark", () => {
    const source = readFileSync(headerPath, "utf8");
    // Capture moved into the header when the tab bar went native (2026-09-05).
    expect(source).toContain('name="Tilføj trøje"');
    expect(source).toContain('icon="add"');
    // Wishlist is its own native tab now — the bookmark left the header.
    expect(source).not.toContain('icon="bookmark-outline"');
    expect(source).not.toContain('name="Ønske"');
    expect(source).not.toContain("notifications-outline");
    expect(source).not.toContain("Notifikationer");
  });
});
