#!/usr/bin/env node
import { type ResolvedFetchAdapter, resolveFetchAdapter } from "./resolve-fetch-adapter.js";
import { parseCliArgs, runHierarchyGrain, runSeed } from "./run.js";

async function main() {
  const parsed = parseCliArgs(process.argv);
  let resolved: ResolvedFetchAdapter;
  try {
    resolved = await resolveFetchAdapter();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  }

  try {
    if (parsed.mode === "grain") {
      const { summary } = await runHierarchyGrain({
        kind: parsed.grain.kind,
        competition:
          parsed.grain.kind === "league" ||
          parsed.grain.kind === "league_season" ||
          parsed.grain.kind === "club" ||
          parsed.grain.kind === "club_season" ||
          parsed.grain.kind === "club_proof"
            ? parsed.grain.competition
            : undefined,
        nationalTeamRef:
          parsed.grain.kind === "national_team" ||
          parsed.grain.kind === "national_team_season" ||
          parsed.grain.kind === "national_team_proof"
            ? parsed.grain.nationalTeamRef
            : undefined,
        season:
          parsed.grain.kind === "league_season" ||
          parsed.grain.kind === "club_season" ||
          parsed.grain.kind === "club_proof" ||
          parsed.grain.kind === "national_team_season" ||
          parsed.grain.kind === "national_team_proof"
            ? parsed.grain.season
            : undefined,
        clubExternalId:
          parsed.grain.kind === "club" || parsed.grain.kind === "club_season"
            ? parsed.grain.clubExternalId
            : undefined,
        lane: parsed.lane,
        fetchAdapter: resolved.adapter,
      });
      console.log(
        JSON.stringify(
          { ok: true, mode: "grain", grain: parsed.grain, lane: parsed.lane, summary },
          null,
          2,
        ),
      );
      return;
    }

    const { summary } = await runSeed({
      scope: parsed.scope,
      lane: parsed.lane,
      fetchAdapter: resolved.adapter,
    });

    console.log(JSON.stringify({ ok: true, lane: parsed.lane, summary }, null, 2));
  } finally {
    await resolved.close?.();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
