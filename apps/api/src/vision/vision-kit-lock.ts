import type { KitType } from "@kit/domain";

/** Catalog-locked season/type — not capped by the model's year guess. */
export const CATALOG_KIT_LOCK_CONFIDENCE = 95;

export type ObservableKitHit = {
  kitId: string;
  clubId: string | null;
  seasonId: string;
  seasonLabel: string;
  type: KitType;
  manufacturer: string;
  sponsor: string;
  colorNames?: string | null;
};

export type ObservableKitLock =
  | { status: "unique"; kit: ObservableKitHit }
  | { status: "ambiguous"; kits: ObservableKitHit[] }
  | { status: "none" };

export function normalizeHint(value: string): string {
  return value.trim().toLowerCase();
}

export function scoreLabelMatch(label: string, hint: string): number {
  const normalizedLabel = normalizeHint(label);
  const normalizedHint = normalizeHint(hint);

  if (normalizedLabel === normalizedHint) {
    return 95;
  }
  if (normalizedLabel.startsWith(normalizedHint) || normalizedHint.startsWith(normalizedLabel)) {
    return 85;
  }
  if (normalizedLabel.includes(normalizedHint) || normalizedHint.includes(normalizedLabel)) {
    return 70;
  }

  return 0;
}

function dedupeKits(hits: ObservableKitHit[]): ObservableKitHit[] {
  const seen = new Map<string, ObservableKitHit>();
  for (const hit of hits) {
    if (!seen.has(hit.kitId)) {
      seen.set(hit.kitId, hit);
    }
  }
  return [...seen.values()];
}

/**
 * Unique manufacturer+sponsor kit wins, even over a wrong seasonHint.
 * N hits scoped to a club still unique → lock that club's kit.
 */
export function resolveObservableKitLock(
  hits: ObservableKitHit[],
  clubId?: string,
): ObservableKitLock {
  const unique = dedupeKits(hits);
  if (unique.length === 1) {
    return { status: "unique", kit: unique[0]! };
  }
  if (unique.length === 0) {
    return { status: "none" };
  }
  if (clubId) {
    const scoped = unique.filter((hit) => hit.clubId === clubId);
    if (scoped.length === 1) {
      return { status: "unique", kit: scoped[0]! };
    }
    if (scoped.length > 1) {
      return { status: "ambiguous", kits: scoped };
    }
  }
  return { status: "ambiguous", kits: unique };
}

const COLOR_TOKEN =
  /\b(white|weiss|weiß|hvid|black|navy|red|blue|green|yellow|gold|orange|purple|pink|grey|gray|teal|maroon|claret|amber|silver|cream|ivory)\b/g;

export function scoreColorMatch(colorNames: string | null | undefined, colorHint?: string): number {
  if (!colorHint?.trim() || !colorNames?.trim()) {
    return 0;
  }
  const labelScore = scoreLabelMatch(colorNames, colorHint);
  if (labelScore > 0) {
    return labelScore;
  }
  const catalogTokens = new Set(colorNames.toLowerCase().match(COLOR_TOKEN) ?? []);
  const hintTokens = new Set(colorHint.toLowerCase().match(COLOR_TOKEN) ?? []);
  if (catalogTokens.size === 0 || hintTokens.size === 0) {
    return 0;
  }
  let overlap = 0;
  for (const token of hintTokens) {
    if (catalogTokens.has(token)) {
      overlap += 1;
    }
  }
  if (overlap === 0) {
    return 0;
  }
  return overlap === hintTokens.size ? 85 : 70;
}

/**
 * Among N manufacturer+sponsor hits, type and/or colours can lock one kit
 * without a second Vision call.
 */
export function pickUniqueKitByObservables(
  hits: ObservableKitHit[],
  kitType?: KitType,
  colorHint?: string,
): ObservableKitHit | null {
  let scoped = dedupeKits(hits);
  if (kitType) {
    scoped = scoped.filter((hit) => hit.type === kitType);
  }
  if (scoped.length === 1) {
    return scoped[0]!;
  }
  if (colorHint?.trim()) {
    const colored = scoped.filter((hit) => scoreColorMatch(hit.colorNames, colorHint) > 0);
    if (colored.length === 1) {
      return colored[0]!;
    }
  }
  return null;
}

/** Second look: pick among catalog candidates by refined season label and type. */
export function pickRefinedKit(
  hits: ObservableKitHit[],
  amongKitIds: string[],
  seasonHint?: string,
  kitType?: KitType,
): ObservableKitHit | null {
  const allowed = new Set(amongKitIds);
  let scoped = dedupeKits(hits).filter((hit) => allowed.has(hit.kitId));
  if (kitType) {
    scoped = scoped.filter((hit) => hit.type === kitType);
  }
  if (seasonHint?.trim()) {
    scoped = scoped.filter((hit) => scoreLabelMatch(hit.seasonLabel, seasonHint) > 0);
  }
  if (scoped.length === 1) {
    return scoped[0]!;
  }
  return null;
}
