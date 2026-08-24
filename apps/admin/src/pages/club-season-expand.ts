export function resolveSeasonIdForClub(
  currentSeasonId: string,
  seasons: ReadonlyArray<{ id: string }>,
): string {
  if (currentSeasonId && seasons.some((season) => season.id === currentSeasonId)) {
    return currentSeasonId;
  }
  return seasons[0]?.id ?? "";
}

export function isClubSeasonReadyToExpand(
  club: { id: string; seasons: ReadonlyArray<{ id: string }> } | null,
  routeClubId: string | undefined,
  seasonId: string,
): boolean {
  return (
    club !== null &&
    routeClubId !== undefined &&
    club.id === routeClubId &&
    seasonId.length > 0 &&
    club.seasons.some((season) => season.id === seasonId)
  );
}

export function isClubSeasonExpandPending(
  club: { id: string; seasons: ReadonlyArray<{ id: string }> } | null,
  routeClubId: string | undefined,
  seasonId: string,
): boolean {
  if (!routeClubId || isClubSeasonReadyToExpand(club, routeClubId, seasonId)) {
    return false;
  }
  return club === null || club.id !== routeClubId || seasonId.length > 0;
}
