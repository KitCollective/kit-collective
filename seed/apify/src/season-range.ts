import { resolveSeasonRef } from "@kit/seed-shared";
import type { NormalizedSeason } from "./types.js";

function seasonIndex(seasons: NormalizedSeason[], competition: string, ref: string): number {
  const resolved = resolveSeasonRef(competition, ref);
  if (resolved === "today") {
    return seasons.length - 1;
  }

  const byLabel = seasons.findIndex((s) => s.label === resolved || s.externalId === resolved);
  if (byLabel === -1) {
    throw new Error(`Season not found: ${ref}`);
  }
  return byLabel;
}

export function filterSeasons(
  seasons: NormalizedSeason[],
  competition: string,
  fromSeason: string,
  toSeason: string,
): NormalizedSeason[] {
  const sorted = [...seasons].sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  const fromIdx = seasonIndex(sorted, competition, fromSeason);
  const toIdx =
    toSeason === "today" ? sorted.length - 1 : seasonIndex(sorted, competition, toSeason);

  if (fromIdx > toIdx) {
    throw new Error(`from-season ${fromSeason} is after to-season ${toSeason}`);
  }

  return sorted.slice(fromIdx, toIdx + 1);
}
