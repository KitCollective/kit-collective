import type { SeedScope } from "@kit/seed-shared";

/** TM club id → Football Kit Archive team slug (no `-kits` suffix). */
const CLUB_SLUG_BY_TM_ID: Record<string, string> = {
  "190": "fc-copenhagen",
  "191": "brondby",
};

const NATIONAL_TEAM_SLUG_BY_REF: Record<string, string> = {
  "denmark-kits": "denmark",
  denmark: "denmark",
};

export function fkaSeasonSlug(seasonLabel: string): string {
  return seasonLabel.trim().replaceAll("/", "-");
}

export function resolveFkaTeamSlug(scope: SeedScope): string | undefined {
  if (scope.kind === "club") {
    return CLUB_SLUG_BY_TM_ID[scope.clubExternalId.replace(/^club-/, "")];
  }
  if (scope.kind === "national_team") {
    return NATIONAL_TEAM_SLUG_BY_REF[scope.nationalTeamRef.trim().toLowerCase()];
  }
  return undefined;
}

export function isDroppedFkaKitPath(pathname: string): boolean {
  const lower = pathname.toLowerCase();
  if (/-kits\/?$/.test(lower)) {
    return true;
  }
  return (
    lower.includes("-training") ||
    lower.includes("-anthem") ||
    lower.includes("-track") ||
    lower.includes("-rain") ||
    lower.includes("-european-") ||
    lower.includes("champions-league")
  );
}
