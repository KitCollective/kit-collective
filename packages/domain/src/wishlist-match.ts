import type { JerseySize, KitType } from "./index.js";

export type WishlistMatchCriteria = {
  clubId: string | null;
  seasonId: string | null;
  type: KitType | null;
  size: JerseySize | null;
};

export type WishlistMatchJersey = {
  ownerUserId: string;
  clubId: string;
  seasonId: string;
  type: KitType;
  size: JerseySize;
  biddingEnabled: boolean;
  private: boolean;
  catalogKitId: string | null;
};

/** True when every set wishlist facet matches the jersey (AND). Unset facets are wildcards. */
export function matchesWishlistFacets(
  criteria: WishlistMatchCriteria,
  jersey: Pick<WishlistMatchJersey, "clubId" | "seasonId" | "type" | "size">,
): boolean {
  if (criteria.clubId != null && criteria.clubId !== jersey.clubId) {
    return false;
  }
  if (criteria.seasonId != null && criteria.seasonId !== jersey.seasonId) {
    return false;
  }
  if (criteria.type != null && criteria.type !== jersey.type) {
    return false;
  }
  if (criteria.size != null && criteria.size !== jersey.size) {
    return false;
  }
  return true;
}

/** Peer jerseys that may appear as a Match hit for a wishlist owner. */
export function isWishlistMatchCandidate(
  jersey: WishlistMatchJersey,
  wishlistOwnerUserId: string,
): boolean {
  if (jersey.ownerUserId === wishlistOwnerUserId) {
    return false;
  }
  if (!jersey.biddingEnabled) {
    return false;
  }
  if (jersey.private) {
    return false;
  }
  if (jersey.catalogKitId != null) {
    return false;
  }
  return true;
}

export function findFirstWishlistMatch(
  criteria: WishlistMatchCriteria,
  wishlistOwnerUserId: string,
  candidates: Array<WishlistMatchJersey & { id: string }>,
): string | null {
  for (const jersey of candidates) {
    if (!isWishlistMatchCandidate(jersey, wishlistOwnerUserId)) {
      continue;
    }
    if (matchesWishlistFacets(criteria, jersey)) {
      return jersey.id;
    }
  }
  return null;
}
