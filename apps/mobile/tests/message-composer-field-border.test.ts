import { describe, expect, it } from "vitest";
import { composerFieldBorder } from "../src/components/message-composer-field-border";
import { color } from "../src/theme/tokens";

describe("composerFieldBorder", () => {
  it("uses border.subtle at rest", () => {
    expect(composerFieldBorder(color, false)).toEqual({
      borderColor: color.borderSubtle,
      borderWidth: 1,
    });
  });

  it("uses border.strong / border.focus on focus", () => {
    expect(composerFieldBorder(color, true)).toEqual({
      borderColor: color.contentPrimary,
      borderWidth: 2,
    });
  });
});
