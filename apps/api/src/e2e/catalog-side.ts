import { catalogLabel, type Db, nationalTeamSeason, season, teamSeason } from "@kit/db";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { FixtureSide } from "./test-data.fixture.js";

export type ResolvedSide = {
  clubId: string | null;
  nationalTeamId: string | null;
  seasonId: string;
};

/**
 * A fixture side on this lane's catalog: the entity carrying the label (or
 * alias) and its latest linked season. Null when the catalog has no such side.
 */
export async function resolveCatalogSide(db: Db, side: FixtureSide): Promise<ResolvedSide | null> {
  const labels = await db
    .select({ entityId: catalogLabel.entityId })
    .from(catalogLabel)
    .where(
      and(
        eq(catalogLabel.entityType, side.kind),
        sql`lower(${catalogLabel.text}) = ${side.label.toLowerCase()}`,
      ),
    )
    .orderBy(desc(sql`${catalogLabel.kind} = 'label'`), asc(catalogLabel.entityId));

  for (const { entityId } of labels) {
    const link = side.kind === "club" ? teamSeason : nationalTeamSeason;
    const owner = side.kind === "club" ? teamSeason.clubId : nationalTeamSeason.nationalTeamId;
    const [latest] = await db
      .select({ seasonId: season.id })
      .from(link)
      .innerJoin(season, eq(season.id, link.seasonId))
      .where(eq(owner, entityId))
      .orderBy(desc(season.startsOn), asc(season.id))
      .limit(1);
    if (latest) {
      return side.kind === "club"
        ? { clubId: entityId, nationalTeamId: null, seasonId: latest.seasonId }
        : { clubId: null, nationalTeamId: entityId, seasonId: latest.seasonId };
    }
  }
  return null;
}
