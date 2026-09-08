#!/usr/bin/env node
import { runBulkFromCli } from "./bulk.js";
import { createDefaultFkRunner } from "./fk-runner.js";
import { runJerseyNumbersFromCli } from "./jersey-numbers.js";
import { runClubJoinWorkflow, runNationalTeamJoinWorkflow } from "./join-workflow.js";
import { describeSeedError, seedProgress } from "./progress.js";
import { type ResolvedFetchAdapter, resolveFetchAdapter } from "./resolve-fetch-adapter.js";
import { parseCliArgs, runHierarchyGrain, runSeed } from "./run.js";

async function main() {
  const parsed = parseCliArgs(process.argv);
  if (parsed.mode === "join") {
    seedProgress(
      parsed.scope.path === "club"
        ? `cli join club ${parsed.scope.competition} ${parsed.scope.season} lane=${parsed.scope.lane}`
        : `cli join national-team ${parsed.scope.nationalTeamRef} ${parsed.scope.season} lane=${parsed.scope.lane}`,
    );
  } else if (parsed.mode === "grain") {
    seedProgress(`cli grain ${parsed.grain.kind} lane=${parsed.lane}`);
  } else if (parsed.mode === "bulk") {
    seedProgress(`cli bulk ${parsed.bulk.command} lane=${parsed.lane}`);
  } else if (parsed.mode === "jersey-numbers") {
    seedProgress(
      `cli jersey-numbers ${parsed.playerExternalIds.length || "backfill"} lane=${parsed.lane}`,
    );
  } else {
    seedProgress(`cli walk lane=${parsed.lane}`);
  }

  let resolved: ResolvedFetchAdapter;
  try {
    resolved = await resolveFetchAdapter();
    seedProgress(`fetch transport=${resolved.transport}`);
  } catch (error: unknown) {
    const message = describeSeedError(error);
    seedProgress(`fail adapter ${message}`);
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

    if (parsed.mode === "jersey-numbers") {
      const fetcher = resolved.jerseyNumbers;
      if (!fetcher) {
        throw new Error(
          "jersey-numbers needs the Transfermarkt HTML transport. Unset SEED_FETCH=apify and SEED_APIFY_FIXTURE.",
        );
      }
      const result = await runJerseyNumbersFromCli({
        playerExternalIds: parsed.playerExternalIds,
        lane: parsed.lane,
        fetcher,
      });
      console.log(JSON.stringify({ ok: true, command: "jersey-numbers", ...result }, null, 2));
      return;
    }

    if (parsed.mode === "bulk") {
      const result = await runBulkFromCli({
        request: parsed.bulk,
        lane: parsed.lane,
        fetchAdapter: resolved.adapter,
      });
      console.log(JSON.stringify({ ok: true, mode: "bulk", ...result }, null, 2));
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
  const message = describeSeedError(error);
  seedProgress(`fail ${message}`);
  console.error(message);
  process.exit(1);
});
