import type { AdminClubSeasonDrill } from "@kit/api-contract";

const drills = new Map<string, AdminClubSeasonDrill>();

export function clubSeasonCacheKey(clubId: string, seasonId: string): string {
  return `${clubId}:${seasonId}`;
}

export function peekClubSeasonDrill(clubId: string, seasonId: string): AdminClubSeasonDrill | null {
  return drills.get(clubSeasonCacheKey(clubId, seasonId)) ?? null;
}

export function putClubSeasonDrill(drill: AdminClubSeasonDrill): void {
  drills.set(clubSeasonCacheKey(drill.clubId, drill.seasonId), drill);
}

export function clearClubSeasonDrillCache(): void {
  drills.clear();
}
