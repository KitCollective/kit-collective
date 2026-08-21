import type { ActorPlayerProfile, ActorSquadRow } from "./actor-types.js";

export function squadRowNeedsProfile(row: ActorSquadRow): boolean {
  return !row.playerId || row.shirtNumber === undefined || row.shirtNumber === null;
}

export async function resolveProfiles(
  squadRows: ActorSquadRow[],
  fetchProfile: (playerId: string) => Promise<ActorPlayerProfile>,
  onProfileFetch?: (playerId: string) => void,
): Promise<Map<string, ActorPlayerProfile>> {
  const profiles = new Map<string, ActorPlayerProfile>();

  for (const row of squadRows) {
    if (!squadRowNeedsProfile(row) || !row.playerId) {
      continue;
    }
    if (profiles.has(row.playerId)) {
      continue;
    }
    onProfileFetch?.(row.playerId);
    profiles.set(row.playerId, await fetchProfile(row.playerId));
  }

  return profiles;
}
