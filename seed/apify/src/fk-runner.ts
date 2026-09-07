import {
  createFkApiFetchAdapter,
  createJoinProofClubFixtureFetchAdapter,
  createJoinProofNationalTeamFixtureFetchAdapter,
} from "@kit/seed-fkapi/fetch";
import { runFkSeed } from "@kit/seed-fkapi/mapper";
import { createR2ObjectStore } from "@kit/seed-fkapi/object-store";
import type { FkFetchAdapter } from "@kit/seed-fkapi/types";
import type { FkJoinRunner } from "./join-workflow.js";

export function resolveDefaultFkFetchAdapter(): FkFetchAdapter {
  if (process.env.FKAPI_BASE_URL?.trim()) {
    return createFkApiFetchAdapter();
  }
  if (process.env.SEED_FK_FETCH?.trim() === "fixture") {
    return {
      async fetchKits(scope) {
        if (scope.kind === "national_team") {
          return createJoinProofNationalTeamFixtureFetchAdapter().fetchKits(scope);
        }
        return createJoinProofClubFixtureFetchAdapter().fetchKits(scope);
      },
    };
  }
  throw new Error(
    "FKApi fetch requires FKAPI_BASE_URL, or SEED_FK_FETCH=fixture. No silent fixture default.",
  );
}

export function createDefaultFkRunner(fetchAdapter?: FkFetchAdapter): FkJoinRunner {
  const fkFetch = fetchAdapter ?? resolveDefaultFkFetchAdapter();
  const objectStore = createR2ObjectStore();
  return async ({ scope, databaseUrl }) =>
    runFkSeed({
      databaseUrl,
      fetchAdapter: fkFetch,
      objectStore,
      scope,
    });
}
