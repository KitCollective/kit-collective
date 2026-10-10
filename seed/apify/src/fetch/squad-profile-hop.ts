import type { ActorPlayerProfile, ActorSquadRow } from "./actor-types.js";

/**
 * Whether a squad row is thin enough to justify the profile fetch.
 *
 * A profile page costs ~110 KB and one proxy request, so the default stays identity-
 * driven: only rows missing a player id or a shirt number hop. On the live FC Copenhagen
 * 2012/13 squad that is 9 of 32 rows.
 */
export function squadRowNeedsProfile(row: ActorSquadRow): boolean {
  return !row.playerId || row.shirtNumber === undefined || row.shirtNumber === null;
}

/**
 * Opt-in predicate that also hops when a body fact the profile can supply is missing.
 *
 * Costs nothing extra on a rich `plus/1` squad table, which fills date of birth and
 * nationality for every row, but on a season whose squad table renders fewer columns it
 * escalates to a profile fetch per player — up to ~30 extra page loads per club-season.
 * Pass it as `resolveProfiles`' `needsProfile` argument rather than making it default.
 */
export function squadRowMissingBodyFacts(row: ActorSquadRow): boolean {
  return squadRowNeedsProfile(row) || !row.dateOfBirth || !row.nationalityIso;
}

export async function resolveProfiles(
  squadRows: ActorSquadRow[],
  fetchProfile: (playerId: string) => Promise<ActorPlayerProfile>,
  onProfileFetch?: (playerId: string) => void,
  onProfileHole?: (playerId: string, error: unknown) => void,
  needsProfile: (row: ActorSquadRow) => boolean = squadRowNeedsProfile,
): Promise<Map<string, ActorPlayerProfile>> {
  const profiles = new Map<string, ActorPlayerProfile>();

  for (const row of squadRows) {
    if (!needsProfile(row) || !row.playerId) {
      continue;
    }
    if (profiles.has(row.playerId)) {
      continue;
    }
    onProfileFetch?.(row.playerId);
    try {
      profiles.set(row.playerId, await fetchProfile(row.playerId));
    } catch (error: unknown) {
      onProfileHole?.(row.playerId, error);
    }
  }

  return profiles;
}
