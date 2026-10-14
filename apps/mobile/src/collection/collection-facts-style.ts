import type { TypeRoleStyle } from "@/theme/brand-fonts-resolve";

/**
 * Saira Extra Condensed 700 reports ascent 1.135 em and descent 0.439 em, and its digits stand
 * 0.688 em tall. The `numeral` role sets the line height equal to the size
 * (docs/design-system.md → Typography), which on iOS puts the baseline 0.439 em above the
 * bottom of the line box and leaves only 1 − 0.439 = 0.561 em above it for a 0.688 em digit:
 * the tops are sliced flat (hosted Device flow KIT-286, Samling facts "2023"). The facts block
 * therefore sets its own line height of 1.25 em, which leaves 0.811 em above the baseline. The
 * `numeral` token is outside this issue's write-scope and the other `numeral` places (Number
 * emblem, own UserJersey detail) are fixed-height tiles, so the correction stays here.
 */
const FACTS_NUMERAL_LINE_HEIGHT_EM = 1.25;

export function collectionFactsNumeralStyle(role: TypeRoleStyle): TypeRoleStyle {
  return {
    ...role,
    lineHeight: Math.ceil(role.fontSize * FACTS_NUMERAL_LINE_HEIGHT_EM),
  };
}
