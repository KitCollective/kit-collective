import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(relative: string) {
  return readFileSync(join(__dirname, relative), "utf8");
}

// Vitest has no React Native renderer, so the call sites are pinned from their source.
describe("a collector in a 44px leading slot uses the sm Avatar", () => {
  it("the Søg typeahead collector hit renders sm and the slot stays 44", () => {
    const row = read("../src/search/typeahead-hit-row.tsx");
    const avatarCase = row.slice(row.indexOf('case "avatar"'), row.indexOf('case "initials"'));

    expect(avatarCase).toContain('size="sm"');
    expect(avatarCase).not.toContain('size="md"');
    expect(row).toContain("LEADING_SLOT = 44");
    expect(row).not.toContain("overhang");
  });

  it("the Samlere shelf rows on Søg home render sm", () => {
    const home = read("../app/(tabs)/search/index.tsx");
    const shelf = home.slice(home.indexOf('testID="magazine-shelf-collectors"'));
    const start = shelf.indexOf("<Avatar");
    const avatar = shelf.slice(start, shelf.indexOf("/>", start));

    expect(avatar).toContain('size="sm"');
    expect(home).not.toMatch(/<Avatar[^>]*size="md"/);
  });
});
