import * as ImagePicker from "expo-image-picker";

type PickGalleryPhotosOptions = {
  allowsMultipleSelection?: boolean;
  selectionLimit?: number;
  quality?: number;
};

/**
 * Request media-library permission and open the system picker.
 * Returns asset URIs in picker order, or null when denied/cancelled.
 */
export async function pickGalleryPhotos(
  options: PickGalleryPhotosOptions = {},
): Promise<string[] | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: options.allowsMultipleSelection ?? false,
    selectionLimit: options.selectionLimit,
    quality: options.quality ?? 0.8,
  });

  if (result.canceled) {
    return null;
  }

  const uris = result.assets.map((asset) => asset.uri).filter((uri): uri is string => Boolean(uri));
  return uris.length > 0 ? uris : null;
}
