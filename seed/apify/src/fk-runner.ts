import { createFkApiFetchAdapter } from "@kit/seed-fkapi/fetch";
import { runFkSeed } from "@kit/seed-fkapi/mapper";
import { createR2ObjectStore } from "@kit/seed-fkapi/object-store";
import type { FkFetchAdapter } from "@kit/seed-fkapi/types";
import type { FkJoinRunner } from "./join-workflow.js";

export function resolveDefaultFkFetchAdapter(): FkFetchAdapter {
  if (process.env.FKAPI_BASE_URL) {
    return createFkApiFetchAdapter();
  }
  throw new Error(
    "FKApi fetch requires FKAPI_BASE_URL. Join workflow FK step uses live FKApi in development lane; tests inject a fetch adapter.",
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
