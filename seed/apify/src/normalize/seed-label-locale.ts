import type { LabelLocale } from "@kit/domain";

const ORG_MARKERS =
  /\b(FC|F\.C\.|IF|BK|SK|FF|CF|SC|AC|AS|SV|FK|United|City|Rovers|Wanderers|Athletic|Albion|Hotspur)\b/i;

const ASCII_PERSONAL_NAME = /^[A-Z][a-z]+(?:[\s\-'][A-Z][a-z]+)+$/;

const NORDIC_ASCII_TRANSLITERATION =
  /\b\w*(?:oe|aa|ae)\w*\b|(?:^|\s)(?:hoj|boj|koj)\w*|ojlund\b|ondby\b|obenhavn\b/i;

/**
 * Transfermarkt sends English seed strings. Default locale is `en`.
 * Use `mul` only when the string is spelled the same in da, en, sv, and no.
 */
export function seedLabelLocale(name: string): LabelLocale {
  return isLocaleInvariantSeedString(name) ? "mul" : "en";
}

function isLocaleInvariantSeedString(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) {
    return false;
  }

  if (ORG_MARKERS.test(trimmed)) {
    return false;
  }

  // biome-ignore lint/suspicious/noControlCharactersInRegex: the ASCII range bound is the test itself.
  if (/[^\u0000-\u007F]/.test(trimmed)) {
    return /^[\p{L}\p{M}\s\-'.]+$/u.test(trimmed);
  }

  if (!ASCII_PERSONAL_NAME.test(trimmed)) {
    return false;
  }

  if (NORDIC_ASCII_TRANSLITERATION.test(trimmed)) {
    return false;
  }

  return true;
}
