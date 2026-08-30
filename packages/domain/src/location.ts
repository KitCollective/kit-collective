/** Popular cities fixture keyed by ISO 3166-1 alpha-2. Live geocoding is out of scope. */
export const POPULAR_CITIES_BY_ISO3166: Readonly<Record<string, readonly string[]>> = {
  DK: ["København", "Aarhus", "Odense", "Aalborg"],
  SE: ["Stockholm", "Göteborg", "Malmö", "Uppsala"],
  NO: ["Oslo", "Bergen", "Trondheim", "Stavanger"],
  DE: ["Berlin", "Hamburg", "München", "Köln"],
  GB: ["London", "Manchester", "Birmingham", "Glasgow"],
};

/** Danish catalog labels mapped to ISO 3166 for the popular-city fixture. */
export const COUNTRY_LABEL_TO_ISO3166: Readonly<Record<string, string>> = {
  Danmark: "DK",
  Sverige: "SE",
  Norge: "NO",
  Tyskland: "DE",
  Storbritannien: "GB",
  England: "GB",
};

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
