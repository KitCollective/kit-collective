export const REJECT_NATIONAL_TEAM_APIFY_SCOPE_MESSAGE =
  "NationalTeam walk scope belongs to @kit/seed-fkapi; @kit/seed-apify only walks club/competition seasons";

export function rejectNationalTeamApifyScope(): never {
  throw new Error(REJECT_NATIONAL_TEAM_APIFY_SCOPE_MESSAGE);
}
