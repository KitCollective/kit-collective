import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeRawKit } from "./normalize.js";
import {
  createSeedHttpFetch,
  resolveSeedProxyConfig,
  type SeedHttpFetch,
  type SeedProxyConfig,
} from "./proxy-config.js";
import type { FkFetchAdapter, FkFetchScope, FkRawKit } from "./types.js";

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
      // SAFETY: the fixture is committed in this repository and normalizeRawKit rejects
      // any record that does not parse into an FkRawKit.
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

type FkApiFetchAdapterOptions = {
  proxyConfig?: SeedProxyConfig;
  httpFetch?: SeedHttpFetch;
  baseUrl?: string;
  token?: string;
};

/** Production fetch talks to Football Kit Archive via FKApi — not used in tests. */
export function createFkApiFetchAdapter(options: FkApiFetchAdapterOptions = {}): FkFetchAdapter {
  const proxyConfig = options.proxyConfig ?? resolveSeedProxyConfig();
  const httpFetch = options.httpFetch ?? createSeedHttpFetch(proxyConfig);
  const baseUrl = options.baseUrl ?? process.env.FKAPI_BASE_URL ?? "https://fkapi.example.invalid";
  const token = options.token ?? process.env.FKAPI_TOKEN;

  return {
    async fetchKits(scope: FkFetchScope): Promise<FkRawKit[]> {
      const url = new URL("/kits", baseUrl);
      url.searchParams.set("competition", scope.competition);
      url.searchParams.set("from", scope.fromSeason);
      url.searchParams.set("to", scope.toSeason);

      const headers: Record<string, string> = {};
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await httpFetch(url.toString(), { headers });
      // SAFETY: every record is parsed by normalizeRawKit, which drops anything that is
      // not an FkRawKit, so a wrong shape here yields no kits rather than bad data.
      const body = (await response.json()) as { kits?: Record<string, unknown>[] };
      const kits: FkRawKit[] = [];

      for (const item of body.kits ?? []) {
        const normalized = normalizeRawKit(item);
        if (!normalized) {
          continue;
        }

        if (!normalized.imageBytes || normalized.imageBytes.length === 0) {
          const imageUrl = asOptionalString(item.imageUrl);
          if (imageUrl) {
            normalized.imageBytes = await downloadImageBytes(imageUrl, httpFetch);
          }
        }

        kits.push(normalized);
      }

      return kits;
    },
  };
}

async function downloadImageBytes(url: string, httpFetch: SeedHttpFetch): Promise<Uint8Array> {
  const response = await httpFetch(url);
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
