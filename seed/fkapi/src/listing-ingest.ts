import { runFkSeed } from "./mapper.js";
import { normalizeRawKit } from "./normalize.js";
import { createR2ObjectStore } from "./object-store.js";
import type { FkListingKitJson } from "./listing-kit-source.js";
import type { FkFetchAdapter, FkRawKit, ObjectStoreAdapter, SeedRunResult } from "./types.js";
import type { SeedScope } from "@kit/seed-shared";

export type FkListingIngestInput = {
  scope: SeedScope;
  kits: FkListingKitJson[];
};

export type FkListingIngestRunner = (input: FkListingIngestInput) => Promise<SeedRunResult>;

export type FkListingIngestRunnerOptions = {
  env?: NodeJS.ProcessEnv;
  objectStore?: ObjectStoreAdapter;
  fetchImpl?: typeof fetch;
};

const ARCHIVE_USER_AGENT =
  "KitCollective-Seed/1.0 (+https://github.com/KitCollective/kit-collective)";
const WAYBACK_ORIGIN = "https://web.archive.org";
const WAYBACK_ID_RE = /\/web\/(\d+)id_\/(https?:\/\/\S+)$/;

function isArchiveImageBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 4) {
    return false;
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return true;
  }
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return true;
  }
  return bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
}

function waybackIdUrl(timestamp: string, original: string): string {
  return `${WAYBACK_ORIGIN}/web/${timestamp}id_/${original}`;
}

function unwrapWaybackOriginal(url: string): string | undefined {
  return url.match(WAYBACK_ID_RE)?.[2];
}

function unwrapWaybackTimestamp(url: string): string | undefined {
  return url.match(WAYBACK_ID_RE)?.[1];
}

async function tryDownloadArchiveImage(
  url: string,
  fetchImpl: typeof fetch,
): Promise<Uint8Array | undefined> {
  const response = await fetchImpl(url, {
    headers: {
      "user-agent": ARCHIVE_USER_AGENT,
      accept: "image/*,*/*;q=0.8",
    },
  });
  if (!response.ok) {
    return undefined;
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  return isArchiveImageBytes(bytes) ? bytes : undefined;
}

async function latestCdxTimestamp(
  original: string,
  fetchImpl: typeof fetch,
): Promise<string | undefined> {
  const cdxUrl = new URL("/cdx/search/cdx", WAYBACK_ORIGIN);
  cdxUrl.searchParams.set("url", original);
  cdxUrl.searchParams.set("output", "json");
  cdxUrl.searchParams.set("filter", "statuscode:200");
  cdxUrl.searchParams.set("collapse", "digest");

  const response = await fetchImpl(cdxUrl, {
    headers: { "user-agent": ARCHIVE_USER_AGENT },
  });
  if (!response.ok) {
    return undefined;
  }
  const body: unknown = await response.json().catch(() => undefined);
  if (!Array.isArray(body) || body.length < 2) {
    return undefined;
  }

  let latest: string | undefined;
  for (const row of body.slice(1)) {
    if (!Array.isArray(row) || typeof row[1] !== "string" || row[1].length === 0) {
      continue;
    }
    if (!latest || row[1] > latest) {
      latest = row[1];
    }
  }
  return latest;
}

async function downloadArchiveImage(
  url: string,
  fetchImpl: typeof fetch,
): Promise<Uint8Array | undefined> {
  let bytes = await tryDownloadArchiveImage(url, fetchImpl);
  if (bytes) {
    return bytes;
  }
  const original = unwrapWaybackOriginal(url) ?? url;
  const pageTimestamp = unwrapWaybackTimestamp(url);
  const timestamp = await latestCdxTimestamp(original, fetchImpl);
  if (timestamp && timestamp !== pageTimestamp) {
    bytes = await tryDownloadArchiveImage(waybackIdUrl(timestamp, original), fetchImpl);
  }
  return bytes;
}

export async function hydrateListingKitBytes(
  kits: FkListingKitJson[],
  fetchImpl: typeof fetch,
): Promise<FkRawKit[]> {
  const raw: FkRawKit[] = [];
  for (const kit of kits) {
    const normalized = normalizeRawKit({ ...kit });
    if (!normalized) {
      continue;
    }
    const urls = [kit.imageUrl, ...(kit.extraImageUrls ?? [])].filter(
      (url): url is string => typeof url === "string" && url.length > 0,
    );
    const downloaded: Uint8Array[] = [];
    if (normalized.imageBytes && isArchiveImageBytes(normalized.imageBytes)) {
      downloaded.push(normalized.imageBytes);
    }
    for (const extra of normalized.additionalImageBytes ?? []) {
      if (isArchiveImageBytes(extra)) {
        downloaded.push(extra);
      }
    }
    if (downloaded.length === 0) {
      for (const url of urls) {
        const bytes = await downloadArchiveImage(url, fetchImpl);
        if (bytes) {
          downloaded.push(bytes);
        }
      }
    } else if (!normalized.additionalImageBytes && kit.extraImageUrls) {
      for (const url of kit.extraImageUrls) {
        const bytes = await downloadArchiveImage(url, fetchImpl);
        if (bytes) {
          downloaded.push(bytes);
        }
      }
    }
    if (downloaded.length === 0) {
      continue;
    }
    normalized.imageBytes = downloaded[0];
    if (downloaded.length > 1) {
      normalized.additionalImageBytes = downloaded.slice(1);
    }
    raw.push(normalized);
  }
  return raw;
}

export function createFkListingIngestRunner(
  options: FkListingIngestRunnerOptions = {},
): FkListingIngestRunner {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;

  return async ({ scope, kits }) => {
    const databaseUrl = env.DATABASE_URL?.trim();
    if (!databaseUrl) {
      throw new Error("FK listing ingest requires DATABASE_URL");
    }

    const raw = await hydrateListingKitBytes(kits, fetchImpl);
    if (kits.length > 0 && raw.length === 0) {
      const kitId = kits[0]?.id ?? "unknown";
      throw new Error(
        `Kit ${kitId} has no archive image bytes. Refusing accept without lane R2 object for this kit.`,
      );
    }

    const objectStore = options.objectStore ?? createR2ObjectStore();
    const fetchAdapter: FkFetchAdapter = {
      async fetchKits() {
        return raw;
      },
    };

    return runFkSeed({
      databaseUrl,
      fetchAdapter,
      objectStore,
      scope,
    });
  };
}
