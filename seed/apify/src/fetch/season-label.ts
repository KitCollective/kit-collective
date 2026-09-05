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
