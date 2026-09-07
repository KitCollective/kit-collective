import type { SeedScope } from "@kit/seed-shared";
import { parseFkaKitPageHtml } from "./listing-fka-html.js";
import { fkaSeasonSlug, isDroppedFkaKitPath, resolveFkaTeamSlug } from "./listing-fka-slugs.js";

export const WAYBACK_CDX_ORIGIN = "https://web.archive.org";

export type FkListingKitJson = {
  id: string;
  clubTransfermarktId?: string;
  nationalTeamFkApiId?: string;
  seasonTransfermarktId: string;
  seasonLabel: string;
  type: string;
  manufacturerName?: string;
  sponsorName?: string;
  imageUrl?: string;
};

export type FkListingKitSourceResult =
  | { ok: true; kits: FkListingKitJson[] }
  | { ok: false; error: string };

export type FkListingKitSource = (scope: SeedScope) => Promise<FkListingKitSourceResult>;

export type WaybackFkListingOptions = {
  fetchImpl?: typeof fetch;
};

type CdxRow = {
  timestamp: string;
  original: string;
};

function waybackIdUrl(timestamp: string, original: string): string {
  return `${WAYBACK_CDX_ORIGIN}/web/${timestamp}id_/${original}`;
}

function kitIdFromOriginal(original: string): string {
  try {
    const path = new URL(original).pathname.replace(/\/+$/, "");
    const slug = path.split("/").filter(Boolean).at(-1);
    return slug && slug.length > 0 ? slug : original;
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

export function createWaybackFkListingKitSource(
  options: WaybackFkListingOptions = {},
): FkListingKitSource {
  const fetchImpl = options.fetchImpl ?? fetch;

  return async (scope) => {
    if (scope.kind === "competition") {
      return {
        ok: false,
        error: "competition range listing is not this host’s live path yet",
      };
    }

    const slug = resolveFkaTeamSlug(scope);
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

    const cdxResponse = await fetchImpl(cdxUrl);
    if (!cdxResponse.ok) {
      return {
        ok: false,
        error: `Wayback CDX refused (${cdxResponse.status})`,
      };
    }

    const snapshots = parseCdx(await readJson(cdxResponse)).filter((row) => {
      try {
        const pathname = new URL(row.original).pathname;
        if (isDroppedFkaKitPath(pathname)) {
          return false;
        }
        return pathname.includes(`/${slug}-${seasonKey}-`) && pathname.includes("-kit");
      } catch {
        return false;
      }
    });

    if (snapshots.length === 0) {
      return {
        ok: false,
        error: "Wayback has no Football Kit Archive kit snapshot for this scope",
      };
    }

    const kits: FkListingKitJson[] = [];

    for (const snapshot of snapshots) {
      const htmlResponse = await fetchImpl(waybackIdUrl(snapshot.timestamp, snapshot.original));
      if (!htmlResponse.ok) {
        continue;
      }
      const html = await htmlResponse.text();
      const parsed = parseFkaKitPageHtml(html);
      if (!parsed) {
        continue;
      }

      const kit: FkListingKitJson = {
        id: kitIdFromOriginal(snapshot.original),
        seasonTransfermarktId: seasonLabel,
        seasonLabel,
        type: parsed.type,
        manufacturerName: parsed.manufacturerName,
        sponsorName: parsed.sponsorName,
      };

      if (scope.kind === "club") {
        kit.clubTransfermarktId = scope.clubExternalId.replace(/^club-/, "");
      } else {
        kit.nationalTeamFkApiId = scope.nationalTeamRef;
      }

      if (parsed.imageUrl) {
        kit.imageUrl = waybackIdUrl(snapshot.timestamp, parsed.imageUrl);
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
