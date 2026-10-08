import { resolveCompetition } from "./competitions.js";

/**
 * Resolve a season reference for a competition.
 * `0001` means that competition's first Transfermarkt season (e.g. Superliga 1991/92).
 * Labels like `1995/96` pass through unchanged.
 */
export function resolveSeasonRef(competition: string, ref: string): string {
  if (ref === "today") {
    return "today";
  }

  if (/^0001$/.test(ref)) {
    const def = resolveCompetition(competition);
    if (!def?.firstSeasonLabel) {
      throw new Error(`Unknown competition: ${competition}`);
    }
    return def.firstSeasonLabel;
  }

  return ref;
}
