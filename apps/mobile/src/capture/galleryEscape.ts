import { MAX_USER_JERSEY_PHOTOS } from "@kit/domain";
import type { CaptureSessionPhoto } from "./captureSessionTypes";

/**
 * Merge in-progress shoot-first camera shots with gallery escape picks.
 * All photos stay unassigned until Confirm applies fill order.
 */
export function mergeGalleryEscapePhotos(
  cameraUris: string[],
  galleryUris: string[],
): CaptureSessionPhoto[] {
  const merged: CaptureSessionPhoto[] = cameraUris.map((uri) => ({
    uri,
    role: null,
    source: "camera",
  }));

  for (const uri of galleryUris) {
    if (merged.length >= MAX_USER_JERSEY_PHOTOS) {
      break;
    }
    merged.push({
      uri,
      role: null,
      source: "gallery",
    });
  }

  return merged;
}
