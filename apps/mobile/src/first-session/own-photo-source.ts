import { capFirstSessionPhotos, FIRST_SESSION_PHOTO_CAP } from "@/first-session/vision-result";

export type OwnPhotoSource = "camera" | "library" | "files";

export type OwnPhotoPickers = {
  library: (options: { selectionLimit: number }) => Promise<string[] | null>;
  files: () => Promise<string[] | null>;
};

/**
 * Photos from the photo library or Files for the own-photo road: at most three,
 * in picker order. Null when the collector cancelled or picked nothing.
 */
export async function pickOwnPhotos(
  source: Exclude<OwnPhotoSource, "camera">,
  pickers: OwnPhotoPickers,
): Promise<string[] | null> {
  const picked =
    source === "library"
      ? await pickers.library({ selectionLimit: FIRST_SESSION_PHOTO_CAP })
      : await pickers.files();
  if (!picked || picked.length === 0) {
    return null;
  }
  return capFirstSessionPhotos(picked);
}
