import type { SeedScope } from "@kit/seed-shared";
import { parseFkaKitPageHtml, parseFkaSeasonIndexKitUrls } from "./listing-fka-html.js";
import {
  classifyFkaKitStem,
  collapseFkaKitSnapshots,
  fkaKitExternalId,
  fkaKitPathStem,
  fkaSeasonSlug,
  isFkaKitDetailPath,
  resolveFkaTeamSlug,
} from "./listing-fka-slugs.js";

export const WAYBACK_CDX_ORIGIN = "https://web.archive.org";
const WAYBACK_USER_AGENT =
  "KitCollective-Seed/1.0 (+https://github.com/KitCollective/kit-collective)";
const WAYBACK_TRANSIENT_STATUSES = new Set([429, 502, 503, 504]);
const WAYBACK_CDX_ATTEMPTS = 3;

export type FkListingKitJson = {
  id: string;
  clubTransfermarktId?: string;
  nationalTeamFkApiId?: string;
  seasonTransfermarktId: string;
  seasonLabel: string;
  type: string;
  variant?: string;
  manufacturerName?: string;
  sponsorName?: string;
  design?: string;
  colorNames?: string;
  primaryColorHex?: string;
  secondaryColorHex?: string;
  competition?: string;
  releasedOn?: string;
  description?: string;
  imageUrl?: string;
  extraImageUrls?: string[];
  imageBytes?: Uint8Array;
  additionalImageBytes?: Uint8Array[];
};

export type FkListingKitSourceResult =
  | { ok: true; kits: FkListingKitJson[] }
  | { ok: false; error: string };

export type FkListingKitSourceHints = {
  clubLabel?: string;
};

export type FkListingKitSource = (
  scope: SeedScope,
  hints?: FkListingKitSourceHints,
) => Promise<FkListingKitSourceResult>;

export type WaybackFkListingOptions = {
  fetchImpl?: typeof fetch;
};

export function createFkListingKitSource(
  options: WaybackFkListingOptions = {},
): FkListingKitSource {
  return createWaybackFkListingKitSource(options);
}

type CdxRow = {
  timestamp: string;
  original: string;
};

function waybackIdUrl(timestamp: string, original: string): string {
  return `${WAYBACK_CDX_ORIGIN}/web/${timestamp}id_/${original}`;
}

function kitIdFromOriginal(original: string): string {
  try {
    return fkaKitExternalId(new URL(original).pathname) ?? original;
  } catch {
    return original;
  }
}

function parseCdx(body: unknown): CdxRow[] {
  if (!Array.isArray(body) || body.length < 2) {
    return [];
  }
  const latest = new Map<string, CdxRow>();
  for (const row of body.slice(1)) {
    if (!Array.isArray(row) || row.length < 3) {
      continue;
    }
    const timestamp = String(row[1] ?? "");
    const original = String(row[2] ?? "");
    if (!timestamp || !original) {
      continue;
    }
    const previous = latest.get(original);
    if (!previous || timestamp > previous.timestamp) {
      latest.set(original, { timestamp, original });
    }
  }
  return [...latest.values()];
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function waybackHeaders(): Record<string, string> {
  return {
    "user-agent": WAYBACK_USER_AGENT,
    accept: "application/json,text/html,*/*;q=0.8",
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchWayback(
  url: string | URL,
  fetchImpl: typeof fetch,
  attempts = 1,
): Promise<Response> {
  let response = await fetchImpl(url, { headers: waybackHeaders() });
  for (let attempt = 1; attempt < attempts && WAYBACK_TRANSIENT_STATUSES.has(response.status); attempt += 1) {
    await sleep(200 * attempt);
    response = await fetchImpl(url, { headers: waybackHeaders() });
  }
  return response;
}

export function createWaybackFkListingKitSource(
  options: WaybackFkListingOptions = {},
): FkListingKitSource {
  const fetchImpl = options.fetchImpl ?? fetch;

  return async (scope, hints) => {
    if (scope.kind === "competition") {
      return {
        ok: false,
        error: "competition range listing is not this host’s live path yet",
      };
    }

    const slug = resolveFkaTeamSlug(scope, hints?.clubLabel);
    if (!slug) {
      const identity =
        scope.kind === "club"
          ? `clubTransfermarktId=${scope.clubExternalId}`
          : `nationalTeamFkApiId=${scope.nationalTeamRef}`;
      return {
        ok: false,
        error: `no Football Kit Archive slug for ${identity}`,
      };
    }

    const seasonLabel = scope.season;
    const seasonKey = fkaSeasonSlug(seasonLabel);
    const cdxUrl = new URL("/cdx/search/cdx", WAYBACK_CDX_ORIGIN);
    cdxUrl.searchParams.set("url", `footballkitarchive.com/${slug}-${seasonKey}*`);
    cdxUrl.searchParams.set("output", "json");
    cdxUrl.searchParams.set("filter", "statuscode:200");
    cdxUrl.searchParams.set("collapse", "urlkey");

    const cdxResponse = await fetchWayback(cdxUrl, fetchImpl, WAYBACK_CDX_ATTEMPTS);
    if (!cdxResponse.ok) {
      return {
        ok: false,
        error: `Wayback CDX refused (${cdxResponse.status})`,
      };
    }

    const snapshots = collapseFkaKitSnapshots(
      parseCdx(await readJson(cdxResponse)).filter((row) => {
        try {
          const pathname = new URL(row.original).pathname;
          return (
            pathname.includes(`/${slug}-${seasonKey}-`) && isFkaKitDetailPath(pathname)
          );
        } catch {
          return false;
        }
      }),
    );

    const indexCdxUrl = new URL("/cdx/search/cdx", WAYBACK_CDX_ORIGIN);
    indexCdxUrl.searchParams.set("url", `footballkitarchive.com/${slug}-${seasonKey}-kits/`);
    indexCdxUrl.searchParams.set("output", "json");
    indexCdxUrl.searchParams.set("filter", "statuscode:200");
    indexCdxUrl.searchParams.set("collapse", "urlkey");
    const indexCdxResponse = await fetchWayback(indexCdxUrl, fetchImpl, WAYBACK_CDX_ATTEMPTS);
    if (indexCdxResponse.ok) {
      const indexRows = parseCdx(await readJson(indexCdxResponse)).filter((row) => {
        try {
          return new URL(row.original).pathname.includes(`/${slug}-${seasonKey}-kits`);
        } catch {
          return false;
        }
      });
      const latestIndex = indexRows.sort((left, right) =>
        left.timestamp.localeCompare(right.timestamp),
      )[indexRows.length - 1];
      if (latestIndex) {
        const indexHtmlResponse = await fetchWayback(
          waybackIdUrl(latestIndex.timestamp, latestIndex.original),
          fetchImpl,
          WAYBACK_CDX_ATTEMPTS,
        );
        if (indexHtmlResponse.ok) {
          const knownStems = new Set(
            snapshots.flatMap((row) => {
              try {
                const stem = fkaKitPathStem(new URL(row.original).pathname);
                return stem ? [stem] : [];
              } catch {
                return [];
              }
            }),
          );
          for (const original of parseFkaSeasonIndexKitUrls(
            await indexHtmlResponse.text(),
            slug,
            seasonKey,
          )) {
            const stem = fkaKitPathStem(new URL(original).pathname);
            if (!stem || knownStems.has(stem)) {
              continue;
            }
            const kitCdxUrl = new URL("/cdx/search/cdx", WAYBACK_CDX_ORIGIN);
            kitCdxUrl.searchParams.set("url", original.replace(/^https?:\/\//, ""));
            kitCdxUrl.searchParams.set("output", "json");
            kitCdxUrl.searchParams.set("filter", "statuscode:200");
            kitCdxUrl.searchParams.set("collapse", "urlkey");
            const kitCdxResponse = await fetchWayback(kitCdxUrl, fetchImpl, WAYBACK_CDX_ATTEMPTS);
            if (!kitCdxResponse.ok) {
              continue;
            }
            const extra = parseCdx(await readJson(kitCdxResponse)).filter((row) => {
              try {
                return isFkaKitDetailPath(new URL(row.original).pathname);
              } catch {
                return false;
              }
            });
            if (extra.length === 0) {
              continue;
            }
            knownStems.add(stem);
            snapshots.push(...extra);
          }
        }
      }
    }

    const collapsed = collapseFkaKitSnapshots(snapshots);

    if (collapsed.length === 0) {
      return {
        ok: false,
        error: "Wayback has no Football Kit Archive kit snapshot for this scope",
      };
    }

    const kits: FkListingKitJson[] = [];

    for (const snapshot of collapsed) {
      const htmlResponse = await fetchWayback(
        waybackIdUrl(snapshot.timestamp, snapshot.original),
        fetchImpl,
        WAYBACK_CDX_ATTEMPTS,
      );
      if (!htmlResponse.ok) {
        continue;
      }
      const html = await htmlResponse.text();
      const parsed = parseFkaKitPageHtml(html);
      if (!parsed) {
        continue;
      }

      let pathname: string | undefined;
      try {
        pathname = new URL(snapshot.original).pathname;
      } catch {
        pathname = undefined;
      }
      const stem = pathname ? fkaKitPathStem(pathname) : undefined;
      const classified = stem
        ? classifyFkaKitStem(stem, `${slug}-${seasonKey}`)
        : undefined;
      const identity = classified ?? {
        type: parsed.type,
        variant: parsed.variant ?? null,
      };

      const kit: FkListingKitJson = {
        id: kitIdFromOriginal(snapshot.original),
        seasonTransfermarktId: seasonLabel,
        seasonLabel,
        type: identity.type,
        manufacturerName: parsed.manufacturerName,
        sponsorName: parsed.sponsorName,
        design: parsed.design,
        colorNames: parsed.colorNames,
        primaryColorHex: parsed.primaryColorHex,
        secondaryColorHex: parsed.secondaryColorHex,
        competition: parsed.competition,
        releasedOn: parsed.releasedOn,
        description: parsed.description,
      };
      if (identity.variant) {
        kit.variant = identity.variant;
      }

      if (scope.kind === "club") {
        kit.clubTransfermarktId = scope.clubExternalId.replace(/^club-/, "");
      } else {
        kit.nationalTeamFkApiId = scope.nationalTeamRef;
      }

      if (parsed.imageUrl) {
        kit.imageUrl = waybackIdUrl(snapshot.timestamp, parsed.imageUrl);
      }
      if (parsed.extraImageUrls.length > 0) {
        kit.extraImageUrls = parsed.extraImageUrls.map((url) =>
          waybackIdUrl(snapshot.timestamp, url),
        );
      }

      kits.push(kit);
    }

    if (kits.length === 0) {
      return {
        ok: false,
        error: "Wayback snapshots did not parse into match kits",
      };
    }

    return { ok: true, kits };
  };
}
