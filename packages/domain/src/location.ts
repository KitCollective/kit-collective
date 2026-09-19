import { EUROPEAN_COUNTRIES } from "./countries.js";

/** Popular cities fixture keyed by ISO 3166-1 alpha-2. Live geocoding is out of scope. */
export const POPULAR_CITIES_BY_ISO3166: Readonly<Record<string, readonly string[]>> = {
  DK: ["København", "Aarhus", "Odense", "Aalborg"],
  SE: ["Stockholm", "Göteborg", "Malmö", "Uppsala"],
  NO: ["Oslo", "Bergen", "Trondheim", "Stavanger"],
  DE: ["Berlin", "Hamburg", "München", "Köln"],
  GB: ["London", "Manchester", "Birmingham", "Glasgow"],
};

function countryLabelToIso3166(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const country of EUROPEAN_COUNTRIES) {
    map[country.labelDa] = country.iso3166;
    map[country.labelEn] = country.iso3166;
    for (const alias of country.aliases ?? []) {
      map[alias] = country.iso3166;
    }
  }
  return map;
}

/** Catalog labels and aliases mapped to ISO 3166-1 alpha-2. */
export const COUNTRY_LABEL_TO_ISO3166: Readonly<Record<string, string>> = countryLabelToIso3166();

export function popularCitiesForCountryLabel(
  countryLabel: string | null | undefined,
): readonly string[] {
  if (!countryLabel) {
    return [];
  }
  const iso3166 = COUNTRY_LABEL_TO_ISO3166[countryLabel];
  return popularCitiesForCountry(iso3166);
}

export function popularCitiesForCountry(iso3166: string | null | undefined): readonly string[] {
  if (!iso3166) {
    return [];
  }
  return POPULAR_CITIES_BY_ISO3166[iso3166.toUpperCase()] ?? [];
}

export function formatProfileLocationCaption(
  city: string | null,
  countryLabel: string | null,
  showCity: boolean,
): string | null {
  if (!countryLabel) {
    return null;
  }
  if (showCity && city) {
    return `${city} · ${countryLabel}`;
  }
  return countryLabel;
}

export function formatProfileLocationMeta(
  city: string | null,
  countryLabel: string | null,
): string | null {
  if (city && countryLabel) {
    return `${city} · ${countryLabel}`;
  }
  return countryLabel ?? city;
}
