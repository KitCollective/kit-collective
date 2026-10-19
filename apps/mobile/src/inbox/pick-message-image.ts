import * as ImagePicker from "expo-image-picker";

/** The photo a Collector attaches to a message, as base64; null when permission is refused or the pick is cancelled. */
export async function pickMessageImage(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.9,
    base64: true,
  });

  if (result.canceled) {
    return null;
  }
  return result.assets[0]?.base64 ?? null;
}
