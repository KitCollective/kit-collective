import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FkFetchAdapter, FkFetchScope, FkRawKit } from "./types.js";
import { normalizeRawKit } from "./normalize.js";

const FIXTURE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/superliga-kits.json",
);

type FixtureFile = {
  kits: Record<string, unknown>[];
};

export function createFixtureFetchAdapter(): FkFetchAdapter {
  return {
    async fetchKits(_scope: FkFetchScope): Promise<FkRawKit[]> {
      const raw = await readFile(FIXTURE_PATH, "utf8");
      const parsed = JSON.parse(raw) as FixtureFile;
      const kits: FkRawKit[] = [];
      for (const item of parsed.kits) {
        const normalized = normalizeRawKit(item);
        if (normalized) {
          kits.push(normalized);
        }
      }
      return kits;
    },
  };
}

/** Production fetch talks to Football Kit Archive via FKApi — not used in tests. */
export function createFkApiFetchAdapter(): FkFetchAdapter {
  return {
    async fetchKits(scope: FkFetchScope): Promise<FkRawKit[]> {
      const baseUrl = process.env.FKAPI_BASE_URL ?? "https://fkapi.example.invalid";
      const url = new URL("/kits", baseUrl);
      url.searchParams.set("competition", scope.competition);
      url.searchParams.set("from", scope.fromSeason);
      url.searchParams.set("to", scope.toSeason);

      const response = await fetch(url, {
        headers: process.env.FKAPI_TOKEN
          ? { Authorization: `Bearer ${process.env.FKAPI_TOKEN}` }
          : undefined,
      });

      if (!response.ok) {
        throw new Error(`FKApi fetch failed: ${response.status} ${response.statusText}`);
      }

      const body = (await response.json()) as { kits?: Record<string, unknown>[] };
      const kits: FkRawKit[] = [];
      for (const item of body.kits ?? []) {
        const normalized = normalizeRawKit(item);
        if (normalized) {
          kits.push(normalized);
        }
      }
      return kits;
    },
  };
}
