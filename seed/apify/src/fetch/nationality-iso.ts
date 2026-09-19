/**
 * Transfermarkt spells nationalities as English country names in flag `title`/`alt`
 * attributes. Resolving them to ISO 3166-1 alpha-2 is what lets the mapper set
 * `player.primary_country_id`. `@kit/domain` only carries the European catalog, and
 * squads routinely contain non-European citizenships, so the bulk of the table comes
 * from ICU region names with an alias layer for the football-specific spellings.
 */

/**
 * Codes ICU still resolves but that must never win a reverse lookup: dissolved states
 * and non-country groupings whose display names collide with live countries
 * (SU/Russia, YU/Serbia, ZR/Congo, BU/Myanmar, CS/Serbia and Montenegro).
 */
const EXCLUDED_REGION_CODES = new Set([
  "AN",
  "BU",
  "CS",
  "DD",
  "EA",
  "EU",
  "EZ",
  "FX",
  "IC",
  "NT",
  "QO",
  "QU",
  "SU",
  "TP",
  "UN",
  "YD",
  "YU",
  "ZR",
  "ZZ",
]);

/**
 * Spellings Transfermarkt uses that ICU does not answer to. Football associations are
 * folded onto their ISO state the same way `@kit/domain` aliases England onto GB.
 */
const TRANSFERMARKT_COUNTRY_ALIASES: Record<string, string> = {
  "bosnia herzegovina": "BA",
  "cabo verde": "CV",
  "chinese taipei": "TW",
  congo: "CG",
  "cote d ivoire": "CI",
  "czech republic": "CZ",
  "dr congo": "CD",
  england: "GB",
  "great britain": "GB",
  "hong kong": "HK",
  ireland: "IE",
  "korea north": "KP",
  "korea south": "KR",
  macao: "MO",
  macedonia: "MK",
  myanmar: "MM",
  "northern ireland": "GB",
  "republic of ireland": "IE",
  "russian federation": "RU",
  scotland: "GB",
  "st kitts nevis": "KN",
  "the gambia": "GM",
  turkey: "TR",
  "united states of america": "US",
  usa: "US",
  wales: "GB",
};

/** Fold a country name to a diacritic-free, punctuation-free lookup key. */
function nationalityKey(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2019\u02bc]/g, "'")
    .toLowerCase()
    .replace(/\bthe\b/g, " ")
    .replace(/[^a-z]+/g, " ")
    .trim();
}

function buildIsoByCountryName(): ReadonlyMap<string, string> {
  const byName = new Map<string, string>();
  const display = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" });
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

  // ICU exposes no region enumeration, so probe the alpha-2 space. `fallback: "none"`
  // returns undefined for unassigned codes. First write wins, which keeps the live
  // code ahead of any historic alias that shares a display name.
  for (const first of letters) {
    for (const second of letters) {
      const code = `${first}${second}`;
      if (EXCLUDED_REGION_CODES.has(code)) {
        continue;
      }
      let name: string | undefined;
      try {
        name = display.of(code);
      } catch {
        continue;
      }
      if (!name || name === code) {
        continue;
      }
      const key = nationalityKey(name);
      if (key && !byName.has(key)) {
        byName.set(key, code);
      }
    }
  }

  for (const [name, code] of Object.entries(TRANSFERMARKT_COUNTRY_ALIASES)) {
    byName.set(nationalityKey(name), code);
  }

  return byName;
}

const ISO_BY_COUNTRY_NAME = buildIsoByCountryName();

/** Resolve a Transfermarkt nationality label to ISO 3166-1 alpha-2, or undefined. */
export function nationalityIsoFromName(raw: string | undefined): string | undefined {
  if (!raw) {
    return undefined;
  }
  const key = nationalityKey(raw);
  if (!key) {
    return undefined;
  }
  return ISO_BY_COUNTRY_NAME.get(key);
}
