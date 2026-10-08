import type { PhotoRole } from "@kit/domain";
import { uploadPhotoOriginal } from "@/api/collection";
import { readPhotoBase64 } from "@/capture/photoBytes";

/** Fire-and-forget original upload after Save — must not block jersey #2. */
export function scheduleOriginalPhotoUploads(
  accessToken: string,
  photos: Array<{ id: string; uri: string; role: PhotoRole }>,
): void {
  for (const photo of photos) {
    void (async () => {
      try {
        const contentBase64 = await readPhotoBase64(photo.uri);
        await uploadPhotoOriginal(accessToken, photo.id, contentBase64);
      } catch {
        // Original upload is fail-open; grid/strip/lightbox may still exist.
      }
    })();
  }
}
