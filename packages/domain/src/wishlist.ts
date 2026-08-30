import type { JerseySize, KitType } from "./index.js";
import { JERSEY_SIZE_LABELS_DA, KIT_TYPE_LABELS_DA } from "./index.js";

export type WishlistCriteriaLabels = {
  clubLabel: string | null;
  seasonLabel: string | null;
  typeLabel: string | null;
  sizeLabel: string | null;
};

export function hasWishlistCriterion(input: {
  clubId?: string | null;
  seasonId?: string | null;
  type?: KitType | null;
}): boolean {
  return input.clubId != null || input.seasonId != null || input.type != null;
}

export function buildWishlistAndMeta(labels: WishlistCriteriaLabels): string {
  const parts: string[] = [];
  if (labels.clubLabel) {
    parts.push(labels.clubLabel);
  }
  if (labels.seasonLabel) {
    parts.push(labels.seasonLabel);
  }
  if (labels.typeLabel) {
    parts.push(labels.typeLabel);
  }
  if (labels.sizeLabel) {
    parts.push(labels.sizeLabel);
  }
  return parts.join(" · ");
}

export function buildWishlistAutoName(labels: WishlistCriteriaLabels): string {
  const base = buildWishlistAndMeta({
    clubLabel: labels.clubLabel,
    seasonLabel: labels.seasonLabel,
    typeLabel: labels.typeLabel,
    sizeLabel: null,
  });

  if (labels.sizeLabel) {
    return base ? `${base} · ${labels.sizeLabel}` : labels.sizeLabel;
  }

  return base;
}

export function resolveWishlistTypeLabel(type: KitType | null): string | null {
  return type ? KIT_TYPE_LABELS_DA[type] : null;
}

export function resolveWishlistSizeLabel(size: JerseySize | null): string | null {
  return size ? JERSEY_SIZE_LABELS_DA[size] : null;
}
