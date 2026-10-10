import { PHOTO_ROLES, type PhotoRole } from "@kit/domain";
import { JERSEY_PHOTO_CAP_HELPER_DA } from "./captureSession";

/** Caption of the one narrow add tile (design lock: Confirm and Save, Revision 2026-10-09). */
export const CONFIRM_ADD_PHOTO_LABEL = "Foto";

export type ConfirmPhotoStrip = {
  /** Filled roles only, in role order. No empty role slots, no Upload tile. */
  roles: PhotoRole[];
  showAddTile: boolean;
  capHelper: string | null;
};

export function confirmPhotoStrip(
  photoUris: Record<PhotoRole, string | undefined>,
  options: { analyzing: boolean; photoCount: number },
): ConfirmPhotoStrip {
  const atCap = options.photoCount >= 10;
  return {
    roles: PHOTO_ROLES.filter((role) => Boolean(photoUris[role])),
    showAddTile: !options.analyzing && !atCap,
    capHelper: atCap && !options.analyzing ? JERSEY_PHOTO_CAP_HELPER_DA : null,
  };
}

/**
 * One jersey: the index (circle 1 + add) trails the header title. Two or more: it drops to
 * its own scrolling row under the header and keeps the per-jersey photo count.
 */
export function confirmJerseyIndexPlacement(jerseyCount: number): "header" | "row" {
  return jerseyCount >= 2 ? "row" : "header";
}
