import { type RefinementCtx, z } from "zod";

export const catalogSideKindSchema = z.enum(["club", "national_team"]);

export type CatalogSideKind = z.infer<typeof catalogSideKindSchema>;

export function catalogSideId(row: {
  clubId?: string | null;
  nationalTeamId?: string | null;
}): string | null {
  return row.clubId ?? row.nationalTeamId ?? null;
}

export function catalogSideXorIssue(
  ctx: RefinementCtx,
  clubId: string | null | undefined,
  nationalTeamId: string | null | undefined,
  required: boolean,
): void {
  const hasClub = typeof clubId === "string";
  const hasNationalTeam = typeof nationalTeamId === "string";
  if (required) {
    if (hasClub === hasNationalTeam) {
      ctx.addIssue({
        code: "custom",
        message: "Exactly one of clubId or nationalTeamId is required",
        path: hasClub ? ["nationalTeamId"] : ["clubId"],
      });
    }
    return;
  }
  if (hasClub && hasNationalTeam) {
    ctx.addIssue({
      code: "custom",
      message: "clubId and nationalTeamId are mutually exclusive",
      path: ["nationalTeamId"],
    });
  }
}
