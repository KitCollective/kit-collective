import type { NormalizedSeason } from "./types.js";

function seasonIndex(seasons: NormalizedSeason[], ref: string): number {
  if (/^0\d{3}$/.test(ref)) {
    const index = Number.parseInt(ref, 10) - 1;
    if (index < 0 || index >= seasons.length) {
      throw new Error(`Season index ${ref} is out of range (1-${seasons.length})`);
    }
    return index;
  }

  const byLabel = seasons.findIndex((s) => s.label === ref || s.externalId === ref);
  if (byLabel === -1) {
    throw new Error(`Season not found: ${ref}`);
  }
  return byLabel;
}

export function filterSeasons(
  seasons: NormalizedSeason[],
  fromSeason: string,
  toSeason: string,
): NormalizedSeason[] {
  const sorted = [...seasons].sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  const fromIdx = seasonIndex(sorted, fromSeason);
  const toIdx = toSeason === "today" ? sorted.length - 1 : seasonIndex(sorted, toSeason);

  if (fromIdx > toIdx) {
    throw new Error(`from-season ${fromSeason} is after to-season ${toSeason}`);
  }

  return sorted.slice(fromIdx, toIdx + 1);
}
