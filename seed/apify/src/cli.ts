#!/usr/bin/env node
import { runFkSeed } from "@kit/seed-fkapi/mapper";
import { createR2ObjectStore } from "@kit/seed-fkapi/object-store";
import { createFixtureFetchAdapter as createFkFixtureFetchAdapter } from "@kit/seed-fkapi/fetch";
import { type ResolvedFetchAdapter, resolveFetchAdapter } from "./resolve-fetch-adapter.js";
import { parseCliArgs, runHierarchyGrain, runSeed } from "./run.js";
import {
  runClubJoinWorkflow,
  runNationalTeamJoinWorkflow,
  type FkJoinRunner,
} from "./join-workflow.js";

function createDefaultFkRunner(fetchAdapter?: import("@kit/seed-fkapi/types").FkFetchAdapter): FkJoinRunner {
  const fkFetch = fetchAdapter ?? createFkFixtureFetchAdapter();
  const objectStore = createR2ObjectStore();
  return async ({ scope, databaseUrl }) =>
    runFkSeed({
      databaseUrl,
      fetchAdapter: fkFetch,
      objectStore,
      scope,
    });
}

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
    if (parsed.mode === "join") {
      const fkRunner = createDefaultFkRunner();
      const summary =
        parsed.scope.path === "club"
          ? await runClubJoinWorkflow({
              path: "club",
              competition: parsed.scope.competition,
              season: parsed.scope.season,
              lane: parsed.scope.lane,
              fetchAdapter: resolved.adapter,
              fkRunner,
            })
          : await runNationalTeamJoinWorkflow({
              path: "national_team",
              nationalTeamRef: parsed.scope.nationalTeamRef,
              season: parsed.scope.season,
              lane: parsed.scope.lane,
              fetchAdapter: resolved.adapter,
              fkRunner,
            });

      console.log(
        JSON.stringify(
          { ok: true, mode: "join", lane: parsed.scope.lane, scope: parsed.scope, summary },
          null,
          2,
        ),
      );
      return;
    }

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
