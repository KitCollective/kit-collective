import type { CatalogPickerItem, WishlistEntry } from "@kit/api-contract";
import type { JerseySize, KitType } from "@kit/domain";
import { JERSEY_SIZE_LABELS_DA, KIT_TYPE_LABELS_DA } from "@kit/domain";

export type WishlistSheetMode = "list" | "form";

export type WishlistCriteria = {
  club: CatalogPickerItem | null;
  season: CatalogPickerItem | null;
  type: KitType | null;
  size: JerseySize | null;
};

const EMPTY_CRITERIA: WishlistCriteria = {
  club: null,
  season: null,
  type: null,
  size: null,
};

export const WISHLIST_AND_HELPER_COPY =
  "Valgte felter kombineres med OG — en trøje skal matche alle valgte felter.";

export function resolveWishlistSheetTitle(mode: WishlistSheetMode): string {
  return mode === "list" ? "Ønske" : "Ny ønskerække";
}

export function emptyWishlistCriteria(): WishlistCriteria {
  return { ...EMPTY_CRITERIA };
}

export function hasWishlistCriterion(criteria: WishlistCriteria): boolean {
  return criteria.club !== null || criteria.season !== null || criteria.type !== null;
}

export function canSaveWishlistEntry(criteria: WishlistCriteria, saving: boolean): boolean {
  return hasWishlistCriterion(criteria) && !saving;
}

export function buildWishlistWritePayload(criteria: WishlistCriteria): {
  clubId?: string;
  seasonId?: string;
  type?: KitType;
  size?: JerseySize;
} {
  const payload: {
    clubId?: string;
    seasonId?: string;
    type?: KitType;
    size?: JerseySize;
  } = {};

  if (criteria.club) {
    payload.clubId = criteria.club.id;
  }
  if (criteria.season) {
    payload.seasonId = criteria.season.id;
  }
  if (criteria.type) {
    payload.type = criteria.type;
  }
  if (criteria.size) {
    payload.size = criteria.size;
  }

  return payload;
}

export function seedCriteriaForEdit(entry: WishlistEntry): WishlistCriteria {
  return {
    club:
      entry.clubId !== null ? { id: entry.clubId, label: entry.clubLabel ?? entry.clubId } : null,
    season:
      entry.seasonId !== null
        ? { id: entry.seasonId, label: entry.seasonLabel ?? entry.seasonId }
        : null,
    type: entry.type,
    size: entry.size,
  };
}

export function manageRowAccessibilityLabel(name: string, meta: string): string {
  return `${name}, ${meta}`;
}

export function hasWishlistHit(entry: WishlistEntry): boolean {
  return entry.matchedJerseyId != null;
}

export function hitRowAccessibilityLabel(name: string, meta: string): string {
  return `${name}, ${meta}. Match — tryk for at se trøjen.`;
}

export function resolveWishlistHitRoute(matchedJerseyId: string): string {
  return `/search/send-bid/${matchedJerseyId}`;
}

export function resolveWishlistEmptyTitle(): string {
  return "Ingen ønsker endnu";
}

export function resolveWishlistEmptyBody(): string {
  return "Tilføj en ønskerække med klub, sæson eller type.";
}

export const WISHLIST_TYPE_OPTIONS = KIT_TYPE_LABELS_DA;
export const WISHLIST_SIZE_OPTIONS = JERSEY_SIZE_LABELS_DA;
