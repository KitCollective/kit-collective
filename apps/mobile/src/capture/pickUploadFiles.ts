import { ActionSheetIOS, Alert, Platform } from "react-native";
import { galleryMultiSelectQuality } from "./photoBytes";
import { pickDocumentImages } from "./pickDocumentImages";
import { pickGalleryPhotos } from "./pickGalleryPhotos";

type PickUploadFilesOptions = {
  allowsMultipleSelection?: boolean;
};

async function pickFromGallery(options: PickUploadFilesOptions): Promise<string[] | null> {
  return pickGalleryPhotos({
    allowsMultipleSelection: options.allowsMultipleSelection ?? true,
    quality: galleryMultiSelectQuality(),
  });
}

async function pickFromDocuments(options: PickUploadFilesOptions): Promise<string[] | null> {
  return pickDocumentImages({
    multiple: options.allowsMultipleSelection ?? true,
  });
}

function showUploadSourcePicker(): Promise<"gallery" | "documents" | null> {
  if (Platform.OS === "ios") {
    return new Promise((resolve) => {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ["Fotos", "Filer", "Annuller"],
          cancelButtonIndex: 2,
        },
        (buttonIndex) => {
          if (buttonIndex === 0) {
            resolve("gallery");
            return;
          }
          if (buttonIndex === 1) {
            resolve("documents");
            return;
          }
          resolve(null);
        },
      );
    });
  }

  return new Promise((resolve) => {
    Alert.alert("Upload filer", "Vælg hvor billederne skal hentes fra.", [
      { text: "Galleri", onPress: () => resolve("gallery") },
      { text: "Filer", onPress: () => resolve("documents") },
      { text: "Annuller", style: "cancel", onPress: () => resolve(null) },
    ]);
  });
}

/**
 * Upload filer entry point: Photos library or Files/documents picker per platform.
 */
export async function pickUploadFiles(
  options: PickUploadFilesOptions = {},
): Promise<string[] | null> {
  if (Platform.OS === "web") {
    return pickFromGallery(options);
  }

  const source = await showUploadSourcePicker();
  if (!source) {
    return null;
  }

  if (source === "gallery") {
    return pickFromGallery(options);
  }

  return pickFromDocuments(options);
}
