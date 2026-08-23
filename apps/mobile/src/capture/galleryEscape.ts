import type { PhotoRole } from "@kit/domain";
import { PHOTO_ROLES } from "@kit/domain";
import type { CaptureSessionPhoto } from "./captureSessionTypes";

/**
 * Merge in-progress camera shots with gallery escape picks.
 * Camera photos keep their roles; gallery URIs fill the next empty roles in order.
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

  for (const role of PHOTO_ROLES) {
    if (filledRoles.has(role)) {
      continue;
    }
    if (galleryIndex >= galleryUris.length) {
      break;
    }
    merged.push({
      uri: galleryUris[galleryIndex] as string,
      role,
      source: "gallery",
    });
    galleryIndex += 1;
  }

  return merged;
}
