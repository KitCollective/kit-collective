import type { PhotoRole } from "@kit/domain";
import { MAX_USER_JERSEY_PHOTOS, UNIVERSAL_PHOTO_ROLES } from "@kit/domain";
import type { CaptureSessionPhoto } from "./captureSessionTypes";

/**
 * Merge in-progress camera shots with gallery escape picks.
 * Camera photos keep their roles; gallery URIs fill the next empty universal roles, then Andet.
 */
export function mergeGalleryEscapePhotos(
  cameraPhotos: Array<{ role: PhotoRole; uri: string }>,
  galleryUris: string[],
): CaptureSessionPhoto[] {
  const merged: CaptureSessionPhoto[] = cameraPhotos.map((photo) => ({
    uri: photo.uri,
    role: photo.role,
    source: "camera",
  }));

  const filledRoles = new Set(cameraPhotos.map((photo) => photo.role));
  let galleryIndex = 0;

  for (const role of UNIVERSAL_PHOTO_ROLES) {
    if (filledRoles.has(role)) {
      continue;
    }
    if (galleryIndex >= galleryUris.length) {
      break;
    }
    const uri = galleryUris[galleryIndex];
    if (!uri) {
      break;
    }
    merged.push({
      uri,
      role,
      source: "gallery",
    });
    galleryIndex += 1;
  }

  while (galleryIndex < galleryUris.length && merged.length < MAX_USER_JERSEY_PHOTOS) {
    const uri = galleryUris[galleryIndex];
    if (!uri) {
      break;
    }
    merged.push({
      uri,
      role: "other",
      source: "gallery",
    });
    galleryIndex += 1;
  }

  return merged;
}
