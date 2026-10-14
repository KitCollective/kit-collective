import { describe, expect, it } from "vitest";
import { collectionFactsNumeralStyle } from "@/collection/collection-facts-style";
import { resolveTypeRoles } from "@/theme/brand-fonts-resolve";

// Saira Extra Condensed 700 (hhea): descent 0.439 em, digit height 0.688 em.
const DESCENT_EM = 0.439;
const DIGIT_HEIGHT_EM = 0.688;

describe("collectionFactsNumeralStyle", () => {
  const role = resolveTypeRoles(true).numeral40;
  const style = collectionFactsNumeralStyle(role);

  it("leaves room above the baseline for the whole digit, so iOS does not slice the tops", () => {
    const aboveBaseline = style.lineHeight - DESCENT_EM * style.fontSize;
    expect(aboveBaseline).toBeGreaterThan(DIGIT_HEIGHT_EM * style.fontSize);
  });

  it("keeps the numeral family, size and tracking of the role", () => {
    expect(style.fontFamily).toBe(role.fontFamily);
    expect(style.fontSize).toBe(40);
    expect(style.letterSpacing).toBe(role.letterSpacing);
  });

  it("is needed: the role's own line height (equal to the size) leaves too little", () => {
    expect(role.lineHeight - DESCENT_EM * role.fontSize).toBeLessThan(
      DIGIT_HEIGHT_EM * role.fontSize,
    );
  });
});
