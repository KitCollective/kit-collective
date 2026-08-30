import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const headerPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/components/collection-header.tsx",
);

describe("CollectionHeader wishlist chrome", () => {
  it("uses bookmark icon and Danish Ønske accessible name", () => {
    const source = readFileSync(headerPath, "utf8");
    expect(source).toContain('name="Ønske"');
    expect(source).toContain('icon="bookmark-outline"');
    expect(source).not.toContain("notifications-outline");
    expect(source).not.toContain("Notifikationer");
  });
});
