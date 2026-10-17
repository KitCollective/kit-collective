import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const fieldPath = join(__dirname, "../src/components/search-field-discover.tsx");

function readField() {
  return readFileSync(fieldPath, "utf8");
}

// Vitest has no React Native renderer, so the field's chrome is pinned from its source
// (the pattern of sheet-chrome.test.ts).
describe("SearchFieldDiscover chrome", () => {
  it("renders Back (Tilbage) instead of the search icon while the field is in focus", () => {
    const field = readField();

    // The focus state comes from the input's own focus/blur and still reaches the caller's handlers.
    expect(field).toContain("const [focused, setFocused] = useState(false)");
    expect(field).toContain("setFocused(true)");
    expect(field).toContain("setFocused(false)");
    expect(field).toContain("onFocus?.(event)");
    expect(field).toContain("onBlur?.(event)");
    // In focus the leading slot is Back with an accessible name; at rest it is the search icon.
    expect(field).toMatch(
      /showBack \? \(\s*<IconButton\s+testID="search-back"\s+name="Tilbage"\s+icon="arrow-back"/,
    );
    expect(field).toContain("const showBack = focused || Boolean(value)");
    expect(field).toContain('<Ionicons name="search"');
    expect(field.indexOf('name="Tilbage"')).toBeLessThan(field.indexOf('<Ionicons name="search"'));
  });

  it("Back blurs the field, clears it and calls the optional onBack", () => {
    const field = readField();

    expect(field).toContain("onBack?: () => void");
    expect(field).toContain("inputRef.current?.blur()");
    expect(field).toContain("onClear?.()");
    expect(field).toContain("onBack?.()");
    expect(field).toContain("ref={inputRef}");
  });

  it("keeps clear on the right and the input testID", () => {
    const field = readField();

    expect(field).toContain('accessibilityLabel="Ryd søgning"');
    expect(field).toContain("onPress={onClear}");
    expect(field).toContain("testID={testID}");
    // Clear comes after the input, so it stays on the right.
    expect(field.indexOf("<TextInput")).toBeLessThan(
      field.indexOf('accessibilityLabel="Ryd søgning"'),
    );
  });
});
