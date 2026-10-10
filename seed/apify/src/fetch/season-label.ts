/** Convert a Transfermarkt season start year to a split-year label (2015 → 2015/16). */
export function startYearToLabel(startYear: number): string {
  const next = (startYear + 1) % 100;
  const nextStr = next < 10 ? `0${next}` : String(next);
  return `${startYear}/${nextStr}`;
}

/** Convert a split-year label to a Transfermarkt season start year (2015/16 → 2015). */
export function labelToStartYear(label: string): number {
  const splitYear = /^(\d{4})\/(\d{2})$/.exec(label);
  if (splitYear) {
    return Number.parseInt(splitYear[1]!, 10);
  }

  const bareYear = /^(\d{4})$/.exec(label);
  if (bareYear) {
    return Number.parseInt(bareYear[1]!, 10);
  }

  throw new Error(`Invalid season label: ${label}`);
}

/**
 * Widen a Transfermarkt career-table season label to our `YYYY/YY` form.
 *
 * Career tables (`/rueckennummern`, `/erfolge`) write the season two-digit — `25/26`,
 * and the 1990s as `91/92` — while `season.label` in Postgres is always four-digit.
 * Returns `undefined` for anything that is not a season label.
 */
export function widenSeasonLabel(label: string): string | undefined {
  const trimmed = label.trim();

  if (/^\d{4}\/\d{2}$/.test(trimmed) || /^\d{4}$/.test(trimmed)) {
    return trimmed;
  }

  const shortSplit = /^(\d{2})\/(\d{2})$/.exec(trimmed);
  if (!shortSplit?.[1]) {
    return undefined;
  }
  const twoDigit = Number.parseInt(shortSplit[1], 10);
  const startYear = twoDigit >= 50 ? 1900 + twoDigit : 2000 + twoDigit;
  return startYearToLabel(startYear);
}

/** Calendar bounds for a split-year season starting in `startYear`. */
export function seasonCalendarBounds(startYear: number): {
  startDate: string;
  endDate: string;
} {
  return {
    startDate: `${startYear}-07-01`,
    endDate: `${startYear + 1}-06-30`,
  };
}

/** Calendar bounds for a bare calendar year (e.g. NT World Cup 2010). */
export function calendarYearBounds(year: number): { startDate: string; endDate: string } {
  return {
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
  };
}
