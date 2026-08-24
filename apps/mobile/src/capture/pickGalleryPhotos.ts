import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";

type PickGalleryPhotosOptions = {
  allowsMultipleSelection?: boolean;
  selectionLimit?: number;
  quality?: number;
};

/**
 * Open the system photo picker without requesting broad media-library access.
 * Returns asset URIs in picker order, or null when cancelled.
 */
export async function pickGalleryPhotos(
  options: PickGalleryPhotosOptions = {},
): Promise<string[] | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: options.allowsMultipleSelection ?? false,
    orderedSelection: Platform.OS === "ios" && (options.allowsMultipleSelection ?? false),
    selectionLimit: options.selectionLimit,
    quality: options.quality ?? 0.8,
  });

  if (result.canceled) {
    return null;
  }

  const uris = result.assets.map((asset) => asset.uri).filter((uri): uri is string => Boolean(uri));
  return uris.length > 0 ? uris : null;
}
