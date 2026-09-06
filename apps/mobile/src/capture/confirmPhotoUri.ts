import type { PhotoRole } from "@kit/domain";
import { centerCrop4x5Rect, STRIP_VARIANT_WIDTH } from "@kit/domain";
import { resolvePhotoUrl } from "@/api/collection";
import { readPreparedPhotoUri } from "@/capture/photoBytes";

function isServerPhotoUri(uri: string): boolean {
  return uri.startsWith("http") || uri.includes("/v1/collection/photos/");
}

/** Confirm hub strip — local prepared 4:5 or server `variant=strip`. */
export async function resolveConfirmStripUri(uri: string, role: PhotoRole): Promise<string> {
  if (isServerPhotoUri(uri)) {
    return resolvePhotoUrl(uri, "strip");
  }
  return readPreparedPhotoUri(uri, role, "strip");
}

/** Photo lightbox — local prepared uncropped or server `variant=lightbox`. */
export async function resolveConfirmLightboxUri(uri: string, role: PhotoRole): Promise<string> {
  if (isServerPhotoUri(uri)) {
    return resolvePhotoUrl(uri, "lightbox");
  }
  return readPreparedPhotoUri(uri, role, "lightbox");
}

export { centerCrop4x5Rect, STRIP_VARIANT_WIDTH };
