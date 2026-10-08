export type PickGalleryPhotosOptions = {
  allowsMultipleSelection?: boolean;
  selectionLimit?: number;
  quality?: number;
};

export type GalleryMediaType = "images" | "videos" | "livePhotos";

export type GalleryPickerRequest = {
  mediaTypes: GalleryMediaType[];
  allowsMultipleSelection: boolean;
  orderedSelection: boolean;
  selectionLimit?: number;
  quality: number;
};

export type GalleryPickerAsset = {
  uri?: string;
};

export type GalleryPickerResponse = {
  canceled: boolean;
  assets: GalleryPickerAsset[];
};

export type GalleryPickerAdapter = {
  os: string;
  launchImageLibraryAsync: (request: GalleryPickerRequest) => Promise<GalleryPickerResponse>;
};

/**
 * Open the system photo picker without requesting broad media-library access.
 * Returns asset URIs in picker order, or null when cancelled.
 */
export async function pickGalleryPhotos(
  options: PickGalleryPhotosOptions = {},
  adapter: GalleryPickerAdapter,
): Promise<string[] | null> {
  const allowsMultipleSelection = options.allowsMultipleSelection ?? false;
  const result = await adapter.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection,
    orderedSelection: adapter.os === "ios" && allowsMultipleSelection,
    selectionLimit: options.selectionLimit,
    quality: options.quality ?? 0.8,
  });

  if (result.canceled) {
    return null;
  }

  const uris = result.assets.map((asset) => asset.uri).filter((uri): uri is string => Boolean(uri));
  return uris.length > 0 ? uris : null;
}
