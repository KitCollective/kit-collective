import type { SeedScope } from "@kit/seed-shared";
import type { KitType } from "./types.js";

/** TM club id → Football Kit Archive team slug (no `-kits` suffix). */
const CLUB_SLUG_BY_TM_ID: Record<string, string> = {
  "190": "fc-copenhagen",
  "191": "brondby",
};

const NATIONAL_TEAM_SLUG_BY_REF: Record<string, string> = {
  "denmark-kits": "denmark",
  denmark: "denmark",
};

export function fkaSeasonSlug(seasonLabel: string): string {
  return seasonLabel.trim().replaceAll("/", "-");
}

export function slugifyFkaClubLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replaceAll("ø", "o")
    .replaceAll("æ", "ae")
    .replaceAll("å", "a")
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
}

export function resolveFkaTeamSlug(scope: SeedScope, clubLabel?: string): string | undefined {
  if (scope.kind === "club") {
    const mapped = CLUB_SLUG_BY_TM_ID[scope.clubExternalId.replace(/^club-/, "")];
    if (mapped) {
      return mapped;
    }
    const slug = clubLabel ? slugifyFkaClubLabel(clubLabel) : "";
    return slug.length > 0 ? slug : undefined;
  }
  if (scope.kind === "national_team") {
    return NATIONAL_TEAM_SLUG_BY_REF[scope.nationalTeamRef.trim().toLowerCase()];
  }
  return undefined;
}

const DROPPED_REMAINDER =
  /(?:^|-)(training|traning|anthem|track|rain|pre-match|pre-season|preseason|travel|bench|warm-up|warmup)(?:-|$)/;

function closedKitType(value: string | undefined): KitType | undefined {
  if (
    value === "home" ||
    value === "away" ||
    value === "third" ||
    value === "fourth" ||
    value === "gk" ||
    value === "special"
  ) {
    return value;
  }
  return undefined;
}

export function isDroppedFkaKitPath(pathname: string): boolean {
  const lower = pathname.toLowerCase();
  if (/-kits\/?$/.test(lower)) {
    return true;
  }
  return DROPPED_REMAINDER.test(lower);
}

/** Stem shared by `/…-home-kit/` and `/…-home-kit/354421/`. */
export function fkaKitPathStem(pathname: string): string | undefined {
  const path = pathname.toLowerCase().replace(/\/+$/, "");
  const numbered = path.match(/\/([a-z0-9-]+-kit)\/\d+$/);
  if (numbered?.[1]) {
    return numbered[1];
  }
  const slugOnly = path.match(/\/([a-z0-9-]+-kit)$/);
  return slugOnly?.[1];
}

export function fkaKitExternalId(pathname: string): string | undefined {
  const path = pathname.toLowerCase().replace(/\/+$/, "");
  const numbered = path.match(/\/([a-z0-9-]+-kit)\/(\d+)$/);
  if (numbered?.[2]) {
    return numbered[2];
  }
  const slugOnly = path.match(/\/([a-z0-9-]+-kit)$/);
  return slugOnly?.[1];
}

export function isFkaKitDetailPath(pathname: string): boolean {
  return fkaKitPathStem(pathname) !== undefined && !isDroppedFkaKitPath(pathname);
}

export type FkaKitSnapshot = {
  timestamp: string;
  original: string;
};

function isNumberedFkaKitUrl(original: string): boolean {
  try {
    return /^\d+$/.test(fkaKitExternalId(new URL(original).pathname) ?? "");
  } catch {
    return false;
  }
}

/** Keep one snapshot per kit stem. Prefer `/…-kit/{id}/` over the slug-only URL. */
export function collapseFkaKitSnapshots<T extends FkaKitSnapshot>(rows: T[]): T[] {
  const latest = new Map<string, T>();
  for (const row of rows) {
    let pathname: string;
    try {
      pathname = new URL(row.original).pathname;
    } catch {
      continue;
    }
    const stem = fkaKitPathStem(pathname);
    if (!stem) {
      continue;
    }
    const previous = latest.get(stem);
    if (!previous) {
      latest.set(stem, row);
      continue;
    }
    const incomingNumbered = isNumberedFkaKitUrl(row.original);
    const previousNumbered = isNumberedFkaKitUrl(previous.original);
    if (incomingNumbered !== previousNumbered) {
      if (incomingNumbered) {
        latest.set(stem, row);
      }
      continue;
    }
    if (row.timestamp > previous.timestamp) {
      latest.set(stem, row);
    }
  }
  return [...latest.values()];
}

export function fkaTypeLabelRemainder(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .replace(/-kit$/, "");
}

export function classifyFkaKitRemainder(
  remainder: string,
): { type: KitType; variant: string | null } | undefined {
  const normalized = remainder
    .trim()
    .toLowerCase()
    .replaceAll(/^-+|-+$/g, "");
  if (!normalized || DROPPED_REMAINDER.test(normalized)) {
    return undefined;
  }
  if (normalized === "gk" || normalized.startsWith("gk-")) {
    return { type: "gk", variant: normalized === "gk" ? null : normalized.slice(3) };
  }
  const startsWithBase = normalized.match(/^(home|away|third|fourth|special)(?:-(.+))?$/);
  const startType = closedKitType(startsWithBase?.[1]);
  if (startType) {
    return { type: startType, variant: startsWithBase?.[2] ?? null };
  }
  const endsWithBase = normalized.match(/^(.*)-(home|away|third|fourth)$/);
  const endType = closedKitType(endsWithBase?.[2]);
  if (endsWithBase?.[1] && endType) {
    return { type: endType, variant: endsWithBase[1] };
  }
  return { type: "special", variant: normalized };
}

export function classifyFkaKitStem(
  stem: string,
  clubSeasonPrefix: string,
): { type: KitType; variant: string | null } | undefined {
  const prefix = `${clubSeasonPrefix}-`;
  if (!stem.startsWith(prefix) || !stem.endsWith("-kit")) {
    return undefined;
  }
  return classifyFkaKitRemainder(stem.slice(prefix.length).replace(/-kit$/, ""));
}
