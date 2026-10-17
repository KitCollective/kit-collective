import type { CollectionDiscoverJersey } from "@kit/api-contract";
import { resolvePhotoUrl } from "@/api/collection";

/** Image source for the first photo of a Søg tile, with the bearer header when signed in. */
export function searchTilePhotoSource(
  photo: CollectionDiscoverJersey["photos"][number] | null,
  accessToken: string | null | undefined,
) {
  return photo
    ? {
        uri: resolvePhotoUrl(photo.photoUrl),
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      }
    : undefined;
}
